import { useState, useRef, useEffect, useCallback } from "react";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Send, ImagePlus, X, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imagePreview?: string;
  imageBase64?: string;
  imageMediaType?: string;
}

const SUGGESTIONS = [
  "Armame un outfit casual para el finde",
  "¿Qué me pongo para una cena formal?",
  "Quiero un look urbano/streetwear",
  "¿Cómo combino esta prenda?",
];

export default function Stylist() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ base64: string; preview: string; mediaType: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/auth");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("La imagen es muy pesada (máx 10MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const mediaType = file.type || "image/jpeg";
      setPendingImage({ base64, preview: dataUrl, mediaType });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  const sendMessage = useCallback(async (text?: string) => {
    const content = text || input.trim();
    if (!content && !pendingImage) return;
    if (isStreaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content || "¿Qué me podés decir de esta prenda?",
      imagePreview: pendingImage?.preview,
      imageBase64: pendingImage?.base64,
      imageMediaType: pendingImage?.mediaType,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingImage(null);
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      // Build API messages (without previews)
      const apiMessages = newMessages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.imageBase64 ? { imageBase64: m.imageBase64, imageMediaType: m.imageMediaType } : {}),
      }));

      const response = await fetch("/api/stylist/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Error" }));
        throw new Error(err.message);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullText += parsed.text;
                  setMessages(prev =>
                    prev.map(m => m.id === assistantId ? { ...m, content: fullText } : m)
                  );
                }
                if (parsed.error) {
                  fullText += `\n\n⚠️ ${parsed.error}`;
                  setMessages(prev =>
                    prev.map(m => m.id === assistantId ? { ...m, content: fullText } : m)
                  );
                }
              } catch {}
            }
          }
        }
      }
    } catch (error: any) {
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${error.message}` } : m)
      );
    } finally {
      setIsStreaming(false);
    }
  }, [input, pendingImage, messages, isStreaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full pt-20 pb-4 px-4">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#C8FF00]/10 flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8 text-[#C8FF00]" />
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground mb-2">
                Tu Estilista Personal
              </h1>
              <p className="text-muted-foreground max-w-md mb-8">
                Contame qué buscás vestir, mandame una foto de tu armario, o pedime que te arme un outfit. Conozco todo el catálogo de DREVO.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="px-4 py-2 rounded-full border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3",
                    msg.role === "user"
                      ? "bg-[#C8FF00] text-black rounded-br-md"
                      : "bg-card border border-border text-foreground rounded-bl-md"
                  )}
                >
                  {msg.imagePreview && (
                    <img
                      src={msg.imagePreview}
                      alt="Foto subida"
                      className="max-w-[200px] rounded-lg mb-2"
                    />
                  )}
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                    {msg.role === "assistant" && isStreaming && messages[messages.length - 1]?.id === msg.id && (
                      <span className="inline-block w-1.5 h-4 bg-[#C8FF00] ml-0.5 animate-pulse" />
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="sticky bottom-0 bg-background pt-2">
          {pendingImage && (
            <div className="relative inline-block mb-2">
              <img src={pendingImage.preview} alt="Preview" className="h-20 rounded-lg border border-border" />
              <button
                onClick={() => setPendingImage(null)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 bg-card border border-border rounded-2xl p-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Subir foto de tu armario"
            >
              <ImagePlus className="w-5 h-5" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribí lo que necesitás..."
              rows={1}
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm resize-none outline-none py-2 max-h-32"
              style={{ minHeight: "36px" }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={isStreaming || (!input.trim() && !pendingImage)}
              className={cn(
                "p-2 rounded-xl transition-colors shrink-0",
                isStreaming || (!input.trim() && !pendingImage)
                  ? "text-muted-foreground"
                  : "bg-[#C8FF00] text-black hover:bg-[#C8FF00]/80"
              )}
            >
              {isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            DREVO Stylist puede cometer errores. Las recomendaciones son orientativas.
          </p>
        </div>
      </div>
    </div>
  );
}
