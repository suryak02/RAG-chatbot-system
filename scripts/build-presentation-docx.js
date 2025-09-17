/*
  Build a .docx version of the short demo deck.
  Usage:
    1) npm i --save-dev docx
    2) node scripts/build-presentation-docx.js
  Output: docs/demo-presentation.docx
*/

const fs = require("fs")
const path = require("path")
const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require("docx")

function H1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1 })
}
function H2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2 })
}
function Title(text) {
  return new Paragraph({ text, heading: HeadingLevel.TITLE })
}
function P(text) {
  return new Paragraph({ children: [new TextRun(text)] })
}
function Bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 } })
}
function Spacer() {
  return new Paragraph({ text: "" })
}

const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        Title("RAG Chatbot System — Short Demo Deck"),
        P("Author: [Presenter] • Duration: 5–7 minutes • Audience: Business + Tech"),
        Spacer(),

        H1("1) Overview — Problem & Opportunity"),
        Bullet("Teams in BFSI, Logistics, Supply Chain, and Utilities are drowning in PDFs/DOCX and lengthy reports."),
        Bullet("They want a conversational assistant—not another 80‑page report."),
        Bullet("Traditional search is brittle; manual reading is slow; insights are delayed."),
        Bullet("Opportunity: A domain‑aware assistant that reads private docs and returns cited answers in seconds."),
        Spacer(),
        H2("Speaker notes"),
        P("Emphasise operational pain: time spent hunting for info, out‑of‑date SOPs, repetitive Q&A to experts."),
        P("Goal: shrink time‑to‑insight for line‑of‑business users."),
        Spacer(),

        H1("2) Our Solution — RAG Chatbot with Robust Ingestion"),
        Bullet("Admin UI: upload PDFs/DOCX/MD/TXT with extraction preview."),
        Bullet("Robust text extraction: pdf‑parse → PDF.js → Azure Read OCR (per‑page fallback)."),
        Bullet("Chunking + embeddings → in‑memory vector store (fast demo path)."),
        Bullet("Chat UI: retrieves the most relevant chunks and answers with sources."),
        Bullet("Multi‑tenant ready: optional namespace support."),
        Spacer(),
        H2("Speaker notes"),
        P("Prioritise reliability of extraction (scanned/image‑heavy docs) and observable previews to debug quickly."),
        P("Azure OCR offers speed and accuracy; local OCR can be toggled off for performance."),
        Spacer(),

        H1("3) Tech Stack"),
        Bullet("Frontend: Next.js 15, React 19, TypeScript, ShadCN UI."),
        Bullet("Server: Next.js Route Handlers (Node), Netlify‑ready."),
        Bullet("Parsing: pdf-parse, pdfjs-dist; DOCX via mammoth."),
        Bullet("OCR: Azure AI Vision Read (cloud), local OCR toggled off for performance."),
        Bullet("Vector: in‑memory cosine similarity; AI: OpenAI embeddings + chat (mock mode available)."),
        Spacer(),

        H1("4) Design Principles (Why It Works)"),
        Bullet("Fallback‑first extraction maximises recall for PDFs/DOCX."),
        Bullet("Grounded answers with citations reduce hallucinations."),
        Bullet("Observability: extraction previews + debug lines in Admin."),
        Bullet("Operational toggles: OCR provider, polling, page limits, thresholds."),
        Spacer(),

        H1("5) Demo Flow (2–3 mins)"),
        Bullet("Admin: upload small text PDF → extraction preview appears."),
        Bullet("Admin: upload scanned/image‑heavy PDF → Azure OCR runs → preview fills."),
        Bullet("Chat: ask targeted questions → answers + sources."),
        Bullet("Optional: Azure Monitor shows OCR call spike."),
        Spacer(),
        H2("Tips"),
        Bullet("Keep files small to avoid long waits."),
        Bullet("Toggle PDF_FORCE_AZURE_OCR=true for OCR‑first behaviour if needed."),
        Spacer(),

        H1("6) Use Cases by Domain"),
        Bullet("BFSI: policy/SOP answers, regulatory references, claims handling Q&A."),
        Bullet("Logistics/Supply: shipment SOPs, vendor terms, EDI spec lookups."),
        Bullet("Utilities: safety procedures, outage runbooks, field manuals."),
        Spacer(),

        H1("7) Rollout, Cost, and Security"),
        Bullet("Pilot first; keep OCR page caps and toggles on."),
        Bullet("Usage‑based costs: Azure OCR + LLM; guardrails via limits."),
        Bullet("Security: server‑side processing; env keys not in repo; production adds auth/storage/audit."),
        Spacer(),

        H1("8) Q&A"),
        P("Questions? Happy to dive into accuracy, costs, or rollout options."),
        Spacer(),

        H2("Optional Roadmap"),
        Bullet("Managed vector DB; background OCR jobs; provider‑agnostic OCR (AWS/GCP); SSO and RBAC."),
      ],
    },
  ],
})

async function main() {
  const outPath = path.join(__dirname, "..", "docs", "demo-presentation.docx")
  const buffer = await Packer.toBuffer(doc)
  fs.writeFileSync(outPath, buffer)
  console.log("Wrote", outPath)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
