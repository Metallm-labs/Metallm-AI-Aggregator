/**
 * Pre-rendered HTML served to search engine crawlers and AI indexers.
 * Because MetaLLM is a React SPA, bots receive an empty <div id="root"></div>.
 * This module returns a fully-populated static HTML page so every major crawler
 * (Googlebot, Bingbot, ChatGPT, Claude, Perplexity, etc.) can index real content.
 */

export const BOT_USER_AGENTS = [
  // Search engines
  "googlebot",
  "bingbot",
  "slurp",          // Yahoo
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "sogou",
  "exabot",
  "facebot",
  "ia_archiver",
  "semrushbot",
  "ahrefsbot",
  "mj12bot",
  "dotbot",
  "rogerbot",
  // AI crawlers
  "gptbot",
  "chatgpt-user",
  "google-extended",
  "anthropic-ai",
  "claude-web",
  "claudebot",
  "cohere-ai",
  "perplexitybot",
  "youbot",
  "metaexternalfetcher",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  // Generic
  "spider",
  "crawler",
  "scraper",
  "wget",
  "curl",
  "python-requests",
  "libwww-perl",
  "go-http-client",
  "headlesschrome",
  "phantomjs",
  "lighthouse",
  "seobilitybot",
];

export function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((b) => ua.includes(b));
}

export function getPrerenderHTML(path: string): string {
  const title = "MetaLLM — AI Aggregator | Query Multiple AI Models Simultaneously";
  const description =
    "MetaLLM aggregates Gemini, GPT, LLaMA, Kimi, Qwen, Nemotron & more into one unified AI response. Smart routing, prompt enhancement, AI debate mode & live web search. Built for researchers, students & founders.";
  const canonical = `https://metallm.tech${path === "/" ? "" : path}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <meta name="googlebot" content="index, follow" />
  <meta name="keywords" content="AI aggregator, multi-model AI, Gemini, GPT, LLaMA, Kimi, Qwen, Nemotron, GLM, Groq, AI comparison, LLM aggregator, AI research tool, compare AI models, AI orchestrator, AI synthesis" />
  <link rel="canonical" href="${canonical}" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="MetaLLM — Query Multiple AI Models at Once. Get One Unified Answer." />
  <meta property="og:description" content="Stop switching between Gemini, GPT, LLaMA &amp; Kimi. MetaLLM queries leading AI models simultaneously with smart routing, prompt enhancement &amp; debate mode." />
  <meta property="og:image" content="https://metallm.tech/logo.jpeg" />
  <meta property="og:image:alt" content="MetaLLM AI Aggregator Platform" />
  <meta property="og:site_name" content="MetaLLM" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="MetaLLM — Multiple AI Models. One Unified Answer." />
  <meta name="twitter:description" content="Gemini, GPT, LLaMA, Kimi, Qwen & more — all at once. Smart routing, prompt enhancement, AI debate mode & live web search." />
  <meta name="twitter:image" content="https://metallm.tech/logo.jpeg" />

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "MetaLLM",
    "applicationCategory": "Productivity",
    "operatingSystem": "Web",
    "description": "MetaLLM is a multi-AI aggregator platform that queries Gemini, GPT, LLaMA, Nemotron, Qwen, Kimi, GLM, Trinity, and Groq simultaneously, then synthesizes their responses into one unified, actionable analysis.",
    "url": "https://metallm.tech",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "featureList": [
      "Multi-model AI aggregation",
      "Gemini, GPT, LLaMA, Kimi, Qwen, Nemotron, GLM, Trinity, Groq integration",
      "Unified AI response synthesis",
      "Smart prompt routing",
      "AI Debate Mode",
      "Live Web Search",
      "Research acceleration"
    ]
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "MetaLLM",
    "url": "https://metallm.tech",
    "logo": "https://metallm.tech/logo.jpeg",
    "description": "Multi-AI Aggregator Platform for students, researchers, and founders"
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is MetaLLM?",
        "acceptedAnswer": { "@type": "Answer", "text": "MetaLLM is a multi-AI aggregator that sends your query to Gemini, GPT, LLaMA, Nemotron, Qwen, Kimi, GLM, Trinity, Groq and other top AI models simultaneously, then synthesizes all responses into one comprehensive, unified answer." }
      },
      {
        "@type": "Question",
        "name": "How does MetaLLM save time?",
        "acceptedAnswer": { "@type": "Answer", "text": "Instead of opening 5+ AI tabs and comparing responses manually, MetaLLM does it in one click. Users report saving 10x research time by getting consolidated, multi-perspective AI analysis instantly." }
      },
      {
        "@type": "Question",
        "name": "Which AI models does MetaLLM support?",
        "acceptedAnswer": { "@type": "Answer", "text": "MetaLLM integrates models from Google (Gemini), OpenAI (GPT), Meta (LLaMA), NVIDIA (Nemotron), Alibaba (Qwen), Moonshot (Kimi), ZhipuAI (GLM), Arcee (Trinity), and Groq — all queried simultaneously." }
      },
      {
        "@type": "Question",
        "name": "Is MetaLLM free?",
        "acceptedAnswer": { "@type": "Answer", "text": "MetaLLM uses a credits-based system. Purchase credits to query the world's best AI models — Gemini, GPT, LLaMA, Kimi, Qwen, Nemotron and more — all from one platform." }
      }
    ]
  }
  </script>

  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0f; color: #e5e7eb; margin: 0; padding: 0; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 2.5rem; font-weight: 800; color: #fff; margin-bottom: 16px; }
    h2 { font-size: 1.6rem; font-weight: 700; color: #fff; margin: 40px 0 12px; border-bottom: 1px solid #333; padding-bottom: 8px; }
    h3 { font-size: 1.15rem; font-weight: 600; color: #e2c56b; margin: 20px 0 6px; }
    p { color: #9ca3af; line-height: 1.7; }
    a { color: #f59e0b; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge { display: inline-block; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); color: #fcd34d; padding: 4px 12px; border-radius: 999px; font-size: 0.78rem; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin: 20px 0; }
    .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; }
    .card h3 { margin-top: 0; }
    .card p { margin: 0; font-size: 0.9rem; }
    .cta { display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; font-weight: 700; padding: 12px 28px; border-radius: 8px; margin: 12px 6px 12px 0; font-size: 1rem; }
    .models { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0; }
    .model-tag { background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.2); color: #c4b5fd; padding: 5px 14px; border-radius: 999px; font-size: 0.82rem; }
    .steps { counter-reset: step; }
    .step { counter-increment: step; display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
    .step::before { content: counter(step); background: #f59e0b; color: #000; font-weight: 800; min-width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0; }
    .step-content h3 { margin: 0 0 4px; color: #fff; }
    .step-content p { margin: 0; font-size: 0.9rem; }
    nav { padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.07); display: flex; align-items: center; justify-content: space-between; }
    nav .logo { font-size: 1.2rem; font-weight: 800; color: #fff; }
    nav .nav-links { display: flex; gap: 24px; }
    footer { border-top: 1px solid rgba(255,255,255,0.07); padding: 24px 20px; text-align: center; color: #6b7280; font-size: 0.85rem; margin-top: 60px; }
  </style>
</head>
<body>

<nav>
  <span class="logo">MetaLLM</span>
  <div class="nav-links">
    <a href="/">Home</a>
    <a href="/login">Login</a>
    <a href="/terms">Terms</a>
    <a href="/privacy">Privacy</a>
  </div>
</nav>

<div class="container">

  <div class="badge">✦ Trusted by 5,000+ researchers &amp; founders</div>

  <h1>Stop Guessing. Start Knowing.</h1>
  <p style="font-size:1.15rem; color:#d1d5db; max-width:600px; margin-bottom:24px;">
    Every minute switching between AI tools is wasted. <strong style="color:#fff">MetaLLM auto-routes to the best AI, queries multiple models in parallel, and synthesizes one answer</strong> — with debate mode &amp; live web search.
  </p>
  <a href="/login" class="cta">Start Using MetaLLM</a>

  <h2>What is MetaLLM?</h2>
  <p>
    MetaLLM is a multi-AI aggregator platform that sends your query to <strong style="color:#fff">Gemini, GPT, LLaMA, Nemotron, Qwen, Kimi, GLM, Trinity, and Groq</strong> simultaneously — then synthesizes all responses into one comprehensive, unified answer. Stop switching between multiple AI tabs; get all perspectives in a single click.
  </p>

  <h2>Supported AI Models</h2>
  <div class="models">
    <span class="model-tag">Gemini (Google)</span>
    <span class="model-tag">GPT (OpenAI)</span>
    <span class="model-tag">LLaMA Scout (Meta)</span>
    <span class="model-tag">LLaMA Maverick (Meta)</span>
    <span class="model-tag">LLaMA (Meta)</span>
    <span class="model-tag">Nemotron (NVIDIA)</span>
    <span class="model-tag">Qwen (Alibaba)</span>
    <span class="model-tag">Kimi (Moonshot AI)</span>
    <span class="model-tag">GLM (ZhipuAI)</span>
    <span class="model-tag">Trinity (Arcee AI)</span>
    <span class="model-tag">Groq</span>
  </div>

  <h2>Key Features</h2>
  <div class="grid">
    <div class="card">
      <h3>Smart Routing</h3>
      <p>Automatically detects the best AI model for your query type — coding, research, creative writing, or real-time news.</p>
    </div>
    <div class="card">
      <h3>Prompt Enhancement</h3>
      <p>Rewrites and optimizes your prompts before sending to each model, extracting better, more accurate responses.</p>
    </div>
    <div class="card">
      <h3>AI Debate Mode</h3>
      <p>Two AI models argue opposing sides of any topic across multiple rounds. Get a structured verdict from a neutral judge model.</p>
    </div>
    <div class="card">
      <h3>Multi-Model Parallel Query</h3>
      <p>Send one question to all models simultaneously and compare their answers side-by-side in real time.</p>
    </div>
    <div class="card">
      <h3>Live Web Search</h3>
      <p>Activate real-time web search so any model can access up-to-date information beyond its training cutoff.</p>
    </div>
    <div class="card">
      <h3>AI Synthesis Engine</h3>
      <p>After all models respond, MetaLLM's synthesis engine merges the best insights into one consolidated, actionable answer.</p>
    </div>
  </div>

  <h2>How It Works</h2>
  <div class="steps">
    <div class="step">
      <div class="step-content">
        <h3>Ask Anything</h3>
        <p>Type your question, research topic, or task. MetaLLM works for any domain — science, business, coding, writing, and more.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-content">
        <h3>Smart Route &amp; Enhance</h3>
        <p>MetaLLM automatically routes to the optimal model and enhances your prompt for maximum accuracy.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-content">
        <h3>Models Respond in Parallel</h3>
        <p>All selected AI models respond simultaneously in real time — no waiting in sequence.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-content">
        <h3>Unified Synthesized Answer</h3>
        <p>A final synthesis model reads all responses and produces one complete, cross-verified answer with confidence scoring.</p>
      </div>
    </div>
  </div>

  <h2>Who Is MetaLLM For?</h2>
  <div class="grid">
    <div class="card">
      <h3>Students</h3>
      <p>Get multi-perspective explanations for complex topics. Cross-verify claims across models. Write better essays with AI-assisted research.</p>
    </div>
    <div class="card">
      <h3>Researchers</h3>
      <p>Rapidly synthesize literature, compare model reasoning, and generate hypotheses with multi-model analysis.</p>
    </div>
    <div class="card">
      <h3>Founders &amp; Executives</h3>
      <p>Make faster, data-driven decisions by getting balanced AI perspectives on market trends, strategy, and technical challenges.</p>
    </div>
  </div>

  <h2>Frequently Asked Questions</h2>

  <h3>How much does MetaLLM cost?</h3>
  <p>MetaLLM uses a credits-based model. Purchase credits to access the world's top AI models including Gemini, GPT, LLaMA, Kimi, Qwen, Nemotron, and more — all from one platform.</p>

  <h3>Does MetaLLM support voice input?</h3>
  <p>Yes — MetaLLM includes voice recording so you can speak your query and get multi-model AI responses hands-free.</p>

  <h3>Can I compare AI model responses side by side?</h3>
  <p>Absolutely. In Multi-Model Mode, all models respond simultaneously and you can read each response in a structured layout.</p>

  <h3>What is AI Debate Mode?</h3>
  <p>Debate Mode pits two AI models against each other on any topic, arguing opposing positions across multiple rounds. A neutral third model then delivers the final verdict.</p>

  <h3>Does MetaLLM support image uploads?</h3>
  <p>Yes — you can attach images to your query and vision-capable models (like GPT and Gemini) will analyze them.</p>

  <h3>How is MetaLLM different from ChatGPT?</h3>
  <p>ChatGPT gives you one model's answer. MetaLLM gives you multiple simultaneous answers from the world's best AI models, then synthesizes them. It's AI aggregation — not a single chatbot.</p>

  <a href="/login" class="cta">Start Using MetaLLM</a>

</div>

<footer>
  <p>&copy; 2026 MetaLLM. All rights reserved. &nbsp;|&nbsp;
    <a href="/terms">Terms of Service</a> &nbsp;|&nbsp;
    <a href="/privacy">Privacy Policy</a>
  </p>
  <p style="margin-top:8px;">AI aggregator | Multi-model AI | Gemini, GPT, LLaMA, Groq, Qwen and more in one platform</p>
</footer>

</body>
</html>`;
}
