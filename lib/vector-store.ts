// Simple in-memory vector store for embeddings
export interface DocumentChunk {
  id: string
  content: string
  embedding: number[]
  metadata: {
    source: string
    title: string
    url?: string
    section?: string
  }
}

export class VectorStore {
  private documents: DocumentChunk[] = []

  async addDocument(chunk: DocumentChunk): Promise<void> {
    this.documents.push(chunk)
  }

  async addDocuments(chunks: DocumentChunk[]): Promise<void> {
    this.documents.push(...chunks)
  }

  // Cosine similarity function
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  async similaritySearch(queryEmbedding: number[], k = 5, threshold = 0.7): Promise<DocumentChunk[]> {
    const similarities = this.documents.map((doc) => ({
      document: doc,
      similarity: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }))

    return similarities
      .filter((item) => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)
      .map((item) => item.document)
  }

  async getAllDocuments(): Promise<DocumentChunk[]> {
    return [...this.documents]
  }

  async clear(): Promise<void> {
    this.documents = []
  }

  getDocumentCount(): number {
    return this.documents.length
  }
}

// Singleton instance
export const vectorStore = new VectorStore()
