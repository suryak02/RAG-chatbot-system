import { ChatInterface } from "@/components/chat-interface"

export const metadata = {
  title: "Chat Embed",
  description: "Embeddable chat widget powered by your knowledge base",
}

export default function EmbedPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const placeholderParam = (searchParams?.placeholder as string) || undefined

  return (
    <main className="bg-background">
      <div className="px-3 py-3">
        <ChatInterface hideHeader={true} placeholder={placeholderParam || "Ask a question..."} heightClass="h-[600px]" />
      </div>
    </main>
  )
}
