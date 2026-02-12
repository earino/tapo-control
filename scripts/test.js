#!/usr/bin/env node

/**
 * Integration Test Script
 * Validates argument parsing, config loading, and (optionally) live camera commands
 *
 * Usage:
 *   node scripts/test.js                             # offline tests only
 *   node scripts/test.js --ip <ip> -u <user> -p <pass> --live   # all tests
 */

import minimist from 'minimist';
import { loadConfig, validateIp, validateRange, formatError, preprocessArgs } from '../lib/common.js';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const argv = minimist(process.argv.slice(2), {
  alias: { i: 'ip', u: 'username', p: 'password' },
  boolean: ['live'],
  string: ['pan', 'tilt', 'zoom', 'speed']
});

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

function runScript(script, args) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, script);
    execFile('node', [scriptPath, ...args], { timeout: 30000 }, (err, stdout, stderr) => {
      resolve({ err, stdout, stderr, exitCode: err ? err.code : 0 });
    });
  });
}

// ─── Offline Tests ───

section('IP Validation');
assert(validateIp('192.168.0.107') === null, 'Valid IP accepted');
assert(validateIp('10.0.0.1') === null, 'Private IP accepted');
assert(validateIp(null) !== null, 'Null IP rejected');
assert(validateIp('') !== null, 'Empty IP rejected');
assert(validateIp('256.1.1.1') !== null, 'Out-of-range octet rejected');
assert(validateIp('abc.def.ghi.jkl') !== null, 'Non-numeric IP rejected');
assert(validateIp('192.168.0') !== null, 'Short IP rejected');

section('Range Validation');
assert(validateRange(0.5, 0, 1, 'test') === null, 'Mid-range accepted');
assert(validateRange(0, 0, 1, 'test') === null, 'Min boundary accepted');
assert(validateRange(1, 0, 1, 'test') === null, 'Max boundary accepted');
assert(validateRange(-1, -1, 1, 'test') === null, 'Negative boundary accepted');
assert(validateRange(1.5, 0, 1, 'test') !== null, 'Over-range rejected');
assert(validateRange(-2, -1, 1, 'test') !== null, 'Under-range rejected');
assert(validateRange(NaN, 0, 1, 'test') !== null, 'NaN rejected');

section('Config Loading');
{
  const config = loadConfig({ ip: '1.2.3.4', username: 'u', password: 'p', port: 8080 });
  assert(config.ip === '1.2.3.4', 'CLI ip loaded');
  assert(config.username === 'u', 'CLI username loaded');
  assert(config.password === 'p', 'CLI password loaded');
  assert(config.port === 8080, 'CLI port loaded');
}
{
  const config = loadConfig({});
  assert(config.port === 2020, 'Default port is 2020');
}

section('Port Validation');
{
  const config = loadConfig({ port: 8080 });
  assert(config.port === 8080, 'Valid port accepted');
}
{
  const config = loadConfig({ port: 1 });
  assert(config.port === 1, 'Port 1 accepted');
}
{
  const config = loadConfig({ port: 65535 });
  assert(config.port === 65535, 'Port 65535 accepted');
}
{
  let threw = false;
  try { loadConfig({ port: 0 }); } catch (e) { threw = true; }
  assert(threw, 'Port 0 rejected');
}
{
  let threw = false;
  try { loadConfig({ port: 70000 }); } catch (e) { threw = true; }
  assert(threw, 'Port 70000 rejected');
}
{
  let threw = false;
  try { loadConfig({ port: 'abc' }); } catch (e) { threw = true; }
  assert(threw, 'Port "abc" rejected');
}

section('Error Formatting');
assert(formatError(new Error('ECONNREFUSED')).includes('Connection failed'), 'ECONNREFUSED formatted');
assert(formatError(new Error('401 Unauthorized')).includes('Authentication'), '401 formatted');
assert(formatError(new Error('ffmpeg not found')).includes('FFmpeg'), 'ffmpeg formatted');
assert(formatError(new Error('Timeout exceeded')).includes('timed out'), 'timeout formatted');
assert(formatError(new Error('something else')) === 'something else', 'generic error passed through');

section('Negative Value Parsing (preprocessArgs + minimist)');
{
  const raw = ['--pan', '-0.8', '--tilt', '0.3'];
  const processed = preprocessArgs(raw, ['pan', 'tilt']);
  const testArgv = minimist(processed, { string: ['pan', 'tilt'] });
  assert(testArgv.pan === '-0.8', '--pan -0.8 parsed as string "-0.8"');
  assert(parseFloat(testArgv.pan) === -0.8, 'parseFloat("-0.8") = -0.8');
  assert(testArgv.tilt === '0.3', '--tilt 0.3 parsed as string "0.3"');
}

section('Script --help flags');
const helpScripts = ['ptz.js', 'preset.js', 'snapshot.js', 'status.js', 'discover.js'];
const helpPromises = helpScripts.map(async (script) => {
  const result = await runScript(script, ['--help']);
  assert(result.exitCode === 0 || result.err === null, `${script} --help exits cleanly`);
  assert(result.stdout.includes('Usage'), `${script} --help shows usage`);
});
await Promise.all(helpPromises);

section('Script missing args validation');
{
  const result = await runScript('ptz.js', ['--ip', 'not_an_ip']);
  assert(result.exitCode !== 0 || result.stderr.includes('Error'), 'ptz.js rejects invalid IP');
}
{
  const result = await runScript('preset.js', ['--ip', '192.168.0.1', '-u', 'x', '-p', 'y']);
  assert(result.exitCode !== 0 || result.stderr.includes('Error'), 'preset.js requires action flag');
}

section('Snapshot --method validation');
{
  const result = await runScript('snapshot.js', ['--ip', '192.168.0.1', '-u', 'x', '-p', 'y', '-o', '/tmp/test.jpg', '--method', 'invalid']);
  assert(result.exitCode !== 0 || result.stderr.includes('Error'), 'snapshot.js rejects invalid method');
}
{
  const result = await runScript('snapshot.js', ['--help']);
  assert(result.stdout.includes('onvif'), 'snapshot.js --help mentions onvif method');
  assert(result.stdout.includes('--method'), 'snapshot.js --help mentions --method flag');
}

section('Preset: extractPresets parsing');
{
  // Replicate extractPresets logic for unit testing
  function extractPresets(result) {
    const raw = result?.data?.GetPresetsResponse?.Preset;
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map(p => ({
      token: p.$?.token || '',
      name: p.Name || '',
    }));
  }

  function findPreset(presets, val) {
    const valStr = String(val);
    return presets.find(p => p.token === valStr || (p.name && p.name.toLowerCase() === valStr.toLowerCase()));
  }

  // Multiple presets (array)
  const multiResult = {
    data: {
      GetPresetsResponse: {
        Preset: [
          { $: { token: '1' }, Name: 'Home' },
          { $: { token: '2' }, Name: 'Door' },
          { $: { token: '3' }, Name: 'Yard' },
        ]
      }
    }
  };
  const multi = extractPresets(multiResult);
  assert(Array.isArray(multi), 'Multiple presets returns array');
  assert(multi.length === 3, 'Multiple presets has correct count');
  assert(multi[0].token === '1' && multi[0].name === 'Home', 'First preset parsed correctly');
  assert(multi[2].token === '3' && multi[2].name === 'Yard', 'Last preset parsed correctly');

  // Single preset (object, not array - xml2js explicitArray:false)
  const singleResult = {
    data: {
      GetPresetsResponse: {
        Preset: { $: { token: '1' }, Name: 'Home' }
      }
    }
  };
  const single = extractPresets(singleResult);
  assert(Array.isArray(single), 'Single preset returns array');
  assert(single.length === 1, 'Single preset has count 1');
  assert(single[0].token === '1' && single[0].name === 'Home', 'Single preset parsed correctly');

  // No presets
  const emptyResult = { data: { GetPresetsResponse: {} } };
  assert(extractPresets(emptyResult).length === 0, 'No Preset key returns empty array');

  // Null/undefined result
  assert(extractPresets(null).length === 0, 'Null result returns empty array');
  assert(extractPresets({}).length === 0, 'Empty object returns empty array');
  assert(extractPresets({ data: null }).length === 0, 'Null data returns empty array');

  // Preset without Name
  const noNameResult = {
    data: { GetPresetsResponse: { Preset: { $: { token: '5' } } } }
  };
  const noName = extractPresets(noNameResult);
  assert(noName.length === 1, 'Preset without name parsed');
  assert(noName[0].token === '5' && noName[0].name === '', 'Missing name defaults to empty string');

  // findPreset by token
  assert(findPreset(multi, '2').name === 'Door', 'findPreset by token works');
  assert(findPreset(multi, 1).token === '1', 'findPreset coerces number to string token');
  assert(findPreset(multi, '99') === undefined, 'findPreset with unknown token returns undefined');

  // findPreset by name (case-insensitive)
  assert(findPreset(multi, 'home').token === '1', 'findPreset by lowercase name works');
  assert(findPreset(multi, 'HOME').token === '1', 'findPreset by uppercase name works');
  assert(findPreset(multi, 'Door').token === '2', 'findPreset by exact case name works');
  assert(findPreset(multi, 'nonexistent') === undefined, 'findPreset with unknown name returns undefined');
}

// ─── Live Tests ───

if (argv.live) {
  const config = loadConfig(argv);
  const ipCheck = validateIp(config.ip);
  if (ipCheck) {
    console.error(`\nCannot run live tests: ${ipCheck}`);
    process.exit(1);
  }
  if (!config.username || !config.password) {
    console.error('\nCannot run live tests: username and password required');
    process.exit(1);
  }

  const creds = ['--ip', config.ip, '-u', config.username, '-p', config.password];

  section('Live: Status');
  {
    const result = await runScript('status.js', creds);
    assert(result.exitCode === 0 || result.err === null, 'status.js connects');
    assert(result.stdout.includes('Connection successful') || result.stdout.includes('Device Information'), 'status.js shows device info');
  }

  section('Live: PTZ Position');
  {
    const result = await runScript('ptz.js', creds);
    assert(result.exitCode === 0 || result.err === null, 'ptz.js shows position');
    assert(result.stdout.includes('Pan') || result.stdout.includes('position'), 'ptz.js shows pan/tilt');
  }

  section('Live: PTZ Absolute Move (negative pan)');
  {
    const result = await runScript('ptz.js', [...creds, '--pan', '-0.5', '--tilt', '0.2']);
    assert(result.exitCode === 0 || result.err === null, 'ptz.js absolute move succeeds');
    assert(result.stdout.includes('Movement command sent'), 'ptz.js confirms move');
  }

  section('Live: PTZ Continuous Move with Duration');
  {
    const result = await runScript('ptz.js', [...creds, '--left', '--speed', '0.3', '--duration', '2']);
    assert(result.exitCode === 0 || result.err === null, 'ptz.js continuous move succeeds');
    assert(result.stdout.includes('auto-stopped'), 'ptz.js confirms auto-stop');
  }

  section('Live: Preset List');
  {
    const result = await runScript('preset.js', [...creds, '--list']);
    assert(result.exitCode === 0 || result.err === null, 'preset.js list succeeds');
    assert(result.stdout.includes('preset') || result.stdout.includes('Preset') || result.stdout.includes('Token'), 'preset.js shows presets');
  }

  section('Live: Snapshot');
  {
    const testOutput = path.join(__dirname, '..', 'test_snapshot.jpg');
    const result = await runScript('snapshot.js', [...creds, '-o', testOutput]);
    assert(result.exitCode === 0 || result.err === null, 'snapshot.js captures image');
    const exists = fs.existsSync(testOutput);
    assert(exists, 'snapshot file created');
    if (exists) fs.unlinkSync(testOutput);
  }

  section('Live: Snapshot via ONVIF');
  {
    const testOutput = path.join(__dirname, '..', 'test_onvif.jpg');
    const result = await runScript('snapshot.js', [...creds, '-o', testOutput, '--method', 'onvif']);
    assert(result.exitCode === 0 || result.err === null, 'snapshot.js --method onvif captures image');
    const exists = fs.existsSync(testOutput);
    assert(exists, 'onvif snapshot file created');
    if (exists) fs.unlinkSync(testOutput);
  }

  section('Live: Snapshot with Timestamp');
  {
    const testOutput = path.join(__dirname, '..', 'test_ts.jpg');
    const result = await runScript('snapshot.js', [...creds, '-o', testOutput, '--timestamp']);
    assert(result.exitCode === 0 || result.err === null, 'snapshot.js --timestamp works');
    // The actual file will have a timestamp in the name, clean up
    const dir = path.join(__dirname, '..');
    const files = fs.readdirSync(dir).filter(f => f.startsWith('test_ts_'));
    assert(files.length > 0, 'timestamped snapshot file created');
    files.forEach(f => fs.unlinkSync(path.join(dir, f)));
  }
} else {
  console.log('\n(Skipping live tests - use --live --ip <ip> -u <user> -p <pass> to run)');
}

// ─── Summary ───

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
