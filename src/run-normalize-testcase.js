const fs = require('fs');
const { DEFAULT_INBOX_PATH, normalizeTestCase } = require('./normalize-testcase');

async function main() {
  const inputPath = process.argv[2] || DEFAULT_INBOX_PATH;

  if (!process.argv[2] && !fs.existsSync(DEFAULT_INBOX_PATH)) {
    console.error('Usage: node src/run-normalize-testcase.js raw-testcases/example-confluence-testcase.txt');
    console.error('   or: npm run testcase:normalize');
    console.error('   or: npm run testcase:normalize -- raw-testcases/example-confluence-testcase.txt');
    console.error(`Default inbox file not found: ${DEFAULT_INBOX_PATH}`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await normalizeTestCase(inputPath);

    console.log('Test case normalized successfully.');
    console.log(`input: ${result.inputPath}`);
    console.log(`model: ${result.model}`);
    console.log(`output: ${result.outputPath}`);
    console.log(`id: ${result.normalized.id}`);
    console.log(`title: ${result.normalized.title}`);
    console.log(`steps: ${result.normalized.steps.length}`);
    console.log(`expected results: ${result.normalized.expected_results.length}`);
    console.log(`split suggestions: ${result.normalized.split_suggestions.length}`);
  } catch (error) {
    console.error('Test case normalization failed:', error.message);
    process.exitCode = 1;
  }
}

main();
