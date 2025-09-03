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

      // Step 2: Retrieve relevant documents from vector store
      console.log("Searching vector store...")
      const relevantChunks = await vectorStore.similaritySearch(
        queryEmbedding,
        maxResults,
        effectiveThreshold,
        namespace,
      )

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
    const systemPrompt = `You are an expert assistant for ${domainLabel}. Provide accurate, helpful answers based solely on the provided context.

Guidelines:
- Answer using ONLY the information provided in the context
- If the context doesn't contain enough information, say so clearly
- Be specific and cite relevant details from the sources
- Format your response clearly with structure
- If code or examples appear in the context, include them when useful
- Focus on practical, actionable information`

    const userPrompt = `Question: ${question}

Context:
${context}

Please provide a comprehensive answer based on the context above.`

    const response = await this.openaiClient.createChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ])

    return response
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
