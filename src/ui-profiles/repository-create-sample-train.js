const createRepository = require('./create-repository');
const sampleImport = require('./sample-import');
const repositoryPostImport = require('./repository-post-import');
const trainModel = require('./train-model');
const modelsDropdown = require('./models-dropdown');

module.exports = {
  id: 'repository-create-sample-train',
  title: 'Create repository, import sample data, and start training',
  subprofiles: [
    createRepository.id,
    sampleImport.id,
    repositoryPostImport.id,
    trainModel.id,
    modelsDropdown.id,
  ],
  createRepository,
  sampleImport,
  repositoryPostImport,
  trainModel,
  modelsDropdown,
};
