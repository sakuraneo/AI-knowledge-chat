# AI Knowledge Chat

A full-stack AI chat demo for learning **React**, **Node.js**, **LangChain**, and frontend engineering. The app supports multi-turn conversation memory and token-by-token streaming responses, powered by **DeepSeek V4** via an OpenAI-compatible API.

## Features

| Milestone | Capability |
|-----------|------------|
| **M1** | Monorepo scaffold, Express API, React chat UI, LangChain LCEL chain |
| **M2** | Server-side session memory, TanStack Query optimistic updates |
| **M3** | SSE streaming, LangChain `chain.stream()`, typing effect in UI |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 6, TanStack Query |
| Backend | Node.js, Express 5, TypeScript |
| AI | LangChain.js, DeepSeek V4 (`deepseek-v4-flash` / `deepseek-v4-pro`) |
| Tooling | pnpm workspace (monorepo) |

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm

### Setup

```bash
pnpm install
cp server/.env.example server/.env
# Edit server/.env — set DEEPSEEK_API_KEY
```

### Run

```bash
pnpm dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Project Structure

```text
ai-knowledge-chat/
├── client/                 # Vite + React frontend
│   └── src/
│       ├── api/            # HTTP / SSE client
│       ├── hooks/          # TanStack Query hooks
│       └── App.tsx         # Chat UI
├── server/                 # Express + LangChain backend
│   └── src/
│       ├── chains/         # LCEL prompt | model chains
│       ├── memory/         # In-memory session store
│       ├── config.ts       # Environment config
│       └── index.ts        # HTTP routes
├── docs/
│   └── TECHNICAL.md        # Architecture & API reference
├── pnpm-workspace.yaml
└── package.json
```

## API Overview

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/chat` | Non-streaming chat (JSON) |
| `POST` | `/api/chat/stream` | Streaming chat (SSE) |
| `POST` | `/api/chat/reset` | Clear session memory |

See [docs/TECHNICAL.md](./docs/TECHNICAL.md) for full architecture, data flow, and design decisions.

## Environment Variables

Configure **`server/.env` only** (never commit real keys):

```env
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
MODEL=deepseek-v4-flash
PORT=3001
```

## Roadmap

- [x] M1 — Basic chat
- [x] M2 — Multi-turn memory
- [x] M3 — SSE streaming
- [ ] M4 — RAG (PDF upload + retrieval)
- [ ] M5 — Rate limit, tests, IP

## License

Private learning project.
