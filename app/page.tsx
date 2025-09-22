import { ChatInterface } from "@/components/chat-interface"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Settings, Database } from "lucide-react"
import Link from "next/link"

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-4">Knowledge Base Assistant</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Get instant answers from your documents using retrieval‑augmented generation (RAG)
            </p>

            {/* Quick Actions */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <Link href="/admin">
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Admin Panel
                </Button>
              </Link>
              <Card className="px-3 py-1">
                <CardContent className="p-0 flex items-center gap-2 text-sm text-muted-foreground">
                  <Database className="w-4 h-4" />
                  <span>RAG-powered responses</span>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Chat Interface */}
          <ChatInterface />

          {/* Footer */}
          <div className="text-center mt-8 text-sm text-muted-foreground">
            <p>
              Powered by a secure LLM backend with RAG •
              <Link href="/admin" className="text-primary hover:underline ml-1">
                Manage knowledge base
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
