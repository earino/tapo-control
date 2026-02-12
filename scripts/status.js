#!/usr/bin/env node

/**
 * Camera Status Script
 * Checks camera connection, settings, and capabilities
 *
 * Usage: ./status.js --ip <ip> --username <user> --password <pass>
 */

import minimist from 'minimist';
import { loadConfig, createDevice, formatError, validateIp } from '../lib/common.js';

const argv = minimist(process.argv.slice(2), {
  alias: {
    i: 'ip',
    u: 'username',
    p: 'password',
    port: 'onvif-port',
    h: 'help'
  },
  default: {
    port: 2020
  }
});

if (argv.help) {
  console.log(`
Camera Status Check

Usage: ./status.js [options]

Options:
  --ip, -i              Camera IP address (required)
  --username, -u        Username for authentication (required)
  --password, -p        Password for authentication (required)
  --port, --onvif-port  ONVIF port (default: 2020)
  --help, -h            Show this help message

Environment Variables:
  IP_ADDRESS      Alternative to --ip
  USERNAME        Alternative to --username
  PASSWORD        Alternative to --password
  ONVIF_PORT      Alternative to --port

Examples:
  ./status.js --ip 192.168.0.107 --username admin --password secret
  IP_ADDRESS=192.168.0.107 USERNAME=admin PASSWORD=secret ./status.js
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

console.log(`Checking camera status at ${config.ip}:${config.port}...\n`);

async function checkStatus() {
  try {
    const device = await createDevice(config);
    console.log('Connection successful\n');

    // Device information
    const deviceInfo = device.getInformation();
    console.log('Device Information:');
    console.log('  Manufacturer:', deviceInfo.Manufacturer || 'N/A');
    console.log('  Model:', deviceInfo.Model || 'N/A');
    console.log('  Firmware:', deviceInfo.FirmwareVersion || 'N/A');
    console.log('  Serial:', deviceInfo.SerialNumber || 'N/A');
    console.log('  Hardware:', deviceInfo.HardwareId || 'N/A');
    console.log();

    // Capabilities
    const services = device.services;
    console.log('Capabilities:');
    console.log('  PTZ:', services.ptz ? 'Supported' : 'Not supported');
    console.log('  Media:', services.media ? 'Supported' : 'Not supported');
    console.log('  Events:', services.events ? 'Supported' : 'Not supported');
    console.log('  Imaging:', services.imaging ? 'Supported' : 'Not supported');
    console.log('  Device:', services.device ? 'Supported' : 'Not supported');
    console.log();

    // Video profiles
    const profileList = device.getProfileList();
    if (profileList && profileList.length > 0) {
      console.log(`Video Profiles: ${profileList.length} found`);

      for (let i = 0; i < Math.min(profileList.length, 3); i++) {
        const profile = profileList[i];
        console.log(`\n  Profile: ${profile.name || 'Unnamed'}`);
        console.log(`    Token: ${profile.token}`);
      }
      console.log();
    } else {
      console.log('Video Profiles: None found');
      console.log();
    }

    // Stream URL (no arguments)
    try {
      const streamUrl = device.getUdpStreamUrl();
      if (streamUrl) {
        console.log(`Stream URL: ${streamUrl}`);
        console.log();
      }
    } catch (e) {
      // Ignore
    }

    // PTZ status
    const currentProfile = device.getCurrentProfile();
    if (services.ptz && currentProfile) {
      try {
        const ptzStatus = await services.ptz.getStatus({
          ProfileToken: currentProfile.token
        });

        console.log('PTZ Status:');
        if (ptzStatus && ptzStatus.data) {
          const d = ptzStatus.data;
          const px = parseFloat(d?.PTZStatus?.Position?.PanTilt?.['$']?.x);
          const py = parseFloat(d?.PTZStatus?.Position?.PanTilt?.['$']?.y);
          const pz = parseFloat(d?.PTZStatus?.Position?.Zoom?.['$']?.x);
          if (!isNaN(px)) {
            console.log(`  Pan:  ${px.toFixed(4)}`);
            console.log(`  Tilt: ${py.toFixed(4)}`);
            console.log(`  Zoom: ${pz.toFixed(4)}`);
          } else {
            console.log('  Position data not available');
          }
        } else {
          console.log('  Position data not available');
        }
        console.log();
      } catch (e) {
        console.log('Could not retrieve PTZ status:', e.message);
      }

      // List presets
      try {
        const presets = await services.ptz.getPresets({
          ProfileToken: currentProfile.token
        });

        if (presets && presets.length > 0) {
          console.log(`Presets: ${presets.length} found`);
          presets.forEach(preset => {
            console.log(`  [${preset.token}] ${preset.name || 'Unnamed'}`);
          });
        } else {
          console.log('Presets: None saved');
        }
        console.log();
      } catch (e) {
        console.log('Could not retrieve presets:', e.message);
      }
    }

    // Current profile info
    if (currentProfile && services.media) {
      console.log('Current Profile:', currentProfile.name || currentProfile.token);
      console.log('   Token:', currentProfile.token);
    }

    console.log('\nStatus check complete');
    process.exit(0);

  } catch (error) {
    console.error(`Error: ${formatError(error)}`);
    process.exit(1);
  }
}

checkStatus();
