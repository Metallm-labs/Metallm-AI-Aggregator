import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
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

                <h1 className="text-4xl font-bold font-display mb-2">Privacy Policy</h1>
                <p className="text-muted-foreground mb-10">Last updated: February 24, 2026</p>

                <div className="prose prose-invert prose-sm max-w-none space-y-8">
                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">1. Information We Collect</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            MetaLLM collects the following types of information: account information (email, name) provided during registration, usage data (queries submitted, features used), and technical data (browser type, device info, IP address). We do not sell your personal data to third parties.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">2. How We Use Your Information</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We use your information to provide and improve the MetaLLM service, process your AI queries across multiple models, maintain your query history, communicate service updates, and ensure the security of your account. Your queries are sent to third-party AI model providers for processing.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">3. Data Storage & Security</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Your data is stored securely using industry-standard encryption (TLS/SSL). Query history is stored in encrypted databases. We implement role-based access controls and regular security audits. Session data is managed using secure, httpOnly cookies. We retain your query history for as long as your account is active.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">4. Third-Party AI Model Providers</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            When you submit a query, it is sent to multiple AI model providers including OpenAI, Anthropic, Google, DeepSeek, and others. Each provider has their own privacy policies governing how they handle data. We recommend reviewing their respective privacy policies. MetaLLM does not control how these providers process your query data.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">5. Cookies & Tracking</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            MetaLLM uses essential cookies for authentication and session management. We do not use third-party advertising trackers. We may use analytics tools to understand usage patterns and improve the Service. You can manage cookie preferences through your browser settings.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">6. Your Rights</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            You have the right to access, correct, or delete your personal data. You can export your query history at any time. You may request account deletion by contacting support@metallm.tech. We will process deletion requests within 30 days, subject to legal retention requirements.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">7. Children's Privacy</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            MetaLLM is not intended for children under 13. We do not knowingly collect personal information from children under 13. If we discover such data has been collected, we will promptly delete it.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">8. Changes to This Policy</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We may update this Privacy Policy periodically. Changes will be posted on this page with an updated date. We encourage you to review this page regularly.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">9. Contact Us</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            For privacy-related questions, contact us at support@metallm.tech.
                        </p>
                    </section>
                </div>
            </motion.article>
        </div>
    );
}
