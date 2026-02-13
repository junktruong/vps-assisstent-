const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

function execFileAsync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, options, (error, stdout, stderr) => {
      if (error) {
        const err = new Error(
          `Command failed: ${cmd} ${args.join(" ")}\n${stderr || stdout || error.message}`
        );
        err.cause = error;
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

class BrowserChatgptAdapter {
  constructor({ logger, config }) {
    this.logger = logger;
    this.chatgptUrl = config.chatgptUrl;
    this.session = config.chatgptSession;
    this.headed = config.chatgptBrowserHeaded;
    this.responseTimeoutMs = config.chatgptResponseTimeoutMs;
    this.idlePollMs = config.chatgptIdlePollMs;
    this.promptSelector = config.chatgptPromptSelector;
    this.responseSelector = config.chatgptResponseSelector;
    this.workspaceRoot = config.workspaceRoot;

    const explicitBin = config.playwrightCliBin || "";
    if (explicitBin) {
      this.command = explicitBin;
      this.prefixArgs = [];
    } else {
      this.command = "npx";
      this.prefixArgs = ["--yes", "--package", "@playwright/mcp", "playwright-mcp"];
    }
  }

  async completeAction(prompt) {
    const runId = `${Date.now()}_${crypto.randomUUID()}`;
    const tmpDir = path.join(this.workspaceRoot, "artifacts", "browser_tmp");
    const promptFile = path.join(tmpDir, `prompt_${runId}.txt`);
    const outputFile = path.join(tmpDir, `response_${runId}.txt`);

    await fsp.mkdir(tmpDir, { recursive: true });
    await fsp.writeFile(promptFile, prompt, "utf8");

    try {
      await this.runCli([
        "--session",
        this.session,
        "open",
        this.chatgptUrl,
        ...(this.headed ? ["--headed"] : []),
      ]);

      await this.runCli(
        ["--session", this.session, "run-code", this.buildRunCode(promptFile, outputFile)],
        { timeoutMs: this.responseTimeoutMs + 30_000 }
      );

      const text = await fsp.readFile(outputFile, "utf8");
      const content = String(text || "").trim();
      if (!content) {
        throw new Error("ChatGPT browser mode returned empty response");
      }
      return content;
    } catch (err) {
      const message = String(err?.message || "");
      if (message.includes("No assistant response detected on page")) {
        throw new Error(
          "Không lấy được câu trả lời từ ChatGPT trong thời gian chờ. Kiểm tra lại selector phản hồi hoặc tăng CHATGPT_RESPONSE_TIMEOUT_MS."
        );
      }
      if (message.includes("waiting for locator")) {
        throw new Error(
          "Không tìm thấy ô nhập ChatGPT. Hãy đăng nhập ChatGPT cho session này và kiểm tra CHATGPT_PROMPT_SELECTOR."
        );
      }
      if (message.includes("playwright-cli: not found") || message.includes("playwright-mcp: not found")) {
        throw new Error(
          "Không tìm thấy binary Playwright MCP. Cài @playwright/mcp hoặc set PLAYWRIGHT_CLI_BIN=/usr/local/bin/playwright-mcp."
        );
      }
      throw err;
    } finally {
      await Promise.allSettled([fsp.unlink(promptFile), fsp.unlink(outputFile)]);
    }
  }

  buildRunCode(promptFile, outputFile) {
    const timeout = this.responseTimeoutMs;
    const idle = this.idlePollMs;
    const promptSelector = JSON.stringify(this.promptSelector);
    const responseSelector = JSON.stringify(this.responseSelector);

    return `
const fs = require("fs");
const prompt = fs.readFileSync(${JSON.stringify(promptFile)}, "utf8");
const outputFile = ${JSON.stringify(outputFile)};
const timeoutMs = ${timeout};
const idleMs = ${idle};
const promptSelector = ${promptSelector};
const responseSelector = ${responseSelector};

await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });

const input = page.locator(promptSelector).first();
await input.waitFor({ timeout: timeoutMs });

const beforeCount = await page.locator(responseSelector).count();

await input.click({ timeout: timeoutMs });
await input.fill(prompt, { timeout: timeoutMs });
await input.press("Enter", { timeout: timeoutMs });

await page.waitForFunction(
  ({ selector, before }) => document.querySelectorAll(selector).length > before,
  { selector: responseSelector, before: beforeCount },
  { timeout: timeoutMs }
);

let stableText = "";
let stableRounds = 0;
const startedAt = Date.now();

while (Date.now() - startedAt < timeoutMs) {
  const allTexts = await page.locator(responseSelector).allTextContents();
  const latest = (allTexts[allTexts.length - 1] || "").trim();

  if (latest && latest === stableText) {
    stableRounds += 1;
  } else if (latest) {
    stableText = latest;
    stableRounds = 0;
  }

  const stopButtonVisible = await page
    .locator("button[aria-label*='Stop'], button:has-text('Stop'), button:has-text('Dừng')")
    .count();

  if (stableText && stableRounds >= 2 && stopButtonVisible === 0) {
    break;
  }

  await page.waitForTimeout(idleMs);
}

const finalTexts = await page.locator(responseSelector).allTextContents();
const finalText = (finalTexts[finalTexts.length - 1] || stableText || "").trim();

if (!finalText) {
  throw new Error("No assistant response detected on page");
}

fs.writeFileSync(outputFile, finalText, "utf8");
`;
  }

  async runCli(args, { timeoutMs = 60_000 } = {}) {
    const allArgs = [...this.prefixArgs, ...args];
    this.logger.debug("Running playwright-mcp command", {
      command: this.command,
      args: allArgs,
    });

    return execFileAsync(this.command, allArgs, {
      timeout: timeoutMs,
      cwd: this.workspaceRoot,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
      },
    });
  }
}

module.exports = {
  BrowserChatgptAdapter,
};
