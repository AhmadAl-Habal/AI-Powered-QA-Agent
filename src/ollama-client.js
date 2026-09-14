const { Ollama } = require('ollama');
const config = require('./config');

const ollama = new Ollama({
  host: config.ollamaBaseUrl,
});

module.exports = ollama;
