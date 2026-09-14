module.exports = {
  id: 'sample-import',
  title: 'Import a fixed sample dataset',
  tab: 'Try a Sample',
  sample: {
    name: 'Fruit Detection',
    continue_button: 'Continue with Fruit Detection',
  },
  fingerprints: {
    sample_picker: ['Try a Sample', 'Fruit Detection'],
    import_complete: ['Files imported successfully', 'Done'],
  },
  success_text: 'Files imported successfully',
  done_button: 'Done',
  importTimeoutMs: 180_000,
};
