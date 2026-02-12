# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-06-01

### Added
- PTZ control with absolute positioning, continuous movement, and auto-stop (`ptz.js`)
- Camera snapshot capture via RTSP/ffmpeg (`snapshot.js`)
- ONVIF snapshot method (`--method onvif`) — no ffmpeg dependency required
- Preset management: save, goto, delete, list (`preset.js`)
- Camera status and capability reporting (`status.js`)
- ONVIF device discovery on local network (`discover.js`)
- Shared utility library (`lib/common.js`) with config loading, IP validation, error formatting
- Multi-source configuration: CLI args > environment variables > config file > defaults
- Negative value support for pan/tilt (e.g., `--pan -0.8`)
- Preset lookup by name or token (case-insensitive)
- Timestamp option for snapshot filenames (`--timestamp`)
- Integration test suite with 39+ offline tests (`scripts/test.js`)
- README, SKILL.md, config examples, and full CLI documentation
