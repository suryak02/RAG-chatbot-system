# Quickstart (1–2 minutes)

A simple guide for stakeholders to run and try the Knowledge Base Assistant locally.

## What this is
- A private, document‑grounded chatbot (RAG). Upload PDFs/DOCX/MD/TXT, then ask questions and get answers with sources.

## Requirements
- Node.js 20+
- Your own API keys:
  - OpenAI: `OPENAI_API_KEY`
  - Azure AI Services: endpoint + key (Vision "Read" OCR capability)

## Setup
1) Clone and install
```bash
git clone <your-repo-url>
cd RAG-chatbot-system
npm install --legacy-peer-deps
```

2) Configure environment
```bash
cp .env.example .env.local
```
Edit `.env.local` and fill:
- `OPENAI_API_KEY`
- `OCR_PROVIDER=azure`
- `AZURE_VISION_ENDPOINT` (looks like https://<resource>.cognitiveservices.azure.com)
- `AZURE_VISION_KEY`
(Optional) Tuning:
- `PDF_FORCE_AZURE_OCR=true` for scanned/image PDFs; `false` for text‑heavy PDFs

3) Run the app
```bash
NEXT_TELEMETRY_DISABLED=1 npm run dev -- -p 3000
```

## Try it
- Admin (upload): http://localhost:3000/admin
  - Choose files (PDF/DOCX/MD/TXT), Start Upload
  - Watch the progress bar and preview
- Chat: http://localhost:3000
  - Ask questions and see sources

## Optional: Embed on a site
Add an iframe pointing to `/embed` (see README → Embed):
```html
<iframe
  src="https://<your-domain>/embed?placeholder=Ask%20about%20our%20services..."
  width="100%"
  height="600"
  style="border: 0;"
  loading="lazy"
></iframe>
```

## Deploy (optional)
- Netlify is supported out of the box (`netlify.toml`).
- Set env vars in Netlify: `OPENAI_API_KEY`, `OCR_PROVIDER=azure`, `AZURE_VISION_ENDPOINT`, `AZURE_VISION_KEY`, and the polling/page‑limit vars you prefer. Then deploy.

## Notes
- Secrets are not committed: `.env.local` is git‑ignored.
- The vector store is in‑memory for fast demos. For production, you’d swap in a managed vector DB and add auth.
