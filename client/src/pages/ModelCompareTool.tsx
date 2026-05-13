import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, History, Loader2, Plus, Send, Swords, ChevronDown, StopCircle, Brain, Trash, Zap, Users, Sparkles, Activity, PanelLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CompareStatus = "success" | "error" | "streaming" | "pending";

interface CompareResult {
  modelId: string;
  status: CompareStatus;
  response: string;
  error?: string;
  latencyMs: number;
}

interface CompareApiResponse {
  prompt: string;
  comparedAt: string;
  results: CompareResult[];
}

interface CompareHistoryItem {
  id: string;
  title: string;
  prompt: string;
  models: string[];
  data: CompareApiResponse;
}

const MODEL_OPTIONS = [
  // Free / Unlocked (Groq Models)
  { id: "llama-3.3-70b-versatile", name: "LLaMA 3.3 70B", isPro: false },
  { id: "qwen/qwen3-32b", name: "Qwen 3 32B", isPro: false },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "LLaMA 4 Scout", isPro: false },
  { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", isPro: false },
  { id: "moonshotai/kimi-k2-instruct", name: "Kimi K2", isPro: false },
  { id: "groq/compound", name: "Groq Compound", isPro: false },
  // PRO / Locked Models
  { id: "gpt-5.4", name: "GPT-5.4", isPro: true },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", isPro: true },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", isPro: true },
  { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", isPro: true },
  { id: "grok-4.20-0309-reasoning", name: "Grok 4.20 Reasoning", isPro: true },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", isPro: true },
  { id: "grok-4-1-fast-reasoning", name: "Grok 4.1 Fast", isPro: true },
  { id: "gpt-5.4-mini", name: "GPT-5.4 mini", isPro: true },
  { id: "xiaomi/mimo-v2-pro", name: "Mimo V2 Pro", isPro: true },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", isPro: true },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron", isPro: true },
  { id: "z-ai/glm-4.5-air:free", name: "GLM 4.5", isPro: true },
  { id: "arcee-ai/trinity-large-preview:free", name: "Trinity Large", isPro: true }
];

const HISTORY_STORAGE_KEY = "metallm.model.compare.history";

const COMPARE_MODES = [
  { id: "compare", name: "Compare Mode", icon: Swords, isPro: false },
  { id: "direct", name: "Direct Mode", icon: Zap, isPro: true },
  { id: "debate", name: "Debate", icon: Users, isPro: true },
  { id: "smart", name: "Smart Route", icon: Sparkles, isPro: true }
];

function parseThinkingContent(raw: string): { thinkingBlocks: string[]; visibleContent: string } {
    const thinkingBlocks: string[] = [];
    const cleaned = raw.replace(/<think>([\s\S]*?)<\/think>/gi, (_match, inner: string) => {
        const trimmed = inner.trim();
        if (trimmed) thinkingBlocks.push(trimmed);
        return "";
    });
    const openIdx = cleaned.lastIndexOf("<think>");
    const closeIdx = cleaned.lastIndexOf("</think>");
    let visibleContent = cleaned;
    if (openIdx !== -1 && openIdx > closeIdx) {
        const partial = cleaned.slice(openIdx + 7).trim();
        if (partial) thinkingBlocks.push(partial + " ▌");
        visibleContent = cleaned.slice(0, openIdx);
    }
    return { thinkingBlocks, visibleContent: visibleContent.trim() };
}

function ModelResponseViewer({ row }: { row: CompareResult }) {
    const [showThinking, setShowThinking] = useState(true);
    const { thinkingBlocks, visibleContent } = parseThinkingContent(row.response || "");
    const hasThinking = thinkingBlocks.length > 0;

    useEffect(() => {
        if (row.status === "streaming" && hasThinking) {
            setShowThinking(true);
        }
    }, [row.status, hasThinking]);

    if (row.status === "error") {
        return <span className="text-red-400/80 italic">{row.error || "Model call failed"}</span>;
    }

    return (
        <div className="w-full flex-1">
            {hasThinking && (
                <div className="mb-3">
                    <button
                        onClick={() => setShowThinking((s) => !s)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/15 transition-colors text-[11px] text-purple-300 hover:text-purple-200 w-full text-left"
                    >
                        <Brain className="w-3 h-3 flex-shrink-0" />
                        <span className="font-medium">
                            {row.status === "streaming" && row.response.includes("<think>") && !row.response.includes("</think>") ? "Thinking…" : "View Reasoning"}
                        </span>
                        <ChevronDown className={`w-3 h-3 ml-auto transition-transform flex-shrink-0 ${showThinking ? "rotate-180" : ""}`} />
                    </button>
                    <AnimatePresence>
                        {showThinking && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="mt-1.5 px-3 py-2.5 rounded-lg bg-purple-500/5 border border-purple-500/15 text-xs text-purple-200/70 leading-relaxed whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                                    {thinkingBlocks.join("\n\n---\n\n")}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                a: ({node, ...props}) => <a className="text-amber-400 hover:text-amber-300 underline" target="_blank" {...props} />,
                pre: ({node, ...props}) => <pre className="p-3 my-2 rounded-lg overflow-x-auto border border-white/10 bg-black/50" {...props} />,
                code: ({node, className, ...props}) => {
                    const isInline = !className;
                    return <code className={`${isInline ? 'bg-white/10 text-amber-100 rounded px-1 py-0.5 font-mono text-[13px]' : 'font-mono text-[13px]'}`} {...props} />
                }
            }}>
                {visibleContent || (row.status === "streaming" ? "..." : "")}
            </ReactMarkdown>
        </div>
    );
}

export default function ModelCompareTool() {
  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>(["qwen/qwen3-32b", "openai/gpt-oss-120b"]);
  const [selectedMode, setSelectedMode] = useState("compare");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompareApiResponse | null>(null);
  const [history, setHistory] = useState<CompareHistoryItem[]>([]);
  const abortControllersRef = useRef<{ [modelId: string]: AbortController }>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CompareHistoryItem[];
      if (Array.isArray(parsed)) {
        setHistory(parsed.slice(0, 20));
      }
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 20)));
  }, [history]);

  useEffect(() => {
    const originalTitle = document.title;
    const metaDescription = document.querySelector('meta[name="description"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    const twitterUrl = document.querySelector('meta[name="twitter:url"]');
    const canonical = document.querySelector('link[rel="canonical"]');

    const originalDescription = metaDescription?.getAttribute("content") || "";
    const originalOgTitle = ogTitle?.getAttribute("content") || "";
    const originalOgDescription = ogDescription?.getAttribute("content") || "";
    const originalOgUrl = ogUrl?.getAttribute("content") || "";
    const originalTwitterTitle = twitterTitle?.getAttribute("content") || "";
    const originalTwitterDescription = twitterDescription?.getAttribute("content") || "";
    const originalTwitterUrl = twitterUrl?.getAttribute("content") || "";
    const originalCanonical = canonical?.getAttribute("href") || "";

    const title = "LLM Battle: AI Model Comparison Tool | ChatGPT vs Claude vs Gemini";
    const description =
      "Host the ultimate LLM Battle. Compare ChatGPT vs Claude vs Gemini instantly. Use our AI model comparison tool to evaluate speed, reasoning, and logic across 13+ frontier LLMs in side-by-side matches.";
    const url = "https://metallm.tech/compare";

    document.title = title;
    if (metaDescription) metaDescription.setAttribute("content", description);
    if (ogTitle) ogTitle.setAttribute("content", title);
    if (ogDescription) ogDescription.setAttribute("content", description);
    if (ogUrl) ogUrl.setAttribute("content", url);
    if (twitterTitle) twitterTitle.setAttribute("content", title);
    if (twitterDescription) twitterDescription.setAttribute("content", description);
    if (twitterUrl) twitterUrl.setAttribute("content", url);
    if (canonical) canonical.setAttribute("href", url);

    const schemaScript = document.createElement("script");
    schemaScript.type = "application/ld+json";
    schemaScript.id = "model-compare-schema";
    schemaScript.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "MetaLLM AI Model Comparison Tool",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      description,
      url,
      isAccessibleForFree: true,
      publisher: {
        "@type": "Organization",
        name: "MetaLLM",
        url: "https://metallm.tech",
      },
    });

    if (!document.getElementById("model-compare-schema")) {
      document.head.appendChild(schemaScript);
    }

    return () => {
      document.title = originalTitle;
      if (metaDescription) metaDescription.setAttribute("content", originalDescription);
      if (ogTitle) ogTitle.setAttribute("content", originalOgTitle);
      if (ogDescription) ogDescription.setAttribute("content", originalOgDescription);
      if (ogUrl) ogUrl.setAttribute("content", originalOgUrl);
      if (twitterTitle) twitterTitle.setAttribute("content", originalTwitterTitle);
      if (twitterDescription) twitterDescription.setAttribute("content", originalTwitterDescription);
      if (twitterUrl) twitterUrl.setAttribute("content", originalTwitterUrl);
      if (canonical) canonical.setAttribute("href", originalCanonical);

      const scriptToRemove = document.getElementById("model-compare-schema");
      if (scriptToRemove) {
        document.head.removeChild(scriptToRemove);
      }
    };
  }, []);

  const canSubmit = useMemo(() => prompt.trim().length >= 3 && selectedModels.length >= 2, [prompt, selectedModels]);

  const toggleModel = (modelId: string) => {
    const modelDef = MODEL_OPTIONS.find((m) => m.id === modelId);
    if (modelDef?.isPro) return;
    
    setSelectedModels((prev) => {
      if (prev.includes(modelId)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== modelId);
      }
      if (prev.length >= 2) {
        return [prev[1], modelId];
      }
      return [...prev, modelId];
    });
  };

  const onDeleteHistory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const stopStreaming = () => {
    Object.values(abortControllersRef.current).forEach(ctrl => ctrl.abort());
    setLoading(false);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    stopStreaming();

    const timestamp = new Date().toISOString();
    const runningResults: CompareResult[] = selectedModels.map((id, i) => ({
      modelId: id,
      status: (selectedModels.length === 2 && i === 1) ? "pending" as CompareStatus : "streaming" as CompareStatus,
      response: "",
      latencyMs: 0,
    }));
    
    setData({
      prompt: prompt.trim(),
      comparedAt: timestamp,
      results: [...runningResults],
    });

    const controllers: { [modelId: string]: AbortController } = {};
    abortControllersRef.current = controllers;

    const runModelStream = async (modelId: string, index: number, options?: { mode?: string, opponentResponse?: string, opponentModelId?: string }) => {
        const start = Date.now();
        const controller = new AbortController();
        controllers[modelId] = controller;

        // Set status to streaming right before fetch
        runningResults[index].status = "streaming";
        setData({ prompt: prompt.trim(), comparedAt: timestamp, results: [...runningResults] });

        try {
          const res = await fetch("/api/tools/model-compare/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: prompt.trim(), modelId, ...options }),
            signal: controller.signal,
          });

          if (!res.ok) throw new Error(`Failed with status ${res.status}`);

          const reader = res.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let buffer = "";
          let fullResponse = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const dataStr = trimmed.slice(6);
              if (dataStr === "[DONE]") {
                 runningResults[index] = { ...runningResults[index], status: "success", response: fullResponse, latencyMs: Date.now() - start };
                 setData({ prompt: prompt.trim(), comparedAt: timestamp, results: [...runningResults] });
                 break;
              }

              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.chunk) {
                  fullResponse += parsed.chunk;
                  runningResults[index] = { ...runningResults[index], response: fullResponse };
                  setData({ prompt: prompt.trim(), comparedAt: timestamp, results: [...runningResults] });
                }
              } catch (e) {
                // ignore unparseable
              }
            }
          }
          runningResults[index] = { ...runningResults[index], status: "success", latencyMs: Date.now() - start };
          setData({ prompt: prompt.trim(), comparedAt: timestamp, results: [...runningResults] });
          return fullResponse;
        } catch (err: any) {
             if (err.name !== "AbortError") {
                  runningResults[index] = { ...runningResults[index], status: "error", error: err.message, latencyMs: Date.now() - start };
                  setData({ prompt: prompt.trim(), comparedAt: timestamp, results: [...runningResults] });
             }
             return null;
        }
    };

    // Execute sequential Debate logic if 2 models are active (to satisfy the request for sequential context)
    if (selectedModels.length === 2) {
       const m1 = selectedModels[0];
       const m2 = selectedModels[1];
       
       const m1Response = await runModelStream(m1, 0);
       
       if (m1Response && !controllers[m1].signal.aborted) {
           await runModelStream(m2, 1, { mode: "debate", opponentResponse: m1Response, opponentModelId: m1 });
       } else {
           if (runningResults[1].status === "streaming") {
                runningResults[1] = { ...runningResults[1], status: "error", error: "Debate aborted or failed during first round." };
                setData({ prompt: prompt.trim(), comparedAt: timestamp, results: [...runningResults] });
           }
       }
    } else {
       await Promise.all(selectedModels.map((modelId, index) => runModelStream(modelId, index)));
    }

    setLoading(false);
    setHistory((prev) => {
        const item: CompareHistoryItem = {
          id: `${Date.now()}`,
          title: prompt.trim().slice(0, 52) || "Untitled compare",
          prompt: prompt.trim(),
          models: [...selectedModels],
          data: { prompt: prompt.trim(), comparedAt: timestamp, results: [...runningResults] },
        };
        return [item, ...prev].slice(0, 20);
    });
  };

  const onSelectHistory = (item: CompareHistoryItem) => {
    stopStreaming();
    setPrompt(item.prompt);
    setSelectedModels(item.models);
    setData(item.data);
    setError(null);
  };

  const onNewComparison = () => {
    stopStreaming();
    setPrompt("");
    setSelectedModels(["qwen/qwen3-32b", "openai/gpt-oss-120b"]);
    setData(null);
    setError(null);
  };

  const onPromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void onSubmit(event as unknown as FormEvent);
    }
  };

  return (
    <div className="flex h-screen bg-[#04070d] text-foreground overflow-hidden">
      <div className="absolute inset-0 pointer-events-none z-0 flex justify-center">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,12,0.96)_0%,rgba(3,7,14,0.86)_40%,rgba(5,8,14,0.8)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(155,182,255,0.08),transparent_30%),radial-gradient(circle_at_80%_15%,rgba(250,204,21,0.06),transparent_26%)]" />
      </div>

      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0.5 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className={`relative z-10 bg-black/40 backdrop-blur-xl flex-shrink-0 flex flex-col max-md:hidden hidden md:flex overflow-hidden ${isSidebarOpen ? 'border-r border-white/10' : ''}`}
      >
        <div className="w-[280px] flex flex-col h-full flex-shrink-0">
          <div className="p-4 border-b border-white/5 bg-black/20">
            <Button onClick={onNewComparison} variant="outline" className="w-full justify-start border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20 transition-all font-medium">
              <Plus className="mr-2 h-4 w-4 text-amber-400" />
              New Comparison
            </Button>
          </div>
          <div className="p-4 pb-2 flex items-center gap-2 text-sm font-semibold text-white/80">
            <History className="h-4 w-4 text-amber-400" />
            Recent Battles
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 custom-scrollbar">
            {history.length === 0 ? (
              <div className="px-2 py-4 text-xs text-white/40 text-center border border-dashed border-white/10 rounded-lg mt-2">
                No history yet. Let's start a battle!
              </div>
            ) : (
              history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectHistory(item)}
                  className="w-full relative rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:bg-white/5 hover:border-white/10 group focus:outline-none focus:bg-white/10 block"
                >
                  <div className="pr-6">
                    <p className="truncate text-[13px] font-medium text-white/90 group-hover:text-amber-100 transition-colors w-full">{item.title}</p>
                    <p className="mt-1 truncate text-[11px] text-white/50 w-full">{item.models.length} models • {MODEL_OPTIONS.find(m => m.id === item.models[0])?.name || item.models[0].split("/").pop()}</p>
                  </div>
                  <div
                     onClick={(e) => onDeleteHistory(e, item.id)}
                     className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.25 sm:p-1.5 hover:bg-red-500/20 rounded-md text-red-500/60 hover:text-red-400 transition-all focus:outline-none"
                     title="Delete comparison"
                  >
                      <Trash className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </motion.aside>

      <main className="relative z-10 flex-1 flex flex-col h-screen max-w-full min-w-0">
        <div className="bg-gradient-to-r from-amber-600/20 via-orange-500/10 to-amber-600/20 border-b border-amber-500/20 py-2 px-4 flex items-center justify-center shrink-0 w-full relative z-50 shadow-sm text-center">
            <p className="text-[12px] md:text-[13px] font-medium text-amber-200/90 tracking-wide">
               <span className="font-bold text-amber-400">Unlock Premium Features:</span> Share Context, Debate Mode, Cross-Memory, and 10+ Pro Models!
            </p>
        </div>
        <header className="px-6 py-3 flex items-center justify-between border-b border-white/5 bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-3">
             <Button 
                variant="ghost" 
                onClick={() => setIsSidebarOpen(s => !s)} 
                className="h-8 w-8 p-0 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 transition-colors hidden md:flex shrink-0 mr-1"
                title="Toggle Sidebar"
             >
                <PanelLeft className="h-4 w-4" />
             </Button>
             <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center border border-amber-500/30">
               <Swords className="h-4 w-4 text-amber-400" />
             </div>
             <div>
               <h1 className="text-lg leading-tight font-bold tracking-tight text-white">LLM Battle</h1>
               <p className="text-[11px] text-white/50">Compare models side by side</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
             <Link href="/login">
               <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/5 text-[13px] font-medium transition-colors h-8 px-4 rounded-lg">
                  Log in
               </Button>
             </Link>
             <Link href="/login">
               <Button className="bg-amber-500 text-black hover:bg-amber-400 text-[13px] font-semibold h-8 px-5 rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all">
                  Sign up
               </Button>
             </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar pb-36">
          {!data && !loading && (
            <div className="min-h-full flex flex-col items-center justify-center p-8 text-center bg-transparent">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="text-center space-y-4 w-full max-w-lg mb-20"
              >
                <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-500/5 border border-amber-500/20 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(245,158,11,0.15)]">
                   <Swords className="h-8 w-8 text-amber-400" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                  What would you like to compare?
                </h2>
                <p className="text-[14px] text-white/50 leading-relaxed font-medium mt-3">
                  Enter a prompt below and select up to 4 AI models to battle them head-to-head. Evaluate reasoning, accuracy, speed, and format at a glance.
                </p>
              </motion.div>
            </div>
          )}

          {data && (
            <div className="max-w-[90rem] mx-auto py-8 px-4 sm:px-6 w-full">
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="px-1 max-w-5xl">
                    <div className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-2">Original Prompt</div>
                    <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-[15px] text-white/90 whitespace-pre-wrap leading-relaxed shadow-inner">
                       {data.prompt}
                    </div>
                  </div>
                  
                  <div className="flex overflow-x-auto custom-scrollbar gap-4 lg:gap-6 items-stretch pb-4 w-full snap-x snap-mandatory">
                      {data.results.map((row) => (
                        <div key={row.modelId} className="flex-none w-[90vw] md:w-[60vw] lg:w-[calc(50%-12px)] flex flex-col h-full rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md shadow-xl overflow-hidden snap-center">
                           <div className="p-3 border-b border-white/10 bg-white/[0.03] flex items-center justify-between shrink-0">
                             <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                  {row.status === "streaming" ? (
                                    <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />
                                  ) : row.status === "pending" ? (
                                    <span className="w-1.5 h-1.5 bg-amber-500/50 rounded-full animate-pulse" />
                                  ) : (
                                    <Bot className="h-3.5 w-3.5 text-amber-400" />
                                  )}
                                </div>
                                <span className="text-[13px] font-bold text-white tracking-wide truncate">
                                  {MODEL_OPTIONS.find(m => m.id === row.modelId)?.name || row.modelId.split('/').pop()}
                                </span>
                             </div>
                           </div>
                           <div className="p-4 text-[14px] leading-relaxed text-white/85 flex-1 relative min-h-[150px] overflow-x-auto custom-scrollbar break-words prose prose-invert max-w-none w-full">
                              <ModelResponseViewer row={row} />
                           </div>
                        </div>
                      ))}
                  </div>
                </div>
            </div>
          )}
        </div>

        {/* Floating Input Area */}
        <div className="shrink-0 bg-gradient-to-t from-black via-black/90 to-transparent pt-16 pb-6 px-4 md:px-8 absolute bottom-0 w-full left-0 z-20 pointer-events-none">
          <div className="max-w-[50rem] mx-auto pointer-events-auto">
            <form onSubmit={onSubmit} className="relative rounded-[24px] border border-white/10 bg-[#2f2f2f] shadow-lg focus-within:ring-1 focus-within:ring-amber-500/50 focus-within:border-amber-500/50 transition-all group flex flex-col p-1.5 sm:p-2.5">
               <Textarea
                 value={prompt}
                 onChange={(e) => setPrompt(e.target.value)}
                 onKeyDown={onPromptKeyDown}
                 placeholder="Type your prompt to battle models..."
                 className="min-h-[52px] max-h-[250px] resize-none border-0 bg-transparent px-3 py-2 text-[14px] text-white placeholder:text-white/40 focus-visible:ring-0 leading-relaxed custom-scrollbar shadow-none"
               />
               
               <div className="flex items-center justify-between mt-1 px-1">
                 <div className="flex items-center gap-2">
                   <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                       <Button variant="ghost" className="h-8 rounded-full bg-black/20 hover:bg-black/40 text-[12px] text-white/80 px-3 transition-colors focus:outline-none">
                         <Bot className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                         {selectedModels.length} Models <ChevronDown className="w-3 h-3 ml-1.5 opacity-50" />
                       </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="start" className="w-[280px] bg-black/95 border-white/15 backdrop-blur-xl">
                       <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider font-semibold text-white/40">Select 2 Models</div>
                       {MODEL_OPTIONS.map((model) => {
                         const isSelected = selectedModels.includes(model.id);
                         return (
                           <DropdownMenuCheckboxItem
                             key={model.id}
                             checked={isSelected}
                             onCheckedChange={() => toggleModel(model.id)}
                             disabled={model.isPro}
                             className={`text-[13px] py-1.5 ${model.isPro ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'text-amber-300 focus:text-amber-200 focus:bg-amber-500/20' : 'text-white/70 focus:text-white focus:bg-white/10'}`}
                           >
                             <div className="flex items-center justify-between w-full pr-2">
                               <span>{model.name}</span>
                               {model.isPro && (
                                  <span className="text-[9px] bg-gradient-to-r from-amber-500 to-orange-600 text-white px-1.5 py-0.5 rounded shadow-sm inline-flex items-center ml-2 shrink-0 border border-amber-400/20 font-bold uppercase tracking-wider">PRO</span>
                               )}
                             </div>
                           </DropdownMenuCheckboxItem>
                         );
                       })}
                     </DropdownMenuContent>
                   </DropdownMenu>

                   <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                       <Button variant="ghost" className="h-8 rounded-full bg-black/20 hover:bg-black/40 text-[12px] text-white/80 px-3 transition-colors focus:outline-none">
                         {(() => {
                           const activeMode = COMPARE_MODES.find(m => m.id === selectedMode) || COMPARE_MODES[0];
                           const Icon = activeMode.icon;
                           return (
                             <>
                               <Icon className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                               {activeMode.name} <ChevronDown className="w-3 h-3 ml-1.5 opacity-50" />
                             </>
                           );
                         })()}
                       </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="start" className="w-[200px] bg-black/95 border-white/15 backdrop-blur-xl">
                       <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider font-semibold text-white/40">Select Mode</div>
                       <DropdownMenuRadioGroup value={selectedMode} onValueChange={(val) => {
                          const mode = COMPARE_MODES.find(m => m.id === val);
                          if (mode?.isPro) return;
                          setSelectedMode(val);
                       }}>
                         {COMPARE_MODES.map((mode) => {
                           const Icon = mode.icon;
                           return (
                             <DropdownMenuRadioItem
                               key={mode.id}
                               value={mode.id}
                               disabled={mode.isPro}
                               className={`text-[13px] py-1.5 ${mode.isPro ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${selectedMode === mode.id ? 'text-amber-300 focus:text-amber-200 focus:bg-amber-500/20' : 'text-white/70 focus:text-white focus:bg-white/10'}`}
                             >
                               <div className="flex items-center justify-between w-full pr-2">
                                 <div className="flex items-center">
                                   <Icon className="w-3.5 h-3.5 mr-2 opacity-70" />
                                   <span>{mode.name}</span>
                                 </div>
                                 {mode.isPro && (
                                    <span className="text-[9px] bg-gradient-to-r from-amber-500 to-orange-600 text-white px-1.5 py-0.5 rounded shadow-sm inline-flex items-center ml-2 shrink-0 border border-amber-400/20 font-bold uppercase tracking-wider">PRO</span>
                                 )}
                               </div>
                             </DropdownMenuRadioItem>
                           );
                         })}
                       </DropdownMenuRadioGroup>
                     </DropdownMenuContent>
                   </DropdownMenu>
                 </div>

                 <div className="flex items-center">
                   {loading ? (
                      <Button
                        type="button"
                        onClick={stopStreaming}
                        className="h-8 w-8 p-0 rounded-full transition-all flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/5"
                        title="Stop Generation"
                      >
                        <StopCircle className="h-4 w-4 text-red-400" />
                      </Button>
                   ) : (
                      <Button
                        type="submit"
                        disabled={!canSubmit}
                        className={`h-8 w-8 p-0 rounded-full transition-all flex items-center justify-center ${
                           canSubmit 
                             ? 'bg-white text-black hover:bg-gray-200 shadow-md' 
                             : 'bg-white/5 text-white/20'
                        }`}
                        title="Send Prompt"
                      >
                        <Send className="h-4 w-4 -ml-[1px]" />
                      </Button>
                   )}
                 </div>
               </div>
            </form>
            <div className="mt-3 text-center text-[11px] text-white/30 tracking-tight font-medium">
              Pick exactly 2 models. Press <kbd className="font-sans px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 mx-0.5">Enter</kbd> to battle.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
