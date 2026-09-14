const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoots = ['src', 'scripts', 'tests'].map((name) => path.join(projectRoot, name));

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }
    return entry.isFile() && /\.(?:js|ts)$/.test(entry.name) ? [fullPath] : [];
  });
}

function resolveRelativeImport(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js')];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const files = [path.join(projectRoot, 'playwright.config.js'), ...sourceRoots.flatMap(collectSourceFiles)];
const failures = [];
let checked = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const relativeRequire = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
  let match;

  while ((match = relativeRequire.exec(source)) !== null) {
    checked += 1;
    const resolved = resolveRelativeImport(file, match[1]);
    const staysInsideProject =
      resolved &&
      (resolved === projectRoot || resolved.startsWith(`${projectRoot}${path.sep}`));

    if (!resolved || !staysInsideProject) {
      failures.push(`${path.relative(projectRoot, file)} -> ${match[1]}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Invalid or escaping relative imports:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Import check passed for ${checked} relative imports.`);
}
