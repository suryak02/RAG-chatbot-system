// Core RAG (Retrieval Augmented Generation) service
import { vectorStore, type DocumentChunk } from "@/lib/vector-store"
import { getOpenAIClient } from "./openai-client"

export interface RAGQuery {
  question: string
  maxResults?: number
  similarityThreshold?: number
  namespace?: string
}

export interface RAGResult {
  answer: string
  sources: DocumentSource[]
  retrievedChunks: number
  processingTime: number
}

export interface DocumentSource {
  title: string
  url?: string
  section?: string
  relevanceScore: number
}

export class RAGService {
  private openaiClient = getOpenAIClient()

  async query(ragQuery: RAGQuery): Promise<RAGResult> {
    const startTime = Date.now()
    const { question, maxResults = 5, similarityThreshold = 0.7, namespace } = ragQuery

    const isMock = process.env.USE_MOCK_OPENAI === "true" || process.env.DEMO_MODE === "true"
    // In mock mode, embeddings are synthetic; lower the threshold to always retrieve top matches
    const effectiveThreshold = isMock ? 0.0 : similarityThreshold

    try {
      // Step 1: Generate embedding for the user question
      console.log("Generating query embedding...")
      const queryEmbedding = await this.openaiClient.createEmbedding(question)

      // Step 2: Prefer uploaded docs exclusively when available
      console.log("Searching vector store...")
      const allDocs = await vectorStore.getAllDocuments()
      const uploadedDocs = allDocs.filter((d) => d.metadata.source === "uploaded")
      let relevantChunks: DocumentChunk[] = []

      if (uploadedDocs.length > 0) {
        const scored = uploadedDocs
          .map((d) => ({ doc: d, sim: this.cosineSimilarity(queryEmbedding, d.embedding) }))
          .sort((a, b) => b.sim - a.sim)
        relevantChunks = scored.slice(0, maxResults).map((s) => s.doc)
        console.log(`Using uploaded knowledge base only (docs=${uploadedDocs.length}).`)
      } else {
        // Fall back to mixed store with threshold backoff
        const thresholds = Array.from(
          new Set([effectiveThreshold, 0.3, 0.0].filter((t) => t >= 0 && t <= 1)),
        )
        for (const t of thresholds) {
          relevantChunks = await vectorStore.similaritySearch(queryEmbedding, maxResults, t, namespace)
          if (relevantChunks.length > 0 || t === thresholds[thresholds.length - 1]) {
            if (relevantChunks.length === 0) {
              console.warn(
                `No matches found even at threshold ${t}. Returning top-k (possibly low similarity) results.`,
              )
              // Force return top-k by lowering k filter if needed
              const pool = await vectorStore.getAllDocuments()
              const nsPool = namespace ? pool.filter((d) => d.metadata.namespace === namespace) : pool
              relevantChunks = nsPool.slice(0, maxResults)
            }
            break
          }
          console.log(`No matches at threshold ${t}. Retrying with a lower threshold...`)
        }
      }

      if (relevantChunks.length === 0) {
        return {
          answer:
            "I couldn't find relevant information in the current knowledge base to answer your question. Please try rephrasing, or ingest documentation for this topic.",
          sources: [],
          retrievedChunks: 0,
          processingTime: Date.now() - startTime,
        }
      }

      // Step 3: Format context from retrieved chunks
      const context = this.formatContext(relevantChunks)
      const sources = this.extractSources(relevantChunks)

      // Step 4: Generate response using retrieved context
      console.log("Generating response...")
      // Determine domain label from source metadata
      const firstSource = relevantChunks[0]?.metadata?.source || "knowledge-base"
      const domainLabel = firstSource === "openai-docs" ? "OpenAI documentation" : "the provided knowledge base"

      const answer = await this.generateResponse(question, context, domainLabel)

      return {
        answer,
        sources,
        retrievedChunks: relevantChunks.length,
        processingTime: Date.now() - startTime,
      }
    } catch (error) {
      console.error("RAG query error:", error)
      throw new Error(`Failed to process RAG query: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  private formatContext(chunks: DocumentChunk[]): string {
    return chunks
      .map((chunk, index) => {
        const source = chunk.metadata.section
          ? `${chunk.metadata.title} - ${chunk.metadata.section}`
          : chunk.metadata.title

        return `[Source ${index + 1}: ${source}]\n${chunk.content}\n`
      })
      .join("\n---\n\n")
  }

  private extractSources(chunks: DocumentChunk[]): DocumentSource[] {
    const sourceMap = new Map<string, DocumentSource>()

    chunks.forEach((chunk) => {
      const key = `${chunk.metadata.title}-${chunk.metadata.section || "main"}`

      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          title: chunk.metadata.title,
          url: chunk.metadata.url,
          section: chunk.metadata.section,
          relevanceScore: 0, // Will be calculated based on similarity
        })
      }
    })

    return Array.from(sourceMap.values())
  }

  private async generateResponse(question: string, context: string, domainLabel: string): Promise<string> {
    const allowGeneral = process.env.RAG_ALLOW_GENERAL_KNOWLEDGE === "true"

    const systemPrompt = `You are an expert assistant for ${domainLabel}. Use the provided context as the primary source of truth to answer the user's question clearly and helpfully.

Guidelines:
- Start with a direct one-sentence answer to the question.
- Synthesize and paraphrase; avoid copying long passages from the context.
- Cite supporting statements with the source markers using [Source N] that match the context labels.
- Ignore irrelevant or low-value context; focus on what answers the question.
- Prefer concise, structured explanations (bullets, short paragraphs, or steps when appropriate).
- Include code or concrete examples if the question implies it and the context includes them.
- If the context doesn't contain enough information, say so clearly.${allowGeneral ? "\n- You may add widely accepted general knowledge to clarify gaps, but never contradict the context. If you do, include it under a 'General knowledge' section." : ""}`

    const userPrompt = `Question:
${question}

Context:
${context}

Instructions:
- Answer the question directly first.
- Then briefly explain and reference the relevant [Source N] entries.
- If information is missing from the context, state that clearly.${allowGeneral ? " If useful, add a 'General knowledge' section with brief background." : ""}`

    const response = await this.openaiClient.createChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ])

    return response
  }

  // Local cosine similarity (duplicate of vector-store for ranking)
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
    return dot / ((Math.sqrt(na) || 1) * (Math.sqrt(nb) || 1))
  }

  // Helper method to get vector store statistics
  async getVectorStoreStats(): Promise<{
    totalDocuments: number
    sampleDocuments: Array<{ title: string; source: string }>
  }> {
    const documents = await vectorStore.getAllDocuments()
    return {
      totalDocuments: documents.length,
      sampleDocuments: documents.slice(0, 10).map((doc) => ({
        title: doc.metadata.title,
        source: doc.metadata.source,
      })),
    }
  }
}

// Singleton instance
export const ragService = new RAGService()
