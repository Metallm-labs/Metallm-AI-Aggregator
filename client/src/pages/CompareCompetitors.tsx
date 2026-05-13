import { CheckCircle2, X, ArrowRight, Minus, Crown, Zap, Search, Route, Wand2, Swords, Layers, Mic } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface Competitor {
  id: string;
  name: string;
  tagline: string;
  pricing: string;
  models: string;
  features: {
    parallelQueries: boolean | "partial";
    debateMode: boolean;
    smartRouting: boolean | "partial";
    autoPromptEnhance: boolean;
    webSearch: boolean | "partial";
    synthesisEngine: boolean;
    multiModelResponse: boolean | "partial";
    multiInput: boolean | "partial";
  };
}

const competitors: Competitor[] = [
  {
    id: "poe",
    name: "Poe",
    tagline: "Chat with individual AI bots one at a time",
    pricing: "$5–20/mo",
    models: "20+ models",
    features: {
      parallelQueries: false,
      debateMode: false,
      smartRouting: false,
      autoPromptEnhance: false,
      webSearch: true,
      synthesisEngine: false,
      multiModelResponse: false,
      multiInput: "partial",
    },
  },
  {
    id: "typingmind",
    name: "TypingMind",
    tagline: "BYO API keys with a polished chat UI",
    pricing: "$39–79 one-time",
    models: "Any (BYO key)",
    features: {
      parallelQueries: false,
      debateMode: false,
      smartRouting: false,
      autoPromptEnhance: false,
      webSearch: "partial",
      synthesisEngine: false,
      multiModelResponse: false,
      multiInput: true,
    },
  },
  {
    id: "chathub",
    name: "ChatHub",
    tagline: "Side-by-side model comparison in browser",
    pricing: "$6.99–14.99/mo",
    models: "20+ models",
    features: {
      parallelQueries: true,
      debateMode: false,
      smartRouting: false,
      autoPromptEnhance: false,
      webSearch: true,
      synthesisEngine: false,
      multiModelResponse: true,
      multiInput: true,
    },
  },
  {
    id: "perplexity",
    name: "Perplexity",
    tagline: "AI-powered search engine with cited answers",
    pricing: "$20–200/mo",
    models: "5+ models",
    features: {
      parallelQueries: false,
      debateMode: false,
      smartRouting: "partial",
      autoPromptEnhance: false,
      webSearch: true,
      synthesisEngine: false,
      multiModelResponse: false,
      multiInput: "partial",
    },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    tagline: "Unified API gateway for 400+ models",
    pricing: "Pay-per-token",
    models: "400+ models",
    features: {
      parallelQueries: false,
      debateMode: false,
      smartRouting: "partial",
      autoPromptEnhance: false,
      webSearch: false,
      synthesisEngine: false,
      multiModelResponse: false,
      multiInput: true,
    },
  },
  {
    id: "huggingchat",
    name: "HuggingChat",
    tagline: "Free open-source model chat interface",
    pricing: "Free",
    models: "129+ (open-source)",
    features: {
      parallelQueries: false,
      debateMode: false,
      smartRouting: true,
      autoPromptEnhance: false,
      webSearch: "partial",
      synthesisEngine: false,
      multiModelResponse: false,
      multiInput: "partial",
    },
  },
  {
    id: "merlin",
    name: "Merlin AI",
    tagline: "26-in-1 browser extension for AI tasks",
    pricing: "$19–29/mo",
    models: "8+ models",
    features: {
      parallelQueries: false,
      debateMode: false,
      smartRouting: false,
      autoPromptEnhance: false,
      webSearch: true,
      synthesisEngine: false,
      multiModelResponse: false,
      multiInput: true,
    },
  },
];

const featureRows: { key: keyof Competitor["features"]; label: string; icon: React.ReactNode }[] = [
  { key: "parallelQueries", label: "Multi-Model Parallel Queries", icon: <Layers className="w-4 h-4" /> },
  { key: "debateMode", label: "AI Debate Mode", icon: <Swords className="w-4 h-4" /> },
  { key: "synthesisEngine", label: "AI Synthesis Engine", icon: <Zap className="w-4 h-4" /> },
  { key: "smartRouting", label: "Smart Model Routing", icon: <Route className="w-4 h-4" /> },
  { key: "autoPromptEnhance", label: "Auto Prompt Enhancement", icon: <Wand2 className="w-4 h-4" /> },
  { key: "webSearch", label: "Real-Time Web Search", icon: <Search className="w-4 h-4" /> },
  { key: "multiModelResponse", label: "Multi-Model Responses", icon: <Layers className="w-4 h-4" /> },
  { key: "multiInput", label: "Multi-Input (Text+Image+Files)", icon: <Mic className="w-4 h-4" /> },
];

function FeatureCell({ value }: { value: boolean | "partial" | "n/a" }) {
  if (value === true) return <CheckCircle2 className="w-5 h-5 text-green-400 mx-auto" />;
  if (value === "partial") return <Minus className="w-5 h-5 text-yellow-400 mx-auto" />;
  if (value === "n/a") return <span className="text-xs text-muted-foreground">N/A</span>;
  return <X className="w-5 h-5 text-red-400/70 mx-auto" />;
}

export default function CompareCompetitors() {
  const [showAll, setShowAll] = useState(false);
  const visibleCompetitors = showAll ? competitors : competitors.slice(0, 4);

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium mb-6">
            <Crown className="w-4 h-4" />
            Comprehensive AI Aggregator Comparison
          </div>
          <h1 className="text-4xl md:text-6xl font-bold font-display tracking-tight text-white mb-6">
            MetaLLM vs. Every AI Aggregator
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Compare MetaLLM's Debate Mode, Smart Routing, Parallel Intelligence, Web Search, and Auto Prompt Enhancement against Poe, Perplexity, ChatHub, TypingMind, OpenRouter, HuggingChat & Merlin AI.
          </p>
        </div>

        {/* MetaLLM Unique Features Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { icon: <Swords className="w-5 h-5" />, title: "Debate Mode", desc: "Models argue & a judge decides" },
            { icon: <Route className="w-5 h-5" />, title: "Smart Routing", desc: "Auto-picks best model per query" },
            { icon: <Wand2 className="w-5 h-5" />, title: "Prompt Enhance", desc: "Expert rewrite per model" },
            { icon: <Zap className="w-5 h-5" />, title: "Synthesis Engine", desc: "Merges all responses into one" },
          ].map((f) => (
            <div key={f.title} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-center">
              <div className="text-amber-400 flex justify-center mb-2">{f.icon}</div>
              <h3 className="text-sm font-semibold text-white">{f.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Main Comparison Table */}
        <div className="bg-muted/10 rounded-2xl border border-white/10 overflow-hidden mb-16">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-2xl font-bold text-white">Feature Comparison Table</h2>
            <p className="text-sm text-muted-foreground mt-1">Full side-by-side breakdown of every feature</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-muted/20 border-b border-white/10">
                  <th className="p-4 font-semibold text-white sticky left-0 bg-muted/20 z-10 min-w-[200px]">Feature</th>
                  <th className="p-4 font-bold text-amber-400 bg-amber-500/5 text-center min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <Crown className="w-4 h-4" />
                      <span>MetaLLM</span>
                    </div>
                  </th>
                  {visibleCompetitors.map((c) => (
                    <th key={c.id} className="p-4 font-semibold text-muted-foreground text-center min-w-[100px]">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {/* Pricing row */}
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 font-medium text-white sticky left-0 bg-background z-10">Pricing</td>
                  <td className="p-4 bg-amber-500/5 text-center">
                    <span className="text-amber-400 font-bold">$19/mo</span>
                  </td>
                  {visibleCompetitors.map((c) => (
                    <td key={c.id} className="p-4 text-center text-muted-foreground text-xs">
                      {c.pricing}
                    </td>
                  ))}
                </tr>
                {/* Models row */}
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 font-medium text-white sticky left-0 bg-background z-10">Models Available</td>
                  <td className="p-4 bg-amber-500/5 text-center">
                    <span className="text-amber-400 font-bold">13+ Frontier</span>
                  </td>
                  {visibleCompetitors.map((c) => (
                    <td key={c.id} className="p-4 text-center text-muted-foreground text-xs">
                      {c.models}
                    </td>
                  ))}
                </tr>
                {/* Feature rows */}
                {featureRows.map((row) => (
                  <tr key={row.key} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 font-medium text-white sticky left-0 bg-background z-10">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{row.icon}</span>
                        {row.label}
                      </div>
                    </td>
                    <td className="p-4 bg-amber-500/5 text-center">
                      <CheckCircle2 className="w-5 h-5 text-amber-400 mx-auto" />
                    </td>
                    {visibleCompetitors.map((c) => (
                      <td key={c.id} className="p-4 text-center">
                        <FeatureCell value={c.features[row.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!showAll && (
            <div className="p-4 border-t border-white/10 text-center">
              <Button variant="outline" onClick={() => setShowAll(true)} className="border-white/10 hover:bg-white/5">
                Show All {competitors.length} Competitors
              </Button>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-6 mb-12 text-sm text-muted-foreground justify-center">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-400" /> Full Support</div>
          <div className="flex items-center gap-2"><Minus className="w-4 h-4 text-yellow-400" /> Partial / Plugin</div>
          <div className="flex items-center gap-2"><X className="w-4 h-4 text-red-400/70" /> Not Available</div>
        </div>

        {/* Individual Competitor Cards */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white text-center mb-4">Individual Comparisons</h2>
          <p className="text-muted-foreground text-center mb-10">Click any competitor for a full detailed breakdown</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {competitors.map((comp) => {
            const wins = Object.values(comp.features).filter((v) => v === false).length;
            return (
              <Link key={comp.id} href={`/compare/${comp.id}`}>
                <div className="group bg-muted/5 border border-white/10 rounded-2xl p-6 hover:bg-muted/10 hover:border-amber-500/20 transition-all cursor-pointer h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">
                        vs. {comp.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">{comp.tagline}</p>
                    </div>
                    <div className="bg-amber-500/10 rounded-full px-3 py-1 text-xs font-medium text-amber-400">
                      {comp.pricing}
                    </div>
                  </div>
                  <div className="text-sm text-white/70 mb-4">
                    MetaLLM leads in <span className="text-amber-400 font-semibold">{wins} features</span> where {comp.name} falls short.
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(comp.features)
                      .filter(([_, v]) => v === false)
                      .slice(0, 3)
                      .map(([key]) => {
                        const row = featureRows.find((r) => r.key === key);
                        return row ? (
                          <span key={key} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded-full">
                            No {row.label.split(" ").slice(0, 2).join(" ")}
                          </span>
                        ) : null;
                      })}
                  </div>
                  <div className="flex items-center text-amber-400 text-sm font-medium group-hover:gap-2 transition-all">
                    Full Comparison <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Why MetaLLM Section */}
        <div className="bg-gradient-to-b from-amber-500/5 to-transparent border border-amber-500/15 rounded-3xl p-10 mb-16">
          <h2 className="text-3xl font-bold text-white text-center mb-8">Why Power Users Choose MetaLLM</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "13+ Models Simultaneously", desc: "Query GPT-4o, Claude, Gemini, Grok, LLaMA, Qwen, Kimi & more in one click. No other platform runs this many frontier models in parallel." },
              { title: "Debate Mode", desc: "Assign stances to models, watch them argue over structured rounds, and get a final verdict from an impartial judge model." },
              { title: "Smart Routing", desc: "Automatically detects query type (code, math, creative, research) and routes to the best-performing model for that task." },
              { title: "Auto Prompt Enhancement", desc: "Your simple prompt gets rewritten into expert-level queries tailored individually for each model's strengths." },
              { title: "Synthesis Engine", desc: "All model responses are merged into one conflict-resolved, comprehensive answer with source attribution." },
              { title: "Real-Time Web Search", desc: "Deep web grounding with source citation gives MetaLLM factual accuracy that offline-only models cannot match." },
            ].map((item) => (
              <div key={item.title} className="space-y-2">
                <h3 className="text-white font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Stop Settling for One Model at a Time</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Experience multi-model parallel intelligence, debate mode, and AI synthesis. Free to start.
          </p>
          <Link href="/login">
            <Button size="lg" className="h-14 px-8 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-bold">
              Try MetaLLM for Free <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>

        {/* SEO structured data for crawlers */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: "MetaLLM vs AI Aggregator Competitors Comparison 2026",
              description: "Compare MetaLLM with Poe, Perplexity, ChatHub, TypingMind, OpenRouter, HuggingChat and Merlin AI. Features include Debate Mode, Smart Routing, Parallel Queries, Web Search, Auto Prompt Enhancement.",
              mainEntity: {
                "@type": "ItemList",
                itemListElement: competitors.map((c, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  name: `MetaLLM vs ${c.name}`,
                  url: `https://metallm.tech/compare/${c.id}`,
                })),
              },
            }),
          }}
        />
      </div>
    </div>
  );
}
