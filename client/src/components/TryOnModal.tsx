import { useState, useRef, useCallback } from "react";
import { X, Upload, Camera, Loader2, Sparkles, RotateCcw, User, Download, Share2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";

interface TryOnModalProps {
  productId: string;
  productTitle: string;
  productImage: string;
  isOpen: boolean;
  onClose: () => void;
}

type PhotoSource = "upload" | "profile";

function addWatermark(imageSrc: string, productTitle: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));

      ctx.drawImage(img, 0, 0);

      const bannerHeight = Math.max(48, canvas.height * 0.06);
      const y = canvas.height - bannerHeight;

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, y, canvas.width, bannerHeight);

      const fontSize = Math.max(14, bannerHeight * 0.4);
      ctx.font = `bold ${fontSize}px 'Space Grotesk', 'Inter', sans-serif`;
      ctx.fillStyle = "#C8FF00";
      ctx.textBaseline = "middle";
      const padding = fontSize * 0.8;
      ctx.fillText("DREVO", padding, y + bannerHeight / 2);

      const drevoWidth = ctx.measureText("DREVO").width;

      const smallFontSize = fontSize * 0.6;
      ctx.font = `${smallFontSize}px 'Inter', sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fillText(`drevo.replit.app`, padding + drevoWidth + fontSize * 0.6, y + bannerHeight / 2);

      const productFontSize = fontSize * 0.55;
      ctx.font = `${productFontSize}px 'Inter', sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      const truncatedTitle = productTitle.length > 40 ? productTitle.slice(0, 37) + "..." : productTitle;
      const titleWidth = ctx.measureText(truncatedTitle).width;
      ctx.fillText(truncatedTitle, canvas.width - titleWidth - padding, y + bannerHeight / 2);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to create image"))),
        "image/png",
        1
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSrc;
  });
}

export function TryOnModal({ productId, productTitle, productImage, isOpen, onClose }: TryOnModalProps) {
  const { user } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadedPhoto, setUploadedPhoto] = useState<File | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [photoSource, setPhotoSource] = useState<PhotoSource>(
    user?.fullBodyImageUrl ? "profile" : "upload"
  );
  const [isSharing, setIsSharing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profilePhoto = user?.fullBodyImageUrl || user?.profileImageUrl || null;

  const activePhoto = photoSource === "profile" ? profilePhoto : uploadedPreview;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedPhoto(file);
    setUploadedPreview(URL.createObjectURL(file));
    setPhotoSource("upload");
    setResultImage(null);
    setStatus("idle");
  };

  const handleGenerate = async (forceRegenerate = false) => {
    if (!activePhoto && !uploadedPhoto) {
      setErrorMessage("Necesitás subir una foto o tener una foto de perfil");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("productId", productId);
      if (photoSource === "upload" && uploadedPhoto) {
        formData.append("userPhoto", uploadedPhoto);
      } else {
        formData.append("useProfilePhoto", "true");
      }
      if (forceRegenerate) {
        formData.append("forceRegenerate", "true");
      }

      const res = await fetch("/api/tryon", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Error al generar");
      }

      const data = await res.json();
      if (data?.resultImageUrl) {
        setResultImage(data.resultImageUrl);
        setStatus("done");
      } else {
        throw new Error("No se recibió imagen");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setErrorMessage(message);
      setStatus("error");
    }
  };

  const handleRetry = () => {
    handleGenerate(true);
  };

  const handleDownload = useCallback(async () => {
    if (!resultImage) return;
    setIsSharing(true);
    try {
      const blob = await addWatermark(resultImage, productTitle);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drevo-tryon-${productTitle.replace(/\s+/g, "-").toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement("a");
      a.href = resultImage;
      a.download = `drevo-tryon.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setIsSharing(false);
    }
  }, [resultImage, productTitle]);

  const handleShare = useCallback(async () => {
    if (!resultImage) return;
    setIsSharing(true);
    try {
      const blob = await addWatermark(resultImage, productTitle);
      const file = new File([blob], `drevo-tryon-${productTitle.replace(/\s+/g, "-").toLowerCase()}.png`, { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Mirá cómo me queda — ${productTitle}`,
          text: `Probé esta prenda en DREVO ✨\n${productTitle}`,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: `Mirá cómo me queda — ${productTitle}`,
          text: `Probé esta prenda en DREVO ✨\n${productTitle}\n${window.location.origin}/product/${productId}`,
        });
      } else {
        await handleDownload();
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        await handleDownload();
      }
    } finally {
      setIsSharing(false);
    }
  }, [resultImage, productTitle, productId, handleDownload]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        data-testid="modal-tryon-overlay"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-neutral-900 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          data-testid="modal-tryon"
        >
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="bg-[#C8FF00]/10 p-2 rounded-lg">
                <Sparkles className="w-5 h-5 text-[#C8FF00]" />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold text-white">Probador Virtual</h2>
                <p className="text-sm text-neutral-400">Visualizá cómo te queda esta prenda</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white transition-colors p-1"
              data-testid="button-close-tryon"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Tu foto</p>
                <div className="aspect-[3/4] bg-neutral-800 rounded-lg overflow-hidden border border-white/5 flex items-center justify-center relative">
                  {activePhoto ? (
                    <img src={activePhoto} alt="Tu foto" className="w-full h-full object-cover" data-testid="img-tryon-user" />
                  ) : (
                    <div className="text-center p-4">
                      <Camera className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                      <p className="text-sm text-neutral-500">Subí una foto de cuerpo completo</p>
                    </div>
                  )}
                </div>

                {profilePhoto && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setPhotoSource("profile"); setResultImage(null); setStatus("idle"); }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg border transition-colors ${
                        photoSource === "profile"
                          ? "bg-[#C8FF00]/10 border-[#C8FF00]/30 text-[#C8FF00]"
                          : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"
                      }`}
                      data-testid="button-use-profile-photo"
                    >
                      <User className="w-3.5 h-3.5" />
                      Mi foto
                    </button>
                    <button
                      onClick={() => { setPhotoSource("upload"); fileInputRef.current?.click(); }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg border transition-colors ${
                        photoSource === "upload"
                          ? "bg-[#C8FF00]/10 border-[#C8FF00]/30 text-[#C8FF00]"
                          : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"
                      }`}
                      data-testid="button-upload-new-photo"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Subir otra
                    </button>
                  </div>
                )}

                {!profilePhoto && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-neutral-300 transition-colors"
                    data-testid="button-upload-tryon-photo"
                  >
                    <Upload className="w-4 h-4" />
                    {uploadedPreview ? "Cambiar foto" : "Subir foto"}
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-tryon-photo"
                />

                <p className="text-[10px] text-neutral-600 text-center leading-tight">
                  Usá una foto de cuerpo completo, de frente, con buena iluminación
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Producto</p>
                <div className="aspect-[3/4] bg-neutral-800 rounded-lg overflow-hidden border border-white/5">
                  <img src={productImage} alt={productTitle} className="w-full h-full object-cover" data-testid="img-tryon-product" />
                </div>
                <p className="text-sm text-neutral-400 truncate">{productTitle}</p>
              </div>
            </div>

            {status === "idle" && (
              <button
                onClick={() => handleGenerate()}
                disabled={!activePhoto && !uploadedPhoto}
                className="w-full py-4 bg-[#C8FF00] text-black font-bold rounded-xl hover:bg-[#A3D600] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                data-testid="button-generate-tryon"
              >
                <Sparkles className="w-5 h-5" />
                Generar prueba virtual
              </button>
            )}

            {status === "loading" && (
              <div className="text-center py-8 space-y-4">
                <Loader2 className="w-10 h-10 text-[#C8FF00] animate-spin mx-auto" />
                <div>
                  <p className="text-white font-medium">Generando tu prueba virtual...</p>
                  <p className="text-sm text-neutral-500 mt-1">Esto puede tardar 15-30 segundos</p>
                </div>
                <div className="w-full bg-neutral-800 rounded-full h-1 overflow-hidden">
                  <motion.div
                    className="h-full bg-[#C8FF00]"
                    initial={{ width: "0%" }}
                    animate={{ width: "90%" }}
                    transition={{ duration: 25, ease: "linear" }}
                  />
                </div>
              </div>
            )}

            {status === "done" && resultImage && (
              <div className="space-y-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium text-center">Resultado</p>
                <div className="aspect-[9/16] max-h-[500px] bg-neutral-800 rounded-xl overflow-hidden border border-[#C8FF00]/20 mx-auto">
                  <img src={resultImage} alt="Prueba virtual" className="w-full h-full object-contain" data-testid="img-tryon-result" />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleDownload}
                    disabled={isSharing}
                    className="flex-1 py-3 bg-[#C8FF00] hover:bg-[#A3D600] rounded-xl text-black font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    data-testid="button-download-tryon"
                  >
                    <Download className="w-4 h-4" />
                    Guardar imagen
                  </button>
                  <button
                    onClick={handleShare}
                    disabled={isSharing}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    data-testid="button-share-tryon"
                  >
                    <Share2 className="w-4 h-4" />
                    Compartir
                  </button>
                </div>
                <button
                  onClick={handleRetry}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-neutral-400 text-sm flex items-center justify-center gap-2 transition-colors"
                  data-testid="button-retry-tryon"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Generar de nuevo
                </button>
                <p className="text-xs text-neutral-600 text-center">
                  Imagen generada por IA. Puede no representar fielmente el producto.
                </p>
              </div>
            )}

            {status === "error" && (
              <div className="text-center py-6 space-y-3">
                <p className="text-red-400">{errorMessage}</p>
                <button
                  onClick={handleRetry}
                  className="px-6 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-white text-sm transition-colors"
                  data-testid="button-retry-tryon-error"
                >
                  Intentar de nuevo
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
