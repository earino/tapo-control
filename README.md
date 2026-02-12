# tapo-control

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

**Control TP-Link Tapo cameras from the command line using ONVIF.** Pan, tilt, zoom, take snapshots, manage presets, and discover cameras on your network — all from your terminal.

Built for home automation tinkerers, security camera enthusiasts, and anyone who wants scriptable PTZ camera control without a bulky NVR or vendor app.

## Features

- **Camera Discovery** — Find ONVIF cameras on your local network automatically
- **PTZ Control** — Absolute positioning, continuous movement with auto-stop, and home position
- **Snapshot Capture** — Grab JPEG images via RTSP with configurable quality
- **Preset Management** — Save, recall, and delete camera positions by name or token
- **Status & Info** — Device info, capabilities, stream URLs, current position, and preset list
- **Flexible Config** — CLI args, environment variables, or config file — your choice
- **Zero Dependencies on Camera Firmware** — Uses the standard ONVIF protocol, not proprietary Tapo APIs

## Quick Start

```bash
git clone https://github.com/earino/tapo-control.git
cd tapo-control
npm install

# Check camera status
node scripts/status.js --ip 192.168.0.107 -u admin -p your_password

# Discover cameras on your network
node scripts/discover.js

# Pan left for 2 seconds
node scripts/ptz.js --ip 192.168.0.107 -u admin -p your_password --left --duration 2

# Take a snapshot
node scripts/snapshot.js --ip 192.168.0.107 -u admin -p your_password -o snapshot.jpg
```

## Requirements

- **Node.js** 18.0.0 or later
- **FFmpeg** (for snapshot capture only)
- An **ONVIF-enabled camera** (TP-Link Tapo C200, C210, C225 tested — any ONVIF PTZ camera should work)

## Installation

```bash
git clone https://github.com/earino/tapo-control.git
cd tapo-control
npm install
```

**FFmpeg** (only needed for snapshots):
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg
```

## Configuration

Scripts accept connection parameters in this priority order:

1. **CLI arguments** — `--ip`, `--username` (`-u`), `--password` (`-p`), `--port`
2. **Environment variables** — `IP_ADDRESS`, `USERNAME`, `PASSWORD`, `ONVIF_PORT`
3. **Config file** — `~/.config/tapo-control/config.json`
4. **Defaults** — port 2020

### Config File

Create `~/.config/tapo-control/config.json`:
```json
{
  "ip": "192.168.0.107",
  "username": "admin",
  "password": "your_password",
  "port": 2020
}
```

See `config.example.json` for a template.

## Usage

### Discover Cameras

```bash
node scripts/discover.js
node scripts/discover.js --timeout 10000
```

### Check Status

```bash
node scripts/status.js --ip 192.168.0.107 -u admin -p your_password
```

Shows device info, capabilities, profiles, stream URL, PTZ position, and presets.

### PTZ Control

**Absolute positioning** (supports negative values):
```bash
node scripts/ptz.js --ip 192.168.0.107 -u admin -p your_password --pan -0.8 --tilt 0.3 --zoom 0.2
```

**Continuous movement** with optional auto-stop:
```bash
# Move left for 3 seconds
node scripts/ptz.js --ip 192.168.0.107 -u admin -p your_password --left --speed 0.3 --duration 3

# Start moving, then stop manually
node scripts/ptz.js --ip 192.168.0.107 -u admin -p your_password --right
node scripts/ptz.js --ip 192.168.0.107 -u admin -p your_password --stop
```

**Go home:**
```bash
node scripts/ptz.js --ip 192.168.0.107 -u admin -p your_password --home
```

**All PTZ options:** `--pan`, `--tilt`, `--zoom`, `--left`, `--right`, `--up`, `--down`, `--zoom-in`, `--zoom-out`, `--stop`, `--home`, `--speed`, `--duration`

### Capture Snapshots

```bash
# Basic snapshot
node scripts/snapshot.js --ip 192.168.0.107 -u admin -p your_password -o ./snapshot.jpg

# High quality with timestamp in filename
node scripts/snapshot.js --ip 192.168.0.107 -u admin -p your_password -o ./snap.jpg --quality 1 --timestamp
```

**Options:** `--output` (`-o`), `--quality` (1–31, lower = better), `--timeout`, `--timestamp`

### Manage Presets

```bash
# List all presets
node scripts/preset.js --ip 192.168.0.107 -u admin -p your_password --list

# Save current position as a preset
node scripts/preset.js --ip 192.168.0.107 -u admin -p your_password --save home --name "Home Position"

# Go to preset (by token or name)
node scripts/preset.js --ip 192.168.0.107 -u admin -p your_password --goto "Home Position"

# Delete a preset
node scripts/preset.js --ip 192.168.0.107 -u admin -p your_password --delete home
```

## Supported Cameras

Tested with:
- TP-Link Tapo C200
- TP-Link Tapo C210
- TP-Link Tapo C225
- Any ONVIF-compliant PTZ camera should work

### Enabling ONVIF on Tapo Cameras

1. Open the **Tapo app** on your phone
2. Select your camera → **Settings** → **Advanced Settings**
3. Enable **Camera Account** and create credentials
4. Enable **ONVIF** if there's a separate toggle

### Default Ports

| Service | Port | Description |
|---------|------|-------------|
| ONVIF | 2020 | Device control |
| RTSP | 554 | Video streaming |

## Testing

```bash
# Run offline tests (68 tests covering argument parsing, validation, config loading)
node scripts/test.js

# Run live tests against a real camera
node scripts/test.js --ip 192.168.0.107 -u admin -p your_password --live
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Connection refused | Verify IP, check ONVIF is enabled, `ping <camera-ip>` |
| 401 Unauthorized | Check username/password, recreate camera account in Tapo app |
| FFmpeg not found | `brew install ffmpeg` or `apt-get install ffmpeg` |
| PTZ not working | Confirm camera has motors, check `status.js` capabilities |
| No cameras discovered | Same network? Firewall blocking UDP multicast? Try `--timeout 10000` |
| Negative pan/tilt ignored | Use `--pan -0.8` format (the `-` is handled correctly) |

## OpenClaw Compatibility

This tool is also available as an [OpenClaw](https://github.com/openclaw) skill. See `SKILL.md` for integration details.

## Dependencies

- [node-onvif](https://github.com/futomi/node-onvif) — ONVIF protocol implementation
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) — FFmpeg wrapper for snapshots
- [minimist](https://github.com/minimistjs/minimist) — CLI argument parsing

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Run tests (`node scripts/test.js`)
4. Commit your changes and open a pull request

## License

MIT — see [LICENSE](LICENSE) for details.
