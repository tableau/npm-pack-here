/**
 * This script marks the package.json bin script as executable so it is runnable on linux
 */

const path = require('path');
const fs = require('fs');

const mainScriptPath = path.resolve(__dirname, '../lib/src/cli.js');

console.log(`Marking '${mainScriptPath}' file permissions as executable`);

fs.chmodSync(mainScriptPath, 0o755);

console.log(`Done`);
