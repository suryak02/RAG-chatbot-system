// OpenAI API client utilities
export class OpenAIClient {
  private apiKey: string
  private baseURL = "https://api.openai.com/v1"

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async createEmbedding(text: string, model = "text-embedding-3-small"): Promise<number[]> {
    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model: model,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data[0].embedding
  }

  async createChatCompletion(
    messages: Array<{ role: string; content: string }>,
    model = "gpt-4o-mini",
  ): Promise<string> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json()
    return data.choices[0].message.content
  }
}

// Helper function to get OpenAI client
export function getOpenAIClient(): OpenAIClient {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required")
  }
  return new OpenAIClient(apiKey)
}
