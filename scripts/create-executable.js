#!/usr/bin/env node

/**
 * This script creates a single executable application from the bundled CLI
 * using Node.js Single Executable Application (SEA) feature.
 * 
 * Prerequisites:
 * - Node.js 20.0.0 or later
 * - Bundled CLI created with bundle.js
 * 
 * Usage:
 * node scripts/create-executable.js [--platform platform] [--arch architecture]
 * 
 * Options:
 * --platform: Platform to target (darwin, linux, win32)
 * --arch: Architecture to target (x64, arm64)
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const os = require('os');

const execPromise = util.promisify(exec);
const mkdirPromise = util.promisify(fs.mkdir);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BUNDLE_DIR = path.join(PROJECT_ROOT, 'bundle');
const BUNDLE_FILE = path.join(BUNDLE_DIR, 'vip.js');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist-exe');

// Parse command line arguments
const args = process.argv.slice(2);
let platform = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : os.platform();
let arch = args.includes('--arch') ? args[args.indexOf('--arch') + 1] : os.arch();

// Validate platform and architecture
const validPlatforms = ['darwin', 'linux', 'win32'];
const validArchs = ['x64', 'arm64'];

if (!validPlatforms.includes(platform)) {
  console.error(`Invalid platform: ${platform}. Must be one of: ${validPlatforms.join(', ')}`);
  process.exit(1);
}

if (!validArchs.includes(arch)) {
  console.error(`Invalid architecture: ${arch}. Must be one of: ${validArchs.join(', ')}`);
  process.exit(1);
}

/**
 * Run shell command and log output
 */
async function run(command, options = {}) {
  console.log(`Running: ${command}`);
  const { stdout, stderr } = await execPromise(command, options);
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
}

/**
 * Create executable using Node.js SEA
 */
async function createExecutable() {
  try {
    // Check Node.js version
    const nodeVersion = process.version;
    const versionMatch = nodeVersion.match(/^v(\d+)\./);
    const majorVersion = versionMatch ? parseInt(versionMatch[1], 10) : 0;
    
    if (majorVersion < 20) {
      console.error(`Node.js v20.0.0 or later is required. Current version: ${nodeVersion}`);
      process.exit(1);
    }

    // Check if bundle exists
    if (!fs.existsSync(BUNDLE_FILE)) {
      console.error(`Bundle file not found at ${BUNDLE_FILE}`);
      console.error('Please run "node scripts/bundle.js" first');
      process.exit(1);
    }

    // Create output directory
    try {
      await mkdirPromise(DIST_DIR, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }

    // Set executable name based on platform
    const exeName = platform === 'win32' ? 'vip.exe' : 'vip';
    const outputPath = path.join(DIST_DIR, exeName);

    console.log(`Creating executable for ${platform}-${arch}...`);

    // Create the configuration file for SEA
    const configFile = path.join(BUNDLE_DIR, 'sea-config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      main: 'vip.js',
      output: outputPath,
      disableExperimentalSEAWarning: true,
    }, null, 2));

    // Create the executable
    await run(`node --experimental-sea-config ${configFile}`, { cwd: BUNDLE_DIR });

    // Make the executable executable on Unix platforms
    if (platform !== 'win32') {
      fs.chmodSync(outputPath, '755');
    }

    console.log(`\nExecutable created successfully at ${outputPath}`);
  } catch (error) {
    console.error('Error creating executable:', error);
    process.exit(1);
  }
}

createExecutable(); 