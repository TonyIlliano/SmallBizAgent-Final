/**
 * SupportChat — floating AI support chatbot widget.
 * Context-aware: knows the user's page, business state, and setup gaps.
 * Replaces the static ContextHelp component.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, X, Send, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── API helper ──────────────────────────────────────────────────────────

function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|; )csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function sendChatMessage(
  question: string,
  currentPage: string,
  history: ChatMessage[]
): Promise<{ answer: string; tokensUsed: number }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const csrfToken = getCsrfToken();
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const res = await fetch("/api/support/chat", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ question, currentPage, history }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to send message");
  }
  return res.json();
}

async function fetchSuggestions(page: string): Promise<string[]> {
  const res = await fetch(`/api/support/suggestions?page=${encodeURIComponent(page)}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.suggestions || [];
}

// ─── Main Component ──────────────────────────────────────────────────────

export function SupportChat() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only show for authenticated users
  if (!user) return null;

  // Fetch suggestions when page changes
  useEffect(() => {
    fetchSuggestions(location).then(setSuggestions);
  }, [location]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = useCallback(async (text?: string) => {
    const question = (text || input).trim();
    if (!question || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: question };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setIsLoading(true);

    try {
      const { answer } = await sendChatMessage(question, location, messages);
      setMessages(prev => [...prev, { role: "assistant", content: answer }]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Sorry, I had a hiccup. Try again or email Bark@smallbizagent.ai." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, location]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[60] w-[calc(100vw-2rem)] max-w-[360px] shadow-2xl rounded-2xl overflow-hidden border border-gray-200 bg-white flex flex-col"
          style={{ height: "min(520px, calc(100vh - 8rem))" }}
        >
          {/* Header */}
          <div className="bg-black text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">SmallBizAgent Support</div>
                <div className="text-[10px] text-gray-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />
                  Online
                </div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Welcome message */}
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="h-7 w-7 rounded-full bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]">
                    <p className="text-sm text-gray-800">
                      Hi! I'm your SmallBizAgent assistant. Ask me anything about setting up or using the platform.
                    </p>
                  </div>
                </div>

                {/* Suggested questions */}
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-9">
                    {suggestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(q)}
                        className="text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5 text-gray-700 transition-colors text-left"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Message bubbles */}
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}>
                {msg.role === "assistant" && (
                  <div className="h-7 w-7 rounded-full bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 max-w-[85%] text-sm",
                    msg.role === "user"
                      ? "bg-black text-white rounded-tr-sm"
                      : "bg-gray-100 text-gray-800 rounded-tl-sm"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t bg-white p-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-black/20 focus:border-gray-300 transition-all"
                disabled={isLoading}
                maxLength={500}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                  input.trim() && !isLoading
                    ? "bg-black text-white hover:bg-gray-800"
                    : "bg-gray-100 text-gray-400"
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-4 right-4 md:bottom-6 md:right-6 z-[60] h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105",
          isOpen
            ? "bg-gray-200 text-gray-600"
            : "bg-black text-white hover:bg-gray-800"
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircle className="h-5 w-5" />
        )}
      </button>
    </>
  );
}
