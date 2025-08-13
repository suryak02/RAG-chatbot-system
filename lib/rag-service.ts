// Core RAG (Retrieval Augmented Generation) service
import { vectorStore, type DocumentChunk } from "./vector-store"
import { getOpenAIClient } from "./openai-client"

export interface RAGQuery {
  question: string
  maxResults?: number
  similarityThreshold?: number
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
    const { question, maxResults = 5, similarityThreshold = 0.7 } = ragQuery

    try {
      // Step 1: Generate embedding for the user question
      console.log("Generating query embedding...")
      const queryEmbedding = await this.openaiClient.createEmbedding(question)

      // Step 2: Retrieve relevant documents from vector store
      console.log("Searching vector store...")
      const relevantChunks = await vectorStore.similaritySearch(queryEmbedding, maxResults, similarityThreshold)

      if (relevantChunks.length === 0) {
        return {
          answer:
            "I couldn't find any relevant information in the OpenAI documentation to answer your question. Please try rephrasing your question or asking about OpenAI models, APIs, or features.",
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
      const answer = await this.generateResponse(question, context)

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

  private async generateResponse(question: string, context: string): Promise<string> {
    const systemPrompt = `You are an expert assistant for OpenAI's documentation and APIs. Your role is to provide accurate, helpful answers based solely on the provided context from OpenAI's official documentation.

Guidelines:
- Answer questions using ONLY the information provided in the context
- If the context doesn't contain enough information to answer the question, say so clearly
- Be specific and cite relevant details from the documentation
- Format your response clearly with proper structure
- If code examples are mentioned in the context, include them in your response
- Focus on practical, actionable information
- If multiple models or approaches are mentioned, explain the differences

Context from OpenAI Documentation:
${context}`

    const userPrompt = `Question: ${question}

Please provide a comprehensive answer based on the OpenAI documentation context provided above.`

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
