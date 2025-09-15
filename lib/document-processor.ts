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

      // Prefer to break at sentence/newline/space boundaries near the end of the chunk
      if (end < text.length) {
        const lastSentence = chunk.lastIndexOf(".")
        const lastNewline = chunk.lastIndexOf("\n")
        const lastSpace = chunk.lastIndexOf(" ")
        const breakPointRel = Math.max(lastSentence, lastNewline, lastSpace)

        if (breakPointRel > chunk.length * 0.5) {
          const sliceEnd = start + breakPointRel + 1 // convert to absolute index
          chunks.push(text.slice(start, sliceEnd).trim())
          start = Math.max(0, sliceEnd - overlap)
        } else {
          chunks.push(chunk.trim())
          start = Math.max(0, end - overlap)
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
    sourceLabel = "openai-docs",
    namespace?: string,
  ): Promise<
    Array<{
      content: string
      metadata: {
        source: string
        title: string
        url?: string
        section?: string
        namespace?: string
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
        namespace?: string
      }
    }> = []

    // Process main content
    const mainChunks = this.chunkText(document.content, chunkSize)
    for (const chunk of mainChunks) {
      results.push({
        content: chunk,
        metadata: {
          source: sourceLabel,
          title: document.title,
          url: document.url,
          namespace,
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
            source: sourceLabel,
            title: document.title,
            url: document.url,
            section: section.title,
            namespace,
          },
        })
      }
    }

    return results
  }
}
