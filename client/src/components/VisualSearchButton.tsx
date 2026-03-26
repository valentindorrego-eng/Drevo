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
        className={`p-3 bg-white/5 border border-white/10 rounded-xl text-neutral-400 hover:bg-[#C8FF00]/10 hover:text-[#C8FF00] hover:border-[#C8FF00]/20 transition-all ${className}`}
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
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center"
            onClick={handleClose}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full md:max-w-2xl max-h-[90vh] bg-neutral-950 border border-white/10 rounded-t-2xl md:rounded-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-[#C8FF00]" />
                  <h3 className="text-sm font-semibold text-white">Búsqueda visual</h3>
                </div>
                <button onClick={handleClose} className="p-2 text-neutral-500 hover:text-white transition-colors">
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
                        className="w-full aspect-[4/3] border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-[#C8FF00]/30 hover:bg-[#C8FF00]/5 transition-all"
                      >
                        <ImageIcon className="w-10 h-10 text-neutral-600" />
                        <p className="text-sm text-neutral-500">Subí una foto del look que querés encontrar</p>
                        <p className="text-xs text-neutral-700">JPG, PNG o WebP — máx 5MB</p>
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="relative aspect-[4/3] rounded-xl overflow-hidden">
                          <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                          <button
                            onClick={() => { setPreview(null); setSelectedFile(null); }}
                            className="absolute top-3 right-3 p-2 bg-black/60 rounded-full text-white hover:bg-black/80"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <input
                          value={context}
                          onChange={(e) => setContext(e.target.value)}
                          placeholder="Contexto adicional (opcional): 'para oficina', 'más casual'..."
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30"
                        />

                        <button
                          onClick={handleSearch}
                          className="w-full flex items-center justify-center gap-2 bg-[#C8FF00] text-black py-3 rounded-xl font-bold hover:bg-[#A3D600] transition-all"
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
                    <Loader2 className="w-10 h-10 text-[#C8FF00] animate-spin" />
                    <p className="text-neutral-500 text-sm animate-pulse">Analizando imagen...</p>
                    <p className="text-neutral-700 text-xs">Esto puede tomar unos segundos</p>
                  </div>
                )}

                {results && (
                  <>
                    <div className="mb-4 p-3 bg-white/5 rounded-xl border border-white/5">
                      <p className="text-xs text-neutral-500 mb-1">Drevo interpretó:</p>
                      <p className="text-sm text-white">"{results.imageDescription}"</p>
                    </div>
                    <p className="text-sm text-neutral-400 mb-4">{results.results.length} productos encontrados</p>
                    <div className="grid grid-cols-2 gap-3">
                      {results.results.slice(0, 12).map((p: any, idx: number) => (
                        <div key={p.id} onClick={handleClose}>
                          <ProductCard product={p} index={idx} />
                        </div>
                      ))}
                    </div>
                    {results.results.length === 0 && (
                      <p className="text-center text-neutral-500 py-8">No encontramos productos similares a la imagen.</p>
                    )}
                    <button
                      onClick={() => { setPreview(null); setSelectedFile(null); setContext(""); reset(); }}
                      className="w-full mt-4 py-3 border border-white/10 rounded-xl text-sm text-neutral-400 hover:text-white transition-colors"
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
