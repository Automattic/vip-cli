#!/usr/bin/env node

/**
 * This script bundles the VIP CLI into a single JavaScript file
 * that includes all dependencies. The bundled file can then be
 * converted into a single executable application.
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');

const execPromise = util.promisify(exec);
const writeFilePromise = util.promisify(fs.writeFile);
const mkdirPromise = util.promisify(fs.mkdir);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const BUNDLE_DIR = path.join(PROJECT_ROOT, 'bundle');
const BUNDLE_FILE = path.join(BUNDLE_DIR, 'vip.js');

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
 * Create a bundle using ncc
 */
async function createBundle() {
  try {
    // Make sure bundle directory exists
    try {
      await mkdirPromise(BUNDLE_DIR, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }

    // Install ncc if not already installed
    try {
      await run('npx @vercel/ncc --version');
    } catch (err) {
      console.log('Installing @vercel/ncc...');
      await run('npm install --no-save @vercel/ncc');
    }

    // Build the project first
    console.log('Building project...');
    await run('npm run build', { cwd: PROJECT_ROOT });

    // Bundle using ncc
    console.log('Creating bundle...');
    await run(
      `npx @vercel/ncc build ${path.join(DIST_DIR, 'bin/vip-new.js')} --source-map --minify -o ${BUNDLE_DIR}`,
      { cwd: PROJECT_ROOT }
    );

    // Add shebang to the bundled file
    console.log('Adding shebang to bundled file...');
    const bundledContent = fs.readFileSync(BUNDLE_FILE, 'utf8');
    await writeFilePromise(BUNDLE_FILE, `#!/usr/bin/env node\n${bundledContent}`);
    
    // Make the bundle executable
    console.log('Making bundle executable...');
    fs.chmodSync(BUNDLE_FILE, '755');

    console.log(`\nBundle created successfully at ${BUNDLE_FILE}`);
    console.log('You can run it with: node bundle/vip.js');
  } catch (error) {
    console.error('Error creating bundle:', error);
    process.exit(1);
  }
}

createBundle(); 