# RAG Chatbot System

Conversational assistant grounded in your own documents. Upload PDFs/DOCX/MD/TXT in the Admin UI, then ask questions in the Chat UI and get cited answers fast.

## Overview

Key features:

- Robust PDF/DOCX extraction: pdf-parse → PDF.js → Azure Read OCR (with per‑page fallback)
- Admin UI: upload files, see extraction preview, and embed
- Chat UI: retrieves relevant chunks and answers with sources
- Simple in‑memory vector store (fast for demos), easy to swap later
- Optional audio transcription for short clips via Azure Speech (WAV/MP3/OGG/WEBM/M4A)

## Quick Start

1) Requirements

- Node.js 20+
- An OpenAI API key
- An Azure AI Services (Vision Read OCR capability) endpoint + key
  - Optional (for audio): Azure Speech `region` and `key`

2) Configure environment

- Copy `.env.example` to `.env.local`
- Fill in values for:
  - `OPENAI_API_KEY`
  - `OCR_PROVIDER=azure`
  - `AZURE_VISION_ENDPOINT` (e.g. `https://<resource>.cognitiveservices.azure.com`)
  - `AZURE_VISION_KEY`
  - Optional tuning: `AZURE_READ_POLL_MS`, `AZURE_READ_MAX_POLLS`, `PDF_FORCE_AZURE_OCR`
  - Optional audio (short clips ≤ ~60s recommended): `AZURE_SPEECH_REGION`, `AZURE_SPEECH_KEY`

3) Install and run

```bash
npm install --legacy-peer-deps
NEXT_TELEMETRY_DISABLED=1 npm run dev -- -p 3000
```

4) Use the app

- Open `http://localhost:3000/admin`
- Upload one or more files (50MB/file, 100MB/batch)
- Confirm the extraction preview looks right
- Go to `http://localhost:3000` and ask questions; check cited sources
  - Accepted types include `.pdf`, `.docx`, `.md`, `.txt`, and audio: `.wav`, `.mp3`, `.ogg`, `.webm`, `.m4a` (audio uses Azure Speech short‑audio API)

## Setup Details

See `docs/SETUP.md` for step‑by‑step instructions to:

- Create an OpenAI API key
- Create an Azure AI Services (multi‑service) resource and get endpoint + key
- Configure `.env.local`
- Troubleshoot OCR and PDF parsing

## Deployment (Netlify)

This repo includes `netlify.toml` (Node 20). After connecting your repo, set these Environment Variables in Netlify:

- `OPENAI_API_KEY`
- `OCR_PROVIDER=azure`
- `AZURE_VISION_ENDPOINT`
- `AZURE_VISION_KEY`
- `AZURE_READ_POLL_MS=1000`
- `AZURE_READ_MAX_POLLS=180`
- `PDF_FORCE_AZURE_OCR=true` (or `false` for parser‑first)
- `NEXT_TELEMETRY_DISABLED=1`
  - Optional audio: `AZURE_SPEECH_REGION`, `AZURE_SPEECH_KEY`

## Security

- Secrets live in `.env.local` which is git‑ignored by default (`.env*`).
- Never commit real keys; use `.env.example` as a template.

## Embed

Use the lightweight embed page at `/embed` to place the chat on another site.

Example iframe:

```html
<iframe
  src="https://<your-domain>/embed?placeholder=Ask%20about%20our%20services..."
  width="100%"
  height="600"
  style="border: 0;"
  loading="lazy"
></iframe>
```

Query params:
- `placeholder`: optional input placeholder text.

## Notes

- The vector store is in‑memory for demos. For production, plug in a managed vector DB and add auth + storage.
