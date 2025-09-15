# RAG chatbot system

*Automatically synced with your [v0.app](https://v0.app) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/suryak02s-projects/v0-rag-chatbot-system)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/projects/1iH8uv41UOa)

## Overview
This repository will stay in sync with your deployed chats on [v0.app](https://v0.app).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.app](https://v0.app).

### Key changes & reasoning

The RAG assistant has been tuned to produce concise, contextual answers instead of copying large passages:

- __Prompting__: `lib/rag-service.ts` now instructs the model to provide a direct one‑sentence answer first, then a short explanation with citations using `[Source N]`. If the context is insufficient, it must say so clearly. Optionally, you can allow brief, clearly labeled “General knowledge” additions via an env flag (see below).
- __Parsing & normalization__: `app/api/admin/upload/route.ts` improves PDF/DOCX extraction (tries multiple strategies for PDFs) and normalizes text (fixes ligatures, soft‑hyphens, NBSP, and de‑hyphenates line‑breaks). This prevents chopped/garbled words from entering the vector store.
- __Chunking__: `lib/document-processor.ts` now prefers breaking on sentence/newline/space boundaries and preserves overlap correctly, reducing mid‑word truncation and improving retrieval quality.
- __Admin UX__: Admin panel includes a "Quick Add Text" section to paste content directly. This bypasses tricky file parsing so you can validate end‑to‑end RAG quickly.
- __Error visibility__: Upload API surfaces per‑file warnings when no extractable text is found, and the Admin UI displays these messages so counters don’t look misleading when 0 chunks are produced.

Together these changes reduce extractive copying and steer the assistant to synthesize, cite, and answer questions directly.

## Deployment

Your project is live at:

**[https://vercel.com/suryak02s-projects/v0-rag-chatbot-system](https://vercel.com/suryak02s-projects/v0-rag-chatbot-system)**

## Build your app

Continue building your app on:

**[https://v0.app/chat/projects/1iH8uv41UOa](https://v0.app/chat/projects/1iH8uv41UOa)**

## How It Works

1. Create and modify your project using [v0.app](https://v0.app)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

### Local development

1. __Install__ (Node 20+):
   ```bash
   npm install
   ```
2. __Configure environment__ (`.env.local`): see Configuration below. To run fully offline (no API calls), use mock mode.
3. __Run dev__:
   ```bash
   # Offline/mock mode
   USE_MOCK_OPENAI=true NEXT_TELEMETRY_DISABLED=1 npm run dev -- -p 3000

   # Live mode (requires OPENAI_API_KEY)
   NEXT_TELEMETRY_DISABLED=1 npm run dev -- -p 3000
   ```
4. __Admin panel__: open http://localhost:3000/admin to ingest docs.

Tips:
- If a PDF/DOCX yields 0 chunks, try "Quick Add Text" to verify the pipeline, or export the file as accessible/optimized PDF/TXT and re‑upload.
- Use the "Clear existing knowledge base" checkbox when you want to replace previous content.

## Configuration

- `OPENAI_API_KEY`: Required. Your OpenAI API key.
- `RAG_ALLOW_GENERAL_KNOWLEDGE` (optional): When set to `true`, the assistant may add brief, widely accepted background information to clarify gaps if the retrieved context is insufficient. It never contradicts the provided context and clearly labels this section as "General knowledge".

Example `.env.local` entries:

```
OPENAI_API_KEY=sk-...
# Allow the assistant to add brief background when context is thin
RAG_ALLOW_GENERAL_KNOWLEDGE=false
```
