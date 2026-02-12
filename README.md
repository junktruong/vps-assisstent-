# Zalo Agent (Skills-Only Runtime) - Node.js

Webhook service nhận tin nhắn từ Zalo, chạy AI agent loop để chọn skill, và gửi kết quả ngược lại Zalo.

Runtime này dùng **node-zalo-bot** (`v0.1.6`) để xử lý webhook/send message thay vì tự gọi HTTP thủ công.

## Kiến trúc chính

- `src/main.js`: bootstrap logging, config, service, bridge.
- `src/services/zaloListener.js`:
  - tạo `new ZaloBot(token, { polling: false })`
  - `POST <path từ ZALO_WEBHOOK_URL>`: verify header `x-bot-api-secret-token`, gọi `bot.processUpdate(update)`
  - đăng ký `bot.on('message', ...)`
  - gửi message bằng `bot.sendMessage(...)`
  - đăng ký webhook bằng `bot.setWebHook(ZALO_WEBHOOK_URL, { secret_token: ZALO_WEBHOOK_SECRET })`
- `src/bridge/zaloAgentBridge.js`: nhận message, đưa vào queue, mỗi job chạy qua worker thread (`src/workers/agentWorker.js`).
- `src/infra/agentRunner.js`: vòng lặp agent tối đa `AGENT_MAX_STEPS`, parse/repair `AgentAction`, gọi skill, lưu state.
- `src/domain/agentProtocol.js`: schema action (`plan`, `call_skill`, `ask_user`, `chat`, `final`).
- `src/infra/skillRegistry.js`: đăng ký skills.
- `src/infra/skills/fsTools.js`: `fs.read`, `fs.write`, `fs.patch` (chặn path ngoài workspace).
- `src/infra/skills/gsheetTools.js`: `gsheet.read_range`, `gsheet.write_range`, `gsheet.append_rows`.
- `src/domain/sessionState.js`: session state JSON (`AGENT_STATE_FILE`).
- `src/infra/aiFactory.js`: hỗ trợ `AI_PROVIDER=API` hoặc `AI_PROVIDER=BROWSER`.
- `src/infra/browserChatgptAdapter.js`: nhánh browser mode (mở ChatGPT, dán prompt, lấy response) qua `playwright-cli`.

## AI mode

### 1) Browser mode (mặc định)

- `AI_PROVIDER=BROWSER`
- Runtime sẽ gọi `playwright-cli` theo session (`CHATGPT_SESSION`), mở `CHATGPT_URL`, nhập prompt và đọc block trả lời mới nhất của assistant.

### 2) API mode (fallback)

- `AI_PROVIDER=API`
- Cần `OPENAI_API_KEY`.

## Yêu cầu môi trường

Copy `.env.example` thành `.env` rồi điền giá trị.

### Bắt buộc

- `BOT_TOKEN` hoặc `ZALO_BOT_TOKEN`
- `WEBHOOK_URL` hoặc `ZALO_WEBHOOK_URL`
- `WEBHOOK_SECRET_TOKEN` hoặc `ZALO_WEBHOOK_SECRET`

### Quan trọng

- `AI_PROVIDER` (`BROWSER` hoặc `API`, mặc định `BROWSER`)
- `AGENT_MAX_STEPS` (mặc định `8`)
- `AGENT_STATE_FILE` (mặc định `artifacts/agent_state.json`)
- `ZALO_HOST` (mặc định `0.0.0.0`)
- `ZALO_PORT` (mặc định `8000`)

### Browser mode settings

- `PLAYWRIGHT_CLI_BIN` (tuỳ chọn; nếu trống sẽ tự tìm script mặc định hoặc fallback `npx --package @playwright/mcp playwright-cli`)
- `CHATGPT_URL` (mặc định `https://chatgpt.com/`)
- `CHATGPT_SESSION` (mặc định `zalo-agent`)
- `CHATGPT_BROWSER_HEADED` (`1`/`0`)
- `CHATGPT_RESPONSE_TIMEOUT_MS` (mặc định `180000`)
- `CHATGPT_IDLE_POLL_MS` (mặc định `1200`)
- `CHATGPT_PROMPT_SELECTOR`
- `CHATGPT_RESPONSE_SELECTOR`

### API mode settings

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (mặc định `gpt-4o-mini`)

### Google Sheets

- `GCP_SERVICE_ACCOUNT_JSON` hoặc `GCP_SERVICE_ACCOUNT_FILE`
- `GCP_SHEETS_SCOPES` (tuỳ chọn)

## Chạy local / VPS Ubuntu

```bash
npm install
npm start
```

Service lắng nghe tại `ZALO_HOST:ZALO_PORT`.

## Chuẩn bị ChatGPT session (browser mode)

Chạy một lần để login ChatGPT cho session runtime:

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
"$PWCLI" --session zalo-agent open https://chatgpt.com/ --headed
```

Đăng nhập thủ công trong browser, sau đó đóng lại. Runtime sẽ tái sử dụng session này.

## Deploy Ubuntu (systemd)

1. Copy code lên VPS, ví dụ `/opt/zalo-agent`.
2. Tạo `.env` từ `.env.example`.
3. Cài dependencies:

```bash
npm install
```

4. (Browser mode) login ChatGPT như phần trên với cùng `CHATGPT_SESSION`.
5. Cài service:

```bash
sudo cp deploy/zalo-agent.service /etc/systemd/system/zalo-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now zalo-agent
sudo systemctl status zalo-agent
```

## Chạy test

```bash
npm test
```
