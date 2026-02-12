#!/usr/bin/env node

/**
 * Camera Snapshot Script
 * Captures still images from RTSP stream (ffmpeg) or ONVIF snapshot endpoint
 *
 * Usage: ./snapshot.js --ip <ip> --username <user> --password <pass> --output <file>
 */

import ffmpeg from 'fluent-ffmpeg';
import minimist from 'minimist';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import http from 'http';
import { loadConfig, createDevice, formatError, validateIp } from '../lib/common.js';

const argv = minimist(process.argv.slice(2), {
  alias: {
    i: 'ip',
    u: 'username',
    p: 'password',
    port: 'onvif-port',
    o: 'output',
    q: 'quality',
    m: 'method',
    h: 'help'
  },
  default: {
    port: 2020,
    quality: 2,
    method: 'rtsp'
  },
  boolean: ['help', 'timestamp']
});

if (argv.help) {
  console.log(`
Camera Snapshot Capture

Usage: ./snapshot.js [options]

Options:
  --ip, -i              Camera IP address (required)
  --username, -u        Username for authentication (required)
  --password, -p        Password for authentication (required)
  --port, --onvif-port  ONVIF port (default: 2020)
  --output, -o          Output file path (required)
  --quality, -q         JPEG quality 1-31, lower is better (default: 2, rtsp only)
  --method, -m          Capture method: "rtsp" (default, requires ffmpeg) or "onvif" (no ffmpeg needed)
  --timeout             Capture timeout in seconds (default: 10)
  --timestamp           Append timestamp to filename (e.g. snap_20240101_120000.jpg)
  --help, -h            Show this help message

Environment Variables:
  IP_ADDRESS      Alternative to --ip
  USERNAME        Alternative to --username
  PASSWORD        Alternative to --password
  ONVIF_PORT      Alternative to --port
  OUTPUT_PATH     Alternative to --output

Examples:
  ./snapshot.js --ip 192.168.0.107 -u admin -p secret -o ./snapshot.jpg
  ./snapshot.js --ip 192.168.0.107 -u admin -p secret -o ./snap.jpg --quality 1
  ./snapshot.js --ip 192.168.0.107 -u admin -p secret -o ./snap.jpg --timestamp
  ./snapshot.js --ip 192.168.0.107 -u admin -p secret -o ./snap.jpg --method onvif
`);
  process.exit(0);
}

const config = loadConfig(argv);
const outputPath = argv.output || process.env.OUTPUT_PATH;
const quality = parseInt(argv.quality, 10);
const timeout = parseInt(argv.timeout || 10, 10) * 1000;
const method = argv.method.toLowerCase();

const ipErr = validateIp(config.ip);
if (ipErr) { console.error(`Error: ${ipErr}`); process.exit(1); }
if (!config.username || !config.password) {
  console.error('Error: Username and password are required');
  process.exit(1);
}
if (!outputPath) {
  console.error('Error: Output path is required (--output or OUTPUT_PATH)');
  process.exit(1);
}
if (method !== 'rtsp' && method !== 'onvif') {
  console.error(`Error: Invalid method "${method}". Use "rtsp" or "onvif"`);
  process.exit(1);
}

// Pre-check ffmpeg for rtsp method
if (method === 'rtsp') {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
  } catch (e) {
    console.error('Error: ffmpeg is not installed or not on PATH');
    console.error('   Install it: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)');
    console.error('   Or use --method onvif to capture without ffmpeg');
    process.exit(1);
  }
}

// Apply timestamp to filename if requested
function applyTimestamp(filePath) {
  if (!argv.timestamp) return filePath;
  const ext = path.extname(filePath);
  const base = filePath.slice(0, filePath.length - ext.length);
  const now = new Date();
  const ts = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + '_'
    + String(now.getHours()).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0')
    + String(now.getSeconds()).padStart(2, '0');
  return `${base}_${ts}${ext}`;
}

const resolvedOutput = path.resolve(applyTimestamp(outputPath));
const outputDir = path.dirname(resolvedOutput);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log(`Connecting to camera at ${config.ip}:${config.port}...\n`);

/**
 * Fetch a URL and return the response body as a Buffer
 */
function fetchUrl(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`HTTP ${res.statusCode} from snapshot endpoint`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Snapshot request timed out'));
    });
  });
}

async function captureViaOnvif() {
  const device = await createDevice(config);
  console.log('Connected to camera');
  console.log('Using ONVIF snapshot method (no ffmpeg required)\n');

  // Try fetchSnapshot first — uses the camera's built-in JPEG endpoint
  let snapshotUrl;
  try {
    const profile = device.getCurrentProfile();
    if (!profile) {
      throw new Error('No media profile available on this camera');
    }
    // node-onvif stores snapshot URI in profile after init
    snapshotUrl = profile.snapshot;
  } catch (e) {
    // Ignore — we'll try constructing the URL
  }

  if (!snapshotUrl) {
    // Fallback: construct common Tapo snapshot URL
    snapshotUrl = `http://${config.ip}:${config.port}/onvif-http/snapshot?Profile_1`;
    console.log('Using fallback snapshot URL');
  }

  console.log(`Fetching snapshot...`);
  console.log(`Saving to: ${resolvedOutput}\n`);

  const data = await fetchUrl(snapshotUrl, timeout);

  if (!data || data.length === 0) {
    throw new Error('Empty response from snapshot endpoint');
  }

  fs.writeFileSync(resolvedOutput, data);

  const sizeKB = (data.length / 1024).toFixed(2);
  console.log(`Snapshot saved:`);
  console.log(`   Path: ${resolvedOutput}`);
  console.log(`   Size: ${sizeKB} KB`);
  console.log(`   Method: onvif`);
}

async function captureViaRtsp() {
  const device = await createDevice(config);
  console.log('Connected to camera');

  console.log('Getting stream URL...');

  // getUdpStreamUrl() takes no arguments, returns a string
  let rtspUrl = '';
  try {
    rtspUrl = device.getUdpStreamUrl();
  } catch (e) {
    // Method may not be available
  }

  // Fallback: construct RTSP URL directly
  if (!rtspUrl) {
    rtspUrl = `rtsp://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.ip}:554/stream1`;
    console.log('Using fallback RTSP URL');
  }

  console.log(`Stream URL obtained`);
  console.log(`Saving snapshot to: ${resolvedOutput}`);
  console.log(`Timeout: ${timeout}ms\n`);

  await new Promise((resolve, reject) => {
    const cmd = ffmpeg(rtspUrl)
      .inputOptions([
        '-rtsp_transport tcp',
        '-timeout', '5000000',
        '-reconnect 1',
        '-reconnect_streamed 1',
        '-reconnect_delay_max 5'
      ])
      .outputOptions([
        '-vframes 1',
        '-q:v', quality.toString(),
        '-f image2'
      ])
      .on('start', () => {
        console.log('Starting ffmpeg capture...');
      })
      .on('end', () => {
        console.log('Snapshot captured successfully');
        resolve();
      })
      .on('error', (err) => {
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      .save(resolvedOutput);

    setTimeout(() => {
      cmd.kill('SIGKILL');
      reject(new Error('Snapshot capture timeout'));
    }, timeout);
  });

  if (fs.existsSync(resolvedOutput)) {
    const stats = fs.statSync(resolvedOutput);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`\nSnapshot saved:`);
    console.log(`   Path: ${resolvedOutput}`);
    console.log(`   Size: ${sizeKB} KB`);
    console.log(`   Quality: ${quality} (lower is better)`);
  } else {
    throw new Error('Snapshot file was not created');
  }
}

async function captureSnapshot() {
  try {
    if (method === 'onvif') {
      await captureViaOnvif();
    } else {
      await captureViaRtsp();
    }
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${formatError(error)}`);
    if (fs.existsSync(resolvedOutput)) {
      fs.unlinkSync(resolvedOutput);
    }
    process.exit(1);
  }
}

captureSnapshot();
