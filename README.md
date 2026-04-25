# Claude + Whisper full stack (Node + Angular)

Monorepo layout:

- **`backend/`** — Express API that calls **Anthropic Claude (Sonnet)** for chat and **OpenAI Whisper** for audio transcription.
- **`frontend/`** — Angular app that talks to the API (via dev proxy).

## Prerequisites

- Node.js 18+ (this scaffold was tested with Node 20).
- [Anthropic API key](https://console.anthropic.com/) for Claude.
- [OpenAI API key](https://platform.openai.com/) for Whisper (`whisper-1`).

## Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: ANTHROPIC_API_KEY, OPENAI_API_KEY, optional ANTHROPIC_MODEL
npm run dev
```

Server listens on **http://localhost:3000** by default.

### Endpoints

| Method | Path | Purpose |
|--------|------|--------|
| GET | `/api/health` | Liveness and whether API keys are loaded |
| POST | `/api/chat` | JSON body `{ "messages": [{ "role": "user"\|"assistant", "content": "..." }] }` |
| POST | `/api/transcribe` | `multipart/form-data` with field **`file`** (audio) |

If a model ID in `.env` is not available on your account, set `ANTHROPIC_MODEL` to a Sonnet snapshot your key can use.

## Frontend

```bash
cd frontend
npm install   # already run once by the Angular CLI
ng serve
```

Open **http://localhost:4200**. `ng serve` proxies `/api` to the backend (see `frontend/proxy.conf.json`).

## Production notes

- Serve the Angular `dist/` behind your host and **reverse-proxy** `/api` to the Node server, or set the frontend’s API base URL to your public API origin and configure **CORS** on the backend.
- Do not expose API keys in the browser; keep them only in the backend `.env`.
