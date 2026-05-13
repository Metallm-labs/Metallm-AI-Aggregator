/**
 * Pre-rendered HTML served to search engine crawlers and AI indexers.
 * Bots do not reliably execute our SPA, so route-specific HTML needs to carry
 * the canonical, robots, and body content that matches each page.
 */

export const BOT_USER_AGENTS = [
  "googlebot",
  "bingbot",
  "slurp",
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
  "gptbot",
  "oai-searchbot",
  "chatgpt-user",
  "google-extended",
  "anthropic-ai",
  "claude-web",
  "claudebot",
  "claude-searchbot",
  "cohere-ai",
  "perplexitybot",
  "youbot",
  "metaexternalfetcher",
  "meta-externalfetcher",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "applebot",
  "applebot-extended",
  "amazonbot",
  "bytespider",
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
  "scrolllaunch",
  "marketingdb",
];

type PageConfig = {
  title: string;
  description: string;
  canonicalPath: string;
  robots?: string;
  googlebot?: string;
  ogImage?: string;
  ogImageAlt?: string;
  schema: Record<string, unknown>[];
  body: string;
};

const DEFAULT_ROBOTS = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const DEFAULT_GOOGLEBOT = "index, follow";
const DEFAULT_OG_IMAGE = "https://metallm.tech/logo.jpeg";
const DEFAULT_OG_IMAGE_ALT = "MetaLLM AI platform";
const SITE_URL = "https://metallm.tech";

export function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((b) => ua.includes(b));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serializeJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value)
    .replaceAll("</script>", "<\\/script>")
    .replaceAll("<!--", "<\\!--")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function buildCanonical(path: string): string {
  return `${SITE_URL}${path === "/" ? "/" : path}`;
}

function buildPageConfig(path: string): PageConfig {
  switch (path) {
    case "/chat":
    case "/dashboard":
      return {
        title: "MetaLLM Chat | Public Multi-AI Workspace",
        description:
          "Open the public MetaLLM chat workspace to compare top AI models, use smart routing, debate mode, and live web search from one interface.",
        canonicalPath: "/chat",
        schema: [
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "MetaLLM Chat",
            url: `${SITE_URL}/chat`,
            description:
              "Public MetaLLM chat workspace with smart routing, multi-model comparison, debate mode, and live web search.",
            isPartOf: {
              "@type": "WebSite",
              name: "MetaLLM",
              url: SITE_URL,
            },
          },
        ],
        body: `
          <div class="badge">Public Workspace</div>
          <h1>Try MetaLLM Chat Before You Sign In</h1>
          <p class="lede">Compare leading AI models inside one workspace with smart routing, debate mode, and live web search.</p>
          <div class="card-grid">
            <section class="card">
              <h2>What You Can Explore</h2>
              <ul>
                <li>Public chat workspace at <a href="/chat">/chat</a></li>
                <li>Side-by-side AI model behavior</li>
                <li>Debate mode for stronger reasoning</li>
                <li>Search-backed answers with source attribution</li>
              </ul>
            </section>
            <section class="card">
              <h2>Why It Matters</h2>
              <p>MetaLLM helps researchers, students, founders, and teams stop juggling tabs and get one better answer faster.</p>
            </section>
          </div>
          <p><a class="cta" href="/chat">Open Public Chat</a> <a class="subtle-link" href="/login">Sign In</a></p>
        `,
      };
    case "/agent":
      return {
        title: "WhatsApp AI Agent — Automate Sales & Support 24/7 | Business AI Agent for WhatsApp | MetaLLM",
        description:
          "Deploy a human-like WhatsApp AI agent that answers customers, qualifies leads, and closes deals 24/7. Best AI agent for WhatsApp business automation — no Meta API key needed. AI-powered WhatsApp chatbot for sales, support, and lead generation. Setup in 2 minutes. Free trial available.",
        canonicalPath: "/agent",
        ogImageAlt: "MetaLLM WhatsApp AI Agent — Business AI Agent for WhatsApp Automation, Sales, and Customer Support",
        schema: [
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "MetaLLM WhatsApp AI Agent",
            alternateName: ["WhatsApp AI Agent", "WhatsApp Business AI Agent", "AI Agent for WhatsApp", "WhatsApp AI Bot", "MetaLLM Business Agent"],
            applicationCategory: "BusinessApplication",
            applicationSubCategory: "WhatsApp AI Sales Agent",
            operatingSystem: "Web, iOS, Android, WhatsApp",
            url: `${SITE_URL}/agent`,
            description:
              "MetaLLM WhatsApp AI Agent is an autonomous AI-powered sales and customer support agent that runs directly on WhatsApp. It answers customer queries, qualifies leads, captures orders, and closes deals 24/7 — no Meta API key required. Features include human takeover, voice message support, PDF knowledge ingestion, multi-number management, and instant 2-minute setup.",
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "USD",
              lowPrice: "59",
              highPrice: "299",
              offerCount: "3",
              offers: [
                { "@type": "Offer", name: "Starter", price: "59", priceCurrency: "USD", description: "1 WhatsApp number, 800 messages/month, AI customer chat, basic order capture" },
                { "@type": "Offer", name: "Pro", price: "129", priceCurrency: "USD", description: "3 WhatsApp numbers, 3500 messages/month, voice support, priority AI" },
                { "@type": "Offer", name: "Enterprise", price: "299", priceCurrency: "USD", description: "5 WhatsApp numbers, 10000 messages/month, fastest AI, VIP support" },
              ],
            },
            featureList: [
              "24/7 AI Sales Agent on WhatsApp",
              "No Meta API key needed — scan QR code to connect",
              "Human Takeover — jump into any conversation anytime",
              "Instantly learns from PDFs, websites, and text context",
              "Voice message support with speech-to-text",
              "Multi-WhatsApp number management",
              "Automated lead qualification and order capture",
              "Custom agent personality and sales instructions",
              "Real-time WhatsApp business automation",
              "AI-powered customer support on WhatsApp",
              "Setup in under 2 minutes",
              "Free trial with no credit card required",
            ],
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.8",
              ratingCount: "150",
              bestRating: "5",
              worstRating: "1",
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "What is a WhatsApp AI Agent?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "A WhatsApp AI Agent is an autonomous artificial intelligence bot that operates directly on WhatsApp to handle customer conversations, answer questions, qualify leads, take orders, and close sales 24/7 without human intervention. MetaLLM's WhatsApp AI Agent uses advanced large language models to understand natural language, handle bad grammar, process voice notes, and respond like a human sales representative — unlike basic WhatsApp chatbots that follow rigid scripts.",
                },
              },
              {
                "@type": "Question",
                name: "How does MetaLLM's AI Agent for WhatsApp work?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "MetaLLM's AI Agent for WhatsApp works in 3 simple steps: (1) Scan your WhatsApp QR code to connect — no Meta API key needed. (2) Upload your business knowledge — PDFs, product catalogs, website links. The AI learns everything in seconds. (3) The AI agent handles all incoming WhatsApp messages 24/7, answering queries, qualifying leads, and closing deals. Use Human Takeover to jump into any conversation anytime.",
                },
              },
              {
                "@type": "Question",
                name: "Do I need a Meta API key or WhatsApp Business API?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "No. MetaLLM's WhatsApp AI Agent does NOT require a Meta API key or WhatsApp Business API approval. Simply scan your WhatsApp QR code — like linking WhatsApp Web — and your AI agent is live in under 2 minutes. This makes it the easiest WhatsApp AI integration available for businesses of any size.",
                },
              },
              {
                "@type": "Question",
                name: "What is the best AI chatbot for WhatsApp in 2026?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "MetaLLM is the best AI chatbot for WhatsApp in 2026 because it combines advanced AI language understanding with the simplest setup. Unlike competitors requiring Meta Business API keys or complex integrations, MetaLLM connects via QR code in 2 minutes. Features include human-like conversation, voice support, human takeover, multi-number management, PDF knowledge ingestion, and order capture — starting at $59/month with free trial.",
                },
              },
              {
                "@type": "Question",
                name: "Can the WhatsApp AI agent handle voice messages?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes. MetaLLM's WhatsApp AI Agent supports voice messages through speech-to-text processing on Pro ($129/month) and Enterprise ($299/month) plans. When a customer sends a voice note, the AI transcribes it and responds appropriately — crucial for markets where voice messages are the primary WhatsApp communication method.",
                },
              },
              {
                "@type": "Question",
                name: "What is Human Takeover in WhatsApp AI?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Human Takeover lets you jump into any AI-managed WhatsApp conversation anytime. As soon as you manually reply, the AI agent instantly pauses — no interference or conflicting messages. When you're done, the AI resumes. This ensures complex negotiations, VIP customers, or sensitive issues get human attention while routine queries stay automated.",
                },
              },
              {
                "@type": "Question",
                name: "How much does a WhatsApp AI agent cost?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "MetaLLM's WhatsApp AI Agent starts at $59/month (Starter: 1 number, 800 messages). Pro is $129/month (3 numbers, 3,500 messages, voice support). Enterprise is $299/month (5 numbers, 10,000 messages, VIP support). All plans include free trial with no credit card. Compared to a human sales agent ($2,000+/month) or custom bot development ($5,000+), MetaLLM is the most cost-effective solution.",
                },
              },
              {
                "@type": "Question",
                name: "Can I use the WhatsApp AI agent for my restaurant?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes. MetaLLM's WhatsApp AI Agent handles menu inquiries, delivery orders, reservations, ingredient questions, business hours, and repeat orders — all on WhatsApp. Upload your menu as PDF and the AI learns every dish, price, and option. Restaurants report capturing 3x more orders because the AI responds instantly during peak hours.",
                },
              },
              {
                "@type": "Question",
                name: "Is the WhatsApp AI agent suitable for e-commerce?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Absolutely. E-commerce businesses use MetaLLM to automate product inquiries, catalog sharing, sizing/shipping questions, order processing, payment links, and post-purchase support on WhatsApp. The AI learns your entire product catalog and can recommend products, handle objections, and close sales autonomously 24/7.",
                },
              },
              {
                "@type": "Question",
                name: "How is MetaLLM different from regular WhatsApp chatbots?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Regular WhatsApp chatbots follow rigid decision trees and break on unexpected questions. MetaLLM uses advanced AI to understand natural language, context, intent, bad grammar, slang, and voice messages. It responds like a trained human sales agent. Plus, no coding, no API keys, no flowcharts — just scan QR code and upload business knowledge.",
                },
              },
              {
                "@type": "Question",
                name: "What industries benefit most from WhatsApp AI agents?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "WhatsApp AI agents deliver highest ROI for: restaurants (order taking), e-commerce (product sales), real estate (lead qualification), healthcare clinics (appointment scheduling), education (enrollment inquiries), travel (booking assistance), and professional services (consultation scheduling). Any business receiving WhatsApp customer inquiries benefits from MetaLLM's AI automation.",
                },
              },
              {
                "@type": "Question",
                name: "Is there a free trial for the WhatsApp AI agent?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes. MetaLLM offers a free trial with no credit card required. Create your AI agent, connect WhatsApp, upload business knowledge, and test how the agent handles real conversations before committing to a paid plan. The free trial includes 20 messages to fully evaluate the AI with your specific business use case.",
                },
              },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: "How to Deploy an AI Agent on WhatsApp for Your Business",
            description: "Step-by-step guide to setting up MetaLLM's WhatsApp AI Agent for automated sales, customer support, and lead qualification. No coding or Meta API key required.",
            totalTime: "PT2M",
            step: [
              { "@type": "HowToStep", position: 1, name: "Create a Free Account", text: "Sign up at metallm.tech/agent with email or Google. No credit card required." },
              { "@type": "HowToStep", position: 2, name: "Create Your AI Agent", text: "Click Create Agent. The AI bootstrap system can crawl your website automatically, or upload PDFs and business information manually." },
              { "@type": "HowToStep", position: 3, name: "Connect Your WhatsApp", text: "Scan the QR code with WhatsApp — like connecting WhatsApp Web. No Meta API key needed. Connected in seconds." },
              { "@type": "HowToStep", position: 4, name: "Customize Agent Behavior", text: "Configure how the agent speaks, what to prioritize, sales scripts, and escalation rules. Upload knowledge files to make it an expert." },
              { "@type": "HowToStep", position: 5, name: "Go Live", text: "Your AI Agent handles all incoming WhatsApp messages 24/7. Use Human Takeover anytime to jump into conversations." },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "MetaLLM", item: SITE_URL + "/" },
              { "@type": "ListItem", position: 2, name: "WhatsApp AI Agent", item: SITE_URL + "/agent" },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "Product",
            name: "MetaLLM WhatsApp AI Agent",
            description: "AI-powered WhatsApp sales and customer support agent. Automates lead qualification, order capture, and deal closing 24/7. No API key required.",
            brand: { "@type": "Brand", name: "MetaLLM" },
            category: "Business Software > WhatsApp Automation > AI Agent",
            url: `${SITE_URL}/agent`,
            image: DEFAULT_OG_IMAGE,
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "USD",
              lowPrice: "59",
              highPrice: "299",
              offerCount: "3",
              availability: "https://schema.org/InStock",
            },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.8",
              reviewCount: "150",
              bestRating: "5",
              worstRating: "1",
            },
          },
        ],
        body: `
          <div class="badge">WhatsApp AI Agent — Business Automation</div>
          <h1>WhatsApp AI Agent — Automate Sales & Customer Support 24/7</h1>
          <p class="lede">MetaLLM's WhatsApp AI Agent is an autonomous AI-powered sales and support bot that runs directly on WhatsApp. It answers customers, qualifies leads, captures orders, and closes deals around the clock — no Meta API key required. The best AI agent for WhatsApp business automation in 2026.</p>

          <section class="card" id="what-is-whatsapp-ai-agent">
            <h2>What is a WhatsApp AI Agent?</h2>
            <p>A WhatsApp AI Agent is an autonomous artificial intelligence bot that handles customer conversations directly on WhatsApp. Unlike basic WhatsApp chatbots that follow rigid decision trees, MetaLLM's AI agent uses advanced language models to understand natural language, context, intent, bad grammar, slang, and even voice messages — responding like a trained human sales representative 24/7.</p>
          </section>

          <div class="card-grid">
            <section class="card">
              <h2>Key Features of MetaLLM WhatsApp AI Agent</h2>
              <ul>
                <li><strong>24/7 AI Sales Agent</strong> — Instant replies under 2 seconds to every WhatsApp lead</li>
                <li><strong>No Meta API Key Required</strong> — Connect by scanning QR code, like WhatsApp Web</li>
                <li><strong>Human Takeover</strong> — Jump into any conversation anytime, AI pauses instantly</li>
                <li><strong>Voice Message Support</strong> — AI transcribes and responds to voice notes</li>
                <li><strong>PDF Knowledge Ingestion</strong> — Upload menus, catalogs, price lists — AI learns in seconds</li>
                <li><strong>Multi-Number Management</strong> — Manage up to 5 WhatsApp numbers per agent</li>
                <li><strong>Automated Order Capture</strong> — AI takes orders and processes inquiries autonomously</li>
                <li><strong>Custom Sales Personality</strong> — Configure tone, priorities, and closing strategies</li>
              </ul>
            </section>
            <section class="card" id="how-it-works">
              <h2>How to Deploy AI on WhatsApp in 2 Minutes</h2>
              <ol>
                <li><strong>Create free account</strong> at metallm.tech/agent — no credit card</li>
                <li><strong>Create your AI agent</strong> — AI bootstrap crawls your website automatically</li>
                <li><strong>Scan WhatsApp QR code</strong> — connected in seconds, no API key needed</li>
                <li><strong>Customize behavior</strong> — set sales scripts, tone, and escalation rules</li>
                <li><strong>Go live</strong> — AI handles all WhatsApp messages 24/7</li>
              </ol>
            </section>
          </div>

          <section class="card">
            <h2>WhatsApp AI Agent Pricing</h2>
            <ul>
              <li><strong>Starter — $59/month:</strong> 1 WhatsApp number, 800 messages/month, AI customer chat</li>
              <li><strong>Pro — $129/month:</strong> 3 WhatsApp numbers, 3,500 messages/month, voice support, priority AI</li>
              <li><strong>Enterprise — $299/month:</strong> 5 WhatsApp numbers, 10,000 messages/month, VIP support</li>
            </ul>
            <p>All plans include a free trial with no credit card required.</p>
          </section>

          <section class="card">
            <h2>Who Uses WhatsApp AI Agents?</h2>
            <ul>
              <li><strong>Restaurants:</strong> Automated menu inquiries, order taking, and delivery scheduling on WhatsApp</li>
              <li><strong>E-commerce:</strong> Product recommendations, order processing, and post-purchase support</li>
              <li><strong>Real Estate:</strong> Property inquiries, lead qualification, and showing scheduling</li>
              <li><strong>Healthcare:</strong> Appointment booking, FAQ handling, and patient support</li>
              <li><strong>Professional Services:</strong> Consultation scheduling, pricing inquiries, and lead capture</li>
            </ul>
          </section>

          <section class="card" id="faq">
            <h2>Frequently Asked Questions About WhatsApp AI Agents</h2>
            <dl>
              <dt>What is a WhatsApp AI agent?</dt>
              <dd>An autonomous AI bot that runs directly on WhatsApp to handle customer conversations, qualify leads, take orders, and close sales 24/7.</dd>
              <dt>Do I need a Meta API key?</dt>
              <dd>No. MetaLLM connects via QR code scan — no Meta API key, no Business API approval needed.</dd>
              <dt>How fast does the AI respond?</dt>
              <dd>Under 2 seconds — faster than any human agent, ensuring zero missed leads.</dd>
              <dt>Can it handle voice messages?</dt>
              <dd>Yes. The AI transcribes voice notes and responds intelligently (Pro and Enterprise plans).</dd>
              <dt>Is there a free trial?</dt>
              <dd>Yes. Free trial with 20 messages, no credit card required.</dd>
              <dt>What is Human Takeover?</dt>
              <dd>You can jump into any AI-managed conversation at any time. The AI pauses instantly when you reply.</dd>
              <dt>Can I use it for my restaurant?</dt>
              <dd>Yes. Upload your menu as PDF and the AI handles orders, inquiries, and reservations on WhatsApp.</dd>
              <dt>How is this different from a regular WhatsApp chatbot?</dt>
              <dd>Regular chatbots follow scripts and break on unexpected questions. MetaLLM uses advanced AI to understand natural language, context, and intent like a human.</dd>
            </dl>
          </section>

          <p><a class="cta" href="/agent">Start Free Trial — Deploy WhatsApp AI Agent</a> <a class="subtle-link" href="/login?redirect=/business-agent">Sign In to Dashboard</a></p>
        `,
      };
    case "/terms":
      return {
        title: "Terms of Service | MetaLLM",
        description:
          "Read the MetaLLM terms of service, acceptable use rules, account conditions, and liability terms.",
        canonicalPath: "/terms",
        schema: [
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "MetaLLM Terms of Service",
            url: `${SITE_URL}/terms`,
            description:
              "Legal terms governing use of MetaLLM, including account responsibilities, acceptable use, and liability limits.",
          },
        ],
        body: `
          <div class="badge">Legal</div>
          <h1>MetaLLM Terms of Service</h1>
          <p class="lede">These terms explain how MetaLLM may be used, what account holders are responsible for, and the legal conditions that apply to the service.</p>
          <div class="card-grid single">
            <section class="card">
              <h2>Highlights</h2>
              <ul>
                <li>Use of the service requires agreement to MetaLLM terms.</li>
                <li>Users must not misuse, overload, or exploit the platform.</li>
                <li>AI output is provided as-is and should be independently verified when needed.</li>
                <li>Questions can be sent to <a href="mailto:support@metallm.tech">support@metallm.tech</a>.</li>
              </ul>
            </section>
          </div>
          <p><a class="cta" href="/terms">Read Terms</a></p>
        `,
      };
    case "/privacy":
      return {
        title: "Privacy Policy | MetaLLM",
        description:
          "Review how MetaLLM handles personal information, account data, usage data, and customer support requests.",
        canonicalPath: "/privacy",
        schema: [
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "MetaLLM Privacy Policy",
            url: `${SITE_URL}/privacy`,
            description:
              "Privacy policy covering MetaLLM data handling, user information, and support contact details.",
          },
        ],
        body: `
          <div class="badge">Privacy</div>
          <h1>MetaLLM Privacy Policy</h1>
          <p class="lede">This page explains how MetaLLM handles account data, product usage information, and support communication.</p>
          <div class="card-grid single">
            <section class="card">
              <h2>Key Areas</h2>
              <ul>
                <li>Information collected to operate MetaLLM accounts and sessions</li>
                <li>How platform activity and support requests are handled</li>
                <li>Policy updates and contact guidance</li>
              </ul>
            </section>
          </div>
          <p><a class="cta" href="/privacy">Read Privacy Policy</a></p>
        `,
      };
    case "/refund":
      return {
        title: "Refund Policy | MetaLLM",
        description:
          "See refund eligibility, non-refundable cases, and billing support steps for MetaLLM subscriptions.",
        canonicalPath: "/refund",
        schema: [
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "MetaLLM Refund Policy",
            url: `${SITE_URL}/refund`,
            description:
              "Refund policy for MetaLLM subscription billing, technical issue eligibility, and customer support process.",
          },
        ],
        body: `
          <div class="badge">Billing Policy</div>
          <h1>MetaLLM Refund Policy</h1>
          <p class="lede">This policy describes when a refund may be considered, which situations are non-refundable, and how to contact support for billing issues.</p>
          <div class="card-grid single">
            <section class="card">
              <h2>Important Points</h2>
              <ul>
                <li>Refunds are only considered for verified technical or billing faults.</li>
                <li>Requests must be submitted within the published refund window.</li>
                <li>Support is available at <a href="mailto:support@metallm.tech">support@metallm.tech</a>.</li>
              </ul>
            </section>
          </div>
          <p><a class="cta" href="/refund">Read Refund Policy</a></p>
        `,
      };
    case "/compare":
      return {
        title: "AI Model Compare Tool | MetaLLM",
        description:
          "Compare AI models, pricing context, and behavior inside MetaLLM's model comparison tool.",
        canonicalPath: "/compare",
        schema: [
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "MetaLLM Model Compare Tool",
            url: `${SITE_URL}/compare`,
            description:
              "MetaLLM tool for comparing AI models and evaluating which model best fits a given workflow.",
          },
        ],
        body: `
          <div class="badge">Comparison Tool</div>
          <h1>Compare AI Models Faster</h1>
          <p class="lede">Use MetaLLM's comparison experience to evaluate models and pick the right one for reasoning, coding, research, or speed.</p>
          <div class="card-grid single">
            <section class="card">
              <h2>Inside The Tool</h2>
              <ul>
                <li>Model comparison workflow built into MetaLLM</li>
                <li>Research-friendly evaluation context</li>
                <li>Clear path into the main chat workspace</li>
              </ul>
            </section>
          </div>
          <p><a class="cta" href="/compare">Open Compare Tool</a></p>
        `,
      };
    case "/login":
      return {
        title: "Login | MetaLLM",
        description:
          "Sign in to your MetaLLM account to access saved chats, business-agent tools, and your workspace.",
        canonicalPath: "/login",
        robots: "noindex, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
        googlebot: "noindex, follow",
        schema: [
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "MetaLLM Login",
            url: `${SITE_URL}/login`,
            description: "Login and verification page for existing MetaLLM users.",
          },
        ],
        body: `
          <div class="badge">Account Access</div>
          <h1>Sign In to MetaLLM</h1>
          <p class="lede">Use this page to access your saved chats, account tools, and business-agent workspace.</p>
          <div class="card-grid single">
            <section class="card">
              <h2>Account Access Page</h2>
              <p>This is a utility page for existing users and account verification flows.</p>
            </section>
          </div>
          <p><a class="cta" href="/login">Open Login</a> <a class="subtle-link" href="/">Back to Home</a></p>
        `,
      };
    case "/blogs":
      return {
        title: "MetaLLM Blogs | Updates & AI Insights",
        description: "Read the latest updates, tutorials, and insights regarding MetaLLM chat workspace, AI model comparisons, prompt engineering, and WhatsApp business agents.",
        canonicalPath: "/blogs",
        schema: [
          {
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "MetaLLM Blogs",
            url: `${SITE_URL}/blogs`,
            description: "Updates, tutorials, and insights from MetaLLM regarding AI."
          }
        ],
        body: `
          <div class="badge">Blog</div>
          <h1>MetaLLM AI Insights & Updates</h1>
          <p class="lede">Explore our latest articles published straight from our Medium publication.</p>
        `
      };
    
    case "/":
    default:
      return {
        title: "MetaLLM | AI Aggregator and Multi-Model Chat",
        description:
          "Query multiple frontier AI models from one workspace with smart routing, debate mode, and web-backed answers.",
        canonicalPath: "/",
        schema: [
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "MetaLLM",
            applicationCategory: "ProductivityApplication",
            operatingSystem: "Web",
            url: SITE_URL,
            description:
              "MetaLLM is a multi-model AI workspace that helps users query leading AI systems from one place and synthesize better answers.",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
            featureList: [
              "Multi-model AI orchestration",
              "Smart routing",
              "Debate mode",
              "Live web search",
              "Shared workspace for researchers and teams",
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "MetaLLM",
            url: SITE_URL,
            potentialAction: {
              "@type": "SearchAction",
              target: `${SITE_URL}/chat?q={search_term_string}`,
              "query-input": "required name=search_term_string",
            },
          },
        ],
        body: `
          <div class="badge">Multi-Model AI Workspace</div>
          <h1>All Your Best AI Tools, One Clean Workspace</h1>
          <p class="lede">MetaLLM helps you query multiple AI models, compare reasoning paths, and get one stronger answer without bouncing between tabs.</p>
          <div class="card-grid">
            <section class="card">
              <h2>Core Features</h2>
              <ul>
                <li>Parallel access to top AI models</li>
                <li>Smart routing for better speed and fit</li>
                <li>Debate mode for stronger analysis</li>
                <li>Web search with cited sources</li>
              </ul>
            </section>
            <section class="card">
              <h2>Built For</h2>
              <p>Developers, founders, researchers, students, and teams that need reliable AI workflows instead of scattered tools.</p>
            </section>
          </div>
          <p><a class="cta" href="/chat">Open Chat</a> <a class="subtle-link" href="/agent">Explore WhatsApp Agent</a></p>
          <p style="margin-top:24px"><a href="https://www.scrolllaunch.com/products/metallm?utm_source=badge&utm_medium=embed&utm_campaign=metallm&ref=scrolllaunch" target="_blank" rel="noopener noreferrer"><img src="https://www.scrolllaunch.com/api/badge/metallm" alt="Featured on ScrollLaunch" width="220" height="48" loading="lazy" /></a> <a href="https://marketingdb.live" target="_blank" rel="noopener noreferrer"><img src="https://marketingdb.live/badge.svg" alt="Listed on MarketingDB" width="190" height="44" loading="lazy" /></a></p>
        `,
      };
  }
}

export function getPrerenderHTML(path: string): string {
  const page = buildPageConfig(path);
  const canonical = buildCanonical(page.canonicalPath);
  const robots = page.robots ?? DEFAULT_ROBOTS;
  const googlebot = page.googlebot ?? DEFAULT_GOOGLEBOT;
  const ogImage = page.ogImage ?? DEFAULT_OG_IMAGE;
  const ogImageAlt = page.ogImageAlt ?? DEFAULT_OG_IMAGE_ALT;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const serializedSchema = page.schema
    .map(
      (entry) =>
        `<script type="application/ld+json">${serializeJsonLd(entry)}</script>`,
    )
    .join("\n  ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="${escapeHtml(robots)}" />
  <meta name="googlebot" content="${escapeHtml(googlebot)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" type="image/jpeg" href="/logo-96.jpg" sizes="96x96" />
  <link rel="shortcut icon" href="/logo-96.jpg" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:site_name" content="MetaLLM" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:image:alt" content="${escapeHtml(ogImageAlt)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${escapeHtml(canonical)}" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  ${serializedSchema}
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --panel: rgba(15, 23, 42, 0.78);
      --line: rgba(148, 163, 184, 0.18);
      --text: #e5eefb;
      --muted: #a5b4cf;
      --accent: #f59e0b;
      --accent-soft: rgba(245, 158, 11, 0.16);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top, rgba(245, 158, 11, 0.12), transparent 30%),
        linear-gradient(180deg, #0b1020 0%, #070b16 100%);
      color: var(--text);
    }
    .shell { max-width: 960px; margin: 0 auto; padding: 28px 20px 56px; }
    .nav { display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 44px; }
    .brand { color: #fff; font-weight: 800; text-decoration: none; letter-spacing: -0.02em; }
    .nav-links { display: flex; flex-wrap: wrap; gap: 14px; }
    .nav-links a, .subtle-link { color: var(--muted); text-decoration: none; }
    .nav-links a:hover, .subtle-link:hover { color: #fff; }
    .badge {
      display: inline-flex;
      align-items: center;
      border: 1px solid rgba(245, 158, 11, 0.32);
      background: var(--accent-soft);
      color: #fcd34d;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 0.78rem;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0 0 14px;
      font-size: clamp(2.2rem, 5vw, 3.7rem);
      line-height: 1.05;
      letter-spacing: -0.04em;
      color: #fff;
    }
    .lede {
      margin: 0 0 28px;
      max-width: 760px;
      font-size: 1.06rem;
      line-height: 1.75;
      color: var(--muted);
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 18px;
      margin: 26px 0 30px;
    }
    .card-grid.single { grid-template-columns: 1fr; }
    .card {
      padding: 22px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: var(--panel);
      backdrop-filter: blur(12px);
    }
    h2 { margin: 0 0 12px; font-size: 1.15rem; color: #fff; }
    p, li { color: var(--muted); line-height: 1.7; }
    ul { margin: 0; padding-left: 20px; }
    a { color: #fcd34d; }
    .cta {
      display: inline-block;
      margin-right: 14px;
      padding: 12px 20px;
      border-radius: 12px;
      background: linear-gradient(135deg, #f59e0b, #fbbf24);
      color: #111827;
      font-weight: 700;
      text-decoration: none;
    }
    footer {
      margin-top: 56px;
      padding-top: 20px;
      border-top: 1px solid var(--line);
      color: #8ea0bf;
      font-size: 0.92rem;
    }
    @media (max-width: 640px) {
      .nav { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <nav class="nav">
      <a class="brand" href="/">MetaLLM</a>
      <div class="nav-links">
        <a href="/">Home</a>
        <a href="/chat">Chat</a>
        <a href="/agent">Agent</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </div>
    </nav>
    ${page.body}
    <footer>
      <p>MetaLLM provides route-specific crawler content for SEO, sharing, and AI indexing while the primary product runs as a React app.</p>
    </footer>
  </main>
</body>
</html>`;
}
