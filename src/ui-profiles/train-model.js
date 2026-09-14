module.exports = {
  id: 'train-model',
  title: 'Start object detection training',
  entry_button: 'Build a Model',
  dialog: {
    title: 'Build a Model',
    training_type: 'Object Detection',
    expanded_fingerprint: [
      'Build a Model',
      'Object Detection',
      'Training Directory',
      'Training settings',
      'Normal',
      'Plus',
      'Start Training',
    ],
    defaults: {
      time_budget: 'Normal',
      model_size: 'Plus',
    },
    start_button: 'Start Training',
  },
  post_start: {
    models_button: 'Models',
    pageUpdateTimeoutMs: 120_000,
  },
};
