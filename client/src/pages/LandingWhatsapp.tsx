import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Zap, MessageSquare, Clock, BarChart3, ArrowRight, CheckCircle2, ShieldCheck, Mail, Lock, Loader2, User, Eye, EyeOff, Shield, X } from "lucide-react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function LandingWhatsapp() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState<"signin" | "signup">("signup");
  
  // Custom Modal Auth State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [otp, setOtp] = useState("");
  const [isOtpMode, setIsOtpMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const metaDescription = document.querySelector('meta[name="description"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    const twitterUrl = document.querySelector('meta[name="twitter:url"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogImageAlt = document.querySelector('meta[property="og:image:alt"]');
    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    const robots = document.querySelector('meta[name="robots"]');
    const googlebot = document.querySelector('meta[name="googlebot"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const metaKeywords = document.querySelector('meta[name="keywords"]');

    const originalTitle = document.title;
    const originalDesc = metaDescription?.getAttribute("content") || "";
    const originalOgTitle = ogTitle?.getAttribute("content") || "";
    const originalOgDesc = ogDescription?.getAttribute("content") || "";
    const originalTwitterTitle = twitterTitle?.getAttribute("content") || "";
    const originalTwitterDesc = twitterDescription?.getAttribute("content") || "";
    const originalTwitterUrl = twitterUrl?.getAttribute("content") || "";
    const originalOgUrl = ogUrl?.getAttribute("content") || "";
    const originalOgImage = ogImage?.getAttribute("content") || "";
    const originalOgImageAlt = ogImageAlt?.getAttribute("content") || "";
    const originalTwitterImage = twitterImage?.getAttribute("content") || "";
    const originalRobots = robots?.getAttribute("content") || "";
    const originalGooglebot = googlebot?.getAttribute("content") || "";
    const originalCanonical = canonical?.getAttribute("href") || "";
    const originalKeywords = metaKeywords?.getAttribute("content") || "";

    const newTitle = "WhatsApp AI Agent — Automate Sales & Support 24/7 | Business AI Agent for WhatsApp | MetaLLM";
    const newDesc = "Deploy a human-like WhatsApp AI agent that answers customers, qualifies leads, and closes deals 24/7. Best AI agent for WhatsApp business automation — no Meta API key needed. AI-powered WhatsApp chatbot for sales, support, and lead generation. Setup in 2 minutes. Free trial available.";
    const newUrl = "https://metallm.tech/agent";
    const newImage = "https://metallm.tech/logo.jpeg";
    const newImageAlt = "MetaLLM WhatsApp AI Agent — Business AI Agent for WhatsApp Automation, Sales, and Customer Support";
    const indexDirective = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
    const newKeywords = "whatsapp ai agent, ai agent for whatsapp, whatsapp business ai agent, business whatsapp ai agent, whatsapp ai bot, whatsapp chatbot for business, ai whatsapp integration, whatsapp sales agent, whatsapp automation, automated whatsapp replies, whatsapp ai assistant, ai sales agent whatsapp, whatsapp lead generation ai, whatsapp customer service ai, ai powered whatsapp, whatsapp business automation, ai whatsapp bot for sales, best whatsapp ai agent 2026, whatsapp ai agent no api key, deploy ai agent on whatsapp, whatsapp ai for small business, whatsapp ai agent pricing, whatsapp conversational ai, whatsapp ai customer support, ai agent for whatsapp business, human takeover whatsapp, whatsapp ai chatbot, whatsapp virtual assistant, whatsapp sales automation, ai bot for whatsapp business, whatsapp ai reply bot, whatsapp order taking bot, ai whatsapp agent for restaurants, ai whatsapp agent for ecommerce, best ai chatbot for whatsapp 2026, whatsapp ai integration no code, sell on whatsapp with ai, whatsapp ai sales funnel, whatsapp lead qualification ai, automate whatsapp customer support, ai agent whatsapp free trial, metallm whatsapp agent";

    document.title = newTitle;
    if (metaDescription) metaDescription.setAttribute("content", newDesc);
    if (ogTitle) ogTitle.setAttribute("content", newTitle);
    if (ogDescription) ogDescription.setAttribute("content", newDesc);
    if (twitterTitle) twitterTitle.setAttribute("content", newTitle);
    if (twitterDescription) twitterDescription.setAttribute("content", newDesc);
    if (twitterUrl) twitterUrl.setAttribute("content", newUrl);
    if (ogUrl) ogUrl.setAttribute("content", newUrl);
    if (ogImage) ogImage.setAttribute("content", newImage);
    if (ogImageAlt) ogImageAlt.setAttribute("content", newImageAlt);
    if (twitterImage) twitterImage.setAttribute("content", newImage);
    if (robots) robots.setAttribute("content", indexDirective);
    if (googlebot) googlebot.setAttribute("content", "index, follow");
    if (canonical) canonical.setAttribute("href", newUrl);
    if (metaKeywords) metaKeywords.setAttribute("content", newKeywords);

    const schemaIds = [
      "whatsapp-agent-schema",
      "whatsapp-agent-faq-schema",
      "whatsapp-agent-howto-schema",
      "whatsapp-agent-breadcrumb-schema",
      "whatsapp-agent-product-schema",
      "whatsapp-agent-org-schema",
      "whatsapp-agent-speakable-schema",
    ];

    const schemas = [
      {
        id: "whatsapp-agent-schema",
        data: {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "MetaLLM WhatsApp AI Agent",
          "alternateName": ["WhatsApp AI Agent", "WhatsApp Business AI Agent", "AI Agent for WhatsApp", "WhatsApp AI Bot", "MetaLLM Business Agent"],
          "applicationCategory": "BusinessApplication",
          "applicationSubCategory": "WhatsApp AI Sales Agent",
          "operatingSystem": "Web, iOS, Android, WhatsApp",
          "description": "MetaLLM WhatsApp AI Agent is an autonomous AI-powered sales and customer support agent that runs directly on WhatsApp. It answers customer queries, qualifies leads, captures orders, and closes deals 24/7 — no Meta API key required. Features include human takeover, voice message support, PDF knowledge ingestion, multi-number management, and instant 2-minute setup.",
          "url": newUrl,
          "offers": {
            "@type": "AggregateOffer",
            "priceCurrency": "USD",
            "lowPrice": "59",
            "highPrice": "299",
            "offerCount": "3",
            "offers": [
              { "@type": "Offer", "name": "Starter", "price": "59", "priceCurrency": "USD", "billingDuration": "P1M", "description": "1 WhatsApp number, 800 messages/month, AI-powered customer chat, basic order capture" },
              { "@type": "Offer", "name": "Pro", "price": "129", "priceCurrency": "USD", "billingDuration": "P1M", "description": "3 WhatsApp numbers, 3500 messages/month, faster AI priority, voice support, advanced order flow" },
              { "@type": "Offer", "name": "Enterprise", "price": "299", "priceCurrency": "USD", "billingDuration": "P1M", "description": "5 WhatsApp numbers, 10000 messages/month, fastest AI priority, high-volume order handling, VIP support" }
            ]
          },
          "featureList": [
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
            "Free trial with no credit card required"
          ],
          "screenshot": "https://metallm.tech/logo.jpeg",
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.8",
            "ratingCount": "150",
            "bestRating": "5",
            "worstRating": "1"
          }
        }
      },
      {
        id: "whatsapp-agent-faq-schema",
        data: {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "What is a WhatsApp AI Agent?",
              "acceptedAnswer": { "@type": "Answer", "text": "A WhatsApp AI Agent is an autonomous artificial intelligence bot that operates directly on WhatsApp to handle customer conversations, answer questions, qualify leads, take orders, and close sales 24/7 without human intervention. MetaLLM's WhatsApp AI Agent is specifically designed for businesses to automate their WhatsApp sales and customer support. Unlike basic WhatsApp chatbots that follow rigid scripts, MetaLLM's AI agent understands natural language, handles bad grammar, processes voice notes, and responds like a human sales representative." }
            },
            {
              "@type": "Question",
              "name": "How does MetaLLM's AI Agent for WhatsApp work?",
              "acceptedAnswer": { "@type": "Answer", "text": "MetaLLM's AI Agent for WhatsApp works in 3 simple steps: (1) Scan your WhatsApp QR code to connect your business number — no Meta API key or Business API approval needed. (2) Upload your business knowledge — PDFs, product catalogs, website links, or text descriptions. The AI learns everything about your business in seconds. (3) The AI agent starts handling all incoming WhatsApp messages automatically, answering customer queries, qualifying leads, capturing orders, and closing deals 24/7. You can jump into any conversation anytime with the Human Takeover feature." }
            },
            {
              "@type": "Question",
              "name": "Do I need a Meta API key or WhatsApp Business API for the AI agent?",
              "acceptedAnswer": { "@type": "Answer", "text": "No. MetaLLM's WhatsApp AI Agent does NOT require a Meta API key or WhatsApp Business API approval. You simply scan your WhatsApp QR code — just like linking WhatsApp Web — and your AI agent is live in under 2 minutes. This makes it the easiest WhatsApp AI integration available, accessible to businesses of any size without technical setup or API documentation." }
            },
            {
              "@type": "Question",
              "name": "What is the best AI chatbot for WhatsApp in 2026?",
              "acceptedAnswer": { "@type": "Answer", "text": "MetaLLM is the best AI chatbot for WhatsApp in 2026 because it combines advanced AI language understanding with the simplest setup process. Unlike competitors that require Meta Business API keys, developer setup, or complex integrations, MetaLLM connects via QR code scan in 2 minutes. It features human-like conversation, voice message support, human takeover, multi-number management, PDF knowledge ingestion, and automated order capture — starting at $59/month with a free trial." }
            },
            {
              "@type": "Question",
              "name": "Can the WhatsApp AI agent handle voice messages?",
              "acceptedAnswer": { "@type": "Answer", "text": "Yes. MetaLLM's WhatsApp AI Agent supports voice messages through advanced speech-to-text processing. When a customer sends a voice note on WhatsApp, the AI automatically transcribes it, understands the content, and responds appropriately in text. Voice support is available on Pro ($129/month) and Enterprise ($299/month) plans. This is crucial for markets where voice messages are the primary communication method on WhatsApp." }
            },
            {
              "@type": "Question",
              "name": "What is Human Takeover in WhatsApp AI?",
              "acceptedAnswer": { "@type": "Answer", "text": "Human Takeover is MetaLLM's signature feature that lets you jump into any AI-managed WhatsApp conversation at any time. As soon as you manually reply to a customer, the AI agent instantly pauses and gives you full control — no interference, no conflicting messages. When you're done, the AI resumes handling conversations. This ensures complex negotiations, VIP customers, or sensitive issues always get human attention while routine queries stay automated." }
            },
            {
              "@type": "Question",
              "name": "How much does a WhatsApp AI agent cost?",
              "acceptedAnswer": { "@type": "Answer", "text": "MetaLLM's WhatsApp AI Agent starts at $59/month (Starter: 1 WhatsApp number, 800 messages/month). The Pro plan is $129/month (3 numbers, 3,500 messages, voice support). Enterprise is $299/month (5 numbers, 10,000 messages, VIP support). All plans include a free trial with no credit card required. Compared to hiring a human sales agent ($2,000+/month) or building a custom WhatsApp bot ($5,000+ development cost), MetaLLM is the most cost-effective WhatsApp AI automation solution." }
            },
            {
              "@type": "Question",
              "name": "Can I use the WhatsApp AI agent for my restaurant?",
              "acceptedAnswer": { "@type": "Answer", "text": "Yes. MetaLLM's WhatsApp AI Agent is perfect for restaurants. It can handle menu inquiries, take delivery orders, confirm reservations, answer questions about ingredients and allergens, share business hours, and process repeat orders — all automatically on WhatsApp. Upload your menu as a PDF and the AI instantly learns every dish, price, and option. Restaurants using MetaLLM report capturing 3x more orders from WhatsApp because the AI responds instantly to every message, even during peak hours." }
            },
            {
              "@type": "Question",
              "name": "Is the WhatsApp AI agent suitable for e-commerce businesses?",
              "acceptedAnswer": { "@type": "Answer", "text": "Absolutely. E-commerce businesses use MetaLLM's WhatsApp AI Agent to automate product inquiries, share catalog details, handle sizing/shipping questions, process orders, send payment links, and provide post-purchase support — all directly on WhatsApp. The AI learns your entire product catalog from PDFs or website links and can recommend products, handle objections, and close sales autonomously. It's like having a 24/7 sales team on WhatsApp that never misses a lead." }
            },
            {
              "@type": "Question",
              "name": "How does the WhatsApp AI agent learn about my business?",
              "acceptedAnswer": { "@type": "Answer", "text": "MetaLLM's WhatsApp AI Agent learns about your business through multiple methods: (1) PDF uploads — product catalogs, menus, price lists, FAQs. (2) Website crawling — the AI bootstrap system automatically crawls your website and extracts all relevant business information. (3) Text instructions — you can directly tell the agent about your products, policies, and sales approach. (4) Custom agent files — detailed personality, tools, and product knowledge files. The AI processes all this information in seconds and starts using it immediately in customer conversations." }
            },
            {
              "@type": "Question",
              "name": "Can I manage multiple WhatsApp numbers with one AI agent?",
              "acceptedAnswer": { "@type": "Answer", "text": "Yes. MetaLLM supports multi-WhatsApp number management. Starter plan includes 1 number, Pro plan includes 3 numbers, and Enterprise plan includes 5 numbers. Each number can be connected to the same AI agent with the same business knowledge, or configured independently. This is ideal for businesses with multiple locations, different product lines, or separate customer support and sales channels on WhatsApp." }
            },
            {
              "@type": "Question",
              "name": "How is MetaLLM's WhatsApp AI different from regular WhatsApp chatbots?",
              "acceptedAnswer": { "@type": "Answer", "text": "Regular WhatsApp chatbots follow rigid decision trees and pre-scripted responses — they break when customers ask unexpected questions. MetaLLM's WhatsApp AI Agent uses advanced large language models (LLMs) to understand natural language, context, intent, bad grammar, slang, and even voice messages. It responds like a trained human sales agent, not a bot. Plus, it requires no coding, no API keys, and no flowchart building — just scan a QR code and upload your business knowledge." }
            },
            {
              "@type": "Question",
              "name": "Is there a free trial for the WhatsApp AI agent?",
              "acceptedAnswer": { "@type": "Answer", "text": "Yes. MetaLLM offers a free trial for the WhatsApp AI Agent with no credit card required. You can create your AI agent, connect your WhatsApp number, upload your business knowledge, and test how the agent handles real customer conversations — all before committing to a paid plan. The free trial includes 20 messages so you can fully evaluate the AI's capabilities with your specific business use case." }
            },
            {
              "@type": "Question",
              "name": "What industries benefit most from a WhatsApp AI agent?",
              "acceptedAnswer": { "@type": "Answer", "text": "WhatsApp AI agents deliver the highest ROI for: (1) Restaurants and food delivery — automated order taking and menu inquiries. (2) E-commerce and retail — product recommendations and order processing. (3) Real estate — property inquiries and lead qualification. (4) Healthcare clinics — appointment scheduling and FAQ handling. (5) Education and tutoring — enrollment inquiries and course information. (6) Travel and hospitality — booking assistance and itinerary support. (7) Professional services — consultation scheduling and pricing inquiries. Any business that receives customer inquiries on WhatsApp can benefit from MetaLLM's AI automation." }
            },
            {
              "@type": "Question",
              "name": "How fast does the WhatsApp AI agent respond to customers?",
              "acceptedAnswer": { "@type": "Answer", "text": "MetaLLM's WhatsApp AI Agent responds to customer messages in under 2 seconds — faster than any human agent. This instant response time is critical because studies show 70% of inbound sales are lost due to slow response times. Customers on WhatsApp expect instant replies, and a delay of even 10 minutes means they've likely already contacted your competitor. The AI agent ensures zero missed leads and 24/7 instant engagement." }
            }
          ]
        }
      },
      {
        id: "whatsapp-agent-howto-schema",
        data: {
          "@context": "https://schema.org",
          "@type": "HowTo",
          "name": "How to Deploy an AI Agent on WhatsApp for Your Business",
          "description": "Step-by-step guide to setting up MetaLLM's WhatsApp AI Agent for automated sales, customer support, and lead qualification. No coding or Meta API key required.",
          "totalTime": "PT2M",
          "estimatedCost": { "@type": "MonetaryAmount", "currency": "USD", "value": "0" },
          "tool": [
            { "@type": "HowToTool", "name": "WhatsApp account (personal or business)" },
            { "@type": "HowToTool", "name": "MetaLLM free account" },
            { "@type": "HowToTool", "name": "Business knowledge (PDFs, website, or text)" }
          ],
          "step": [
            { "@type": "HowToStep", "position": 1, "name": "Create a Free MetaLLM Account", "text": "Sign up for a free MetaLLM account at metallm.tech/agent. No credit card required. You can sign up with email or Google in under 10 seconds." },
            { "@type": "HowToStep", "position": 2, "name": "Create Your AI Agent", "text": "Click 'Create Agent' and give your WhatsApp AI agent a name. The AI bootstrap system can automatically crawl your website to learn about your business, or you can manually upload PDFs, product catalogs, and business information." },
            { "@type": "HowToStep", "position": 3, "name": "Connect Your WhatsApp Number", "text": "Scan the QR code with your WhatsApp app — just like connecting to WhatsApp Web. No Meta API key, no Business API approval, no developer setup required. Your AI agent is connected in seconds." },
            { "@type": "HowToStep", "position": 4, "name": "Customize Agent Behavior", "text": "Configure how your AI agent speaks, what products to prioritize, sales scripts, response tone, and escalation rules. Upload additional knowledge files (PDFs, menus, price lists) to make the agent an expert on your business." },
            { "@type": "HowToStep", "position": 5, "name": "Go Live — AI Handles Everything", "text": "Your WhatsApp AI Agent is now live and handling all incoming messages 24/7. It answers customer queries, qualifies leads, captures orders, and closes deals automatically. Use Human Takeover anytime to jump into conversations personally." }
          ]
        }
      },
      {
        id: "whatsapp-agent-breadcrumb-schema",
        data: {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "MetaLLM", "item": "https://metallm.tech/" },
            { "@type": "ListItem", "position": 2, "name": "WhatsApp AI Agent", "item": "https://metallm.tech/agent" }
          ]
        }
      },
      {
        id: "whatsapp-agent-product-schema",
        data: {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "MetaLLM WhatsApp AI Agent",
          "description": "AI-powered WhatsApp sales and customer support agent. Automates lead qualification, order capture, and deal closing 24/7 on WhatsApp. No API key required.",
          "brand": { "@type": "Brand", "name": "MetaLLM" },
          "category": "Business Software > WhatsApp Automation > AI Agent",
          "url": newUrl,
          "image": "https://metallm.tech/logo.jpeg",
          "offers": {
            "@type": "AggregateOffer",
            "priceCurrency": "USD",
            "lowPrice": "59",
            "highPrice": "299",
            "offerCount": "3",
            "availability": "https://schema.org/InStock"
          },
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.8",
            "reviewCount": "150",
            "bestRating": "5",
            "worstRating": "1"
          }
        }
      },
      {
        id: "whatsapp-agent-org-schema",
        data: {
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "MetaLLM",
          "url": "https://metallm.tech",
          "logo": "https://metallm.tech/logo.jpeg",
          "description": "MetaLLM provides AI-powered tools including a multi-model AI aggregator and autonomous WhatsApp AI Agent for business sales automation.",
          "sameAs": [
            "https://x.com/metallmai",
            "https://www.linkedin.com/company/metallmtech/"
          ]
        }
      },
      {
        id: "whatsapp-agent-speakable-schema",
        data: {
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "WhatsApp AI Agent — Automate Sales & Support 24/7 | MetaLLM",
          "url": newUrl,
          "description": newDesc,
          "speakable": {
            "@type": "SpeakableSpecification",
            "cssSelector": ["h1", ".hero-description", "#faq", "#how-it-works"]
          },
          "lastReviewed": "2026-04-27"
        }
      }
    ];

    schemas.forEach(({ id, data }) => {
      if (!document.getElementById(id)) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = id;
        script.text = JSON.stringify(data);
        document.head.appendChild(script);
      }
    });

    return () => {
      document.title = originalTitle;
      if (metaDescription) metaDescription.setAttribute("content", originalDesc);
      if (ogTitle) ogTitle.setAttribute("content", originalOgTitle);
      if (ogDescription) ogDescription.setAttribute("content", originalOgDesc);
      if (twitterTitle) twitterTitle.setAttribute("content", originalTwitterTitle);
      if (twitterDescription) twitterDescription.setAttribute("content", originalTwitterDesc);
      if (twitterUrl) twitterUrl.setAttribute("content", originalTwitterUrl);
      if (ogUrl) ogUrl.setAttribute("content", originalOgUrl);
      if (ogImage) ogImage.setAttribute("content", originalOgImage);
      if (ogImageAlt) ogImageAlt.setAttribute("content", originalOgImageAlt);
      if (twitterImage) twitterImage.setAttribute("content", originalTwitterImage);
      if (robots) robots.setAttribute("content", originalRobots);
      if (googlebot) googlebot.setAttribute("content", originalGooglebot);
      if (canonical) canonical.setAttribute("href", originalCanonical);
      if (metaKeywords) metaKeywords.setAttribute("content", originalKeywords);

      schemaIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    };
  }, []);

  const openAuth = (intent: "signin" | "signup") => {
    setAuthIntent(intent);
    setIsOtpMode(false);
    setAuthModalOpen(true);
  };

  const handleResendOtp = async () => {
    try {
      const response = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        toast({ title: "Code sent", description: "Please check your email." });
      } else {
        throw new Error("Failed to send code");
      }
    } catch {
      toast({ title: "Error", description: "Could not resend code", variant: "destructive" });
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isOtpMode) {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Verification failed");
        
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        setLocation("/business-agent");
      } else {
        const endpoint = authIntent === "signin" ? "/api/auth/login" : "/api/auth/register";
        const body = authIntent === "signin" 
          ? { email, password } 
          : { email, password, firstName, lastName };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (res.status === 403 && data.status === "unverified") {
          setIsOtpMode(true);
          toast({ title: "Verification Required", description: "Please check your email for the code." });
          return;
        }
        if (res.ok && data.status === "pending_verification") {
          setIsOtpMode(true);
          toast({ title: "Code Sent", description: "Please check your email." });
          return;
        }
        if (!res.ok) throw new Error(data.message || "Authentication failed");

        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        setLocation("/business-agent");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-[#25D366]/20">
      {/* Navigation */}
      <nav className="border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366]">
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900">
                Metallm Agent for WhatsApp
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => openAuth("signin")}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Log in
              </button>
              <Button 
                onClick={() => openAuth("signup")}
                className="bg-[#25D366] hover:bg-[#128C7E] text-white shadow-sm border-0"
              >
                Start Free Trial
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative overflow-hidden pt-24 pb-32">
        {/* Interactive Deep Cinematic Background */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {/* Subtle Dot Matrix Background */}
          <div 
            className="absolute inset-0 opacity-[0.4]" 
            style={{ 
              backgroundImage: `radial-gradient(#128C7E 1px, transparent 1px)`,
              backgroundSize: '24px 24px'
            }} 
          />
          
          {/* Ambient Static Orbs (Cinematic feel, optimized) */}
          <div 
            className="absolute top-[10%] right-[10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-[#25D366]/20 to-transparent blur-[100px]" 
          />
          <div 
            className="absolute bottom-[10%] left-[5%] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#128C7E]/15 to-[#25D366]/5 blur-[120px]" 
          />

          {/* Static Soft Center Glow */}
          <div 
            className="absolute inset-0 z-0"
            style={{
              background: `radial-gradient(800px circle at 50% 50%, rgba(37,211,102,0.06), transparent 60%)`,
            }}
          />

          {/* Glassmorphic Fade at Bottom */}
          <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-white to-transparent" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Col - Text & CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-left"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-[#25D366]/10 px-4 py-1.5 mb-8 border border-[#25D366]/20">
                <Zap className="h-4 w-4 text-[#128C7E]" />
                <span className="text-sm font-medium text-[#128C7E]">Turn Conversations into Conversions</span>
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 leading-tight mb-6">
                WhatsApp AI Agent — <span className="text-[#25D366]">Automate Sales</span> & Support 24/7
              </h1>

              <p className="text-xl text-slate-600 mb-10 leading-relaxed max-w-xl">
                Deploy a human-like AI agent for WhatsApp that answers customers, qualifies leads, and closes deals around the clock. The best AI chatbot for WhatsApp business — no Meta API key required. Setup in 2 minutes.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-start gap-4">
                <Button 
                  size="lg" 
                  onClick={() => openAuth("signup")}
                  className="w-full sm:w-auto text-lg h-14 px-8 bg-[#25D366] hover:bg-[#128C7E] text-white shadow-lg shadow-[#25D366]/30 border-0 hover:scale-105 transition-all duration-300"
                >
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <span className="text-sm text-slate-500 font-medium">Try first. Decide later. No credit card required.</span>
              </div>

              <div className="mt-12 flex items-center gap-8 text-sm font-medium text-slate-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#25D366]" />
                  <span>Setup in 2 minutes</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#25D366]" />
                  <span>Works with existing numbers</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#25D366]" />
                  <span>No Meta API key required</span>
                </div>
              </div>
            </motion.div>

            {/* Right Col - Image */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="hidden lg:flex justify-end relative"
            >
              <img
                src="/mobile (1).png"
                alt="WhatsApp AI Agent mobile preview — MetaLLM AI chatbot for WhatsApp business automation, sales, and customer support"
                className="max-h-[600px] w-auto drop-shadow-2xl object-contain z-10 hover:scale-[1.02] transition-transform duration-500"
              />
              {/* Optional decor behind phone */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-[#25D366]/20 to-transparent rounded-full blur-3xl -z-10" />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Psychology/Problem Section */}
      <div className="bg-slate-50 py-24 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                Why Your Business Needs a WhatsApp AI Agent — Stop Losing 70% of Inbound Sales
              </h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Customers on WhatsApp expect instant replies. If you take an hour to respond, they've already bought from your competitor. MetaLLM's AI agent for WhatsApp acts as your best salesperson — instantly greeting leads, answering product questions, and guiding them to a sale 24/7, even while you sleep. No Meta API key or WhatsApp Business API required.
              </p>
              
              <ul className="space-y-4">
                {[
                  "Instant response time (under 2 seconds)",
                  "Understands bad grammar and voice notes",
                  "Escalates to a human only when necessary"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-1 bg-[#25D366]/20 p-1 rounded-full">
                      <CheckCircle2 className="h-4 w-4 text-[#128C7E]" />
                    </div>
                    <span className="text-slate-700 font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-[#128C7E] to-[#25D366] rounded-3xl transform rotate-3 scale-105 opacity-20 blur-xl" />
              <div className="relative bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="bg-[#128C7E] px-4 py-3 flex items-center gap-3 text-white">
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Your AI Assistant</h3>
                    <p className="text-xs text-white/70">Online</p>
                  </div>
                </div>
                <div className="p-4 space-y-4 bg-[#EFEAE2] h-[300px] overflow-y-auto w-full" style={{ backgroundImage: "radial-gradient(circle at top right, rgba(18,140,126,0.12), transparent 45%), radial-gradient(circle at bottom left, rgba(37,211,102,0.10), transparent 40%)" }}>
                  {/* Mock Chat */}
                  <div className="flex justify-end">
                     <div className="bg-[#D9FDD3] px-3 py-2 rounded-lg rounded-tr-none text-sm text-slate-800 shadow-sm max-w-[80%] inline-block text-left">
                        Hi, do you have the premium package available today? I need it urgently.
                        <div className="text-[10px] text-right text-slate-500 mt-1">10:00 AM</div>
                     </div>
                  </div>
                  <div className="flex justify-start">
                     <div className="bg-white px-3 py-2 rounded-lg rounded-tl-none text-sm text-slate-800 shadow-sm max-w-[80%] inline-block text-left">
                        Hi there! 👋 Yes, we have the Premium Package available right now. We can send it out today if you order within the next hour.
                        <br/><br/>
                        Would you like me to send you the secure payment link?
                        <div className="text-[10px] text-right text-slate-500 mt-1">10:00 AM</div>
                     </div>
                  </div>
                   <div className="flex justify-end">
                     <div className="bg-[#D9FDD3] px-3 py-2 rounded-lg rounded-tr-none text-sm text-slate-800 shadow-sm max-w-[80%] inline-block text-left">
                        Yes please!
                        <div className="text-[10px] text-right text-slate-500 mt-1">10:01 AM</div>
                     </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">WhatsApp AI Agent Features — Everything You Need to Automate Sales</h2>
            <p className="text-lg text-slate-600">The best AI chatbot for WhatsApp business. Built for business owners who want results, not complicated tech setups. No coding, no API keys.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <Clock className="h-6 w-6 text-white" />,
                title: "24/7 WhatsApp AI Sales Agent",
                description: "Your AI agent for WhatsApp never sleeps. Capture and convert leads from every timezone while you rest. Responds in under 2 seconds."
              },
              {
                icon: <ShieldCheck className="h-6 w-6 text-white" />,
                title: "AI Learns Your Business Instantly",
                description: "Upload PDFs, product catalogs, or website links. The WhatsApp AI bot learns everything about your business, products, and pricing in seconds."
              },
              {
                icon: <MessageSquare className="h-6 w-6 text-white" />,
                title: "No API Key — QR Code Setup",
                description: "No Meta API key or WhatsApp Business API required. Scan your WhatsApp QR code and your AI chatbot is live in 60 seconds. Zero coding needed."
              },
              {
                icon: <BarChart3 className="h-6 w-6 text-white" />,
                title: "Custom AI Agent Personality",
                description: "Configure your WhatsApp AI agent's sales personality. Set tone, priorities, closing strategies, and escalation rules. Full control over how it sells."
              }
            ].map((feature, i) => (
              <div key={i} className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-12 w-12 bg-[#25D366] rounded-xl flex items-center justify-center mb-6 shadow-sm">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Standout Text-Based Feature: Human Takeover */}
      <div className="py-24 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="text-5xl md:text-7xl font-black text-slate-900 mb-8 tracking-tighter">
              Human <span className="text-[#25D366]">Takeover.</span>
            </h2>
            <p className="text-2xl md:text-3xl text-slate-600 max-w-4xl mx-auto leading-tight font-medium">
              Jump into any WhatsApp AI conversation anytime. As soon as you reply, the AI agent pauses instantly — giving you full control with zero interference. The best of AI automation + human touch.
            </p>
            <div className="mt-12 flex justify-center gap-4 items-center text-[#128C7E] font-bold text-lg">
              <Zap className="w-6 h-6 animate-pulse" />
              <span>Instant AI Pausing</span>
            </div>
          </motion.div>
        </div>
      </div>
      {/* Competitor Comparison Section — MetaLLM vs Respond.io vs Wati */}
      <div className="py-24 bg-white border-t border-slate-100" id="compare">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-slate-900 mb-4"
            >
              MetaLLM WhatsApp Agent vs Respond.io vs Wati
            </motion.h2>
            <p className="text-lg text-slate-600">See why businesses choose MetaLLM over traditional WhatsApp automation platforms</p>
          </div>

          {/* Main Comparison Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden mb-16">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 font-semibold text-slate-900 min-w-[200px]">Feature</th>
                    <th className="p-4 font-bold text-[#128C7E] bg-[#25D366]/5 text-center min-w-[140px]">MetaLLM Agent</th>
                    <th className="p-4 font-semibold text-slate-600 text-center min-w-[140px]">Respond.io</th>
                    <th className="p-4 font-semibold text-slate-600 text-center min-w-[140px]">Wati</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {[
                    { feature: "Setup Time", meta: "2 minutes (QR scan)", respond: "Days–weeks (API setup)", wati: "Hours (API approval)" },
                    { feature: "Meta API Key Required", meta: false, respond: true, wati: true },
                    { feature: "AI-Powered Conversations", meta: true, respond: "Basic (rule-based)", wati: "Basic (template-based)" },
                    { feature: "Understands Natural Language", meta: true, respond: false, wati: false },
                    { feature: "Voice Message Support", meta: true, respond: false, wati: false },
                    { feature: "Human Takeover (Instant)", meta: true, respond: true, wati: true },
                    { feature: "Learns from PDFs/Website", meta: true, respond: false, wati: false },
                    { feature: "Autonomous Lead Qualification", meta: true, respond: "Manual flows", wati: "Manual flows" },
                    { feature: "Autonomous Order Capture", meta: true, respond: "Needs integration", wati: "Template-based" },
                    { feature: "Multi-Number Management", meta: true, respond: true, wati: true },
                    { feature: "Custom Agent Personality", meta: true, respond: false, wati: false },
                    { feature: "No-Code Setup", meta: true, respond: false, wati: "Partial" },
                    { feature: "Broadcast Messages", meta: "Coming soon", respond: true, wati: true },
                    { feature: "CRM Integrations", meta: "Coming soon", respond: true, wati: true },
                    { feature: "Starting Price", meta: "$59/mo", respond: "$99/mo", wati: "$49/mo + API costs" },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-medium text-slate-900">{row.feature}</td>
                      <td className="p-4 bg-[#25D366]/5 text-center">
                        {typeof row.meta === "boolean" ? (
                          row.meta ? <CheckCircle2 className="w-5 h-5 text-[#25D366] mx-auto" /> : <X className="w-5 h-5 text-red-400 mx-auto" />
                        ) : (
                          <span className="text-xs font-medium text-[#128C7E]">{row.meta}</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {typeof row.respond === "boolean" ? (
                          row.respond ? <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-red-400 mx-auto" />
                        ) : (
                          <span className="text-xs text-slate-500">{row.respond}</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {typeof row.wati === "boolean" ? (
                          row.wati ? <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-red-400 mx-auto" />
                        ) : (
                          <span className="text-xs text-slate-500">{row.wati}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Individual Competitor Breakdowns */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {/* vs Respond.io */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm"
            >
              <h3 className="text-xl font-bold text-slate-900 mb-4">MetaLLM Agent vs Respond.io</h3>
              <p className="text-sm text-slate-600 mb-6">Respond.io is a messaging platform that requires Meta Business API approval, developer setup, and complex workflow builders. MetaLLM's AI agent connects via QR code and handles conversations autonomously.</p>
              <ul className="space-y-3">
                {[
                  "No Meta API key needed — scan QR in 2 minutes vs days of API setup",
                  "True AI conversations vs rigid rule-based flowcharts",
                  "Learns from your PDFs instantly vs manual workflow building",
                  "Voice message understanding vs text-only support",
                  "Starts at $59/mo vs Respond.io at $99/mo minimum",
                  "AI qualifies leads autonomously vs manual flow logic",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-[#25D366] shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* vs Wati */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm"
            >
              <h3 className="text-xl font-bold text-slate-900 mb-4">MetaLLM Agent vs Wati</h3>
              <p className="text-sm text-slate-600 mb-6">Wati is a WhatsApp Business API solution focused on templates and broadcasts. It requires API approval and uses template-based responses. MetaLLM's AI agent thinks and responds like a human.</p>
              <ul className="space-y-3">
                {[
                  "AI understands natural language vs template-based scripted replies",
                  "No API key or Meta approval needed vs mandatory Business API setup",
                  "Handles messy grammar, slang, and voice notes vs rigid templates",
                  "Custom AI personality vs fixed response flows",
                  "$59/mo all-inclusive vs $49/mo + per-conversation API charges",
                  "Autonomous selling vs manual template triggering",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-[#25D366] shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          {/* Chatbot vs MetaLLM AI Agent Section */}
          <div className="bg-slate-50 rounded-3xl p-8 md:p-12 border border-slate-200">
            <div className="text-center mb-10">
              <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">Traditional Chatbots vs MetaLLM AI Agent</h3>
              <p className="text-slate-600">Why rule-based chatbots fail and AI agents convert</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Traditional Chatbot */}
              <div className="bg-white rounded-2xl p-6 border border-red-100">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 bg-red-100 rounded-lg flex items-center justify-center">
                    <X className="h-4 w-4 text-red-500" />
                  </div>
                  <h4 className="font-bold text-slate-900">Traditional Chatbot</h4>
                </div>
                <ul className="space-y-3 text-sm text-slate-600">
                  {[
                    "Follows rigid decision trees — breaks on unexpected questions",
                    "Requires hours of flowchart building for each scenario",
                    "Cannot understand bad grammar, typos, or slang",
                    "No voice message support — text-only",
                    "Gives scripted, robotic responses that feel impersonal",
                    "Needs constant manual updating as your business changes",
                    "Customers feel like they're talking to a machine",
                    "High drop-off rate when chatbot can't understand the query",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <X className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* MetaLLM AI Agent */}
              <div className="bg-white rounded-2xl p-6 border border-[#25D366]/30">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 bg-[#25D366]/10 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-[#25D366]" />
                  </div>
                  <h4 className="font-bold text-slate-900">MetaLLM AI Agent</h4>
                </div>
                <ul className="space-y-3 text-sm text-slate-600">
                  {[
                    "Understands natural language — handles ANY question intelligently",
                    "Upload a PDF and it learns your entire business in seconds",
                    "Processes bad grammar, typos, slang, and abbreviations perfectly",
                    "Supports voice messages via speech-to-text transcription",
                    "Responds like a trained human sales representative",
                    "Auto-updates when you upload new knowledge or products",
                    "Customers can't tell it's AI — human-like conversations",
                    "High conversion rate — responds instantly and never gives up",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#25D366] shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Button
                onClick={() => openAuth("signup")}
                className="bg-[#25D366] hover:bg-[#128C7E] text-white font-bold px-8 h-12 shadow-lg shadow-[#25D366]/20"
              >
                Switch to AI Agent — Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div className="py-24 bg-slate-50 border-t border-slate-100" id="pricing">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight"
            >
              WhatsApp AI Agent Pricing — Simple & Transparent
            </motion.h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto relative lg:items-center">
            {/* Starter Plan */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col"
            >
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3 w-3 rounded-full bg-[#25D366]"></div>
                  <h3 className="text-xl font-bold text-slate-900">Starter</h3>
                </div>
                <p className="text-slate-500 text-sm font-medium h-5">Best for trying it out</p>
              </div>
              <div className="mb-8">
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-extrabold text-slate-900">$59</span>
                  <span className="text-slate-500 mb-1">/month</span>
                </div>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {[
                  "1 WhatsApp number",
                  "800 messages / month",
                  "AI handles customer chats",
                  "Order capture (basic)",
                  "Standard support"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#25D366] shrink-0" />
                    <span className="text-slate-700">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button 
                onClick={() => openAuth("signup")}
                className="w-full h-12 bg-white border-2 border-slate-200 text-slate-900 hover:border-[#25D366] hover:bg-slate-50 font-bold text-base transition-colors"
                variant="outline"
              >
                Start Free Trial
              </Button>
            </motion.div>

            {/* Pro Plan (Highlighted) */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-3xl p-8 border-2 border-[#25D366] shadow-[0_20px_50px_rgba(37,211,102,0.15)] flex flex-col relative transform lg:-translate-y-4"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#25D366] text-white px-4 py-1 rounded-full text-sm font-bold shadow-md flex items-center gap-1">
                <span>⭐</span> Most Popular
              </div>
              <div className="mb-6 mt-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3 w-3 rounded-full bg-amber-400"></div>
                  <h3 className="text-xl font-bold text-slate-900">Pro</h3>
                </div>
                <p className="text-[#128C7E] text-sm font-semibold h-5">For growing restaurants</p>
              </div>
              <div className="mb-8">
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-extrabold text-slate-900">$129</span>
                  <span className="text-slate-500 mb-1">/month</span>
                </div>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {[
                  "3 WhatsApp numbers",
                  "3,500 messages / month",
                  "Faster AI response priority",
                  "Order handling + better flow",
                  "Voice support (speech to text)",
                  "Priority support"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#25D366] shrink-0" />
                    <span className="text-slate-800 font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button 
                onClick={() => openAuth("signup")}
                className="w-full h-14 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold text-lg shadow-lg shadow-[#25D366]/30 transition-all hover:scale-[1.02]"
              >
                Start Free Trial
              </Button>
            </motion.div>

            {/* Enterprise Plan */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-xl flex flex-col text-white"
            >
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3 w-3 rounded-full bg-rose-500"></div>
                  <h3 className="text-xl font-bold text-white">Enterprise</h3>
                </div>
                <p className="text-slate-400 text-sm font-medium h-5">For high-volume businesses</p>
              </div>
              <div className="mb-8">
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-extrabold text-white">$299</span>
                  <span className="text-slate-400 mb-1">/month</span>
                </div>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {[
                  "5 WhatsApp numbers",
                  "10,000 messages / month",
                  "Fastest AI response priority",
                  "High-volume order handling",
                  "Voice support (speech to text)",
                  "VIP support"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#25D366] shrink-0" />
                    <span className="text-slate-300">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button 
                onClick={() => openAuth("signup")}
                className="w-full h-12 bg-white text-slate-900 hover:bg-slate-200 font-bold text-base transition-colors"
              >
                Start Free Trial
              </Button>
            </motion.div>
          </div>

          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-16 text-center space-y-4"
          >
            <p className="text-slate-500 font-medium text-sm">
              <ShieldCheck className="w-4 h-4 inline-block mr-1 text-[#25D366]" />
              No setup fees. Cancel anytime.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="bg-slate-900 py-20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#25D366] rounded-full blur-[100px] opacity-20" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#128C7E] rounded-full blur-[100px] opacity-20" />
        
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Deploy Your WhatsApp AI Agent Now — Stop Losing Sales</h2>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
            Create your AI agent for WhatsApp in 2 minutes. Free trial — no credit card required. See how it handles real customer conversations before you commit.
          </p>
          <Button 
            size="lg" 
            onClick={() => openAuth("signup")}
            className="text-lg h-14 px-10 bg-[#25D366] hover:bg-[#128C7E] text-white shadow-xl shadow-[#25D366]/20 border-0 hover:scale-105 transition-all duration-300"
          >
            Create My Agent Now
          </Button>
        </div>
      </div>

      {/* Floating WhatsApp Contact Button — Right Side */}
      <a
        href="https://wa.me/447868136874?text=Hi%2C%20I%27m%20interested%20in%20the%20WhatsApp%20AI%20Agent.%20Can%20you%20tell%20me%20more%3F"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] shadow-lg shadow-[#25D366]/30 hover:scale-110 hover:shadow-xl transition-all duration-300"
        aria-label="Chat with us on WhatsApp"
      >
        <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        {/* Red unread badge */}
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
          1
        </span>
      </a>

      {/* Custom Auth Modal specifically built for Landing Page */}
      <Dialog open={authModalOpen} onOpenChange={setAuthModalOpen}>
        <DialogContent className="sm:max-w-xl bg-slate-50 border-0 shadow-2xl rounded-2xl p-0 overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* Left Info Panel */}
            <div className="hidden md:flex flex-col justify-between bg-gradient-to-br from-[#128C7E] to-[#25D366] w-[40%] p-8 text-white">
               <div>
                  <div className="flex items-center gap-2 mb-8 opacity-90">
                     <MessageSquare className="w-5 h-5" />
                     <span className="font-bold tracking-tight">Agent AI</span>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <h3 className="text-2xl font-bold mb-4 leading-tight">Automate your inbound sales</h3>
                    <p className="text-white/80 text-sm leading-relaxed mb-6">Create a personalized AI agent that understands your products and closes deals directly on WhatsApp.</p>
                  </motion.div>
                  
                  <div className="space-y-3">
                     {[
                       "Instantly reply to leads",
                       "Integrates with your #",
                       "Learn from your PDFs"
                     ].map((item, i) => (
                       <motion.div 
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + i * 0.1 }}
                        className="flex items-center gap-2 text-sm text-white/90"
                       >
                         <CheckCircle2 className="w-4 h-4 text-white" /> {item}
                       </motion.div>
                     ))}
                  </div>
               </div>
               
               <div className="mt-8 pt-6 border-t border-white/20">
                  <p className="text-xs text-white/70 italic">Businesses closing more deals on autopilot.</p>
               </div>
            </div>

            {/* Right Auth Panel */}
            <div className="w-full md:w-[60%] p-6 sm:p-8 bg-white">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold text-slate-900 mb-1">
                  {isOtpMode ? "Verify Email" : authIntent === "signin" ? "Welcome Back" : "Create Your Agent"}
                </DialogTitle>
                <DialogDescription className="text-slate-500 mb-2">
                  {isOtpMode ? `Enter the code sent to ${email}` : authIntent === "signin" ? "Access your workspace to continue." : "Sign up in 10 seconds to get your agent."}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-6 space-y-5">
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  {isOtpMode ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-center gap-2 text-[#128C7E] font-semibold mb-2">
                          <Shield className="w-5 h-5" />
                          <span>Enter verification code</span>
                      </div>
                      <div className="space-y-4">
                        <Input
                          id="otp"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="000000"
                          className="h-14 bg-white text-slate-900 border-slate-300 focus:border-[#25D366] focus:ring-[#25D366] placeholder:text-slate-300 font-bold tracking-[0.5em] text-center text-2xl"
                          required
                          autoFocus
                        />
                        <div className="text-center">
                          <button type="button" onClick={handleResendOtp} className="text-sm text-[#128C7E] hover:text-[#075E54] hover:underline font-medium transition-colors">
                              Resend Verification Code
                          </button>
                        </div>
                      </div>
                      <button type="button" className="px-0 text-sm text-slate-500 font-medium hover:underline hover:text-slate-700 transition-colors" onClick={() => setIsOtpMode(false)}>
                        ← Back to {authIntent === 'signin' ? 'Sign In' : 'Sign Up'}
                      </button>
                    </div>
                  ) : (
                    <>
                      {authIntent === "signup" && (
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="space-y-2">
                            <Label htmlFor="firstName" className="text-slate-700 font-semibold text-xs uppercase tracking-wider">First Name</Label>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <Input
                                id="firstName"
                                placeholder="John"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                className="pl-9 h-11 bg-white text-slate-900 border-slate-300 focus:border-[#25D366] focus:ring-[#25D366]"
                                required={authIntent === "signup"}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="lastName" className="text-slate-700 font-semibold text-xs uppercase tracking-wider">Last Name</Label>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <Input
                                id="lastName"
                                placeholder="Doe"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                className="pl-9 h-11 bg-white text-slate-900 border-slate-300 focus:border-[#25D366] focus:ring-[#25D366]"
                                required={authIntent === "signup"}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-slate-700 font-semibold text-xs uppercase tracking-wider">Business Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            id="email"
                            type="email"
                            placeholder="founder@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="pl-9 h-11 bg-white text-slate-900 border-slate-300 focus:border-[#25D366] focus:ring-[#25D366] placeholder:text-slate-400"
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-slate-700 font-semibold text-xs uppercase tracking-wider">Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pl-9 pr-10 h-11 bg-white text-slate-900 border-slate-300 focus:border-[#25D366] focus:ring-[#25D366] placeholder:text-slate-400"
                            required
                            minLength={6}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {authIntent === "signin" && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setLocation("/forgot-password")}
                              className="text-xs font-medium text-[#128C7E] hover:underline"
                            >
                              Forgot password?
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold text-base tracking-wide"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : isOtpMode ? "Verify & Access" : authIntent === "signin" ? "Sign In" : "Start For Free"}
                  </Button>
                </form>

                {!isOtpMode && (
                  <>
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-200" />
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="bg-white px-4 font-medium text-slate-400">Or seamlessly continue with</span>
                      </div>
                    </div>

                    <a href="/api/auth/google?web_redirect=/business-agent" className="block">
                      <Button type="button" variant="outline" className="w-full h-12 border-slate-300 text-slate-700 bg-white hover:bg-slate-50 font-medium">
                        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Sign up with Google
                      </Button>
                    </a>
                    
                    <div className="text-center mt-6">
                      <button 
                        type="button"
                        onClick={() => setAuthIntent(authIntent === "signin" ? "signup" : "signin")} 
                        className="text-sm font-semibold text-[#128C7E] hover:text-[#075E54] hover:underline"
                      >
                        {authIntent === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
