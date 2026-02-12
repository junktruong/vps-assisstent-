const OpenAI = require("openai");

class OpenAIApiAdapter {
  constructor({ apiKey, model, logger }) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.logger = logger;
  }

  async completeAction(prompt) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an agent runtime. Reply with exactly one valid JSON object matching the requested action schema.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Model returned empty content");
    }

    return content;
  }
}

module.exports = {
  OpenAIApiAdapter,
};
