const fs = require('fs');
const path = require('path');
const { buildPlan } = require('./planner');
const { executePlan } = require('./executor');
const { analyzeScreenshot } = require('./vision');
const { TestCaseSchema } = require('./testcase-schema');
const config = require('./config');

const DEFAULT_TESTCASE_PATH = path.join(
  config.projectRoot,
  'testcases',
  'examples',
  'repository-create-guided.json'
);

function resolveTestCasePath(cliPath) {
  if (cliPath) {
    const resolved = path.isAbsolute(cliPath) ? cliPath : path.resolve(config.projectRoot, cliPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Test case file not found: ${resolved}`);
    }
    return resolved;
  }

  if (fs.existsSync(DEFAULT_TESTCASE_PATH)) {
    return DEFAULT_TESTCASE_PATH;
  }

  throw new Error(
    'No test case file was provided. Pass one like: node src/run-agent.js testcases/examples/repository-create-guided.json'
  );
}

function formatZodIssues(error) {
  return error.issues
    .map((issue) => {
      const field = issue.path.length ? issue.path.join('.') : '(root)';
      return `${field}: ${issue.message}`;
    })
    .join('; ');
}

function loadTestCase(filePath) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read valid JSON from ${filePath}: ${error.message}`);
  }

  const result = TestCaseSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid test case ${filePath}: ${formatZodIssues(result.error)}`);
  }

  return result.data;
}

function safeName(value) {
  return (
    String(value || 'run')
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'run'
  );
}

function createRunDir(testCase) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(config.artifactsDir, `${timestamp}-${safeName(testCase.id)}`);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function skippedResult(reason) {
  return { status: 'skipped', reason };
}

function collectScreenshots(executionResult) {
  const screenshots = [];

  for (const step of executionResult.steps || []) {
    if (step.screenshot) {
      screenshots.push(step.screenshot);
    }
  }

  if (executionResult.finalScreenshot) {
    screenshots.push(executionResult.finalScreenshot);
  }

  if (executionResult.failedStep && executionResult.failedStep.screenshot) {
    screenshots.push(executionResult.failedStep.screenshot);
  }

  return [...new Set(screenshots)];
}

function buildFinalReport({
  testCase,
  plan,
  plannerStatus,
  plannerError,
  executionResult,
  visionResult,
  runDir,
  reportPath,
}) {
  const executionStatus = executionResult.status || 'skipped';
  const finalStatus =
    plannerStatus === 'passed' && executionStatus === 'passed' ? 'passed' : 'failed';

  return {
    test_case_id: testCase.id,
    title: testCase.title,
    flow_profile: plan && plan.flow_profile ? plan.flow_profile : testCase.flow_profile || null,
    flow_profiles: plan && plan.flow_profiles ? plan.flow_profiles : [],
    runtime_values: plan && plan.runtime_values ? plan.runtime_values : {},
    generated_plan: plan || null,
    planner_status: plannerStatus,
    execution_status: executionStatus,
    vision_status: visionResult.status || 'skipped',
    final_status: finalStatus,
    final_url: executionResult.finalUrl || null,
    screenshots: collectScreenshots(executionResult),
    failed_step: executionResult.failedStep || null,
    error_summary: plannerError || executionResult.error || null,
    artifacts_dir: runDir,
    report_path: reportPath,
  };
}

function printSummary(report) {
  console.log('\n--- Agent summary ---');
  console.log(`test case: ${report.title}`);
  console.log(`flow profile: ${report.flow_profile || 'none'}`);
  if (report.flow_profiles.length > 0) {
    console.log(`flow profiles: ${report.flow_profiles.join(' -> ')}`);
  }
  if (report.runtime_values.repository_name) {
    console.log(`repository: ${report.runtime_values.repository_name}`);
  }
  console.log(`planner: ${report.planner_status}`);
  console.log(`execution: ${report.execution_status}`);
  console.log(`vision: ${report.vision_status}`);
  console.log(`final status: ${report.final_status}`);
  console.log(`final report: ${report.report_path}`);
}

async function main() {
  let testCasePath;
  let testCase;

  try {
    testCasePath = resolveTestCasePath(process.argv[2]);
    testCase = loadTestCase(testCasePath);
  } catch (error) {
    console.error('Agent run failed:', error.message);
    process.exitCode = 1;
    return;
  }

  const runDir = createRunDir(testCase);
  const planPath = path.join(runDir, 'plan.json');
  const executionPath = path.join(runDir, 'execution-result.json');
  const visionPath = path.join(runDir, 'vision-result.json');
  const reportPath = path.join(runDir, 'final-report.json');

  let plan;
  let plannerStatus = 'failed';
  let plannerError;
  let executionResult = skippedResult('Planner did not produce a valid plan.');
  let visionResult = skippedResult('No execution screenshot was available.');

  console.log(`--- Test case: ${testCase.title} ---`);
  console.log(`input: ${testCasePath}`);
  console.log(`artifacts: ${runDir}`);

  console.log(`\n--- Step 1: Build plan with profiles or ${config.models.planner} ---`);
  try {
    plan = await buildPlan(testCase);
    plannerStatus = 'passed';
    writeJson(planPath, plan);
    console.log(JSON.stringify(plan, null, 2));
  } catch (error) {
    plannerError = error.message;
    writeJson(planPath, { status: 'failed', error: plannerError });
    console.error(`Planner failed: ${plannerError}`);
  }

  if (plannerStatus === 'passed') {
    console.log('\n--- Step 2: Execute plan with Playwright ---');
    try {
      executionResult = await executePlan(plan, {
        screenshotsDir: path.join(runDir, 'screenshots'),
        requiresAuth: testCase.requires_auth,
      });
    } catch (error) {
      executionResult = {
        status: 'failed',
        error: error.message,
        steps: [],
      };
    }
    writeJson(executionPath, executionResult);
    console.log(JSON.stringify(executionResult, null, 2));
  } else {
    writeJson(executionPath, executionResult);
  }

  if (executionResult.finalScreenshot) {
    console.log(`\n--- Step 3: Analyze final screenshot with ${config.models.vision} ---`);
    try {
      visionResult = await analyzeScreenshot(executionResult.finalScreenshot);
    } catch (error) {
      visionResult = {
        status: 'failed',
        error: error.message,
      };
    }
    console.log(JSON.stringify(visionResult, null, 2));
  }
  writeJson(visionPath, visionResult);

  const finalReport = buildFinalReport({
    testCase,
    plan,
    plannerStatus,
    plannerError,
    executionResult,
    visionResult,
    runDir,
    reportPath,
  });

  writeJson(reportPath, finalReport);
  printSummary(finalReport);

  if (finalReport.final_status !== 'passed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Agent run failed:', error);
  process.exitCode = 1;
});
