const { OpenAIApiAdapter } = require("./openaiApiAdapter");
const { BrowserChatgptAdapter } = require("./browserChatgptAdapter");

function createAIAdapter(config, logger) {
  if (config.aiProvider === "API") {
    return new OpenAIApiAdapter({
      apiKey: config.openaiApiKey,
      model: config.openaiModel,
      logger,
    });
  }

  if (config.aiProvider === "BROWSER") {
    return new BrowserChatgptAdapter({
      logger,
      config,
    });
  }

  throw new Error(`Unsupported AI_PROVIDER=${config.aiProvider}. Supported values: API, BROWSER.`);
}

module.exports = {
  createAIAdapter,
};
