import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <nav className="fixed w-full z-50 top-0 left-0 border-b border-white/5 bg-background/70 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
                    <a href="/" className="flex items-center gap-3 group">
                        <img src="/logo.jpeg" alt="MetaLLM Logo" className="w-10 h-10 rounded-lg ring-1 ring-amber-500/20" />
                        <span className="text-xl font-bold font-display tracking-tight">
                            Meta<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">LLM</span>
                        </span>
                    </a>
                </div>
            </nav>

            <motion.article
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20"
            >
                <a href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors mb-8">
                    <ArrowLeft className="w-4 h-4" /> Back to Home
                </a>

                <h1 className="text-4xl font-bold font-display mb-2">Terms of Service</h1>
                <p className="text-muted-foreground mb-10">Last updated: February 24, 2026</p>

                <div className="prose prose-invert prose-sm max-w-none space-y-8">
                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">1. Acceptance of Terms</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            By accessing or using MetaLLM ("the Service"), available at metallm.tech, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service. MetaLLM is a multi-AI aggregator platform designed for students, researchers, founders, and professionals.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">2. Description of Service</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            MetaLLM provides a multi-model AI aggregation service that sends user queries to multiple artificial intelligence models (including but not limited to GPT-4, Claude, Gemini, DeepSeek, Mistral, Qwen, and Meta LLaMA) simultaneously and synthesizes their responses into unified, actionable intelligence. The Service is provided "as is" and we make no warranties about the accuracy of AI-generated content.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">3. User Accounts</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            To use MetaLLM, you must create an account by providing accurate information. You are responsible for maintaining the confidentiality of your account credentials. You must be at least 13 years old to use the Service. You agree to notify us immediately of any unauthorized use of your account.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">4. Acceptable Use</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            You agree not to use MetaLLM for any unlawful purpose, to generate harmful, misleading, or illegal content, to attempt to reverse-engineer or exploit the Service, or to overload the system with excessive automated queries. We reserve the right to terminate accounts that violate these terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">5. Intellectual Property</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            You retain ownership of the content you submit to MetaLLM. AI-generated responses are provided for your use but may be subject to the terms of the underlying AI model providers. The MetaLLM platform, brand, logo, and design are proprietary and protected by applicable intellectual property laws.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">6. Limitation of Liability</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            MetaLLM and its team shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the Service. AI-generated content should not be considered professional advice. Always verify important decisions with qualified professionals.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">7. Changes to Terms</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We reserve the right to modify these Terms of Service at any time. Changes will be posted on this page with an updated "Last updated" date. Your continued use of MetaLLM after changes constitutes acceptance of the new terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">8. Contact</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            For questions about these Terms of Service, please contact us at support@metallm.tech.
                        </p>
                    </section>
                </div>
            </motion.article>
        </div>
    );
}
