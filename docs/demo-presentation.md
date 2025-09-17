# RAG Chatbot System — Short Demo Deck

Author: You  •  Duration: 5–7 minutes  •  Audience: Business + Tech

---

## 1) Overview — Problem & Opportunity

- BFSI, Logistics, Supply Chain, and Utilities teams are drowning in PDFs/DOCX and lengthy reports.
- They need instant, conversational answers grounded in their own documents — not generic web data.
- Traditional search is brittle; manual reading is slow; insights are delayed.
- Opportunity: A domain‑aware assistant that reads private docs and responds with cited answers in seconds.

Speaker notes:
- Emphasize operational pain: time spent hunting for info, out‑of‑date SOPs, repetitive Q&A to experts.
- Goal: shrink "time‑to‑insight" for line‑of‑business users.

---

## 2) Our Solution — RAG Chatbot with Robust Ingestion

![Architecture](/architecture-rag.svg)

- Admin UI: upload PDFs/DOCX/MD/TXT with extraction preview.
- Robust text extraction pipeline: pdf‑parse → PDF.js → Azure Read OCR (per‑page fallback).
- Chunking + embeddings → in‑memory vector store (fast demo path).
- Chat UI: retrieves the most relevant chunks and answers with sources.
- Multi‑tenant ready: optional namespace support.

Speaker notes:
- We prioritized reliability of extraction (scanned/image‑heavy docs) and observable previews to debug quickly.
- Azure OCR offers speed and accuracy; local OCR can be toggled off for performance.

---

## Tech Stack

- Frontend: Next.js 15, React 19, TypeScript, ShadCN UI.
- Server: Next.js Route Handlers (Node runtime), Netlify‑ready.
- Parsing: `pdf-parse`, `pdfjs-dist`, `mammoth` (DOCX → text/HTML).
- OCR: Azure AI Vision Read (cloud), optional `tesseract.js` local (disabled by default).
- Vector: simple in‑memory cosine similarity store (pluggable later).
- AI: OpenAI embeddings + chat (with mock fallback for offline demos).

---

## Design Highlights (Why It Works)

- Fallback‑first ingestion: text parser → structural parser → OCR (file and per‑page) to maximize recall.
- Grounded answers: retrieves chunks by cosine similarity, cites sources to build trust.
- Operational toggles: env flags for OCR provider, polling, page limits, and thresholds.
- Observability: extraction previews + error/debug lines exposed in Admin for quick triage.

---

## 3) Demo Flow (2–3 minutes)

1. Open Admin at `/admin`.
2. Upload a small PDF (e.g., “Hello PDF.pdf”); show extraction preview.
3. Upload a scanned or image‑heavy PDF; point out Azure OCR finishing, preview populates.
4. Switch to Chat, ask targeted questions; highlight source citations.
5. (Optional) Show Azure Monitor → Vision metrics spike during OCR.

Tips:
- Keep files small to avoid long waits.
- If needed, toggle `PDF_FORCE_AZURE_OCR=true` for OCR‑first behavior.

---

## 4) Q&A Prompt Cards

- Accuracy & Hallucinations: grounded by retrieved chunks + citations; add guardrails and filters as needed.
- Performance: Azure OCR is fast; for very large PDFs we cap pages and show progress; vector store is in‑memory for demo speed.
- Security: docs processed server‑side; `.env.local` keys are not committed; production would add auth, storage, and audit.
- Cost: Azure OCR and OpenAI calls are usage‑based; we provide toggles and page limits; mock mode for offline demos.
- Roadmap: swap in a managed vector DB (Pinecone/Weaviate/PGVector), background jobs for OCR, provider‑agnostic OCR (AWS Textract/Google Vision), enterprise SSO.

---

## Appendix: Key Env Flags

- `OCR_PROVIDER=azure | local`
- `AZURE_VISION_ENDPOINT`, `AZURE_VISION_KEY`
- `AZURE_READ_POLL_MS`, `AZURE_READ_MAX_POLLS`
- `PDF_FORCE_AZURE_OCR=true|false`
- `PDF_MAX_TEXT_PAGES`, `AZURE_OCR_MAX_PAGES`
- `USE_LOCAL_OCR_FALLBACK=true|false`

Notes:
- `.env*` files are git‑ignored; secrets are not pushed.
- Netlify build uses Node 20; mock OpenAI mode available for demos.
