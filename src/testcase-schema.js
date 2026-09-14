const { z } = require('zod');

const TestStepSchema = z.union([
  z.string().min(1),
  z
    .object({
      description: z.string().optional(),
      precondition: z.string().optional(),
      expected_result: z.string().optional(),
      notes: z.array(z.string()).optional(),
      data_hints: z.array(z.string()).optional(),
      action: z.string().optional(),
      selector: z.string().optional(),
      text: z.string().optional(),
      value: z.string().optional(),
      url: z.string().optional(),
      files: z.array(z.string()).optional(),
      timeoutMs: z.number().int().positive().optional(),
    })
    .passthrough(),
]);

const SplitSuggestionSchema = z
  .object({
    title: z.string().min(1),
    reason: z.string().optional(),
    notes: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
  })
  .passthrough();

const TestCaseSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    flow_profile: z.string().min(1).optional(),
    requires_auth: z.boolean().default(true),
    start_url: z.string().min(1).nullable().optional(),
    app_host: z.string().min(1).optional(),
    preconditions: z.array(z.string()).default([]),
    test_data: z.record(z.string(), z.unknown()).default({}),
    steps: z.array(TestStepSchema).min(1),
    expected_results: z.array(z.string()).min(1),
    tags: z.array(z.string()).default([]),
    source_notes: z.array(z.string()).default([]),
    split_suggestions: z.array(SplitSuggestionSchema).default([]),
  })
  .strict();

module.exports = { TestCaseSchema };
