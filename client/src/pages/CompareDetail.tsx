import { useParams, Link } from "wouter";
import { CheckCircle2, X, ArrowLeft, ArrowRight, Minus, Crown, Zap, Search, Route, Wand2, Swords, Layers, Mic, Globe, DollarSign, Cpu, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FeatureComparison {
  feature: string;
  metaLLM: boolean | string;
  competitor: boolean | string;
  icon: React.ReactNode;
}

interface CompetitorData {
  name: string;
  title: string;
  metaTitle: string;
  description: string;
  pricing: { free: string; paid: string };
  models: string;
  modelsList: string[];
  uniqueStrength: string;
  limitations: string[];
  metaWins: { title: string; desc: string }[];
  features: FeatureComparison[];
  verdict: string;
}

const competitorsData: Record<string, CompetitorData> = {
  poe: {
    name: "Poe",
    title: "MetaLLM vs Poe: Multi-Model Parallel Intelligence vs Single-Bot Chat",
    metaTitle: "MetaLLM vs Poe Comparison 2026 | AI Aggregator Battle",
    description: "Poe by Quora lets you chat with individual AI bots one at a time. MetaLLM runs 13+ frontier models simultaneously with debate mode, synthesis, and smart routing — all from a single prompt.",
    pricing: { free: "Limited messages", paid: "$5–20/month (credit-based)" },
    models: "20+ models",
    modelsList: ["GPT-4o", "Claude", "Gemini", "Llama", "Mistral", "Stable Diffusion", "Community bots"],
    uniqueStrength: "Custom bot creation marketplace and community bots",
    limitations: [
      "Only 1 model per prompt — no parallel execution",
      "Must manually switch between bots to compare outputs",
      "No synthesis or consensus of multiple model outputs",
      "Credit-based system limits heavy usage of premium models",
      "No automatic prompt optimization or routing intelligence",
      "No debate mode or structured model argumentation",
    ],
    metaWins: [
      { title: "13+ Models in Parallel", desc: "MetaLLM queries GPT-4o, Claude, Gemini, Grok, LLaMA 4, Qwen 3, Kimi K2, and more simultaneously. Poe forces you to chat with one bot at a time." },
      { title: "AI Debate Mode", desc: "Watch models argue positions over structured rounds with a judge delivering a final verdict. Poe has no concept of model-vs-model discourse." },
      { title: "Auto Prompt Enhancement", desc: "MetaLLM rewrites your prompt into expert-level queries tailored per model. Poe sends your raw input with zero optimization." },
      { title: "Synthesis Engine", desc: "All 13+ model responses get merged into one comprehensive answer. On Poe, you manually read each bot's response and synthesize yourself." },
      { title: "Smart Routing", desc: "MetaLLM auto-detects query type and routes to the best model. Poe requires you to know which bot to pick." },
      { title: "Real-Time Web Search", desc: "MetaLLM integrates live web search with source citations for factual accuracy. Poe's web access is limited to specific bots." },
    ],
    features: [
      { feature: "Multi-Model Parallel Queries", metaLLM: true, competitor: false, icon: <Layers className="w-4 h-4" /> },
      { feature: "AI Debate Mode", metaLLM: true, competitor: false, icon: <Swords className="w-4 h-4" /> },
      { feature: "AI Synthesis Engine", metaLLM: true, competitor: false, icon: <Zap className="w-4 h-4" /> },
      { feature: "Smart Model Routing", metaLLM: true, competitor: false, icon: <Route className="w-4 h-4" /> },
      { feature: "Auto Prompt Enhancement", metaLLM: true, competitor: false, icon: <Wand2 className="w-4 h-4" /> },
      { feature: "Real-Time Web Search", metaLLM: true, competitor: true, icon: <Search className="w-4 h-4" /> },
      { feature: "Multi-Input (Text+Image+Files)", metaLLM: true, competitor: "Text+Image only", icon: <Mic className="w-4 h-4" /> },
      { feature: "13+ Frontier Models Simultaneously", metaLLM: true, competitor: false, icon: <Layers className="w-4 h-4" /> },
      { feature: "Custom Bot Creation", metaLLM: false, competitor: true, icon: <Cpu className="w-4 h-4" /> },
      { feature: "Bot Marketplace", metaLLM: false, competitor: true, icon: <Globe className="w-4 h-4" /> },
    ],
    verdict: "Poe is great for casual single-bot chatting and its community marketplace. But for serious work — comparing model outputs, reducing hallucinations through consensus, or leveraging the best model for each task automatically — MetaLLM is in a different league entirely.",
  },
  typingmind: {
    name: "TypingMind",
    title: "MetaLLM vs TypingMind: Turnkey Intelligence vs BYO-API Frontend",
    metaTitle: "MetaLLM vs TypingMind 2026 | AI Chat Interface Comparison",
    description: "TypingMind is a premium chat UI where you bring your own API keys. MetaLLM is a complete AI orchestration platform with built-in models, debate mode, and synthesis — no API keys needed.",
    pricing: { free: "No free tier", paid: "$39–79 one-time + your API costs" },
    models: "Any model via API key",
    modelsList: ["Any OpenAI model", "Any Anthropic model", "Any Google model", "Any OpenAI-compatible endpoint"],
    uniqueStrength: "One-time purchase with full ownership and self-hosting option",
    limitations: [
      "Requires managing your own API keys for each provider",
      "No built-in parallel model querying",
      "No debate or consensus features",
      "No automatic model selection or routing",
      "Costs unpredictable (raw API usage varies wildly)",
      "Power-user tool — not beginner friendly",
      "No synthesis engine to merge responses",
    ],
    metaWins: [
      { title: "Zero Setup Required", desc: "MetaLLM works out of the box — no API keys, no billing accounts, no configuration. TypingMind requires you to set up API keys with each provider separately." },
      { title: "Predictable $19/mo Pricing", desc: "With TypingMind, your costs are unpredictable API bills. MetaLLM gives you flat-rate access to 13+ frontier models." },
      { title: "Parallel + Debate + Synthesis", desc: "MetaLLM's core value: run all models at once, debate them, and synthesize one answer. TypingMind is one-model-at-a-time." },
      { title: "Smart Routing Intelligence", desc: "MetaLLM automatically picks the best model for your query type. TypingMind requires you to manually select which model to use." },
      { title: "Auto Prompt Enhancement", desc: "Your simple queries get transformed into expert-level prompts tailored per model. TypingMind has a static prompt library but no dynamic enhancement." },
      { title: "Built-in Web Search", desc: "Real-time web grounding with source attribution included. TypingMind needs plugins for basic web search." },
    ],
    features: [
      { feature: "Multi-Model Parallel Queries", metaLLM: true, competitor: false, icon: <Layers className="w-4 h-4" /> },
      { feature: "AI Debate Mode", metaLLM: true, competitor: false, icon: <Swords className="w-4 h-4" /> },
      { feature: "AI Synthesis Engine", metaLLM: true, competitor: false, icon: <Zap className="w-4 h-4" /> },
      { feature: "Smart Model Routing", metaLLM: true, competitor: false, icon: <Route className="w-4 h-4" /> },
      { feature: "Auto Prompt Enhancement", metaLLM: true, competitor: false, icon: <Wand2 className="w-4 h-4" /> },
      { feature: "No API Keys Needed", metaLLM: true, competitor: false, icon: <DollarSign className="w-4 h-4" /> },
      { feature: "Predictable Pricing", metaLLM: "$19/mo flat", competitor: "Variable API costs", icon: <DollarSign className="w-4 h-4" /> },
      { feature: "Real-Time Web Search", metaLLM: true, competitor: "Plugin required", icon: <Search className="w-4 h-4" /> },
      { feature: "Self-Hosting Option", metaLLM: false, competitor: true, icon: <Globe className="w-4 h-4" /> },
      { feature: "RAG Knowledge Base", metaLLM: false, competitor: true, icon: <Cpu className="w-4 h-4" /> },
    ],
    verdict: "TypingMind is excellent for developers who want full control over their API costs and a polished UI. But MetaLLM eliminates the complexity — no keys, no variable bills — while adding parallel intelligence, debate mode, and synthesis that TypingMind simply doesn't offer.",
  },
  chathub: {
    name: "ChatHub",
    title: "MetaLLM vs ChatHub: Intelligent Orchestration vs Side-by-Side Display",
    metaTitle: "MetaLLM vs ChatHub 2026 | Multi-Model AI Platform Comparison",
    description: "ChatHub shows model responses side-by-side. MetaLLM goes further: it debates them, synthesizes them, routes intelligently, and enhances your prompts — turning raw parallel output into actionable intelligence.",
    pricing: { free: "Basic access", paid: "$6.99–14.99/month" },
    models: "20+ models",
    modelsList: ["GPT-4o", "Claude", "Gemini", "Llama 3.3", "Grok", "DeepSeek"],
    uniqueStrength: "Cross-platform apps (iOS, Android, Windows, Mac, browser extension)",
    limitations: [
      "Shows responses side-by-side but does NOT merge or synthesize them",
      "No debate or consensus mode",
      "No automatic model routing intelligence",
      "No prompt enhancement before sending",
      "300K users (smaller community)",
      "You still have to manually decide which response is best",
    ],
    metaWins: [
      { title: "Synthesis > Side-by-Side", desc: "ChatHub shows you 4 answers and leaves you to figure out which is right. MetaLLM's Synthesis Engine automatically merges them into one optimal response." },
      { title: "Debate Mode", desc: "MetaLLM makes models argue structured positions over multiple rounds with a judge. ChatHub just shows static parallel outputs." },
      { title: "Smart Routing", desc: "MetaLLM detects your query type (code/math/creative/research) and auto-routes. ChatHub sends the same raw prompt to all models." },
      { title: "Prompt Enhancement", desc: "MetaLLM rewrites your prompt per-model to maximize each model's strengths. ChatHub uses your raw input everywhere." },
      { title: "13+ Frontier Models", desc: "MetaLLM runs 13+ including Qwen 3, Kimi K2, Nemotron, Trinity, GLM 4.5. ChatHub has fewer frontier model options." },
      { title: "Web Search with Citations", desc: "MetaLLM integrates real-time web search with source graphs. ChatHub's web search is basic." },
    ],
    features: [
      { feature: "Multi-Model Parallel Queries", metaLLM: true, competitor: true, icon: <Layers className="w-4 h-4" /> },
      { feature: "AI Debate Mode", metaLLM: true, competitor: false, icon: <Swords className="w-4 h-4" /> },
      { feature: "AI Synthesis Engine", metaLLM: true, competitor: false, icon: <Zap className="w-4 h-4" /> },
      { feature: "Smart Model Routing", metaLLM: true, competitor: false, icon: <Route className="w-4 h-4" /> },
      { feature: "Auto Prompt Enhancement", metaLLM: true, competitor: false, icon: <Wand2 className="w-4 h-4" /> },
      { feature: "Real-Time Web Search", metaLLM: true, competitor: true, icon: <Search className="w-4 h-4" /> },
      { feature: "Multi-Input (Text+Image+Files)", metaLLM: true, competitor: true, icon: <Mic className="w-4 h-4" /> },
      { feature: "Mobile Apps (iOS/Android)", metaLLM: false, competitor: true, icon: <Globe className="w-4 h-4" /> },
      { feature: "Desktop Apps", metaLLM: false, competitor: true, icon: <Cpu className="w-4 h-4" /> },
    ],
    verdict: "ChatHub is the closest competitor feature-wise since it also does parallel queries. But it stops at displaying responses side-by-side — MetaLLM's debate mode, synthesis engine, and smart routing transform raw parallel output into actual intelligence.",
  },
  perplexity: {
    name: "Perplexity",
    title: "MetaLLM vs Perplexity: AI Orchestration vs AI Search Engine",
    metaTitle: "MetaLLM vs Perplexity AI 2026 | Search vs Multi-Model Platform",
    description: "Perplexity excels at search — finding and citing web sources. MetaLLM excels at AI orchestration — running multiple models in parallel, debating them, and synthesizing comprehensive answers for any task.",
    pricing: { free: "Limited searches", paid: "$20/mo Pro, $200/mo Max" },
    models: "5+ models",
    modelsList: ["GPT-4o", "Claude Opus", "Gemini Pro", "Sonar 2 (proprietary)", "R1 1776"],
    uniqueStrength: "Best-in-class web search with source citations and real-time data",
    limitations: [
      "Not designed for multi-model comparison",
      "No parallel querying — single synthesized search answer",
      "Cannot compare model outputs side by side",
      "Heavy focus on search/research only, not creative or coding tasks",
      "No debate or consensus features between models",
      "Expensive at higher tiers ($200/mo for Max)",
      "You can't choose or control which model responds",
    ],
    metaWins: [
      { title: "Multi-Model Diversity", desc: "Perplexity gives one search-focused answer. MetaLLM lets you compare perspectives from 13+ different AI models on any topic." },
      { title: "Beyond Search", desc: "MetaLLM handles coding, creative writing, analysis, debate, and multi-model reasoning. Perplexity is optimized specifically for research queries." },
      { title: "Debate Mode", desc: "Want to see GPT-4o argue against Claude on a technical decision? MetaLLM's debate mode structures this. Perplexity has no concept of model discourse." },
      { title: "Model Control", desc: "MetaLLM lets you pick exactly which models to query and compare. Perplexity auto-selects internally with no user control." },
      { title: "Lower Price Point", desc: "MetaLLM Pro at $19/mo vs Perplexity Pro at $20/mo — and MetaLLM includes parallel queries, debate, synthesis, and smart routing." },
      { title: "Prompt Enhancement", desc: "MetaLLM rewrites your prompt for optimal results. Perplexity uses your raw query as-is." },
    ],
    features: [
      { feature: "Multi-Model Parallel Queries", metaLLM: true, competitor: false, icon: <Layers className="w-4 h-4" /> },
      { feature: "AI Debate Mode", metaLLM: true, competitor: false, icon: <Swords className="w-4 h-4" /> },
      { feature: "AI Synthesis Engine", metaLLM: true, competitor: false, icon: <Zap className="w-4 h-4" /> },
      { feature: "Smart Model Routing", metaLLM: true, competitor: "Internal only", icon: <Route className="w-4 h-4" /> },
      { feature: "Auto Prompt Enhancement", metaLLM: true, competitor: false, icon: <Wand2 className="w-4 h-4" /> },
      { feature: "Real-Time Web Search", metaLLM: true, competitor: true, icon: <Search className="w-4 h-4" /> },
      { feature: "Source Citations", metaLLM: true, competitor: true, icon: <Globe className="w-4 h-4" /> },
      { feature: "Code Generation & Analysis", metaLLM: true, competitor: "Limited", icon: <Cpu className="w-4 h-4" /> },
      { feature: "Creative Writing", metaLLM: true, competitor: "Limited", icon: <Star className="w-4 h-4" /> },
      { feature: "Model Selection Control", metaLLM: true, competitor: false, icon: <Route className="w-4 h-4" /> },
    ],
    verdict: "Perplexity is the best AI search engine. But MetaLLM is a complete AI orchestration platform. If you need cited search results, Perplexity excels. If you need multi-model intelligence, debate, synthesis, creative work, and coding — MetaLLM covers it all at a lower price.",
  },
  openrouter: {
    name: "OpenRouter",
    title: "MetaLLM vs OpenRouter: Ready-to-Use Platform vs Raw API Gateway",
    metaTitle: "MetaLLM vs OpenRouter 2026 | AI Platform vs API Gateway",
    description: "OpenRouter is an API gateway for developers who want to route between 400+ models programmatically. MetaLLM is a complete platform that gives everyone — not just developers — access to parallel AI intelligence.",
    pricing: { free: "Some free models", paid: "Pay-per-token (variable)" },
    models: "400+ models",
    modelsList: ["Claude Opus", "GPT-4o", "Gemini Pro", "Llama", "DeepSeek", "Mistral", "400+ others"],
    uniqueStrength: "Largest model catalog (400+) with OpenAI SDK compatibility and automatic fallbacks",
    limitations: [
      "Developer-focused — no consumer chat UI",
      "No built-in interface for end users",
      "No synthesis, debate, or consensus features",
      "Requires technical knowledge to use",
      "No prompt optimization or enhancement",
      "No web search integration",
      "Credit purchase required upfront",
    ],
    metaWins: [
      { title: "No Code Required", desc: "MetaLLM works instantly in your browser — no SDK, no code, no API calls. OpenRouter requires developer integration." },
      { title: "Parallel + Debate + Synthesis", desc: "MetaLLM's orchestration layer does what developers would need weeks to build on top of OpenRouter: parallel execution, debate, and synthesis." },
      { title: "Web Search Built-In", desc: "MetaLLM has real-time web grounding. OpenRouter is a pure model relay with no search capabilities." },
      { title: "Predictable Pricing", desc: "$19/mo flat vs unpredictable per-token costs. Heavy users on OpenRouter can easily spend $100+/mo." },
      { title: "Smart Routing Intelligence", desc: "MetaLLM's routing understands query intent. OpenRouter's routing is about availability/cost, not intelligence." },
      { title: "Prompt Enhancement", desc: "MetaLLM rewrites prompts for optimal results per model. OpenRouter passes through raw input." },
    ],
    features: [
      { feature: "Multi-Model Parallel Queries", metaLLM: true, competitor: "Build it yourself", icon: <Layers className="w-4 h-4" /> },
      { feature: "AI Debate Mode", metaLLM: true, competitor: false, icon: <Swords className="w-4 h-4" /> },
      { feature: "AI Synthesis Engine", metaLLM: true, competitor: false, icon: <Zap className="w-4 h-4" /> },
      { feature: "Smart Model Routing", metaLLM: true, competitor: "Cost/availability only", icon: <Route className="w-4 h-4" /> },
      { feature: "Auto Prompt Enhancement", metaLLM: true, competitor: false, icon: <Wand2 className="w-4 h-4" /> },
      { feature: "Real-Time Web Search", metaLLM: true, competitor: false, icon: <Search className="w-4 h-4" /> },
      { feature: "Chat UI (No Code)", metaLLM: true, competitor: false, icon: <Globe className="w-4 h-4" /> },
      { feature: "Model Catalog Size", metaLLM: "13+ frontier", competitor: "400+ (many niche)", icon: <Cpu className="w-4 h-4" /> },
      { feature: "OpenAI SDK Compatible", metaLLM: false, competitor: true, icon: <Cpu className="w-4 h-4" /> },
      { feature: "Automatic Fallbacks", metaLLM: false, competitor: true, icon: <Zap className="w-4 h-4" /> },
    ],
    verdict: "OpenRouter is the best API gateway for developers building custom AI applications. MetaLLM is the best platform for actually using AI — parallel intelligence, debate, synthesis, and web search in one interface, no coding required.",
  },
  huggingchat: {
    name: "HuggingChat",
    title: "MetaLLM vs HuggingChat: Frontier Intelligence vs Open-Source Chat",
    metaTitle: "MetaLLM vs HuggingChat 2026 | Frontier vs Open-Source AI",
    description: "HuggingChat is free and open-source, powered by community models. MetaLLM provides access to frontier models (GPT-4o, Claude, Gemini) plus parallel orchestration — the intelligence layer HuggingChat lacks.",
    pricing: { free: "Completely free", paid: "No paid tier" },
    models: "129+ open-source models",
    modelsList: ["Llama variants", "Mistral", "Mixtral", "Falcon", "Command R", "Qwen (open)", "Community models"],
    uniqueStrength: "Completely free with 129+ open-source models and Omni router",
    limitations: [
      "Open-source models ONLY — no GPT-4o, Claude, or Gemini access",
      "Model quality significantly lower than frontier models",
      "Official warning: 'Generated content may be inaccurate or false'",
      "No parallel querying of multiple models",
      "No debate or synthesis features",
      "No prompt enhancement",
      "Limited multi-modal capabilities",
    ],
    metaWins: [
      { title: "Frontier Model Access", desc: "MetaLLM includes GPT-4o, Claude 3.5, Gemini 1.5, Grok — the world's best models. HuggingChat is limited to open-source models that are generations behind." },
      { title: "Parallel Execution", desc: "Run 13+ frontier models simultaneously. HuggingChat gives you one open-source model at a time." },
      { title: "Debate Mode", desc: "Watch Claude argue against GPT-4o. HuggingChat can't even access both models, let alone debate them." },
      { title: "Accuracy & Reliability", desc: "Frontier models hallucinate less. HuggingChat's own disclaimer warns about inaccuracy." },
      { title: "Web Search + Synthesis", desc: "Real-time web grounding with source attribution plus synthesis across models. HuggingChat has basic search on some models." },
      { title: "Prompt Enhancement", desc: "MetaLLM transforms simple prompts into expert queries. HuggingChat uses raw input." },
    ],
    features: [
      { feature: "Multi-Model Parallel Queries", metaLLM: true, competitor: false, icon: <Layers className="w-4 h-4" /> },
      { feature: "AI Debate Mode", metaLLM: true, competitor: false, icon: <Swords className="w-4 h-4" /> },
      { feature: "AI Synthesis Engine", metaLLM: true, competitor: false, icon: <Zap className="w-4 h-4" /> },
      { feature: "Smart Model Routing", metaLLM: true, competitor: true, icon: <Route className="w-4 h-4" /> },
      { feature: "Auto Prompt Enhancement", metaLLM: true, competitor: false, icon: <Wand2 className="w-4 h-4" /> },
      { feature: "Frontier Model Access (GPT, Claude, Gemini)", metaLLM: true, competitor: false, icon: <Star className="w-4 h-4" /> },
      { feature: "Real-Time Web Search", metaLLM: true, competitor: "Partial", icon: <Search className="w-4 h-4" /> },
      { feature: "Completely Free", metaLLM: "Free tier + $19/mo Pro", competitor: true, icon: <DollarSign className="w-4 h-4" /> },
      { feature: "Open Source", metaLLM: false, competitor: true, icon: <Globe className="w-4 h-4" /> },
      { feature: "Self-Hostable", metaLLM: false, competitor: true, icon: <Cpu className="w-4 h-4" /> },
    ],
    verdict: "HuggingChat is unbeatable on price (free) and philosophy (open-source). But if you need accurate, state-of-the-art AI with parallel intelligence, debate, and synthesis capabilities — MetaLLM's frontier models and orchestration layer are worth every penny of $19/mo.",
  },
  merlin: {
    name: "Merlin AI",
    title: "MetaLLM vs Merlin AI: AI Orchestration Platform vs Browser Extension",
    metaTitle: "MetaLLM vs Merlin AI 2026 | Platform vs Browser Extension",
    description: "Merlin AI is a 26-in-1 Chrome extension for quick AI tasks on any webpage. MetaLLM is a dedicated AI orchestration platform built for deep multi-model work, parallel intelligence, and synthesis.",
    pricing: { free: "Limited daily queries", paid: "$19–29/month" },
    models: "8+ models",
    modelsList: ["GPT-4o", "Claude 3.7", "Gemini", "Mistral", "DeepSeek", "o1-mini"],
    uniqueStrength: "Browser-native AI on any webpage (YouTube summaries, Gmail drafts, search enhancement)",
    limitations: [
      "Browser extension only — dependent on Chrome/Edge",
      "No parallel model querying",
      "No debate or consensus features",
      "No model routing intelligence",
      "No prompt enhancement",
      "Limited to browser context",
      "One model per query",
      "No synthesis engine",
    ],
    metaWins: [
      { title: "Full AI Platform", desc: "MetaLLM is a dedicated platform built for deep AI work. Merlin is a sidebar tool for quick tasks within your browser." },
      { title: "13+ Parallel Models", desc: "Run all frontier models simultaneously. Merlin queries one model at a time." },
      { title: "Debate Mode + Synthesis", desc: "Models argue and merge their responses into one answer. Merlin has no concept of multi-model intelligence." },
      { title: "Smart Routing", desc: "Auto-routes coding to Kimi, math to Nemotron, creative to Trinity. Merlin requires manual model selection." },
      { title: "Deep Multi-Model Analysis", desc: "For complex decisions, research, or code review — getting 13+ perspectives synthesized beats one model's sidebar response every time." },
      { title: "Web Search with Sources", desc: "MetaLLM's deep web search provides source graphs and citations. Merlin enhances existing search engines but doesn't provide independent search." },
    ],
    features: [
      { feature: "Multi-Model Parallel Queries", metaLLM: true, competitor: false, icon: <Layers className="w-4 h-4" /> },
      { feature: "AI Debate Mode", metaLLM: true, competitor: false, icon: <Swords className="w-4 h-4" /> },
      { feature: "AI Synthesis Engine", metaLLM: true, competitor: false, icon: <Zap className="w-4 h-4" /> },
      { feature: "Smart Model Routing", metaLLM: true, competitor: false, icon: <Route className="w-4 h-4" /> },
      { feature: "Auto Prompt Enhancement", metaLLM: true, competitor: false, icon: <Wand2 className="w-4 h-4" /> },
      { feature: "Real-Time Web Search", metaLLM: true, competitor: true, icon: <Search className="w-4 h-4" /> },
      { feature: "Multi-Input (Text+Image+Files)", metaLLM: true, competitor: true, icon: <Mic className="w-4 h-4" /> },
      { feature: "Browser Sidebar (any webpage)", metaLLM: false, competitor: true, icon: <Globe className="w-4 h-4" /> },
      { feature: "YouTube Summarization", metaLLM: false, competitor: true, icon: <Star className="w-4 h-4" /> },
      { feature: "Gmail Integration", metaLLM: false, competitor: true, icon: <Cpu className="w-4 h-4" /> },
    ],
    verdict: "Merlin AI is perfect as a browser-native assistant for quick summaries, email drafts, and search enhancement. But for serious AI work — comparing model outputs, structured debates, deep analysis — MetaLLM is purpose-built.",
  },
};

function FeatureCell({ value }: { value: boolean | string }) {
  if (value === true) return <CheckCircle2 className="w-5 h-5 text-green-400" />;
  if (value === false) return <X className="w-5 h-5 text-red-400/70" />;
  return <span className="text-xs text-yellow-400 font-medium">{value}</span>;
}

export default function CompareDetail() {
  const params = useParams();
  const rawId = params.competitor || "";
  const compId = rawId.toLowerCase();
  const data = competitorsData[compId];

  if (!data) {
    return (
      <div className="min-h-screen bg-background text-foreground pt-24 pb-16 flex flex-col items-center justify-center">
        <h1 className="text-3xl font-bold text-white mb-4">Competitor Not Found</h1>
        <p className="text-muted-foreground mb-8">We couldn't find the comparison you're looking for.</p>
        <Link href="/compare-competitors">
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Back to comparisons</Button>
        </Link>
      </div>
    );
  }

  const metaWinCount = data.features.filter((f) => f.metaLLM === true && (f.competitor === false || typeof f.competitor === "string")).length;

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        {/* Breadcrumb */}
        <div className="mb-8">
          <Link href="/compare-competitors">
            <Button variant="ghost" className="px-0 text-muted-foreground hover:text-white hover:bg-transparent mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> All Comparisons
            </Button>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-4">
            <Crown className="w-3 h-3" />
            MetaLLM wins in {metaWinCount} out of {data.features.length} categories
          </div>
          <h1 className="text-3xl md:text-5xl font-bold font-display text-white mb-6 leading-tight">
            {data.title}
          </h1>
          <p className="text-lg text-white/70 leading-relaxed bg-white/5 p-6 rounded-2xl border border-white/5">
            {data.description}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-center">
            <p className="text-xs text-amber-400/70 uppercase tracking-wide">MetaLLM Price</p>
            <p className="text-lg font-bold text-amber-400 mt-1">$19/mo</p>
          </div>
          <div className="bg-muted/10 border border-white/10 rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{data.name} Price</p>
            <p className="text-lg font-bold text-white mt-1">{data.pricing.paid}</p>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-center">
            <p className="text-xs text-amber-400/70 uppercase tracking-wide">MetaLLM Models</p>
            <p className="text-lg font-bold text-amber-400 mt-1">13+ Frontier</p>
          </div>
          <div className="bg-muted/10 border border-white/10 rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{data.name} Models</p>
            <p className="text-lg font-bold text-white mt-1">{data.models}</p>
          </div>
        </div>

        {/* Feature Comparison Table */}
        <div className="bg-muted/10 rounded-2xl border border-white/10 overflow-hidden mb-12">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-2xl font-bold text-white">Feature-by-Feature Comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/20 border-b border-white/10">
                  <th className="p-4 font-semibold text-white">Feature</th>
                  <th className="p-4 font-bold text-amber-400 bg-amber-500/5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Crown className="w-4 h-4" /> MetaLLM
                    </div>
                  </th>
                  <th className="p-4 font-semibold text-muted-foreground text-center">{data.name}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {data.features.map((f, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 font-medium text-white">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{f.icon}</span>
                        {f.feature}
                      </div>
                    </td>
                    <td className="p-4 bg-amber-500/5 text-center">
                      <div className="flex justify-center"><FeatureCell value={f.metaLLM} /></div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center"><FeatureCell value={f.competitor} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Why MetaLLM Wins */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-amber-400 mb-6 flex items-center gap-3">
              <Crown className="w-6 h-6" /> Why MetaLLM Wins
            </h3>
            <div className="space-y-5 text-white/90">
              {data.metaWins.map((win, i) => (
                <div key={i}>
                  <h4 className="font-semibold text-base flex items-center gap-2 mb-1.5">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                    {win.title}
                  </h4>
                  <p className="text-sm text-white/60 pl-6">{win.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-muted/10 border border-white/10 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-white mb-6">
              Where {data.name} Falls Short
            </h3>
            <ul className="space-y-3 text-white/70">
              {data.limitations.map((lim, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <X className="w-4 h-4 text-red-500/80 shrink-0 mt-0.5" />
                  <span>{lim}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 pt-6 border-t border-white/10">
              <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wide mb-2">{data.name}'s Strength</h4>
              <p className="text-sm text-white/60">{data.uniqueStrength}</p>
            </div>
          </div>
        </div>

        {/* Verdict */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-12">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" /> The Verdict
          </h3>
          <p className="text-white/70 leading-relaxed">{data.verdict}</p>
        </div>

        {/* Models they support */}
        <div className="bg-muted/5 border border-white/10 rounded-2xl p-8 mb-12">
          <h3 className="text-xl font-bold text-white mb-4">{data.name}'s Model Catalog</h3>
          <div className="flex flex-wrap gap-2">
            {data.modelsList.map((m) => (
              <span key={m} className="text-xs bg-white/5 border border-white/10 text-muted-foreground px-3 py-1.5 rounded-full">
                {m}
              </span>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-white/5">
            <p className="text-xs text-muted-foreground">
              MetaLLM models: GPT-4o, Claude 3.5, Gemini 1.5, Grok, LLaMA 4 Scout, LLaMA 4 Maverick, LLaMA 3.3, Nemotron, Qwen 3, Kimi K2, GLM 4.5, Arcee Trinity, Groq Compound
            </p>
          </div>
        </div>

        {/* Navigate to other comparisons */}
        <div className="mb-12">
          <h3 className="text-lg font-semibold text-white mb-4">Compare with other platforms</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(competitorsData)
              .filter(([id]) => id !== compId)
              .map(([id, comp]) => (
                <Link key={id} href={`/compare/${id}`}>
                  <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5 hover:border-amber-500/20 hover:text-amber-400 transition-colors">
                    vs. {comp.name}
                  </Button>
                </Link>
              ))}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-500/20 rounded-3xl p-10 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Experience Multi-Model Intelligence?</h2>
          <p className="text-lg text-white/70 mb-8 max-w-2xl mx-auto">
            Debate Mode. Smart Routing. Parallel Queries. Synthesis Engine. See why users are switching from {data.name} to MetaLLM.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/login">
              <Button size="lg" className="h-14 px-8 bg-amber-500 hover:bg-amber-400 text-black font-bold">
                Try MetaLLM Free <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/compare-competitors">
              <Button size="lg" variant="outline" className="h-14 px-8 border-white/10 hover:bg-white/5">
                View All Comparisons
              </Button>
            </Link>
          </div>
        </div>

        {/* SEO Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: data.metaTitle,
              description: data.description,
              mainEntity: {
                "@type": "ItemList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "MetaLLM", description: "AI Aggregator with Debate Mode, Smart Routing, Parallel Queries, Synthesis Engine" },
                  { "@type": "ListItem", position: 2, name: data.name, description: data.uniqueStrength },
                ],
              },
            }),
          }}
        />
      </div>
    </div>
  );
}
