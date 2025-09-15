# Generative AI and RAG – A Practical Field Guide

> This guide is designed to be ingested by a Retrieval‑Augmented Generation (RAG) system.
> It contains concise explanations, structured sections, and concrete examples you can query.

## 1. Generative AI 101

Generative AI (GenAI) refers to models that create new content from patterns learned during training.
Common model families include large language models (LLMs), text‑to‑image models, and multimodal models.

### Core capabilities
- Text generation: drafting emails, articles, product descriptions.
- Q&A and summarization: extracting, compressing, and re‑phrasing information.
- Code generation and transformation: scaffolding functions, refactoring, translating between languages.
- Multimodal: reasoning over text + images, or converting between formats.

### Limitations to remember
- Hallucinations: confident but incorrect statements when context is insufficient.
- Staleness: models do not automatically “know” new facts after their training cutoff.
- Context window limits: long inputs must be pruned or summarized to fit.

## 2. Why Retrieval‑Augmented Generation (RAG)?

RAG combines a vector search over your private knowledge with an LLM that writes the final answer.
Instead of fine‑tuning the model with your data, RAG fetches the most relevant chunks at query time.

### Benefits
- Freshness: update the knowledge base and the answers change immediately.
- Control and auditability: answers can be tied to cited sources.
- Cost efficiency: store embeddings once; reuse for many queries.

### Trade‑offs
- Good retrieval is essential: poor chunking or bad indexing leads to weak answers.
- Context size remains a constraint: you must select and format the most useful passages.

## 3. Architecture Overview

1. Ingest documents (PDF, DOCX, MD, TXT) and extract clean text.
2. Chunk text with overlap to preserve context.
3. Embed each chunk into a vector using an embeddings model (e.g., `text-embedding-3-small`, 1536‑D).
4. Store vectors + metadata in a vector store (memory, pgvector, Qdrant, Pinecone, etc.).
5. At query time, embed the user question and retrieve the top‑K similar chunks.
6. Construct a prompt with the question and the retrieved context.
7. Ask the LLM to synthesize a direct answer with citations.

## 4. Chunking Strategy

- Default chunk size: 800–1,200 characters with 10–25% overlap.
- Prefer breaking at sentence/newline/space boundaries to avoid mid‑word truncation.
- Include section titles in chunk content to improve retrieval precision.
- Keep metadata (title, url, section, namespace) so you can filter, cite, and re‑rank.

## 5. Vector Stores and Similarity

A vector store indexes dense vectors and supports nearest‑neighbor search.

- Similarity: cosine similarity is common; dot‑product and Euclidean also exist.
- Exact vs approximate: ANN (e.g., HNSW, IVF) scales to millions of vectors.
- Filtering: metadata filters (e.g., `namespace = "tenant-a"`) scope results.

> Persistence matters in production; in‑memory stores are great for demos but do not survive restarts.

## 6. Retrieval Tuning

- Top‑K: typically 3–8 chunks. Too few misses context; too many dilutes it.
- Threshold: discard very low‑similarity chunks to reduce noise.
- MMR/reranking: diversify or re‑score candidates to cover more aspects of the query.
- Query rewriting: reformulate vague questions into focused sub‑queries.

## 7. Prompting for Synthesis

Good prompts:
- Start with a one‑sentence answer.
- Synthesize and paraphrase; avoid long verbatim quotes.
- Cite sources using labels like `[Source N]` that map to context entries.
- If the context is insufficient, say so clearly.
- Optionally allow a short "General knowledge" section that never contradicts the context.

## 8. RAG vs. Fine‑tuning

- Fine‑tuning excels at style adaptation and structured outputs on narrow tasks.
- RAG excels at grounding answers in ever‑changing knowledge without retraining.
- Many systems use both: RAG for grounding + light fine‑tuning for tone/format.

## 9. API Documentation Chatbot Pattern

RAG works well for API docs: parse specifications (OpenAPI/Swagger) and code examples, embed them, and answer developer questions with snippets.

### Example workflow
- Extract endpoints, methods, auth schemes, request/response schemas, and examples.
- On question, retrieve the most relevant endpoints + snippets.
- The LLM produces a concise explanation and a short code sample.

### Node.js example snippet (OAuth 2.0, simplified)

```js
import fetch from "node-fetch"

async function getAccessToken({ clientId, clientSecret, tokenUrl, scope }) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: scope || "",
  })

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) throw new Error(`Token request failed: ${res.status}`)
  const data = await res.json()
  return data.access_token
}
```

> Security notes: never log secrets; prefer PKCE for user‑agent flows; rotate credentials.

## 10. Evaluation and Quality

- Build a small evaluation set of (question, expected answer, expected sources).
- Track retrieval precision/recall, answer helpfulness, and citation correctness.
- Add guardrails: refuse to answer outside the domain or when context is empty.

## 11. Troubleshooting Checklist

- No answers: check the vector store count; ensure ingestion succeeded and the same namespace is used.
- Extracted text looks odd: fix ligatures/soft‑hyphens/NBSP; de‑hyphenate line breaks; OCR scans if needed.
- Overly extractive answers: update the prompt to force synthesis and citations; trim low‑value chunks.
- Too generic: allow a short "General knowledge" section to fill small gaps.
- Slow responses: reduce top‑K, add reranking, or use an ANN index.

## 12. Example Questions to Try

- What is the main difference between RAG and fine‑tuning?
- How does chunk size and overlap affect retrieval quality?
- Show a minimal Node.js example for obtaining an OAuth 2.0 access token.
- What are common pitfalls when building a RAG system, and how do I avoid hallucinations?
- Which vector stores can I use, and why would I choose Pinecone or pgvector?

## 13. Glossary

- Embedding: a numeric vector that represents the semantic meaning of text.
- Chunk: a small, contiguous span of text used as a retrieval unit.
- Namespace: a label to scope or partition documents per tenant/project.
- MMR: Maximal Marginal Relevance, a reranking method that balances relevance and diversity.
- Reranker: a secondary model that rescores retrieved documents.

---

This guide is intentionally structured with headings so a RAG chunker can detect sections and include titles in metadata. Use it as a seed corpus for experimenting with retrieval, prompting, and evaluation.
