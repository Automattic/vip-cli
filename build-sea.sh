#!/bin/bash
set -e

echo "Building TypeScript project..."
npm run build

#echo "Installing esbuild for bundling..."
#npm install --save-dev esbuild

echo "Creating bundler script..."
cat > scripts/bundle.js << 'EOF'
const esbuild = require('esbuild');

esbuild.buildSync({
  entryPoints: ['./dist/bin/vip-new.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: './dist/vip-cli-bundle.js',
  minify: false,
  format: 'cjs',
  sourcemap: false,
  external: [
    'node:*',
    'fs', 'path', 'os', 'child_process', 'util', 'events', 'stream', 
    'http', 'https', 'crypto', 'zlib', 'buffer', 'string_decoder', 'url',
    'assert', 'tty', 'net', 'dns', 'dgram', 'querystring', 'readline',
    'perf_hooks', 'async_hooks', 'worker_threads', 'inspector', 'trace_events',
    'cluster', 'module', 'v8', 'vm'
  ],
  mainFields: ['main'],
  loader: {
    '.js': 'js',
    '.json': 'json',
    '.node': 'file'
  },
  packages: 'external',
  logLevel: 'info'
})
EOF

echo "Bundling the application..."
mkdir -p scripts
node scripts/bundle.js

echo "Creating SEA config file..."
cat > sea-config.json << 'EOF'
{
  "main": "./wrapper.js",
  "output": "sea-prep.blob"
}
EOF

echo "Generating SEA preparation blob..."
node --experimental-sea-config sea-config.json

echo "Creating copy of node executable..."
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
  cp $(command -v node) vip-cli
else
  node -e "require('fs').copyFileSync(process.execPath, 'vip-cli.exe')"
fi

echo "Removing binary signature (if needed)..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  codesign --remove-signature vip-cli
elif [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "cygwin"* ]] || [[ "$OSTYPE" == "win"* ]]; then
  echo "On Windows, you may need to run: signtool remove /s vip-cli.exe"
fi

echo "Installing postject..."
npm install --save-dev postject

echo "Injecting the blob into the executable..."
if [[ "$OSTYPE" == "linux"* ]]; then
  npx postject vip-cli NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
elif [[ "$OSTYPE" == "darwin"* ]]; then
  npx postject vip-cli NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --macho-segment-name NODE_SEA
else
  npx postject vip-cli.exe NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
fi

echo "Signing the binary (if needed)..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  codesign --sign - vip-cli
elif [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "cygwin"* ]] || [[ "$OSTYPE" == "win"* ]]; then
  echo "On Windows, you may need to run: signtool sign /a vip-cli.exe"
fi

echo "Process complete. Test the executable with:"
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
  echo "./vip-cli"
else
  echo "./vip-cli.exe"
fi