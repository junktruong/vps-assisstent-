const { OpenAIApiAdapter } = require("./openaiApiAdapter");

function createAIAdapter(config, logger) {
  if (config.aiProvider !== "API") {
    throw new Error(
      `Unsupported AI_PROVIDER=${config.aiProvider}. This build supports API only; browser mode must be restored separately.`
    );
  }

  return new OpenAIApiAdapter({
    apiKey: config.openaiApiKey,
    model: config.openaiModel,
    logger,
  });
}

module.exports = {
  createAIAdapter,
};
