import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Zap, Shield, Users, Clock, Brain, Target, ArrowRight, CheckCircle2,
  Sparkles, BarChart3, GraduationCap, FlaskConical, Rocket, ChevronDown,
  Star, Play, TrendingUp, Globe, Lock, MessageSquare
} from "lucide-react";
import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion";

/* ─── Intersection Observer hook for scroll-triggered animations ─── */
function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: threshold });
  return { ref, isInView };
}

/* ─── Stagger container variants ─── */
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.8 } },
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

/* ─── Floating particles component ─── */
function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 4 + 2,
            height: Math.random() * 4 + 2,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            background: i % 3 === 0
              ? "rgba(212, 175, 55, 0.4)"
              : i % 3 === 1
                ? "rgba(139, 92, 246, 0.3)"
                : "rgba(34, 197, 94, 0.3)",
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.8, 0.2],
          }}
          transition={{
            duration: Math.random() * 4 + 3,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/* ─── Animated counter ─── */
function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const step = target / 60;
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, target]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

/* ─── Model Logo Carousel ─── */
function ModelLogoCarousel() {
  const models = [
    { name: "Gemini", src: "/icons/gemini.svg" },
    { name: "DeepSeek", src: "/icons/deepseek.svg" },
    { name: "Meta LLaMA", src: "/icons/meta.svg" },
    { name: "Mistral", src: "/icons/mistral.svg" },
    { name: "Qwen", src: "/icons/qwen.svg" },
    { name: "NVIDIA", src: "/icons/nvidia.svg" },
    { name: "GLM", src: "/icons/glm.svg" },
  ];

  return (
    <div className="relative overflow-hidden py-6" aria-label="Supported AI models">
      <div className="flex animate-scroll-logos gap-16 items-center">
        {[...models, ...models].map((model, i) => (
          <div key={i} className="flex items-center gap-3 shrink-0 opacity-50 hover:opacity-100 transition-opacity duration-300 group">
            <img
              src={model.src}
              alt={`${model.name} AI model logo`}
              className="w-8 h-8 grayscale group-hover:grayscale-0 transition-all duration-300"
              loading="lazy"
            />
            <span className="text-sm font-medium text-muted-foreground group-hover:text-white transition-colors whitespace-nowrap">
              {model.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Testimonial data ─── */
const testimonials = [
  {
    quote: "MetaLLM cut my literature review from 3 days to 4 hours. The multi-model synthesis catches nuances no single AI would.",
    name: "Sarah K.",
    role: "PhD Researcher, MIT",
    avatar: "SK",
  },
  {
    quote: "As a founder, every decision costs time and money. MetaLLM gives me 5 expert-level perspectives in one query. Game changer.",
    name: "Ahmed R.",
    role: "CEO, TechVenture",
    avatar: "AR",
  },
  {
    quote: "I used to spend hours comparing ChatGPT vs Claude answers. Now MetaLLM does it instantly with a synthesized summary.",
    name: "Priya M.",
    role: "CS Student, Stanford",
    avatar: "PM",
  },
];

/* ─── FAQ data ─── */
const faqs = [
  {
    q: "What is MetaLLM and how does it work?",
    a: "MetaLLM is an AI aggregator that sends your query to multiple leading AI models — GPT-4, Claude, Gemini, DeepSeek, and more — simultaneously. It then synthesizes all responses into one unified, comprehensive answer, saving you hours of tab-switching and manual comparison."
  },
  {
    q: "Who is MetaLLM designed for?",
    a: "MetaLLM is built for anyone who values time and accuracy: university students working on research papers, academic researchers needing multi-perspective analysis, startup founders making rapid data-driven decisions, and professionals who want the best possible AI-assisted insights."
  },
  {
    q: "How much time does MetaLLM save?",
    a: "Users report saving 10× their typical research time. Instead of querying 5+ AI models separately, comparing responses, and synthesizing manually, MetaLLM does this entire workflow in seconds with a single query."
  },
  {
    q: "Which AI models does MetaLLM support?",
    a: "MetaLLM integrates with GPT-4 (OpenAI), Claude (Anthropic), Gemini (Google), DeepSeek, Mistral, Qwen, Meta LLaMA, NVIDIA NIM, and more. We continuously add new models as they become available."
  },
  {
    q: "Is my data secure on MetaLLM?",
    a: "Absolutely. MetaLLM uses enterprise-grade encryption, secure OAuth authentication, and never stores your queries beyond your session history. Your intellectual property remains yours."
  },
];

/* ════════════════════════════════════════════════════════════════════════════ */
/*  MAIN LANDING COMPONENT                                                     */
/* ════════════════════════════════════════════════════════════════════════════ */

export default function Landing() {
  const { scrollYProgress } = useScroll();
  const heroParallax = useTransform(scrollYProgress, [0, 0.3], [0, -60]);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const features = [
    {
      icon: <Zap className="w-6 h-6" />,
      title: "10× Faster Research",
      description: "Why query one AI when you can query them all? Get multi-model answers in the time it takes to type one prompt.",
      color: "from-amber-500/20 to-yellow-500/10",
      iconColor: "text-amber-400",
    },
    {
      icon: <Brain className="w-6 h-6" />,
      title: "Cognitive Load Reduction",
      description: "Your brain shouldn't waste energy comparing tabs. MetaLLM synthesizes conflicting AI viewpoints into clear, actionable intelligence.",
      color: "from-purple-500/20 to-violet-500/10",
      iconColor: "text-purple-400",
    },
    {
      icon: <Target className="w-6 h-6" />,
      title: "Decision-Grade Accuracy",
      description: "Single-model AI has blind spots. Multi-model consensus eliminates hallucinations and gives you answers you can trust.",
      color: "from-emerald-500/20 to-green-500/10",
      iconColor: "text-emerald-400",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Bias Elimination",
      description: "Every AI model has biases. Cross-referencing multiple models reveals the truth that any single model might miss.",
      color: "from-cyan-500/20 to-blue-500/10",
      iconColor: "text-cyan-400",
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "Role-Based Analysis",
      description: "Get perspectives tailored to your context — whether you're a developer debugging code, a researcher analyzing data, or a founder evaluating markets.",
      color: "from-rose-500/20 to-pink-500/10",
      iconColor: "text-rose-400",
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: "AI Model Intelligence",
      description: "MetaLLM's orchestrator knows each model's strengths and automatically routes your query for optimal results.",
      color: "from-amber-500/20 to-orange-500/10",
      iconColor: "text-amber-300",
    },
  ];

  const audienceCards = [
    {
      icon: <GraduationCap className="w-8 h-8" />,
      title: "Students",
      tagline: "Research smarter, not harder",
      pain: "Tired of spending hours comparing ChatGPT vs Claude for your thesis?",
      solution: "MetaLLM gives you a synthesized, multi-perspective answer in one click — with citations from multiple AI models.",
      stat: "75% less time on research papers",
      color: "border-amber-500/30 hover:border-amber-400/60",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-400",
    },
    {
      icon: <FlaskConical className="w-8 h-8" />,
      title: "Researchers",
      tagline: "Multi-perspective analysis, instantly",
      pain: "Need to cross-reference findings across multiple AI knowledge bases?",
      solution: "MetaLLM queries all leading models simultaneously and synthesizes conflicting viewpoints into actionable insights.",
      stat: "10× faster literature reviews",
      color: "border-purple-500/30 hover:border-purple-400/60",
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-400",
    },
    {
      icon: <Rocket className="w-8 h-8" />,
      title: "Founders",
      tagline: "Decisions backed by AI consensus",
      pain: "Every wrong decision costs time and money you don't have?",
      solution: "MetaLLM gives you decision-grade intelligence from 7+ AI models so you can move fast with confidence.",
      stat: "90% more confident decisions",
      color: "border-emerald-500/30 hover:border-emerald-400/60",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
    },
  ];

  const stats = [
    { value: 7, suffix: "+", label: "AI Models Integrated" },
    { value: 10, suffix: "×", label: "Faster Than Manual Research" },
    { value: 98, suffix: "%", label: "User Satisfaction Rate" },
    { value: 50000, suffix: "+", label: "Queries Processed" },
  ];

  const howItWorks = [
    {
      step: "01",
      title: "Ask Your Question",
      description: "Type any question, research query, or analysis request — just like you would with any AI chatbot.",
      icon: <MessageSquare className="w-6 h-6" />,
    },
    {
      step: "02",
      title: "AI Models Analyze Simultaneously",
      description: "MetaLLM sends your query to GPT-4, Claude, Gemini, DeepSeek and more — all at the same time.",
      icon: <Globe className="w-6 h-6" />,
    },
    {
      step: "03",
      title: "Get One Unified Answer",
      description: "Our AI orchestrator synthesizes all responses, resolves conflicts, and delivers a comprehensive analysis you can trust.",
      icon: <Sparkles className="w-6 h-6" />,
    },
  ];

  /* ── Scroll reveal refs ── */
  const statsReveal = useScrollReveal();
  const featuresReveal = useScrollReveal();
  const audienceReveal = useScrollReveal();
  const howReveal = useScrollReveal();
  const testimonialsReveal = useScrollReveal();
  const faqReveal = useScrollReveal();
  const ctaReveal = useScrollReveal();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden selection:bg-amber-500/30 selection:text-amber-100">

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* NAVBAR                                                                 */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <nav className="fixed w-full z-50 top-0 left-0 border-b border-white/5 bg-background/70 backdrop-blur-xl" role="navigation" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 group" aria-label="MetaLLM Home">
            <motion.img
              src="/logo.jpeg"
              alt="MetaLLM Logo - AI Aggregator Platform"
              className="w-10 h-10 rounded-lg ring-1 ring-amber-500/20 group-hover:ring-amber-400/50 transition-all"
              whileHover={{ scale: 1.05, rotate: 2 }}
              transition={{ type: "spring", stiffness: 300 }}
            />
            <span className="text-xl font-bold font-display tracking-tight">
              Meta<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">LLM</span>
            </span>
          </a>
          <div className="flex items-center gap-2 sm:gap-4">
            <a href="#features" className="hidden md:inline-flex text-sm text-muted-foreground hover:text-white transition-colors px-3 py-2">
              Features
            </a>
            <a href="#how-it-works" className="hidden md:inline-flex text-sm text-muted-foreground hover:text-white transition-colors px-3 py-2">
              How It Works
            </a>
            <a href="#faq" className="hidden md:inline-flex text-sm text-muted-foreground hover:text-white transition-colors px-3 py-2">
              FAQ
            </a>
            <a href="/login">
              <Button variant="ghost" className="hidden sm:inline-flex hover:text-white text-muted-foreground">Sign In</Button>
            </a>
            <a href="/login">
              <Button className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-semibold shadow-lg shadow-amber-500/25 hover:shadow-amber-400/40 transition-all duration-300">
                Get Started Free
              </Button>
            </a>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* HERO SECTION                                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative pt-28 pb-16 lg:pt-40 lg:pb-24 overflow-hidden" aria-labelledby="hero-heading">
        {/* Background effects */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-20 right-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[150px] animate-pulse" />
          <div className="absolute top-40 left-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-emerald-500/8 rounded-full blur-[100px]" />
          <FloatingParticles />
        </div>

        <motion.div style={{ y: heroParallax }} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            {/* Trust badge */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-amber-500/20 bg-amber-500/5 mb-8"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-300/90 font-medium">Trusted by 5,000+ researchers & founders</span>
            </motion.div>

            <motion.h1
              id="hero-heading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold font-display tracking-tight mb-6 leading-[1.1]"
            >
              <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/50">
                Stop Guessing.
              </span>
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400" style={{ textShadow: "0 0 40px rgba(212,175,55,0.3)" }}>
                Start Knowing.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="max-w-2xl mx-auto text-lg sm:text-xl text-muted-foreground mb-10 leading-relaxed"
            >
              Every minute you spend switching between AI tools is a minute wasted.{" "}
              <strong className="text-white">MetaLLM queries GPT-4, Claude, Gemini & more simultaneously</strong>{" "}
              and synthesizes one accurate, comprehensive answer — so you can make decisions faster.
            </motion.p>

            {/* CTA buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6"
            >
              <a href="/login">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-14 px-10 text-lg bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-bold shadow-xl shadow-amber-500/30 hover:shadow-amber-400/50 transition-all duration-300 group"
                >
                  Start Free — No Credit Card
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>
              <a href="#how-it-works">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-14 px-10 text-lg border-white/10 hover:bg-white/5 hover:border-amber-500/30 transition-all duration-300"
                >
                  <Play className="w-5 h-5 mr-2" />
                  See How It Works
                </Button>
              </a>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="text-sm text-muted-foreground/60"
            >
              Free forever for basic use · No credit card required · 2-minute setup
            </motion.p>
          </div>

          {/* Hero Dashboard Image */}
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.5, duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="mt-16 relative mx-auto max-w-5xl"
          >
            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-amber-500/10 relative group">
              <img
                src="/hero-dashboard.png"
                alt="MetaLLM AI Aggregator Dashboard - Multiple AI models synthesizing unified analysis"
                className="w-full h-auto transition-transform duration-700 group-hover:scale-[1.02]"
                loading="eager"
                width={1200}
                height={675}
              />
              {/* Animated shimmer overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1500" />
            </div>
            {/* Glow effect */}
            <div className="absolute -inset-6 bg-gradient-to-t from-amber-500/15 via-purple-500/5 to-transparent blur-3xl -z-10 rounded-full opacity-60" />
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="hidden lg:flex justify-center mt-12"
        >
          <ChevronDown className="w-6 h-6 text-muted-foreground/40" />
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODEL LOGOS BAR                                                        */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative border-y border-white/5 bg-black/20 py-8" aria-label="Supported AI models">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground/60 mb-4 uppercase tracking-widest font-medium">
            Powered by the world's leading AI models
          </p>
          <ModelLogoCarousel />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SOCIAL PROOF STATS                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 relative" aria-label="Statistics" ref={statsReveal.ref}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={statsReveal.isInView ? "visible" : "hidden"}
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {stats.map((stat, i) => (
              <motion.div key={i} variants={fadeUp} className="text-center">
                <div className="text-3xl sm:text-4xl md:text-5xl font-bold font-display bg-clip-text text-transparent bg-gradient-to-br from-amber-300 to-yellow-400">
                  {statsReveal.isInView && <AnimatedCounter target={stat.value} suffix={stat.suffix} />}
                </div>
                <p className="mt-2 text-sm sm:text-base text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* PAIN POINT → SOLUTION (Psychology: Loss Aversion)                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden" aria-labelledby="problem-heading">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[200px]" />
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-16"
          >
            <h2 id="problem-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mb-6">
              Every Hour You Spend Switching AI Tabs
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">Is an Hour You'll Never Get Back</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              The average researcher loses <strong className="text-white">12+ hours per week</strong> copy-pasting between ChatGPT, Claude, and Gemini.
              That's <strong className="text-amber-400">624 hours per year</strong> — almost a month of your life.</p>
          </motion.div>

          {/* Before/After comparison */}
          <div className="grid md:grid-cols-2 gap-8 items-stretch">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 space-y-4"
            >
              <div className="flex items-center gap-2 text-red-400 font-semibold text-lg mb-4">
                <Clock className="w-6 h-6" />
                Without MetaLLM
              </div>
              {[
                "Open 5+ AI tabs",
                "Type the same query 5 times",
                "Wait for each response separately",
                "Manually compare & synthesize",
                "Second-guess which AI is right",
                "Repeat for every new question",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500/60 shrink-0" />
                  {item}
                </div>
              ))}
              <p className="text-red-400/80 text-sm font-medium pt-4 border-t border-red-500/10">
                ⏱ Average time: 25-40 minutes per question
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 space-y-4"
            >
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-lg mb-4">
                <Zap className="w-6 h-6" />
                With MetaLLM
              </div>
              {[
                "One query, one platform",
                "All models queried simultaneously",
                "AI synthesizes & resolves conflicts",
                "Get a unified, accurate answer",
                "Multi-model consensus = confidence",
                "Save 10× time on every question",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  {item}
                </div>
              ))}
              <p className="text-emerald-400/80 text-sm font-medium pt-4 border-t border-emerald-500/10">
                ⚡ Average time: 30 seconds per question
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FEATURES GRID                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section id="features" className="py-24 bg-gradient-to-b from-black/20 to-transparent border-t border-white/5" aria-labelledby="features-heading" ref={featuresReveal.ref}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={featuresReveal.isInView ? "visible" : "hidden"}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp}>
              <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest">Why MetaLLM</span>
              <h2 id="features-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mt-3 mb-4">
                Intelligence Multiplied,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-300">
                  Time Divided
                </span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Every feature is engineered to save your most valuable resource — time — while maximizing the accuracy of your decisions.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={featuresReveal.isInView ? "visible" : "hidden"}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {features.map((feature, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="group relative p-6 rounded-2xl bg-card/50 border border-white/5 hover:border-amber-500/20 transition-all duration-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-500/5"
              >
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative z-10">
                  <div className={`w-12 h-12 rounded-xl bg-white/5 group-hover:bg-white/10 flex items-center justify-center mb-4 ${feature.iconColor} transition-colors`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold font-display mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TARGET AUDIENCE SECTION (Psychology: Identity Labeling)                 */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden" aria-labelledby="audience-heading" ref={audienceReveal.ref}>
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/3 right-0 w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-[150px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={audienceReveal.isInView ? "visible" : "hidden"}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp}>
              <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest">Built For You</span>
              <h2 id="audience-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mt-3 mb-4">
                Your Time Is Too Valuable to Waste
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Whether you're writing a thesis, publishing research, or building a startup — MetaLLM gives you an unfair advantage.
              </p>
            </motion.div>
          </motion.div>

          {/* Audience image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="mb-16 rounded-2xl overflow-hidden border border-white/10 max-w-4xl mx-auto"
          >
            <img
              src="/target-audience.png"
              alt="Students, researchers, and founders using MetaLLM AI aggregator to save time and make better decisions"
              className="w-full h-auto"
              loading="lazy"
              width={900}
              height={500}
            />
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={audienceReveal.isInView ? "visible" : "hidden"}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {audienceCards.map((card, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className={`relative rounded-2xl border ${card.color} bg-card/40 backdrop-blur-sm p-8 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl group`}
              >
                <div className={`w-14 h-14 rounded-xl ${card.iconBg} flex items-center justify-center mb-5 ${card.iconColor}`}>
                  {card.icon}
                </div>
                <h3 className="text-2xl font-bold font-display mb-1">{card.title}</h3>
                <p className="text-amber-400/80 text-sm font-medium mb-4">{card.tagline}</p>
                <p className="text-muted-foreground text-sm mb-3 italic">"{card.pain}"</p>
                <p className="text-foreground/80 text-sm mb-6 leading-relaxed">{card.solution}</p>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">{card.stat}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* HOW IT WORKS                                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-24 bg-gradient-to-b from-black/20 to-transparent border-t border-white/5" aria-labelledby="how-heading" ref={howReveal.ref}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={howReveal.isInView ? "visible" : "hidden"}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp}>
              <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest">Simple Process</span>
              <h2 id="how-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mt-3 mb-4">
                Three Steps to{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-300">
                  Smarter Decisions
                </span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                No complex setup. No learning curve. Just ask and get the most comprehensive AI answer available.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={howReveal.isInView ? "visible" : "hidden"}
            className="space-y-8"
          >
            {howItWorks.map((step, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="flex flex-col md:flex-row items-start gap-6 p-8 rounded-2xl bg-card/30 border border-white/5 hover:border-amber-500/20 transition-all duration-500 group"
              >
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-5xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-b from-amber-400/40 to-amber-400/10">
                    {step.step}
                  </span>
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                    {step.icon}
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold font-display mb-2">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
                {i < howItWorks.length - 1 && (
                  <div className="hidden md:block w-px h-8 bg-gradient-to-b from-amber-500/20 to-transparent mx-auto" />
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TESTIMONIALS                                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative" aria-labelledby="testimonials-heading" ref={testimonialsReveal.ref}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={testimonialsReveal.isInView ? "visible" : "hidden"}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp}>
              <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest">Testimonials</span>
              <h2 id="testimonials-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mt-3 mb-4">
                Trusted by People Who{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-300">
                  Value Their Time
                </span>
              </h2>
            </motion.div>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={testimonialsReveal.isInView ? "visible" : "hidden"}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="p-8 rounded-2xl bg-card/40 border border-white/5 hover:border-amber-500/15 transition-all duration-500 relative group"
              >
                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-foreground/80 leading-relaxed mb-6 italic">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/30 to-purple-500/30 flex items-center justify-center text-sm font-bold text-amber-300">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FAQ SECTION (SEO + Psychology: Objection Handling)                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-24 bg-gradient-to-b from-black/20 to-transparent border-t border-white/5" aria-labelledby="faq-heading" ref={faqReveal.ref}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={faqReveal.isInView ? "visible" : "hidden"}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp}>
              <span className="text-amber-400 text-sm font-semibold uppercase tracking-widest">FAQ</span>
              <h2 id="faq-heading" className="text-3xl sm:text-4xl font-bold font-display mt-3 mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-lg text-muted-foreground">
                Everything you need to know about MetaLLM's multi-AI aggregation platform.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={faqReveal.isInView ? "visible" : "hidden"}
            className="space-y-4"
          >
            {faqs.map((faq, i) => (
              <motion.div key={i} variants={fadeUp}>
                <button
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                  className="w-full text-left p-6 rounded-xl bg-card/40 border border-white/5 hover:border-amber-500/15 transition-all duration-300"
                  aria-expanded={activeFaq === i}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold font-display text-lg pr-4">{faq.q}</h3>
                    <ChevronDown className={`w-5 h-5 text-amber-400 shrink-0 transition-transform duration-300 ${activeFaq === i ? "rotate-180" : ""}`} />
                  </div>
                  <AnimatePresence>
                    {activeFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <p className="text-muted-foreground mt-4 leading-relaxed">{faq.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FINAL CTA (Psychology: Urgency + Social Proof)                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden" aria-labelledby="cta-heading" ref={ctaReveal.ref}>
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-amber-500/8 rounded-full blur-[200px]" />
          <FloatingParticles />
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate={ctaReveal.isInView ? "visible" : "hidden"}
          >
            <motion.div variants={fadeUp} className="mb-6">
              <img
                src="/logo.jpeg"
                alt="MetaLLM Logo"
                className="w-20 h-20 mx-auto rounded-2xl ring-2 ring-amber-500/20 shadow-xl shadow-amber-500/10 mb-8"
                loading="lazy"
              />
            </motion.div>
            <motion.h2 variants={fadeUp} id="cta-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold font-display mb-6">
              Stop Wasting Time.{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-300">
                Start Deciding.
              </span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
              Join thousands of students, researchers, and founders who use MetaLLM to make faster, more accurate decisions with multi-AI intelligence.
            </motion.p>
            <motion.div variants={fadeUp}>
              <a href="/login">
                <Button
                  size="lg"
                  className="h-16 px-12 text-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-bold shadow-2xl shadow-amber-500/30 hover:shadow-amber-400/50 transition-all duration-300 group"
                >
                  Get Started Free — It Takes 30 Seconds
                  <ArrowRight className="w-6 h-6 ml-3 group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>
              <p className="mt-4 text-sm text-muted-foreground/60 flex items-center justify-center gap-2">
                <Lock className="w-3.5 h-3.5" />
                No credit card required · Free forever for basic use
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FOOTER (SEO Links)                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <footer className="py-16 border-t border-white/5 bg-background" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <a href="/" className="flex items-center gap-3 mb-4">
                <img src="/logo.jpeg" alt="MetaLLM" className="w-10 h-10 rounded-lg" loading="lazy" />
                <span className="text-xl font-bold font-display">
                  Meta<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">LLM</span>
                </span>
              </a>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The multi-AI aggregator platform that queries GPT-4, Claude, Gemini & more simultaneously for smarter, faster decisions.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold font-display mb-4 text-sm uppercase tracking-wider text-amber-400/80">Product</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="text-sm text-muted-foreground hover:text-white transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="text-sm text-muted-foreground hover:text-white transition-colors">How It Works</a></li>
                <li><a href="/login" className="text-sm text-muted-foreground hover:text-white transition-colors">Get Started</a></li>
                <li><a href="#faq" className="text-sm text-muted-foreground hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>

            {/* Use Cases */}
            <div>
              <h4 className="font-semibold font-display mb-4 text-sm uppercase tracking-wider text-amber-400/80">Use Cases</h4>
              <ul className="space-y-3">
                <li><a href="/login" className="text-sm text-muted-foreground hover:text-white transition-colors">AI for Students</a></li>
                <li><a href="/login" className="text-sm text-muted-foreground hover:text-white transition-colors">AI for Researchers</a></li>
                <li><a href="/login" className="text-sm text-muted-foreground hover:text-white transition-colors">AI for Founders</a></li>
                <li><a href="/login" className="text-sm text-muted-foreground hover:text-white transition-colors">AI Model Comparison</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold font-display mb-4 text-sm uppercase tracking-wider text-amber-400/80">Legal</h4>
              <ul className="space-y-3">
                <li><a href="/terms" className="text-sm text-muted-foreground hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="/privacy" className="text-sm text-muted-foreground hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/sitemap.xml" className="text-sm text-muted-foreground hover:text-white transition-colors">Sitemap</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground/60">
              © {new Date().getFullYear()} MetaLLM. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground/40">
              MetaLLM — AI Aggregator Platform | Multi-Model AI Analysis | GPT-4, Claude, Gemini, DeepSeek
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
