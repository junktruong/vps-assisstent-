const express = require("express");
const path = require("path");

function extractValuesDeep(value, keysLower, out = []) {
  if (!value || typeof value !== "object") {
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractValuesDeep(item, keysLower, out);
    }
    return out;
  }

  for (const [key, val] of Object.entries(value)) {
    if (keysLower.includes(key.toLowerCase()) && typeof val !== "object") {
      out.push(String(val));
    }
    extractValuesDeep(val, keysLower, out);
  }

  return out;
}

class ZaloBotService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.app = express();
    this.handlers = [];
    this.artifactResolver = null;

    this.app.use(express.json({ limit: "3mb" }));

    this.app.post("/zalo-webhook", this.handleWebhook.bind(this));
    this.app.get("/zalo-artifacts/:artifactId", this.handleArtifact.bind(this));
  }

  addMessageHandler(handler) {
    this.handlers.push(handler);
  }

  setArtifactResolver(resolver) {
    this.artifactResolver = resolver;
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        this.logger.info("Zalo service started", {
          host: this.config.host,
          port: this.config.port,
        });
        resolve();
      });
    });
  }

  async stop() {
    if (!this.server) {
      return;
    }
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  verifySecret(req) {
    const expected = this.config.zaloWebhookSecret;
    const candidates = [];

    for (const headerName of this.config.secretHeaders) {
      const headerValue = req.get(headerName);
      if (headerValue) {
        candidates.push(String(headerValue));
      }
    }

    if (this.config.allowQuerySecret) {
      for (const field of this.config.secretFields) {
        const value = req.query[field];
        if (value) {
          candidates.push(String(value));
        }
      }
    }

    if (this.config.allowBodySecret) {
      const bodyMatches = extractValuesDeep(req.body, this.config.secretFields.map((x) => x.toLowerCase()));
      candidates.push(...bodyMatches);
    }

    return candidates.some((candidate) => candidate === expected);
  }

  parseUpdate(rawBody) {
    const result = rawBody?.result || rawBody || {};
    const candidateMessage = result.message || result.data?.message || result;

    const text =
      candidateMessage?.text ||
      candidateMessage?.content ||
      result?.text ||
      result?.data?.text ||
      "";

    const chatId =
      result?.sender?.id ||
      result?.from?.id ||
      result?.user_id ||
      result?.uid ||
      result?.chat_id ||
      result?.conversation_id ||
      result?.data?.sender?.id;

    if (!text || !chatId) {
      return null;
    }

    return {
      text: String(text),
      chatId: String(chatId),
      raw: result,
    };
  }

  async handleWebhook(req, res) {
    try {
      const okSecret = this.verifySecret(req);
      if (!okSecret) {
        res.status(401).json({ ok: false, error: "Invalid webhook secret" });
        return;
      }

      const update = this.parseUpdate(req.body);
      if (!update) {
        res.json({ ok: true, skipped: true });
        return;
      }

      await Promise.all(
        this.handlers.map((handler) =>
          Promise.resolve(handler(update.text, update.chatId, update.raw)).catch((err) => {
            this.logger.error("Message handler failed", {
              error: err.message,
              chatId: update.chatId,
            });
          })
        )
      );

      res.json({ ok: true });
    } catch (err) {
      this.logger.error("Webhook handling failed", { error: err.message });
      res.status(500).json({ ok: false, error: "Internal server error" });
    }
  }

  async handleArtifact(req, res) {
    try {
      if (!this.artifactResolver) {
        res.status(404).json({ ok: false, error: "Artifact resolver not ready" });
        return;
      }

      const artifactPath = await this.artifactResolver(req.params.artifactId);
      if (!artifactPath) {
        res.status(404).json({ ok: false, error: "Artifact not found" });
        return;
      }

      res.sendFile(path.resolve(artifactPath));
    } catch (err) {
      this.logger.error("Artifact serving failed", {
        error: err.message,
        artifactId: req.params.artifactId,
      });
      res.status(500).json({ ok: false, error: "Artifact error" });
    }
  }

  async sendResponse(chatId, text) {
    const payload = {
      recipient: {
        user_id: String(chatId),
      },
      message: {
        text: String(text),
      },
    };

    await this.sendToZalo(payload);
  }

  async sendImage(chatId, imageUrl, caption = "") {
    const payload = {
      recipient: {
        user_id: String(chatId),
      },
      message: {
        text: caption,
        attachment: {
          type: "template",
          payload: {
            template_type: "media",
            elements: [
              {
                media_type: "image",
                url: imageUrl,
              },
            ],
          },
        },
      },
    };

    try {
      await this.sendToZalo(payload);
    } catch (err) {
      this.logger.warn("sendImage failed, fallback to text link", { error: err.message });
      await this.sendResponse(chatId, `${caption}\n${imageUrl}`.trim());
    }
  }

  async sendToZalo(payload) {
    const response = await fetch(this.config.zaloSendMessageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.zaloBotToken}`,
        access_token: this.config.zaloBotToken,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Zalo API error (${response.status}): ${text}`);
    }
  }
}

module.exports = {
  ZaloBotService,
};
