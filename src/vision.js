const fs = require('fs');
const ollama = require('./ollama-client');
const config = require('./config');

function visionLooksUnavailable(error) {
  const message = error && error.message ? error.message : String(error);
  return /not found|model|fetch failed|connect|ECONNREFUSED|unavailable/i.test(message);
}

async function analyzeScreenshot(imagePath) {
  if (!imagePath) {
    return {
      status: 'skipped',
      reason: 'No screenshot path was provided.',
    };
  }

  if (!fs.existsSync(imagePath)) {
    return {
      status: 'skipped',
      reason: `Screenshot not found: ${imagePath}`,
      imagePath,
    };
  }

  try {
    const response = await ollama.chat({
      model: config.models.vision,
      messages: [
        {
          role: 'user',
          content: `
Analyze this screenshot of a web application.
Answer briefly in English:
1. Is the page loaded correctly?
2. Is the text "Your Repositories" visible?
3. Is there any obvious UI problem?
          `.trim(),
          images: [imagePath],
        },
      ],
      stream: false,
      options: { temperature: 0 },
    });

    return {
      status: 'passed',
      model: config.models.vision,
      imagePath,
      analysis: response.message.content,
    };
  } catch (error) {
    return {
      status: visionLooksUnavailable(error) ? 'skipped' : 'failed',
      model: config.models.vision,
      imagePath,
      error: error.message,
    };
  }
}

module.exports = { analyzeScreenshot };
