#!/usr/bin/env node

/**
 * PTZ Control Script
 * Controls Pan, Tilt, and Zoom of ONVIF cameras
 *
 * Usage: ./ptz.js --ip <ip> --username <user> --password <pass> [options]
 */

import minimist from 'minimist';
import { loadConfig, createDevice, formatError, validateIp, validateRange, preprocessArgs } from '../lib/common.js';

const numericKeys = ['pan', 'tilt', 'zoom', 'speed', 'duration'];
const argv = minimist(preprocessArgs(process.argv.slice(2), numericKeys), {
  alias: {
    i: 'ip',
    u: 'username',
    p: 'password',
    port: 'onvif-port',
    h: 'help'
  },
  default: {
    port: 2020
  },
  boolean: ['left', 'right', 'up', 'down', 'zoom-in', 'zoom-out', 'stop', 'home', 'help'],
  string: ['pan', 'tilt', 'zoom', 'speed', 'duration']
});

if (argv.help) {
  console.log(`
PTZ Camera Control

Usage: ./ptz.js [options]

Options:
  --ip, -i              Camera IP address (required)
  --username, -u        Username for authentication (required)
  --password, -p        Password for authentication (required)
  --port, --onvif-port  ONVIF port (default: 2020)
  --pan <value>         Pan position (-1.0 to 1.0)
  --tilt <value>        Tilt position (-1.0 to 1.0)
  --zoom <value>        Zoom level (0.0 to 1.0)
  --left                Pan left (continuous movement)
  --right               Pan right (continuous movement)
  --up                  Tilt up (continuous movement)
  --down                Tilt down (continuous movement)
  --zoom-in             Zoom in (continuous)
  --zoom-out            Zoom out (continuous)
  --stop                Stop continuous movement
  --speed <value>       Movement speed (0.0 to 1.0, default: 0.5)
  --duration <seconds>  Auto-stop after N seconds (continuous moves only)
  --home                Move to home position
  --help, -h            Show this help message

Environment Variables:
  IP_ADDRESS      Alternative to --ip
  USERNAME        Alternative to --username
  PASSWORD        Alternative to --password
  ONVIF_PORT      Alternative to --port

Examples:
  # Absolute position (negative values work)
  ./ptz.js --ip 192.168.0.107 -u admin -p secret --pan -0.8 --tilt 0.3 --zoom 0.2

  # Continuous movement with auto-stop
  ./ptz.js --ip 192.168.0.107 -u admin -p secret --left --speed 0.3 --duration 3

  # Stop movement
  ./ptz.js --ip 192.168.0.107 -u admin -p secret --stop

  # Go to home position
  ./ptz.js --ip 192.168.0.107 -u admin -p secret --home
`);
  process.exit(0);
}

const config = loadConfig(argv);

const ipErr = validateIp(config.ip);
if (ipErr) { console.error(`Error: ${ipErr}`); process.exit(1); }
if (!config.username || !config.password) {
  console.error('Error: Username and password are required (--username/--password or USERNAME/PASSWORD)');
  process.exit(1);
}

const speed = argv.speed !== undefined ? parseFloat(argv.speed) : 0.5;
const speedErr = validateRange(speed, 0, 1, 'Speed');
if (speedErr) { console.error(`Error: ${speedErr}`); process.exit(1); }

const duration = argv.duration !== undefined ? parseFloat(argv.duration) : null;
if (duration !== null) {
  const durErr = validateRange(duration, 0.1, 300, 'Duration');
  if (durErr) { console.error(`Error: ${durErr}`); process.exit(1); }
}

const hasAbsoluteMove = argv.pan !== undefined || argv.tilt !== undefined || argv.zoom !== undefined;
const hasRelativeMove = argv.left || argv.right || argv.up || argv.down || argv['zoom-in'] || argv['zoom-out'];

console.log(`Connecting to PTZ camera at ${config.ip}:${config.port}...\n`);

async function controlPTZ() {
  try {
    const device = await createDevice(config);
    console.log('Connected to camera\n');

    const services = device.services;
    if (!services.ptz) {
      console.error('Error: Camera does not support PTZ');
      process.exit(1);
    }

    const ptz = services.ptz;
    const profile = device.getCurrentProfile();
    if (!profile) {
      console.error('Error: No media profile available on this camera');
      process.exit(1);
    }
    const profileToken = profile.token;

    if (argv.stop) {
      console.log('Stopping movement...');
      await ptz.stop({ ProfileToken: profileToken, PanTilt: true, Zoom: true });
      console.log('Movement stopped');
      process.exit(0);
    }

    if (argv.home) {
      console.log('Moving to home position...');
      try {
        await ptz.gotoHomePosition({ ProfileToken: profileToken });
        console.log('Moved to home position');
      } catch (e) {
        console.log('gotoHomePosition not supported, moving to center...');
        await ptz.absoluteMove({
          ProfileToken: profileToken,
          Position: { x: 0, y: 0, z: 0 },
          Speed: { x: speed, y: speed, z: speed }
        });
        console.log('Moved to center position');
      }
      process.exit(0);
    }

    if (hasRelativeMove) {
      const velocity = { x: 0, y: 0, z: 0 };
      let movementDesc = [];

      if (argv.left) { velocity.x = -speed; movementDesc.push('pan left'); }
      else if (argv.right) { velocity.x = speed; movementDesc.push('pan right'); }
      if (argv.up) { velocity.y = speed; movementDesc.push('tilt up'); }
      else if (argv.down) { velocity.y = -speed; movementDesc.push('tilt down'); }
      if (argv['zoom-in']) { velocity.z = speed; movementDesc.push('zoom in'); }
      else if (argv['zoom-out']) { velocity.z = -speed; movementDesc.push('zoom out'); }

      const moveParams = { ProfileToken: profileToken, Velocity: velocity };
      if (duration !== null) {
        moveParams.Timeout = Math.round(duration);
      }

      console.log(`Starting continuous movement: ${movementDesc.join(', ')} (speed: ${speed})`);
      if (duration !== null) {
        console.log(`Auto-stop after ${duration} seconds`);
      }
      await ptz.continuousMove(moveParams);
      console.log('Continuous movement started');

      if (duration !== null) {
        await new Promise(r => setTimeout(r, duration * 1000));
        await ptz.stop({ ProfileToken: profileToken, PanTilt: true, Zoom: true });
        console.log('Movement auto-stopped');
      } else {
        console.log('Use --stop to halt movement');
      }
      process.exit(0);
    }

    if (hasAbsoluteMove) {
      // Get current position to fill in unspecified axes
      let currentX = 0, currentY = 0, currentZ = 0;
      try {
        const currentStatus = await ptz.getStatus({ ProfileToken: profileToken });
        if (currentStatus && currentStatus.data) {
          const d = currentStatus.data;
          currentX = parseFloat(d?.PTZStatus?.Position?.PanTilt?.['$']?.x) || 0;
          currentY = parseFloat(d?.PTZStatus?.Position?.PanTilt?.['$']?.y) || 0;
          currentZ = parseFloat(d?.PTZStatus?.Position?.Zoom?.['$']?.x) || 0;
        }
      } catch (e) {
        // Use defaults if status unavailable
      }

      const pan = argv.pan !== undefined ? parseFloat(argv.pan) : currentX;
      const tilt = argv.tilt !== undefined ? parseFloat(argv.tilt) : currentY;
      const zoom = argv.zoom !== undefined ? parseFloat(argv.zoom) : currentZ;

      // Validate ranges
      const panErr = validateRange(pan, -1, 1, 'Pan');
      if (panErr) { console.error(`Error: ${panErr}`); process.exit(1); }
      const tiltErr = validateRange(tilt, -1, 1, 'Tilt');
      if (tiltErr) { console.error(`Error: ${tiltErr}`); process.exit(1); }
      const zoomErr = validateRange(zoom, 0, 1, 'Zoom');
      if (zoomErr) { console.error(`Error: ${zoomErr}`); process.exit(1); }

      console.log(`Moving to absolute position:`);
      console.log(`   Pan: ${pan.toFixed(4)}, Tilt: ${tilt.toFixed(4)}, Zoom: ${zoom.toFixed(4)}`);
      console.log(`   Speed: ${speed}`);

      await ptz.absoluteMove({
        ProfileToken: profileToken,
        Position: { x: pan, y: tilt, z: zoom },
        Speed: { x: speed, y: speed, z: speed }
      });

      console.log('Movement command sent');

      // Wait and report new position
      await new Promise(r => setTimeout(r, 1000));
      try {
        const newStatus = await ptz.getStatus({ ProfileToken: profileToken });
        if (newStatus && newStatus.data) {
          const d = newStatus.data;
          const nx = parseFloat(d?.PTZStatus?.Position?.PanTilt?.['$']?.x);
          const ny = parseFloat(d?.PTZStatus?.Position?.PanTilt?.['$']?.y);
          const nz = parseFloat(d?.PTZStatus?.Position?.Zoom?.['$']?.x);
          if (!isNaN(nx)) {
            console.log(`\nCurrent: Pan ${nx.toFixed(4)}, Tilt ${ny.toFixed(4)}, Zoom ${nz.toFixed(4)}`);
          }
        }
      } catch (e) {
        // Ignore status read errors
      }
      process.exit(0);
    }

    // No action specified - show current position
    console.log('Current PTZ position:');
    try {
      const status = await ptz.getStatus({ ProfileToken: profileToken });
      if (status && status.data) {
        const d = status.data;
        const px = parseFloat(d?.PTZStatus?.Position?.PanTilt?.['$']?.x);
        const py = parseFloat(d?.PTZStatus?.Position?.PanTilt?.['$']?.y);
        const pz = parseFloat(d?.PTZStatus?.Position?.Zoom?.['$']?.x);
        if (!isNaN(px)) {
          console.log(`   Pan:  ${px.toFixed(4)}`);
          console.log(`   Tilt: ${py.toFixed(4)}`);
          console.log(`   Zoom: ${pz.toFixed(4)}`);
        } else {
          console.log('   Position data not available');
        }
      } else {
        console.log('   Position data not available');
      }
    } catch (e) {
      console.log('   Could not retrieve position:', e.message);
    }
    console.log('\nUse --help for available commands');

  } catch (error) {
    console.error(`Error: ${formatError(error)}`);
    process.exit(1);
  }
}

controlPTZ();
