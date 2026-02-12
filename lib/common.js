/**
 * Shared utilities for tapo-control scripts
 */

import Onvif from 'node-onvif';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'tapo-control');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Parse a .env file into a key-value object.
 * Handles KEY=VALUE lines, ignores comments (#) and blank lines.
 * Strips optional surrounding quotes from values.
 */
function loadDotenv() {
  const envPath = path.join(process.cwd(), '.env');
  try {
    if (!fs.existsSync(envPath)) return {};
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    const result = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip matching surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
    return result;
  } catch (e) {
    return {};
  }
}

/**
 * Load configuration from CLI args > env vars > .env file > config file > defaults
 */
export function loadConfig(argv, defaults = {}) {
  const dotenv = loadDotenv();

  let fileConfig = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    // Ignore config file errors
  }

  const rawPort = argv.port ?? process.env.ONVIF_PORT ?? dotenv.ONVIF_PORT ?? fileConfig.port ?? defaults.port ?? 2020;
  const port = parseInt(rawPort, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${argv.port || process.env.ONVIF_PORT || fileConfig.port || defaults.port}. Must be 1-65535`);
  }

  return {
    ip: argv.ip || process.env.IP_ADDRESS || dotenv.IP_ADDRESS || fileConfig.ip || defaults.ip,
    username: argv.username || process.env.USERNAME || dotenv.USERNAME || fileConfig.username || defaults.username,
    password: argv.password || process.env.PASSWORD || dotenv.PASSWORD || fileConfig.password || defaults.password,
    port,
  };
}

/**
 * Create and initialize an ONVIF device
 */
export async function createDevice(config) {
  const xaddr = `http://${config.ip}:${config.port}/onvif/device_service`;
  const device = new Onvif.OnvifDevice({
    xaddr,
    user: config.username,
    pass: config.password,
  });
  await device.init();
  return device;
}

/**
 * Format errors into user-friendly messages
 */
export function formatError(error) {
  const msg = error.message || String(error);

  if (msg.includes('ECONNREFUSED') || msg.includes('EHOSTUNREACH') || msg.includes('ETIMEDOUT')) {
    return `Connection failed: ${msg}\n   Make sure the camera is online and ONVIF is enabled`;
  }
  if (msg.includes('Unauthorized') || msg.includes('401')) {
    return `Authentication failed: ${msg}\n   Check your username and password`;
  }
  if (msg.includes('ffmpeg') || msg.includes('ENOENT')) {
    return `FFmpeg error: ${msg}\n   Make sure ffmpeg is installed: brew install ffmpeg`;
  }
  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return `Operation timed out: ${msg}\n   The camera may be slow to respond. Try increasing --timeout`;
  }
  return msg;
}

/**
 * Validate an IPv4 address format
 */
export function validateIp(ip) {
  if (!ip) return 'IP address is required (--ip or IP_ADDRESS)';
  const parts = ip.split('.');
  if (parts.length !== 4) return `Invalid IP address: ${ip}`;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255 || String(num) !== part) {
      return `Invalid IP address: ${ip}`;
    }
  }
  return null;
}

/**
 * Validate a numeric value is within range
 */
export function validateRange(value, min, max, name) {
  if (isNaN(value)) return `${name} must be a number, got: ${value}`;
  if (value < min || value > max) return `${name} must be between ${min} and ${max}, got: ${value}`;
  return null;
}

/**
 * Preprocess argv to handle negative numeric values for specified keys.
 * Converts '--key -0.8' to '--key=-0.8' so minimist doesn't treat -0.8 as a flag.
 */
export function preprocessArgs(args, numericKeys) {
  const result = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    const key = arg.replace(/^--/, '');
    if (numericKeys.includes(key) && next && /^-[\d.]/.test(next)) {
      result.push(arg + '=' + next);
      i++;
    } else {
      result.push(arg);
    }
  }
  return result;
}
