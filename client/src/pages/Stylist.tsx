import { useState, useRef, useEffect, useCallback } from "react";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Send, ImagePlus, X, Sparkles, Loader2, ExternalLink, RotateCcw, Mic, MicOff } from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface StylistProduct {
  id: string;
  title: string;
  price: string | null;
  salePrice: string | null;
  brandName: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
}

interface PendingImage {
  base64: string;
  preview: string;
  mediaType: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imagePreviews?: string[];
  images?: { base64: string; mediaType: string }[];
  products?: StylistProduct[];
}

const MAX_IMAGES = 5;

const SUGGESTIONS = [
  "Armame un outfit casual para el finde",
  "¿Qué me pongo para una cena formal?",
  "Quiero un look urbano/streetwear",
  "¿Cómo combino esta prenda?",
];

function ProductCard({ product }: { product: StylistProduct }) {
  return (
    <Link href={`/product/${product.id}`} className="flex items-center gap-3 p-2 rounded-xl bg-background/50 border border-border/50 hover:border-accent/30 transition-colors cursor-pointer no-underline">
      {product.imageUrl ? (
        <img src={product.imageUrl} alt={product.title} className="w-14 h-14 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-muted-foreground/10 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{product.title}</p>
        <p className="text-[10px] text-muted-foreground">{product.brandName || "DREVO"}</p>
        <p className="text-xs font-bold text-accent">
          {product.salePrice ? `$${product.salePrice}` : product.price ? `$${product.price}` : ""}
        </p>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    </Link>
  );
}

function MessageContent({ content, products }: { content: string; products?: StylistProduct[] }) {
  const productMap = new Map(products?.map(p => [p.id, p]) || []);
  const parts = content.split(/\[PRODUCT:([^\]]+)\]/g);

  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const product = productMap.get(part);
          if (product) return <ProductCard key={`prod-${i}`} product={product} />;
          return null;
        }
        return part ? <span key={`text-${i}`}>{part}</span> : null;
      })}
    </>
  );
}

export default function Stylist() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem("drevo-stylist-chat");
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        return parsed.map(m => ({ ...m, images: undefined }));
      }
    } catch {}
    return [];
  });
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/auth");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (messages.length > 0) {
      const toSave = messages.map(m => ({ ...m, images: undefined }));
      localStorage.setItem("drevo-stylist-chat", JSON.stringify(toSave));
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = MAX_IMAGES - pendingImages.length;
    const toProcess = files.slice(0, remaining);

    if (files.length > remaining) {
      alert(`Podés adjuntar hasta ${MAX_IMAGES} fotos. Se agregaron las primeras ${remaining}.`);
    }

    toProcess.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert(`"${file.name}" es muy pesada (max 10MB). Se salteo.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        const mediaType = file.type || "image/jpeg";
        setPendingImages(prev => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [...prev, { base64, preview: dataUrl, mediaType }];
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }, [pendingImages.length]);

  // Voice recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

        if (audioBlob.size < 1000) return; // too short

        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");
          const res = await fetch("/api/stylist/transcribe", {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          if (res.ok) {
            const { text } = await res.json();
            if (text) setInput(prev => prev ? `${prev} ${text}` : text);
          }
        } catch (err) {
          console.error("Transcription error:", err);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
      alert("No se pudo acceder al micrófono. Revisá los permisos del navegador.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingTime(0);
  }, []);

  const sendMessage = useCallback(async (text?: string) => {
    const content = text || input.trim();
    if (!content && pendingImages.length === 0) return;
    if (isStreaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content || (pendingImages.length > 1 ? "¿Qué me podés decir de estas prendas? ¿Cómo las combino?" : "¿Qué me podés decir de esta prenda?"),
      imagePreviews: pendingImages.length > 0 ? pendingImages.map(img => img.preview) : undefined,
      images: pendingImages.length > 0 ? pendingImages.map(img => ({ base64: img.base64, mediaType: img.mediaType })) : undefined,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingImages([]);
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const apiMessages = newMessages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.images?.length ? { images: m.images } : {}),
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
      let streamProducts: StylistProduct[] = [];

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
                if (parsed.products) {
                  streamProducts = parsed.products;
                  setMessages(prev =>
                    prev.map(m => m.id === assistantId ? { ...m, products: streamProducts } : m)
                  );
                }
                if (parsed.text) {
                  fullText += parsed.text;
                  setMessages(prev =>
                    prev.map(m => m.id === assistantId ? { ...m, content: fullText, products: streamProducts } : m)
                  );
                }
                if (parsed.error) {
                  fullText += `\n\n${parsed.error}`;
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
  }, [input, pendingImages, messages, isStreaming]);

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
        {messages.length > 0 && (
          <div className="flex justify-end py-2">
            <button
              onClick={() => { setMessages([]); localStorage.removeItem("drevo-stylist-chat"); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full border border-border hover:border-foreground/30"
            >
              <RotateCcw className="w-3 h-3" />
              Nuevo chat
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8 text-accent" />
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground mb-2">
                Tu Estilista Personal
              </h1>
              <p className="text-muted-foreground max-w-md mb-8">
                Contame que buscas vestir, mandame fotos de tu armario, o pedime que te arme un outfit. Conozco todo el catalogo de DREVO.
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
                      ? "bg-accent text-black rounded-br-md"
                      : "bg-card border border-border text-foreground rounded-bl-md"
                  )}
                >
                  {msg.imagePreviews && msg.imagePreviews.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.imagePreviews.map((preview, idx) => (
                        <img
                          key={idx}
                          src={preview}
                          alt={`Foto ${idx + 1}`}
                          className="max-w-[140px] max-h-[140px] rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap leading-relaxed space-y-2">
                    {msg.role === "assistant" && msg.products?.length ? (
                      <MessageContent content={msg.content} products={msg.products} />
                    ) : (
                      msg.content
                    )}
                    {msg.role === "assistant" && isStreaming && messages[messages.length - 1]?.id === msg.id && (
                      <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse" />
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
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingImages.map((img, idx) => (
                <div key={idx} className="relative inline-block">
                  <img src={img.preview} alt={`Preview ${idx + 1}`} className="h-20 rounded-lg border border-border" />
                  <button
                    onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {pendingImages.length < MAX_IMAGES && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-20 w-20 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  <ImagePlus className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
          <div className="flex items-end gap-2 bg-card border border-border rounded-2xl p-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={pendingImages.length >= MAX_IMAGES}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-30"
              title={`Subir fotos (${pendingImages.length}/${MAX_IMAGES})`}
            >
              <ImagePlus className="w-5 h-5" />
            </button>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isStreaming}
              className={cn(
                "p-2 transition-colors shrink-0",
                isRecording
                  ? "text-red-500 animate-pulse"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={isRecording ? "Parar grabacion" : "Grabar audio"}
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            {isRecording && (
              <span className="text-xs text-red-500 font-mono shrink-0 py-2">
                {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, "0")}
              </span>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? "Grabando..." : "Escribi lo que necesitas..."}
              rows={1}
              disabled={isRecording}
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm resize-none outline-none py-2 max-h-32 disabled:opacity-50"
              style={{ minHeight: "36px" }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={isStreaming || (!input.trim() && pendingImages.length === 0)}
              className={cn(
                "p-2 rounded-xl transition-colors shrink-0",
                isStreaming || (!input.trim() && pendingImages.length === 0)
                  ? "text-muted-foreground"
                  : "bg-accent text-black hover:bg-accent/80"
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
