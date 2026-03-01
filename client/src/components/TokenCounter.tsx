import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, X, TrendingUp, Zap, DollarSign, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModelTokenUsage {
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenCounterProps {
  tokensByModel: Map<string, ModelTokenUsage>;
  onExportChat?: () => void;
}

// ── Model Pricing (per 1M tokens in USD) ──

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "Gemini":  { input: 0.50,  output: 3.00 },
  "DeepSeek R1":   { input: 0,     output: 0    },
  "LLaMA 3.3":    { input: 0,     output: 0    },
  "Gemma 3 27B":  { input: 0,     output: 0    },
  "Devstral":     { input: 0,     output: 0    },
  "Nemotron":     { input: 0,     output: 0    },
  "Qwen 2.5":    { input: 0,     output: 0    },
  "Gemma 3 12B":  { input: 0,     output: 0    },
  "GLM 4.5":     { input: 0,     output: 0    },
};

function getModelCost(model: ModelTokenUsage): number {
  const pricing = MODEL_PRICING[model.modelName];
  if (!pricing) return 0;
  const inputCost = (model.promptTokens / 1_000_000) * pricing.input;
  const outputCost = (model.completionTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

function formatCost(cost: number): string {
  if (cost === 0) return "Free";
  if (cost < 0.0001) return "<$0.0001";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

// ── Color mapping by model displayName ──
const MODEL_COLOR_MAP: Record<string, { solid: string; text: string; bg: string; border: string }> = {
  "Gemini":  { solid: "bg-blue-500",    text: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
  "DeepSeek R1":   { solid: "bg-purple-500",  text: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/20"  },
  "LLaMA 3.3":    { solid: "bg-green-500",   text: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/20"   },
  "Gemma 3 27B":  { solid: "bg-indigo-500",  text: "text-indigo-400",  bg: "bg-indigo-500/10",  border: "border-indigo-500/20"  },
  "Devstral":     { solid: "bg-cyan-500",    text: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20"    },
  "Nemotron":     { solid: "bg-lime-500",    text: "text-lime-400",    bg: "bg-lime-500/10",    border: "border-lime-500/20"    },
  "Qwen 2.5":    { solid: "bg-pink-500",    text: "text-pink-400",    bg: "bg-pink-500/10",    border: "border-pink-500/20"    },
  "Gemma 3 12B":  { solid: "bg-amber-500",   text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
  "GLM 4.5":     { solid: "bg-teal-500",    text: "text-teal-400",    bg: "bg-teal-500/10",    border: "border-teal-500/20"    },
  "✨ Summary":   { solid: "bg-yellow-500",  text: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/20"  },
};

const FALLBACK_COLORS = [
  { solid: "bg-violet-500",  text: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20"  },
  { solid: "bg-rose-500",    text: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20"    },
  { solid: "bg-orange-500",  text: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20"  },
  { solid: "bg-sky-500",     text: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/20"     },
];

function getModelColor(modelName: string, index: number) {
  return MODEL_COLOR_MAP[modelName] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function TokenCounter({ tokensByModel, onExportChat }: TokenCounterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const models = Array.from(tokensByModel.values());
  const totalPrompt = models.reduce((sum, m) => sum + m.promptTokens, 0);
  const totalCompletion = models.reduce((sum, m) => sum + m.completionTokens, 0);
  const totalTokens = models.reduce((sum, m) => sum + m.totalTokens, 0);
  const totalCost = models.reduce((sum, m) => sum + getModelCost(m), 0);

  const modelSlices = models.map((m, i) => ({
    model: m,
    color: getModelColor(m.modelName, i),
    percentage: totalTokens > 0 ? (m.totalTokens / totalTokens) * 100 : 0,
    cost: getModelCost(m),
  }));

  if (totalTokens === 0) return null;

  return (
    <>
      {/* Floating pill: token count + export chat */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed top-4 right-4 z-50 flex items-center gap-0.5"
      >
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-l-full",
            "bg-card/90 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/20",
            "hover:border-primary/30 hover:bg-card transition-all cursor-pointer",
            "text-xs font-medium border-r-0",
            isOpen && "border-primary/40 bg-primary/5"
          )}
          title="Token usage"
        >
          <Coins className="w-3.5 h-3.5 text-yellow-400" />
          <span className="text-white/80">{formatTokenCount(totalTokens)}</span>
          {totalCost > 0 && (
            <span className="text-emerald-400/80 text-[10px] ml-0.5">{formatCost(totalCost)}</span>
          )}
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => { onExportChat?.(); }}
          className={cn(
            "flex items-center justify-center w-8 h-[30px] rounded-r-full",
            "bg-card/90 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/20",
            "hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all cursor-pointer"
          )}
          title="Export chat as Markdown"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" />
        </motion.button>
      </motion.div>

      {/* Detailed panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="fixed top-14 right-4 z-50 w-[380px] max-h-[70vh] overflow-y-auto rounded-xl bg-card/95 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/30"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
                    <Coins className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Token Usage</h3>
                    <p className="text-[10px] text-muted-foreground">Active chat session</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { onExportChat?.(); setIsOpen(false); }}
                    className="p-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors text-muted-foreground hover:text-emerald-400"
                    title="Export chat as Markdown"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Summary cards */}
              <div className="px-4 py-3 border-b border-white/5">
                <div className={cn("grid gap-2", totalCost > 0 ? "grid-cols-4" : "grid-cols-3")}>
                  <div className="rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/15 p-2.5">
                    <div className="text-[10px] text-blue-400/70 font-medium uppercase tracking-wider mb-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Input
                    </div>
                    <div className="text-lg font-bold text-blue-400">{formatTokenCount(totalPrompt)}</div>
                  </div>
                  <div className="rounded-lg bg-gradient-to-br from-green-500/10 to-emerald-600/5 border border-green-500/15 p-2.5">
                    <div className="text-[10px] text-green-400/70 font-medium uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Output
                    </div>
                    <div className="text-lg font-bold text-green-400">{formatTokenCount(totalCompletion)}</div>
                  </div>
                  <div className="rounded-lg bg-gradient-to-br from-yellow-500/10 to-orange-600/5 border border-yellow-500/15 p-2.5">
                    <div className="text-[10px] text-yellow-400/70 font-medium uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Coins className="w-3 h-3" /> Total
                    </div>
                    <div className="text-lg font-bold text-yellow-400">{formatTokenCount(totalTokens)}</div>
                  </div>
                  {totalCost > 0 && (
                    <div className="rounded-lg bg-gradient-to-br from-emerald-500/10 to-green-600/5 border border-emerald-500/15 p-2.5">
                      <div className="text-[10px] text-emerald-400/70 font-medium uppercase tracking-wider mb-1 flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> Cost
                      </div>
                      <div className="text-lg font-bold text-emerald-400">{formatCost(totalCost)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Stacked progress bar + model legend */}
              <div className="px-4 py-3">
                <div className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider mb-3">
                  Usage by Model ({models.length})
                </div>

                {/* Single stacked progress bar */}
                <div className="relative h-5 rounded-full bg-white/5 overflow-hidden mb-4 flex">
                  {modelSlices.map((slice, i) => (
                    <motion.div
                      key={slice.model.modelName}
                      initial={{ width: 0 }}
                      animate={{ width: `${slice.percentage}%` }}
                      transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.08 }}
                      className={cn(
                        "h-full relative",
                        slice.color.solid,
                        i === 0 && "rounded-l-full",
                        i === modelSlices.length - 1 && "rounded-r-full"
                      )}
                      title={`${slice.model.modelName}: ${Math.round(slice.percentage)}%`}
                    >
                      {slice.percentage >= 12 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white drop-shadow-sm">
                          {Math.round(slice.percentage)}%
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Model legend rows */}
                <div className="space-y-2">
                  {modelSlices.map((slice) => {
                    const pricing = MODEL_PRICING[slice.model.modelName];
                    const isFree = !pricing || (pricing.input === 0 && pricing.output === 0);

                    return (
                      <motion.div
                        key={slice.model.modelName}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={cn("rounded-lg border p-2.5", slice.color.bg, slice.color.border)}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className={cn("w-2.5 h-2.5 rounded-full", slice.color.solid)} />
                            <span className={cn("text-xs font-semibold", slice.color.text)}>
                              {slice.model.modelName}
                            </span>
                            <span className="text-[10px] text-white/40 font-medium">
                              {Math.round(slice.percentage)}%
                            </span>
                          </div>
                          <span className="text-[11px] text-white/60 font-medium">
                            {formatTokenCount(slice.model.totalTokens)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px]">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                              <span className="text-muted-foreground">In:</span>
                              <span className="text-white/70 font-medium">{formatTokenCount(slice.model.promptTokens)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                              <span className="text-muted-foreground">Out:</span>
                              <span className="text-white/70 font-medium">{formatTokenCount(slice.model.completionTokens)}</span>
                            </div>
                          </div>
                          <span className={cn(
                            "font-medium",
                            isFree ? "text-emerald-400/60" : "text-emerald-400"
                          )}>
                            {isFree ? "Free" : formatCost(slice.cost)}
                          </span>
                        </div>

                        {pricing && !isFree && (
                          <div className="mt-1 text-[9px] text-muted-foreground/40">
                            ${pricing.input}/1M in · ${pricing.output}/1M out
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-white/5">
                <p className="text-[9px] text-muted-foreground/40 text-center">
                  Exact token counts from model APIs — cost based on published model pricing
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
