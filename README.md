# Zalo Agent (Skills-Only Runtime) - Node.js

Webhook service nhận tin nhắn từ Zalo, chạy AI agent loop để chọn skill, và gửi kết quả ngược lại Zalo.

## Kiến trúc chính

- `src/main.js`: bootstrap logging, config, service, bridge.
- `src/services/zaloListener.js`: route `POST /zalo-webhook` + `GET /zalo-artifacts/:artifactId`, verify secret, gửi trả lời về Zalo.
- `src/bridge/zaloAgentBridge.js`: nhận message, đưa vào queue, mỗi job chạy qua worker thread (`src/workers/agentWorker.js`).
- `src/infra/agentRunner.js`: vòng lặp agent tối đa `AGENT_MAX_STEPS`, parse/repair `AgentAction`, gọi skill, lưu state.
- `src/domain/agentProtocol.js`: schema action (`plan`, `call_skill`, `ask_user`, `chat`, `final`).
- `src/infra/skillRegistry.js`: đăng ký skills.
- `src/infra/skills/fsTools.js`: `fs.read`, `fs.write`, `fs.patch` (chặn path ngoài workspace).
- `src/infra/skills/gsheetTools.js`: `gsheet.read_range`, `gsheet.write_range`, `gsheet.append_rows`.
- `src/domain/sessionState.js`: session state JSON (`AGENT_STATE_FILE`).
- `src/infra/aiFactory.js`: build này chỉ hỗ trợ `AI_PROVIDER=API` (OpenAI API).

## Yêu cầu môi trường

Copy `.env.example` thành `.env` rồi điền giá trị.

### Bắt buộc

- `ZALO_BOT_TOKEN`
- `ZALO_WEBHOOK_URL`
- `ZALO_WEBHOOK_SECRET`
- `OPENAI_API_KEY`

### Quan trọng

- `AI_PROVIDER` (mặc định `API`)
- `OPENAI_MODEL` (mặc định `gpt-4o-mini`)
- `AGENT_MAX_STEPS` (mặc định `8`)
- `AGENT_STATE_FILE` (mặc định `artifacts/agent_state.json`)
- `ZALO_HOST` (mặc định `0.0.0.0`)
- `ZALO_PORT` (mặc định `8000`)

### Google Sheets

- `GCP_SERVICE_ACCOUNT_JSON` hoặc `GCP_SERVICE_ACCOUNT_FILE`
- `GCP_SHEETS_SCOPES` (tuỳ chọn)

### Webhook secret options

- `ZALO_ALLOW_QUERY_SECRET` (mặc định `0`)
- `ZALO_ALLOW_BODY_SECRET` (mặc định `1`)
- `ZALO_WEBHOOK_SECRET_HEADERS`
- `ZALO_WEBHOOK_SECRET_FIELDS`

## Chạy local / VPS Ubuntu

```bash
npm install
npm start
```

Service lắng nghe tại `ZALO_HOST:ZALO_PORT`.

## Deploy Ubuntu (systemd)

1. Copy code lên VPS, đặt tại ví dụ `/opt/zalo-agent`.
2. Tạo `.env` từ `.env.example`.
3. Cài dependencies:

```bash
npm install
```

4. Cài service:

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

## Ghi chú browser mode

Luồng mở browser ChatGPT chưa bật trong build này. Nếu cần chạy browser mode thật, cần bổ sung adapter trong `src/infra/aiFactory.js`.
