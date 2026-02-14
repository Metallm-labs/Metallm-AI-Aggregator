import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Hexagon, Zap, Shield, Users } from "lucide-react";
import { motion } from "framer-motion";

export default function Landing() {
  const features = [
    {
      icon: <Zap className="w-6 h-6 text-yellow-400" />,
      title: "Multi-Model Intelligence",
      description: "Harness the power of GPT-4, Claude, Gemini, and more in a single query."
    },
    {
      icon: <Shield className="w-6 h-6 text-cyan-400" />,
      title: "Consolidated Insights",
      description: "Our orchestrator synthesizes conflicting viewpoints into actionable intelligence."
    },
    {
      icon: <Users className="w-6 h-6 text-magenta-400" />,
      title: "Role-Based Analysis",
      description: "Get perspectives tailored for developers, traders, or creative professionals."
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden selection:bg-primary/30">
      {/* Navbar */}
      <nav className="fixed w-full z-50 top-0 left-0 border-b border-white/5 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hexagon className="w-8 h-8 text-primary fill-primary/20" />
            <span className="text-xl font-bold font-display tracking-tight">Metallm</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/login">
              <Button variant="ghost" className="hidden sm:inline-flex hover:text-white">Sign In</Button>
            </a>
            <a href="/login">
              <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25">
                Get Started
              </Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl z-0 pointer-events-none">
          <div className="absolute top-20 right-0 w-96 h-96 bg-primary/20 rounded-full blur-[100px] animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/20 rounded-full blur-[80px]"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold font-display tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
              One Query.<br />
              <span className="text-primary text-glow">Infinite Perspectives.</span>
            </h1>
            <p className="max-w-2xl mx-auto text-xl text-muted-foreground mb-10 leading-relaxed">
              Stop switching tabs. Metallm orchestrates the world's leading AI models to give you a comprehensive, multi-faceted analysis of any problem.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="/login">
                <Button size="lg" className="w-full sm:w-auto h-12 px-8 text-lg bg-white text-black hover:bg-white/90">
                  Start Analyzing
                </Button>
              </a>
              <a href="#features">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 text-lg border-white/10 hover:bg-white/5">
                  Learn More
                </Button>
              </a>
            </div>
          </motion.div>

          {/* Hero Interface Mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="mt-20 relative mx-auto max-w-5xl"
          >
            <div className="rounded-xl bg-[#0A0A0B] border border-white/10 shadow-2xl overflow-hidden aspect-[16/9] flex items-center justify-center">
              {/* Simple CSS placeholder for interface visual */}
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-primary/20 rounded-full flex items-center justify-center animate-pulse">
                  <Hexagon className="w-8 h-8 text-primary" />
                </div>
                <p className="text-muted-foreground font-mono text-sm">Orchestrating Intelligence...</p>
              </div>
            </div>
            {/* Glow effect under the mockup */}
            <div className="absolute -inset-4 bg-gradient-to-t from-primary/20 to-transparent blur-2xl -z-10 rounded-full opacity-50"></div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-black/20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-6 rounded-2xl bg-card border border-white/5 hover:border-white/10 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold font-display mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Hexagon className="w-6 h-6 text-muted-foreground" />
            <span className="font-display font-bold text-muted-foreground">Metallm</span>
          </div>
          <p className="text-sm text-muted-foreground/60">
            © 2024 Metallm Inc. Built with Replit.
          </p>
        </div>
      </footer>
    </div>
  );
}
