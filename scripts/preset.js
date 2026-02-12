#!/usr/bin/env node

/**
 * Camera Preset Script
 * Save and recall camera positions (presets)
 *
 * Usage: ./preset.js --ip <ip> --username <user> --password <pass> [options]
 */

import minimist from 'minimist';
import { loadConfig, createDevice, formatError, validateIp } from '../lib/common.js';

const argv = minimist(process.argv.slice(2), {
  alias: {
    i: 'ip',
    u: 'username',
    p: 'password',
    port: 'onvif-port',
    s: 'save',
    g: 'goto',
    d: 'delete',
    l: 'list',
    n: 'name',
    h: 'help'
  },
  default: {
    port: 2020
  },
  boolean: ['list', 'help']
});

if (argv.help) {
  console.log(`
Camera Preset Management

Usage: ./preset.js [options]

Options:
  --ip, -i              Camera IP address (required)
  --username, -u        Username for authentication (required)
  --password, -p        Password for authentication (required)
  --port, --onvif-port  ONVIF port (default: 2020)
  --save, -s <token>    Save current position as preset
  --goto, -g <val>      Move to preset (by token or name)
  --delete, -d <val>    Delete a preset (by token or name)
  --list, -l            List all presets
  --name, -n <name>     Name for preset when saving (optional)
  --help, -h            Show this help message

Environment Variables:
  IP_ADDRESS      Alternative to --ip
  USERNAME        Alternative to --username
  PASSWORD        Alternative to --password
  ONVIF_PORT      Alternative to --port

Examples:
  # List all presets
  ./preset.js --ip 192.168.0.107 -u admin -p secret --list

  # Save current position as preset "home"
  ./preset.js --ip 192.168.0.107 -u admin -p secret --save home --name "Home Position"

  # Go to preset by name or token
  ./preset.js --ip 192.168.0.107 -u admin -p secret --goto "Home Position"
  ./preset.js --ip 192.168.0.107 -u admin -p secret --goto home

  # Delete preset by name or token
  ./preset.js --ip 192.168.0.107 -u admin -p secret --delete home
`);
  process.exit(0);
}

const config = loadConfig(argv);

const ipErr = validateIp(config.ip);
if (ipErr) { console.error(`Error: ${ipErr}`); process.exit(1); }
if (!config.username || !config.password) {
  console.error('Error: Username and password are required');
  process.exit(1);
}

const saveToken = argv.save;
const gotoVal = argv.goto;
const deleteVal = argv.delete;
const listPresets = argv.list;
const presetName = argv.name;

if (!saveToken && !gotoVal && !deleteVal && !listPresets) {
  console.error('Error: No action specified. Use --save, --goto, --delete, or --list');
  process.exit(1);
}

/**
 * Extract presets array from the ONVIF API response.
 * getPresets() returns { data: { GetPresetsResponse: { Preset: ... } } }
 * With explicitArray:false, a single preset is an object, not an array.
 * Each preset has { $: { token: '...' }, Name: '...' }
 */
function extractPresets(result) {
  const raw = result?.data?.GetPresetsResponse?.Preset;
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(p => ({
    token: p.$?.token || '',
    name: p.Name || '',
  }));
}

/**
 * Find a preset by token or name (case-insensitive name match)
 */
function findPreset(presets, val) {
  const valStr = String(val);
  return presets.find(p => p.token === valStr || (p.name && p.name.toLowerCase() === valStr.toLowerCase()));
}

console.log(`Connecting to camera at ${config.ip}:${config.port}...\n`);

async function managePresets() {
  try {
    const device = await createDevice(config);
    console.log('Connected to camera\n');

    const services = device.services;
    if (!services.ptz) {
      console.error('Error: Camera does not support PTZ/presets');
      process.exit(1);
    }

    const ptz = services.ptz;
    const profile = device.getCurrentProfile();
    if (!profile) {
      console.error('Error: No media profile available on this camera');
      process.exit(1);
    }
    const profileToken = profile.token;

    if (listPresets) {
      console.log('Retrieving presets...\n');
      const result = await ptz.getPresets({ ProfileToken: profileToken });
      const presets = extractPresets(result);

      if (presets.length === 0) {
        console.log('No presets found');
        console.log('   Use --save <token> to create a preset');
      } else {
        console.log(`Found ${presets.length} preset(s):\n`);
        console.log('  Token                Name');
        console.log('  ───────────────────  ──────────────────────');
        presets.forEach(preset => {
          const token = (preset.token || '').padEnd(21);
          const name = preset.name || '(unnamed)';
          console.log(`  ${token}${name}`);
        });
      }
      process.exit(0);
    }

    if (saveToken) {
      console.log(`Saving preset "${saveToken}"...`);
      if (presetName) console.log(`   Name: ${presetName}`);

      await ptz.setPreset({
        ProfileToken: profileToken,
        PresetToken: saveToken,
        PresetName: presetName || saveToken
      });
      console.log(`\nPreset "${saveToken}" saved successfully`);
      process.exit(0);
    }

    if (gotoVal) {
      console.log(`Moving to preset "${gotoVal}"...`);
      const result = await ptz.getPresets({ ProfileToken: profileToken });
      const presets = extractPresets(result);
      const preset = findPreset(presets, gotoVal);

      if (!preset) {
        console.error(`\nError: Preset "${gotoVal}" not found`);
        console.error('Available presets:');
        presets.forEach(p => console.error(`  [${p.token}] ${p.name || '(unnamed)'}`));
        process.exit(1);
      }

      await ptz.gotoPreset({
        ProfileToken: profileToken,
        PresetToken: preset.token
      });
      console.log(`Moving to preset "${preset.name || preset.token}" (token: ${preset.token})`);
      process.exit(0);
    }

    if (deleteVal) {
      console.log(`Deleting preset "${deleteVal}"...`);
      const result = await ptz.getPresets({ ProfileToken: profileToken });
      const presets = extractPresets(result);
      const preset = findPreset(presets, deleteVal);

      if (!preset) {
        console.error(`\nError: Preset "${deleteVal}" not found`);
        console.error('Available presets:');
        presets.forEach(p => console.error(`  [${p.token}] ${p.name || '(unnamed)'}`));
        process.exit(1);
      }

      await ptz.removePreset({ ProfileToken: profileToken, PresetToken: preset.token });
      console.log(`Preset "${preset.name || preset.token}" (token: ${preset.token}) deleted successfully`);
      process.exit(0);
    }

  } catch (error) {
    console.error(`Error: ${formatError(error)}`);
    process.exit(1);
  }
}

managePresets();
