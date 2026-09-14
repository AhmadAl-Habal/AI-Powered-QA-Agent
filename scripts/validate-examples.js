const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { TestCaseSchema } = require('../src/testcase-schema');
const { buildPlan, PlanSchema, selectFlowProfile } = require('../src/planner');

const examplesDir = path.join(config.projectRoot, 'testcases', 'examples');
const exampleFiles = fs
  .readdirSync(examplesDir)
  .filter((name) => name.endsWith('.json'))
  .sort();

async function main() {
  if (exampleFiles.length === 0) {
    throw new Error('No JSON examples were found.');
  }

  for (const name of exampleFiles) {
    const filePath = path.join(examplesDir, name);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const testCase = TestCaseSchema.parse(raw);
    const profile = selectFlowProfile(testCase);
    if (!profile || profile.id !== testCase.flow_profile) {
      throw new Error(`${name} does not resolve to its declared flow profile.`);
    }

    const plan = await buildPlan({
      ...testCase,
      start_url: 'https://qa.example.test/repositories',
    });
    PlanSchema.parse(plan);
  }

  console.log(`Schema and guided-plan validation passed for ${exampleFiles.length} examples.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
