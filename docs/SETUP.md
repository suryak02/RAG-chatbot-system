# Setup Guide

This guide shows how to run the RAG Chatbot locally and (optionally) deploy to Netlify.

- Runs on Node.js 20+
- Requires an OpenAI API key
- Uses Azure AI Services (Vision Read OCR capability) for fast/accurate PDF text extraction
- Optional: Azure Speech (short‑audio transcription) to ingest audio clips

---

## 1) Clone and install

```bash
git clone <your-fork-or-repo-url>
cd RAG-chatbot-system
npm install --legacy-peer-deps
```

---

## 2) Configure environment

1. Copy the example file to your local env file:
   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and fill in the values:
   - `OPENAI_API_KEY` — your OpenAI key
   - `OCR_PROVIDER=azure` — use Azure OCR
   - `AZURE_VISION_ENDPOINT` — looks like `https://<resource>.cognitiveservices.azure.com`
   - `AZURE_VISION_KEY` — key from the Azure portal
   - Optional audio (short clips ≤ ~60s recommended):
     - `AZURE_SPEECH_REGION`
     - `AZURE_SPEECH_KEY`
   - Optional tuning:
     - `AZURE_READ_POLL_MS` (default 1000)
     - `AZURE_READ_MAX_POLLS` (default 180)
     - `PDF_FORCE_AZURE_OCR=true|false` (true for scanned/image PDFs, false for normal text PDFs)
     - `PDF_MAX_TEXT_PAGES` and `AZURE_OCR_MAX_PAGES` limits

> Note: `.env.local` is git‑ignored. Do not commit real keys.

---

## 3) Create the Azure AI Services resource

1. In the Azure Portal, search for "Azure AI Services" (multi‑service) and create a resource (S0 works for testing). We use the Vision Read OCR capability from this multi‑service resource.
2. After creation, go to "Keys and Endpoint" and copy:
   - Endpoint (e.g., `https://<resource>.cognitiveservices.azure.com`)
   - Key (e.g., a long alphanumeric string)
3. Paste these into `.env.local` as `AZURE_VISION_ENDPOINT` and `AZURE_VISION_KEY`.

> Tip: To verify calls, open the resource in Azure → Monitor → Metrics and watch "Requests" or "Successful calls" during uploads.

---

## 4) Run locally

```bash
NEXT_TELEMETRY_DISABLED=1 npm run dev -- -p 3000
```

- Admin UI: http://localhost:3000/admin
  - Upload PDFs/DOCX/MD/TXT and audio files (WAV/MP3/OGG/WEBM/M4A)
  - See extraction preview before embedding
- Chat UI: http://localhost:3000
  - Ask questions, see cited sources

Troubleshooting
- If a simple text PDF shows low/no text:
  - Try `PDF_FORCE_AZURE_OCR=false` (parser‑first) for text‑heavy PDFs
  - Or keep `true` for scanned/image PDFs
- If Azure OCR doesn’t respond:
  - Check `AZURE_VISION_ENDPOINT`/`AZURE_VISION_KEY`
  - Increase `AZURE_READ_MAX_POLLS`
 - For audio transcription:
   - Ensure `AZURE_SPEECH_REGION` and `AZURE_SPEECH_KEY` are set
   - Use short clips (≤ ~60s recommended) for this REST endpoint

---

## 5) Deploy to Netlify (optional)

This repo ships with `netlify.toml` (Node 20). After connecting your repo in Netlify, set Environment Variables:

- `OPENAI_API_KEY`
- `OCR_PROVIDER=azure`
- `AZURE_VISION_ENDPOINT`
- `AZURE_VISION_KEY`
- `AZURE_READ_POLL_MS=1000`
- `AZURE_READ_MAX_POLLS=180`
- `PDF_FORCE_AZURE_OCR=true` (or `false` for parser‑first)
- `NEXT_TELEMETRY_DISABLED=1`

Then trigger a deploy. Post‑deploy smoke test:
1. Open `/admin`, upload a small text PDF → preview appears.
2. Upload a scanned PDF → preview fills after OCR.
3. Open `/` (Chat), ask a question → answer cites sources.

---

## 6) Security & housekeeping

- `.env*` files are ignored by Git (see `.gitignore`). Keep your keys only in `.env.local` or in Netlify env vars.
- No `NEXT_PUBLIC_*` env vars are used; secrets are server‑side.
- Old documentation ingestion code has been removed. The project relies solely on file uploads via `/api/admin/upload`.
