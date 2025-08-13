// Complete ingestion pipeline for processing and storing documentation
import { DocumentationFetcher, type OpenAIDocPage } from "./documentation-fetcher"
import { DocumentProcessor } from "./document-processor"
import { vectorStore, type DocumentChunk } from "./vector-store"
import { getOpenAIClient } from "./openai-client"

export interface IngestionStats {
  totalPages: number
  totalChunks: number
  successfulChunks: number
  failedChunks: number
  startTime: Date
  endTime?: Date
  errors: string[]
}

export class IngestionPipeline {
  private fetcher: DocumentationFetcher
  private stats: IngestionStats

  constructor() {
    this.fetcher = new DocumentationFetcher()
    this.stats = {
      totalPages: 0,
      totalChunks: 0,
      successfulChunks: 0,
      failedChunks: 0,
      startTime: new Date(),
      errors: [],
    }
  }

  async ingestDocumentation(useSampleData = true): Promise<IngestionStats> {
    console.log("Starting documentation ingestion...")
    this.stats.startTime = new Date()

    try {
      // Clear existing documents
      await vectorStore.clear()

      // Fetch documentation
      let pages: OpenAIDocPage[]
      if (useSampleData) {
        console.log("Using sample documentation data...")
        pages = this.fetcher.getSampleDocumentation()
      } else {
        console.log("Fetching live documentation...")
        pages = await this.fetcher.fetchAllDocumentation()
      }

      this.stats.totalPages = pages.length
      console.log(`Processing ${pages.length} documentation pages...`)

      // Process each page
      for (const page of pages) {
        try {
          await this.processPage(page)
        } catch (error) {
          const errorMsg = `Failed to process page ${page.title}: ${error}`
          console.error(errorMsg)
          this.stats.errors.push(errorMsg)
        }
      }

      this.stats.endTime = new Date()
      const duration = this.stats.endTime.getTime() - this.stats.startTime.getTime()

      console.log(`Ingestion completed in ${duration}ms`)
      console.log(`Successfully processed: ${this.stats.successfulChunks}/${this.stats.totalChunks} chunks`)

      return this.stats
    } catch (error) {
      this.stats.endTime = new Date()
      const errorMsg = `Ingestion pipeline failed: ${error}`
      console.error(errorMsg)
      this.stats.errors.push(errorMsg)
      throw error
    }
  }

  private async processPage(page: OpenAIDocPage): Promise<void> {
    console.log(`Processing: ${page.title}`)

    // Convert to ProcessedDocument format
    const processedDoc = {
      title: page.title,
      content: page.content,
      url: page.url,
      sections: DocumentProcessor.extractSections(page.content),
    }

    // Create chunks
    const chunks = await DocumentProcessor.processDocument(processedDoc, 800)
    this.stats.totalChunks += chunks.length

    // Generate embeddings and store chunks
    const openaiClient = getOpenAIClient()

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      try {
        console.log(`  Processing chunk ${i + 1}/${chunks.length}...`)

        // Generate embedding
        const embedding = await openaiClient.createEmbedding(chunk.content)

        // Create document chunk
        const documentChunk: DocumentChunk = {
          id: `${page.url}-chunk-${i}`,
          content: chunk.content,
          embedding,
          metadata: chunk.metadata,
        }

        // Store in vector database
        await vectorStore.addDocument(documentChunk)
        this.stats.successfulChunks++

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        this.stats.failedChunks++
        const errorMsg = `Failed to process chunk ${i} of ${page.title}: ${error}`
        console.error(errorMsg)
        this.stats.errors.push(errorMsg)
      }
    }
  }

  getStats(): IngestionStats {
    return { ...this.stats }
  }
}
