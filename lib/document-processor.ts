// Document processing and chunking utilities
export interface ProcessedDocument {
  title: string
  content: string
  url?: string
  sections: DocumentSection[]
}

export interface DocumentSection {
  title: string
  content: string
  level: number
}

export class DocumentProcessor {
  // Split text into chunks with overlap
  static chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
    const chunks: string[] = []
    let start = 0

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length)
      const chunk = text.slice(start, end)

      // Try to break at sentence boundaries
      if (end < text.length) {
        const lastSentence = chunk.lastIndexOf(".")
        const lastNewline = chunk.lastIndexOf("\n")
        const breakPoint = Math.max(lastSentence, lastNewline)

        if (breakPoint > start + chunkSize * 0.5) {
          chunks.push(text.slice(start, breakPoint + 1).trim())
          start = breakPoint + 1 - overlap
        } else {
          chunks.push(chunk.trim())
          start = end - overlap
        }
      } else {
        chunks.push(chunk.trim())
        break
      }
    }

    return chunks.filter((chunk) => chunk.length > 0)
  }

  // Extract sections from markdown-like content
  static extractSections(content: string): DocumentSection[] {
    const sections: DocumentSection[] = []
    const lines = content.split("\n")
    let currentSection: DocumentSection | null = null

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)

      if (headerMatch) {
        // Save previous section
        if (currentSection) {
          sections.push(currentSection)
        }

        // Start new section
        currentSection = {
          title: headerMatch[2].trim(),
          content: "",
          level: headerMatch[1].length,
        }
      } else if (currentSection) {
        currentSection.content += line + "\n"
      }
    }

    // Add final section
    if (currentSection) {
      sections.push(currentSection)
    }

    return sections.map((section) => ({
      ...section,
      content: section.content.trim(),
    }))
  }

  // Process a document into chunks ready for embedding
  static async processDocument(
    document: ProcessedDocument,
    chunkSize = 1000,
  ): Promise<
    Array<{
      content: string
      metadata: {
        source: string
        title: string
        url?: string
        section?: string
      }
    }>
  > {
    const results: Array<{
      content: string
      metadata: {
        source: string
        title: string
        url?: string
        section?: string
      }
    }> = []

    // Process main content
    const mainChunks = this.chunkText(document.content, chunkSize)
    for (const chunk of mainChunks) {
      results.push({
        content: chunk,
        metadata: {
          source: "openai-docs",
          title: document.title,
          url: document.url,
        },
      })
    }

    // Process sections
    for (const section of document.sections) {
      const sectionChunks = this.chunkText(section.content, chunkSize)
      for (const chunk of sectionChunks) {
        results.push({
          content: `${section.title}\n\n${chunk}`,
          metadata: {
            source: "openai-docs",
            title: document.title,
            url: document.url,
            section: section.title,
          },
        })
      }
    }

    return results
  }
}
