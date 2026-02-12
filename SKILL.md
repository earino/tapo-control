# tapo-control

An OpenClaw skill for controlling TP-Link Tapo cameras via the ONVIF protocol.

## Description

This skill provides comprehensive control over ONVIF-compliant cameras, specifically tested with TP-Link Tapo series cameras. It supports camera discovery, PTZ (Pan-Tilt-Zoom) control, snapshot capture, preset management, and status monitoring.

## Features

- **ONVIF Discovery** - Automatically find cameras on your local network
- **PTZ Control** - Precise Pan, Tilt, and Zoom control with absolute and continuous movement
- **Snapshots** - Capture still images from the RTSP stream
- **Presets** - Save and recall camera positions (lookup by token or name)
- **Status** - View camera information, capabilities, and current settings

## Requirements

- Node.js 18.0.0 or higher
- FFmpeg (for snapshot capture)
- ONVIF-enabled camera (TP-Link Tapo C200/C210/C225 recommended)

## Installation

```bash
cd skills/tapo-control
npm install
chmod +x scripts/*.js
```

### Installing FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html and add to PATH.

## Configuration

Scripts accept parameters via (in priority order):

1. **CLI arguments** (`--ip`, `--username`, `--password`, `--port`)
2. **Environment variables** (`IP_ADDRESS`, `USERNAME`, `PASSWORD`, `ONVIF_PORT`)
3. **Config file** (`~/.config/tapo-control/config.json`)
4. **Defaults** (port: 2020)

| Parameter | CLI Flag | Environment Variable | Description |
|-----------|----------|---------------------|-------------|
| IP Address | `--ip` | `IP_ADDRESS` | Camera IP address |
| Username | `--username` | `USERNAME` | ONVIF username |
| Password | `--password` | `PASSWORD` | ONVIF password |
| ONVIF Port | `--port` | `ONVIF_PORT` | ONVIF port (default: 2020) |
| Output Path | `--output` | `OUTPUT_PATH` | Snapshot output file |

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

## Usage

### 1. Discover Cameras

Find all ONVIF cameras on your local network:

```bash
./scripts/discover.js
./scripts/discover.js --timeout 10000
```

### 2. Check Camera Status

View detailed camera information and capabilities:

```bash
./scripts/status.js --ip 192.168.0.107 --username admin --password secret
```

**Output includes:**
- Device information (manufacturer, model, firmware)
- Supported capabilities (PTZ, streaming, events)
- Video profiles
- Stream URL
- PTZ current position
- Saved presets

### 3. PTZ Control

**Absolute positioning** (negative values supported):
```bash
# Move to specific coordinates (-1.0 to 1.0 for pan/tilt, 0.0 to 1.0 for zoom)
./scripts/ptz.js --ip 192.168.0.107 -u admin -p secret --pan -0.8 --tilt 0.3 --zoom 0.2
```

**Continuous movement** with optional auto-stop:
```bash
# Move left for 3 seconds then auto-stop
./scripts/ptz.js --ip 192.168.0.107 -u admin -p secret --left --speed 0.3 --duration 3

# Start moving (manual stop later)
./scripts/ptz.js --ip 192.168.0.107 -u admin -p secret --left --speed 0.3

# Stop movement
./scripts/ptz.js --ip 192.168.0.107 -u admin -p secret --stop
```

**Return to home:**
```bash
./scripts/ptz.js --ip 192.168.0.107 -u admin -p secret --home
```

**Available movement options:**
- `--pan <value>` - Set pan position (-1.0 to 1.0)
- `--tilt <value>` - Set tilt position (-1.0 to 1.0)
- `--zoom <value>` - Set zoom level (0.0 to 1.0)
- `--left` / `--right` - Continuous pan movement
- `--up` / `--down` - Continuous tilt movement
- `--zoom-in` / `--zoom-out` - Continuous zoom
- `--stop` - Stop continuous movement
- `--home` - Return to home position
- `--speed <value>` - Movement speed 0.0 to 1.0 (default: 0.5)
- `--duration <seconds>` - Auto-stop after N seconds (continuous moves only)

### 4. Capture Snapshots

Save a still image from the camera:

```bash
# Basic snapshot
./scripts/snapshot.js --ip 192.168.0.107 -u admin -p secret --output ./snapshot.jpg

# High quality with timestamp in filename
./scripts/snapshot.js --ip 192.168.0.107 -u admin -p secret -o ./snap.jpg --quality 1 --timestamp
```

**Options:**
- `--output, -o` - Output file path (required)
- `--quality, -q` - JPEG quality 1-31 (lower is better, default: 2)
- `--timeout` - Capture timeout in seconds (default: 10)
- `--timestamp` - Append timestamp to filename (e.g. `snap_20240101_120000.jpg`)

### 5. Preset Management

Save and recall camera positions by token or name:

**List presets:**
```bash
./scripts/preset.js --ip 192.168.0.107 -u admin -p secret --list
```

**Save current position:**
```bash
./scripts/preset.js --ip 192.168.0.107 -u admin -p secret --save home --name "Home Position"
```

**Go to preset (by token or name):**
```bash
./scripts/preset.js --ip 192.168.0.107 -u admin -p secret --goto home
./scripts/preset.js --ip 192.168.0.107 -u admin -p secret --goto "Home Position"
```

**Delete preset (by token or name):**
```bash
./scripts/preset.js --ip 192.168.0.107 -u admin -p secret --delete home
```

## Testing

```bash
# Offline tests
node scripts/test.js

# Live tests (requires camera)
node scripts/test.js --ip 192.168.0.107 -u admin -p secret --live
```

## NPM Scripts

```bash
npm run discover
npm run status -- --ip 192.168.0.107 -u admin -p secret
npm run ptz -- --ip 192.168.0.107 -u admin -p secret --home
npm run snapshot -- --ip 192.168.0.107 -u admin -p secret -o ./snap.jpg
npm run preset -- --ip 192.168.0.107 -u admin -p secret --list
npm test
```

## Supported Cameras

Tested with:
- TP-Link Tapo C200
- TP-Link Tapo C210
- TP-Link Tapo C225
- Any ONVIF-compliant camera

## ONVIF Configuration

### Enabling ONVIF on Tapo Cameras

1. Open the Tapo app on your phone
2. Select your camera
3. Go to Settings > Advanced Settings
4. Enable "Camera Account"
5. Create an account username and password
6. Enable ONVIF if there's a separate toggle

### Default Ports

| Service | Port | Description |
|---------|------|-------------|
| ONVIF | 2020 | Device control and configuration |
| RTSP | 554 | Video streaming |
| HTTP | 80 | Web interface and snapshots |

## Troubleshooting

### Connection refused
- Verify the camera IP address is correct
- Ensure ONVIF is enabled in camera settings
- Check that the camera account is created and enabled
- Verify network connectivity: `ping <camera-ip>`

### Unauthorized errors
- Double-check username and password
- Ensure the camera account has PTZ permissions
- Try recreating the camera account

### FFmpeg not found
- Install FFmpeg: `brew install ffmpeg` (macOS) or `apt-get install ffmpeg` (Linux)
- Verify installation: `ffmpeg -version`

### PTZ not working
- Confirm camera supports PTZ (physically motorised)
- Check camera capabilities with `status.js`
- Some cameras require enabling PTZ in ONVIF settings

### Discovery not finding cameras
- Ensure camera and computer are on the same network
- Check firewall settings (UDP multicast may be blocked)
- Try increasing timeout: `--timeout 10000`
- Some cameras may have discovery disabled

### Negative pan/tilt values not working
- Use `--pan -0.8` format; the parser handles negative values correctly

## Script Reference

### discover.js
```bash
./scripts/discover.js [--timeout 5000]
```

### status.js
```bash
./scripts/status.js --ip <ip> --username <user> --password <pass> [--port 2020]
```

### ptz.js
```bash
./scripts/ptz.js --ip <ip> -u <user> -p <pass> [options]
  --pan <value>        Absolute pan (-1.0 to 1.0)
  --tilt <value>       Absolute tilt (-1.0 to 1.0)
  --zoom <value>       Absolute zoom (0.0 to 1.0)
  --left/--right       Continuous pan
  --up/--down          Continuous tilt
  --zoom-in/out        Continuous zoom
  --stop               Stop movement
  --home               Go to home
  --speed <value>      Movement speed (default: 0.5)
  --duration <seconds> Auto-stop after N seconds
```

### snapshot.js
```bash
./scripts/snapshot.js --ip <ip> -u <user> -p <pass> -o <file> [--quality 2] [--timestamp]
```

### preset.js
```bash
./scripts/preset.js --ip <ip> -u <user> -p <pass> [action]
  --list               List all presets
  --save <token>       Save current position
  --goto <val>         Move to preset (token or name)
  --delete <val>       Delete preset (token or name)
  --name <name>        Name for saved preset
```

## Dependencies

- [node-onvif](https://github.com/futomi/node-onvif) - ONVIF protocol implementation
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - FFmpeg wrapper for Node.js
- [minimist](https://github.com/minimistjs/minimist) - Command-line argument parsing

## License

MIT

## Author

OpenClaw
