# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

tapo-control is an OpenClaw skill providing CLI tools for controlling TP-Link Tapo cameras via the ONVIF protocol. It uses **node-onvif** (not node-onvif-ts — different package), fluent-ffmpeg, and minimist. ES modules throughout (`"type": "module"`). Requires Node.js >= 18.

## Commands

```bash
npm install                # install dependencies
npm test                   # run offline test suite (68+ tests)
node scripts/test.js --ip <camera-ip> -u <user> -p '<pass>' --live  # run all tests including live camera
node scripts/status.js --ip <camera-ip> -u <user> -p '<pass>'       # quick smoke test against real camera
```

There is no build step or linter configured. Scripts run directly via `node scripts/<name>.js`.

## Architecture

### Config Loading Chain (lib/common.js)

All scripts share a single config loader with this priority:

**CLI args → process.env → .env file (cwd) → ~/.config/tapo-control/config.json → defaults**

The `.env` file is parsed by a hand-rolled loader in `loadDotenv()` (no dotenv dependency). It handles comments, blank lines, and quoted values.

### Script Pattern

Every script in `scripts/` follows the same structure:
1. Parse args with minimist (aliases, defaults, booleans)
2. `loadConfig(argv)` → merged config object
3. `validateIp()` + credential checks
4. `createDevice(config)` → initialized ONVIF device
5. Perform operation, handle errors via `formatError()`

### node-onvif API Quirks

The node-onvif library has a flat API for PTZ operations — **not** the nested ONVIF XML structure:

```javascript
// CORRECT — flat {x, y, z} objects
ptz.absoluteMove({ ProfileToken: token, Position: { x: 0.5, y: -0.3, z: 0 }, Speed: { x: 1, y: 1, z: 1 } })
ptz.continuousMove({ ProfileToken: token, Velocity: { x: 0.5, y: 0, z: 0 }, Timeout: 5 })

// WRONG — do not use nested PanTilt/Zoom format
// Position: { PanTilt: { x, y }, Zoom: { x } }  ← this is NOT what node-onvif expects
```

PTZ status responses come back as raw XML-parsed objects:
```javascript
const px = parseFloat(status.data?.PTZStatus?.Position?.PanTilt?.['$']?.x);
```

Preset responses also need manual extraction — `getPresets()` returns `{ data: { GetPresetsResponse: { Preset: ... } } }` where Preset may be an object (single) or array (multiple). See `extractPresets()` in preset.js.

`getUdpStreamUrl()` takes **no arguments** and returns a string.

### Negative CLI Values (preprocessArgs)

minimist misinterprets `--pan -0.8` as a `-0` flag. The `preprocessArgs()` function in lib/common.js rewrites `['--pan', '-0.8']` to `['--pan=-0.8']` before minimist sees it. Any script accepting negative numeric values must use this pattern:

```javascript
const argv = minimist(preprocessArgs(process.argv.slice(2), ['pan', 'tilt', 'zoom']), { string: ['pan', 'tilt', 'zoom'], ... });
```

Both `preprocessArgs` (rewriting) and `string` (preventing minimist numeric coercion) are needed together.

## Test Camera

The test camera is a Tapo C200 at `192.168.0.107:2020` (ONVIF) / `:554` (RTSP). Credentials are stored in `.env` (not committed). With `.env` present in cwd, scripts can be run without explicit credential flags.

## Test Suite

`scripts/test.js` contains offline unit tests (validation, parsing, config loading, error formatting, help flags) and optional `--live` integration tests (status, PTZ moves, presets, snapshots). Offline tests run without any camera. The test runner is hand-rolled (no framework) — each test calls `pass(name)` or `fail(name, detail)` and the script exits with code 1 if any test failed.
