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
    namespace?: string
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

  async similaritySearch(
    queryEmbedding: number[],
    k = 5,
    threshold = 0.7,
    namespace?: string,
  ): Promise<DocumentChunk[]> {
    const pool = namespace ? this.documents.filter((d) => d.metadata.namespace === namespace) : this.documents

    const similarities = pool.map((doc) => ({
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

  // Clear only documents that belong to a specific namespace
  async clearNamespace(namespace: string): Promise<void> {
    const ns = namespace.trim()
    this.documents = this.documents.filter((d) => d.metadata.namespace !== ns)
  }

  getDocumentCount(): number {
    return this.documents.length
  }
}

// Singleton instance across dev/HMR and route module reloads
const globalForVectorStore = globalThis as unknown as { vectorStore?: VectorStore }
if (!globalForVectorStore.vectorStore) {
  globalForVectorStore.vectorStore = new VectorStore()
}
export const vectorStore = globalForVectorStore.vectorStore
