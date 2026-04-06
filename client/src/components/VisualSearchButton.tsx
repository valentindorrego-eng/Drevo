import { useState, useRef } from "react";
import { Camera, X, Loader2, Send, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useVisualSearch } from "@/hooks/use-search";
import { ProductCard } from "./ProductCard";

interface VisualSearchButtonProps {
  className?: string;
}

export function VisualSearchButton({ className }: VisualSearchButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [context, setContext] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate: visualSearch, data: results, isPending, reset } = useVisualSearch();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSearch = () => {
    if (!selectedFile) return;
    visualSearch({ image: selectedFile, context: context || undefined });
  };

  const handleClose = () => {
    setIsOpen(false);
    setPreview(null);
    setSelectedFile(null);
    setContext("");
    reset();
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`p-3 bg-card border border-border rounded-xl text-muted-foreground hover:bg-accent/10 hover:text-accent hover:border-accent/20 transition-all ${className}`}
        title="Buscar por imagen"
      >
        <Camera className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end md:items-center justify-center"
            onClick={handleClose}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full md:max-w-2xl max-h-[90vh] bg-card border border-border rounded-t-2xl md:rounded-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-accent" />
                  <h3 className="text-sm font-semibold text-foreground">Búsqueda visual</h3>
                </div>
                <button onClick={handleClose} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
                {!results && !isPending && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    {!preview ? (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full aspect-[4/3] border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-3 hover:border-accent/30 hover:bg-accent/5 transition-all"
                      >
                        <ImageIcon className="w-10 h-10 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Subí una foto del look que querés encontrar</p>
                        <p className="text-xs text-muted-foreground">JPG, PNG o WebP — máx 5MB</p>
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="relative aspect-[4/3] rounded-xl overflow-hidden">
                          <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                          <button
                            onClick={() => { setPreview(null); setSelectedFile(null); }}
                            className="absolute top-3 right-3 p-2 bg-background/60 rounded-full text-foreground hover:bg-background/80"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <input
                          value={context}
                          onChange={(e) => setContext(e.target.value)}
                          placeholder="Contexto adicional (opcional): 'para oficina', 'más casual'..."
                          className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/30"
                        />

                        <button
                          onClick={handleSearch}
                          className="w-full flex items-center justify-center gap-2 bg-accent text-black py-3 rounded-xl font-bold hover:bg-accent/80 transition-all"
                        >
                          <Send className="w-4 h-4" />
                          Buscar productos similares
                        </button>
                      </div>
                    )}
                  </>
                )}

                {isPending && (
                  <div className="flex flex-col items-center justify-center py-16 space-y-4">
                    <Loader2 className="w-10 h-10 text-accent animate-spin" />
                    <p className="text-muted-foreground text-sm animate-pulse">Analizando imagen...</p>
                    <p className="text-muted-foreground text-xs">Esto puede tomar unos segundos</p>
                  </div>
                )}

                {results && (
                  <>
                    <div className="mb-4 p-3 bg-card rounded-xl border border-border">
                      <p className="text-xs text-muted-foreground mb-1">Drevo interpretó:</p>
                      <p className="text-sm text-foreground">"{results.imageDescription}"</p>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">{results.results.length} productos encontrados</p>
                    <div className="grid grid-cols-2 gap-3">
                      {results.results.slice(0, 12).map((p: any, idx: number) => (
                        <div key={p.id} onClick={handleClose}>
                          <ProductCard product={p} index={idx} />
                        </div>
                      ))}
                    </div>
                    {results.results.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">No encontramos productos similares a la imagen.</p>
                    )}
                    <button
                      onClick={() => { setPreview(null); setSelectedFile(null); setContext(""); reset(); }}
                      className="w-full mt-4 py-3 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Buscar con otra imagen
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
