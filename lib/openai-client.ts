// OpenAI API client utilities
export class OpenAIClient {
  private apiKey: string
  private baseURL = "https://api.openai.com/v1"

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  // Whether to use mock/offline mode
  private isMock(): boolean {
    return (
      process.env.USE_MOCK_OPENAI === "true" ||
      process.env.DEMO_MODE === "true" ||
      false
    )
  }

  // Simple sleep helper
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // POST helper with retry/backoff for 429/5xx
  private async postWithRetry<T = any>(endpoint: string, payload: any, maxRetries = 5): Promise<T> {
    let attempt = 0
    let delay = 500

    while (true) {
      const response = await fetch(`${this.baseURL}/${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        return (await response.json()) as T
      }

      const status = response.status
      // Retry on rate limits and server errors
      if (status === 429 || status >= 500) {
        attempt++
        if (attempt > maxRetries) {
          const text = await response.text().catch(() => response.statusText)
          throw new Error(`OpenAI API error: ${status} ${response.statusText}${text ? ` - ${text}` : ""}`)
        }

        const retryAfter = response.headers.get("retry-after")
        if (retryAfter) {
          const seconds = Number(retryAfter)
          await this.sleep((isNaN(seconds) ? 1 : seconds) * 1000)
        } else {
          const jitter = Math.floor(Math.random() * 200)
          await this.sleep(delay + jitter)
          delay = Math.min(delay * 2, 8000)
        }
        continue
      }

      // For other 4xx, do not retry
      const text = await response.text().catch(() => response.statusText)
      throw new Error(`OpenAI API error: ${status} ${response.statusText}${text ? ` - ${text}` : ""}`)
    }
  }

  async createEmbedding(text: string, model?: string): Promise<number[]> {
    if (this.isMock()) {
      return this.mockEmbedding(text)
    }

    const modelToUse = model || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
    try {
      const data = await this.postWithRetry<{ data: Array<{ embedding: number[] }> }>("embeddings", {
        input: text,
        model: modelToUse,
      })
      return data.data[0].embedding
    } catch (error) {
      if (this.shouldFallbackToMock(error)) {
        console.warn("OpenAI embeddings failed; falling back to mock due to billing/quota error.")
        return this.mockEmbedding(text)
      }
      throw error
    }
  }

  async createChatCompletion(
    messages: Array<{ role: string; content: string }>,
    model?: string,
  ): Promise<string> {
    if (this.isMock()) {
      return this.mockChatCompletion(messages)
    }

    const modelToUse = model || process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini"
    try {
      const data = await this.postWithRetry<{ choices: Array<{ message: { content: string } }> }>(
        "chat/completions",
        {
          model: modelToUse,
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000,
        },
      )
      return data.choices[0].message.content
    } catch (error) {
      if (this.shouldFallbackToMock(error)) {
        console.warn("OpenAI chat failed; falling back to mock due to billing/quota error.")
        return this.mockChatCompletion(messages)
      }
      throw error
    }
  }

  // --- Mock/offline helpers ---
  private mockEmbedding(text: string, dim = 1536): number[] {
    // Deterministic hash to seed a PRNG
    let h = 2166136261 >>> 0
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }

    // xorshift32 PRNG
    const rand = () => {
      h ^= h << 13
      h ^= h >>> 17
      h ^= h << 5
      return (h >>> 0) / 4294967296
    }

    const vec = new Array(dim)
    for (let i = 0; i < dim; i++) {
      // Map to roughly [-1, 1]
      vec[i] = rand() * 2 - 1
    }

    // Normalize to unit length for better cosine similarity behavior
    let norm = 0
    for (let i = 0; i < dim; i++) norm += vec[i] * vec[i]
    norm = Math.sqrt(norm) || 1
    for (let i = 0; i < dim; i++) vec[i] = vec[i] / norm
    return vec as number[]
  }

  private mockChatCompletion(messages: Array<{ role: string; content: string }>): string {
    const system = messages.find((m) => m.role === "system")?.content || ""
    const user = messages.find((m) => m.role === "user")?.content || ""

    // Try to pull context from system prompt
    let context = ""
    const marker = "Context from OpenAI Documentation:"
    const idx = system.indexOf(marker)
    if (idx >= 0) {
      context = system.slice(idx + marker.length).trim()
    }

    // Fallback: try to pull context from any 'Context:' section in messages (new prompt format)
    if (!context) {
      const combined = messages.map((m) => m.content).join("\n")
      const match = combined.match(/Context:\s*([\s\S]*)$/i)
      if (match) {
        context = match[1].trim()
      }
    }

    // Simple extractive summary: take first few sentences or bullet points
    const bulletLines = context
      .split(/\n|•|-/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 5)

    const sentences = context
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 5)

    const points = (bulletLines.length >= 3 ? bulletLines : sentences).slice(0, 3)

    const header = "[Offline Demo Mode] This answer is generated locally without calling OpenAI."
    const body = points.length
      ? `Key points from context:\n- ${points.join("\n- ")}`
      : "No sufficient context available to generate an answer."

    const question = user.replace(/^Question:\s*/i, "").trim()
    const qLine = question ? `Question: ${question}\n\n` : ""

    return `${header}\n\n${qLine}${body}`
  }

  // Decide if we should fall back to mock mode when OpenAI returns errors
  private shouldFallbackToMock(error: unknown): boolean {
    const allow = process.env.FALLBACK_TO_MOCK_ON_OPENAI_ERROR === "true"
    if (!allow) return false
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase()
    // Match common billing/quota/payment failures (402/403, insufficient_quota, billing)
    return /\b402\b|\b403\b|insufficient_quota|billing|payment/.test(msg)
  }
}

// Helper function to get OpenAI client
export function getOpenAIClient(): OpenAIClient {
  const apiKey = process.env.OPENAI_API_KEY
  const mockEnabled = process.env.USE_MOCK_OPENAI === "true" || process.env.DEMO_MODE === "true"
  if (!apiKey) {
    if (mockEnabled) {
      return new OpenAIClient("mock-placeholder-key")
    }
    throw new Error("OPENAI_API_KEY environment variable is required")
  }
  return new OpenAIClient(apiKey)
}
