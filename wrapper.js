const path = require('path');
const Module = require('module');

// Create proper require function
const requireFromPath = Module.createRequire(__filename);

// Run the actual bundle
requireFromPath('./dist/vip-cli-bundle.js');
