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
