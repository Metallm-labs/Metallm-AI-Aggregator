import { useState } from "react";
import { Download, Loader2, RefreshCw, AlertCircle, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelIcon } from "@/components/ModelIcon";
import { motion } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export interface MediaGenerationState {
  id: string;
  type: "image";
  status: "generating" | "polling" | "completed" | "failed";
  prompt: string;
  modelId: string;
  modelName: string;
  iconUrl?: string;
  aspectRatio?: string;
  images?: { url: string; b64Data?: string }[];
  estimatedCost?: number;
  error?: string;
}

interface MediaGenerationResultProps {
  generation: MediaGenerationState;
  onRetry?: () => void;
}

export function MediaGenerationResult({ generation, onRetry }: MediaGenerationResultProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const handleDownload = async (url: string, filename: string) => {
    try {
      if (url.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
      } else {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      window.open(url, "_blank");
    }
  };

  const firstImageUrl = generation.images?.[0]?.url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl"
    >
      {/* Model name — clean, no box */}
      <div className="flex items-center gap-2 mb-2">
        <ModelIcon modelName={generation.modelName} iconUrl={generation.iconUrl} size={18} />
        <span className="text-xs font-medium text-muted-foreground">{generation.modelName}</span>
      </div>

      {/* Loading state — animated gradient placeholder */}
      {(generation.status === "generating" || generation.status === "polling") && (
        <div
          className="relative rounded-xl overflow-hidden max-h-[400px]"
          style={{ aspectRatio: generation.aspectRatio || "1/1" }}
        >
          <div className="absolute inset-0 animate-pulse-slow bg-gradient-to-br from-pink-500/20 via-purple-500/20 to-blue-500/20" />
          <motion.div
            className="absolute inset-0 opacity-60"
            style={{
              background: "linear-gradient(135deg, rgba(236,72,153,0.3), rgba(168,85,247,0.3), rgba(59,130,246,0.3), rgba(236,72,153,0.3))",
              backgroundSize: "300% 300%",
            }}
            animate={{ backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className="w-10 h-10 text-pink-400 drop-shadow-[0_0_12px_rgba(236,72,153,0.5)]" />
            </motion.div>
            <div className="text-center">
              <p className="text-sm text-white font-medium drop-shadow-md">
                {generation.status === "generating" ? "Generating..." : "Processing..."}
              </p>
              <p className="text-xs text-white/60 mt-1">
{"Creating your image..."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Failed state */}
      {generation.status === "failed" && (
        <div className="flex items-center gap-3 py-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-300">{generation.error || "Generation failed. Please try again."}</p>
          </div>
          {onRetry && (
            <button onClick={onRetry} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors">
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* Completed - Image */}
      {generation.status === "completed" && generation.type === "image" && generation.images && (
        <>
          {generation.images.map((img, i) => (
            <div key={i} className="relative group inline-block rounded-xl overflow-hidden">
              {!imageLoaded && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              <img
                src={img.url}
                alt={generation.prompt}
                className={cn(
                  "max-w-full max-h-[512px] rounded-xl transition-opacity block",
                  imageLoaded ? "opacity-100" : "opacity-0 h-0"
                )}
                onLoad={() => setImageLoaded(true)}
              />
              {/* Overlay icons — always top-right of the actual image */}
              {imageLoaded && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setFullscreen(true)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 backdrop-blur text-white transition-colors"
                    title="Full screen"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDownload(img.url, `metallm-${generation.modelId}-${Date.now()}.png`)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 backdrop-blur text-white transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Fullscreen dialog */}
          <Dialog open={fullscreen} onOpenChange={setFullscreen}>
            <DialogContent className="max-w-[95vw] max-h-[95vh] w-fit p-2 bg-black/95 border-white/10">
              {firstImageUrl && (
                <img
                  src={firstImageUrl}
                  alt={generation.prompt}
                  className="max-w-full max-h-[90vh] object-contain rounded-lg"
                />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}

    </motion.div>
  );
}
