#!/usr/bin/env node

/**
 * ONVIF Camera Discovery Script
 * Discovers ONVIF-compliant cameras on the local network
 *
 * Usage: ./discover.js [--timeout 5000]
 */

import Onvif from 'node-onvif';
import minimist from 'minimist';
import { formatError } from '../lib/common.js';

const argv = minimist(process.argv.slice(2), {
  alias: {
    t: 'timeout',
    h: 'help'
  },
  default: {
    timeout: 5000
  }
});

if (argv.help) {
  console.log(`
ONVIF Camera Discovery

Usage: ./discover.js [options]

Options:
  --timeout, -t    Discovery timeout in milliseconds (default: 5000)
  --help, -h       Show this help message

Environment Variables:
  DISCOVERY_TIMEOUT    Alternative to --timeout

Examples:
  ./discover.js
  ./discover.js --timeout 10000
`);
  process.exit(0);
}

const timeout = parseInt(process.env.DISCOVERY_TIMEOUT || argv.timeout, 10);

console.log(`Discovering ONVIF cameras on local network...`);
console.log(`Timeout: ${timeout}ms\n`);

const onvif = new Onvif();

setTimeout(() => {
  console.log('\nDiscovery timeout reached');
  process.exit(0);
}, timeout);

try {
  onvif.startProbe().then((device_info_list) => {
    if (device_info_list.length === 0) {
      console.log('No ONVIF cameras found');
      process.exit(0);
    }

    console.log(`Found ${device_info_list.length} camera(s):\n`);

    device_info_list.forEach((info, index) => {
      console.log(`[${index + 1}] ${info.name || 'Unknown Camera'}`);
      console.log(`    IP Address: ${info.address}`);
      console.log(`    Port: ${info.port || 2020}`);
      console.log(`    URN: ${info.urn || 'N/A'}`);
      if (info.xaddrs) {
        console.log(`    Service URLs:`);
        info.xaddrs.forEach(url => console.log(`      - ${url}`));
      }
      console.log('');
    });

    console.log('Use --ip <address> with other scripts to control cameras');
    process.exit(0);
  }).catch((error) => {
    console.error(`Discovery error: ${formatError(error)}`);
    process.exit(1);
  });
} catch (error) {
  console.error(`Failed to start discovery: ${formatError(error)}`);
  process.exit(1);
}
