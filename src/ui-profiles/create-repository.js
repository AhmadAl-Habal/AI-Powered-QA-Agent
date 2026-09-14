module.exports = {
  id: 'create-repository',
  title: 'Create repository and open add-content dialog',
  page_ready_signals: ['Your Repositories'],
  entry_triggers: ['Create New Repository', 'Create Your First Repo', 'Create Repository'],
  create_dialog: {
    title: 'Create New Repository',
    verification_texts: [
      'Create New Repository',
      'Repository Name',
      'Description',
      'Create & Continue',
    ],
    fields: {
      repository_name: {
        label: 'Repository Name',
        placeholder: 'e.g., Manufacturing-Q1-2026, Product-Photos, Quality-Control',
        required: true,
        unique_per_run: true,
      },
      description: {
        label: 'Description',
        placeholder: "Describe what this repository is for",
        labels: ['Description', 'Description (optional)'],
        required: false,
      },
    },
    continue_button: 'Create & Continue',
  },
  add_content_dialog: {
    title: 'Add Content to Repository',
    verification_texts: ['Add Content to Repository', 'Upload Files'],
    required_tab: 'Upload Files',
  },
  assertions: {
    page_ready: 'Your Repositories',
    create_dialog_open: 'Create New Repository',
    add_content_dialog_open: 'Add Content to Repository',
    upload_tab_visible: 'Upload Files',
  },
  success_signals: ['Add Content to Repository', 'Upload Files'],
};
