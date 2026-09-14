const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../src/config');

const roots = [
  path.join(config.projectRoot, 'src'),
  path.join(config.projectRoot, 'scripts'),
  path.join(config.projectRoot, 'tests'),
];

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectJavaScriptFiles(fullPath);
    }
    return entry.isFile() && /\.(?:js|ts)$/.test(entry.name) ? [fullPath] : [];
  });
}

const files = [path.join(config.projectRoot, 'playwright.config.js'), ...roots.flatMap(collectJavaScriptFiles)];
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push(`${path.relative(config.projectRoot, file)}\n${result.stderr || result.stdout}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Syntax check passed for ${files.length} source files.`);
}
