// Documentation fetching utilities for OpenAI docs
export interface OpenAIDocPage {
  url: string
  title: string
  content: string
  lastModified?: string
}

export class DocumentationFetcher {
  private baseUrl = "https://platform.openai.com/docs"

  // Sample OpenAI documentation pages to fetch
  private readonly docPages = [
    { path: "/models", title: "Models Overview" },
    { path: "/models/gpt-4", title: "GPT-4 and GPT-4 Turbo" },
    { path: "/models/gpt-3-5", title: "GPT-3.5 Turbo" },
    { path: "/models/embeddings", title: "Embeddings" },
    { path: "/models/dall-e", title: "DALL·E" },
    { path: "/models/whisper", title: "Whisper" },
    { path: "/models/tts", title: "Text-to-speech" },
    { path: "/models/moderation", title: "Moderation" },
    { path: "/api-reference/chat", title: "Chat Completions API" },
    { path: "/api-reference/embeddings", title: "Embeddings API" },
    { path: "/api-reference/images", title: "Images API" },
    { path: "/api-reference/audio", title: "Audio API" },
    { path: "/guides/text-generation", title: "Text Generation Guide" },
    { path: "/guides/embeddings", title: "Embeddings Guide" },
    { path: "/guides/fine-tuning", title: "Fine-tuning Guide" },
    { path: "/guides/function-calling", title: "Function Calling Guide" },
    { path: "/guides/vision", title: "Vision Guide" },
    { path: "/guides/prompt-engineering", title: "Prompt Engineering Guide" },
  ]

  async fetchDocumentationPage(url: string): Promise<OpenAIDocPage | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OpenAI-RAG-Bot/1.0)",
        },
      })

      if (!response.ok) {
        console.warn(`Failed to fetch ${url}: ${response.statusText}`)
        return null
      }

      const html = await response.text()
      const content = this.extractContentFromHTML(html)
      const title = this.extractTitleFromHTML(html)

      return {
        url,
        title: title || "Untitled",
        content,
        lastModified: response.headers.get("last-modified") || undefined,
      }
    } catch (error) {
      console.error(`Error fetching ${url}:`, error)
      return null
    }
  }

  private extractContentFromHTML(html: string): string {
    // Simple HTML content extraction (in a real implementation, you'd use a proper HTML parser)
    // Remove script and style tags
    let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")

    // Remove HTML tags but keep the text content
    content = content.replace(/<[^>]*>/g, " ")

    // Clean up whitespace
    content = content.replace(/\s+/g, " ").trim()

    // Decode HTML entities
    content = content
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")

    return content
  }

  private extractTitleFromHTML(html: string): string | null {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    return titleMatch ? titleMatch[1].trim() : null
  }

  async fetchAllDocumentation(): Promise<OpenAIDocPage[]> {
    const results: OpenAIDocPage[] = []

    for (const docPage of this.docPages) {
      const url = `${this.baseUrl}${docPage.path}`
      console.log(`Fetching: ${url}`)

      const page = await this.fetchDocumentationPage(url)
      if (page) {
        results.push({
          ...page,
          title: docPage.title, // Use our predefined title
        })
      }

      // Add delay to be respectful to the server
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    return results
  }

  // Fallback: Use sample documentation content for demo purposes
  getSampleDocumentation(): OpenAIDocPage[] {
    return [
      {
        url: "https://platform.openai.com/docs/models/gpt-4",
        title: "GPT-4 and GPT-4 Turbo",
        content: `GPT-4 is a large multimodal model (accepting image and text inputs, emitting text outputs) that, while less capable than humans in many real-world scenarios, exhibits human-level performance on various professional and academic benchmarks.

GPT-4 Turbo is the latest GPT-4 model with improved instruction following, JSON mode, reproducible outputs, parallel function calling, and more. Returns a maximum of 4,096 output tokens.

Key features:
- Multimodal capabilities (text and image inputs)
- 128k context length for GPT-4 Turbo
- Improved reasoning and instruction following
- Function calling support
- JSON mode for structured outputs

Model variants:
- gpt-4o: Most advanced model, multimodal
- gpt-4-turbo: Latest GPT-4 Turbo model
- gpt-4: Original GPT-4 model

Pricing varies by model and usage type (input vs output tokens).`,
      },
      {
        url: "https://platform.openai.com/docs/models/embeddings",
        title: "Embeddings",
        content: `OpenAI's text embeddings measure the relatedness of text strings. Embeddings are commonly used for search, clustering, recommendations, anomaly detection, diversity measurement, and classification.

An embedding is a vector (list) of floating point numbers. The distance between two vectors measures their relatedness. Small distances suggest high relatedness and large distances suggest low relatedness.

Models:
- text-embedding-3-large: Most capable embedding model for both english and non-english tasks
- text-embedding-3-small: Increased performance over 2nd generation ada embedding model
- text-embedding-ada-002: Previous generation embedding model

Key features:
- Up to 8191 input tokens
- Dimensions: 1536 for ada-002, configurable for v3 models
- Use cases: search, clustering, recommendations, classification

Best practices:
- Use cosine similarity for comparing embeddings
- Consider dimensionality reduction for storage optimization
- Batch requests for efficiency`,
      },
      {
        url: "https://platform.openai.com/docs/api-reference/chat",
        title: "Chat Completions API",
        content: `Given a list of messages comprising a conversation, the model will return a response.

Endpoint: POST https://api.openai.com/v1/chat/completions

Request body parameters:
- model (required): ID of the model to use
- messages (required): List of messages comprising the conversation
- temperature: Sampling temperature between 0 and 2
- max_tokens: Maximum number of tokens to generate
- top_p: Nucleus sampling parameter
- frequency_penalty: Penalty for frequent tokens
- presence_penalty: Penalty for new tokens
- stop: Up to 4 sequences where the API will stop generating

Message format:
- role: "system", "user", or "assistant"
- content: The content of the message

Example request:
{
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ]
}

Response includes choices array with message content and finish_reason.`,
      },
      {
        url: "https://platform.openai.com/docs/guides/function-calling",
        title: "Function Calling Guide",
        content: `Function calling allows you to connect GPT models to external tools and systems. This is useful for building assistants that can answer questions by calling external APIs, convert natural language into API calls, and extract structured data from text.

How it works:
1. Define functions in your API call
2. The model determines when to call functions
3. The model returns function calls in the response
4. You execute the functions and return results
5. The model incorporates results into its response

Function definition format:
- name: Function name
- description: What the function does
- parameters: JSON Schema object describing parameters

Example function:
{
  "name": "get_weather",
  "description": "Get current weather for a location",
  "parameters": {
    "type": "object",
    "properties": {
      "location": {"type": "string", "description": "City name"}
    },
    "required": ["location"]
  }
}

Best practices:
- Provide clear function descriptions
- Use descriptive parameter names
- Handle function call errors gracefully
- Consider function call costs in pricing`,
      },
    ]
  }

  // Universal placeholder content for a generic business (industry-agnostic)
  getUniversalPlaceholder(): OpenAIDocPage[] {
    return [
      {
        url: "local://universal/company-overview",
        title: "Company Overview",
        content: `# Company Overview

Welcome to Technozis, a multi-location company providing products, subscription plans, and customer support across web and on-site channels. We operate Monday–Saturday with extended evening hours on weekdays.

## Services
- Professional consultations (virtual and in-person)
- Standard and premium service packages
- Product subscriptions and add-ons
- Priority support plans

## Locations
- Downtown (Main)
- Riverside
- Uptown

## Hours
- Mon–Fri: 9:00–19:00
- Sat: 10:00–16:00
- Sun: Closed
        `,
      },
      {
        url: "local://universal/policies",
        title: "Service & Cancellation Policy",
        content: `# Service & Cancellation Policy

## Appointments & Orders
- Schedule online or by phone. A valid email and phone number are required.
- A deposit may be required for extended services or custom orders.

## Cancellations
- Cancel or reschedule at least 24 hours before the appointment to avoid fees.
- Late cancellations may incur a 50% service fee. No-shows may be charged in full.

## Late Arrivals
- Arrivals 10+ minutes late may be shortened or rescheduled to avoid impacting subsequent clients.
        `,
      },
      {
        url: "local://universal/pricing-memberships",
        title: "Pricing & Memberships",
        content: `# Pricing & Memberships

## Standard Pricing (starting from)
- Consultation: $50
- Standard service: $95
- Premium package: $180
- Add-on (per item): $15

## Membership Plans
- Silver: 1 basic service per month at 15% off additional services
- Gold: 2 services per month at 20% off additional services
- Platinum: 4 services per month at 25% off additional services

Memberships renew monthly and unused services roll over for 1 month.
        `,
      },
      {
        url: "local://universal/support-faq",
        title: "Support & FAQ",
        content: `# Support & FAQ

## Contact
- Email: support@technozis.example
- Phone: (555) 555-1234

## Frequent Questions
1. Do you accept walk-ins? Limited walk-ins may be available; online booking is recommended.
2. What is your refund policy? Service fees are non-refundable once a service has been rendered. Products follow our standard return policy.
3. Do you offer gift cards? Yes, digital gift cards are available online and at customer service.
        `,
      },
    ]
  }
}
