import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export default function Refund() {
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

        const title = "Refund Policy | MetaLLM";
        const description = "Read MetaLLM refund policy, eligibility requirements, and support process for billing issues.";
        const url = "https://metallm.tech/refund";

        document.title = title;
        if (metaDescription) metaDescription.setAttribute("content", description);
        if (ogTitle) ogTitle.setAttribute("content", title);
        if (ogDescription) ogDescription.setAttribute("content", description);
        if (ogUrl) ogUrl.setAttribute("content", url);
        if (twitterTitle) twitterTitle.setAttribute("content", title);
        if (twitterDescription) twitterDescription.setAttribute("content", description);
        if (twitterUrl) twitterUrl.setAttribute("content", url);
        if (canonical) canonical.setAttribute("href", url);

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
        };
    }, []);

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <nav className="fixed w-full z-50 top-0 left-0 border-b border-white/5 bg-background/70 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
                    <a href="/" className="flex items-center gap-3 group">
                        <img src="/logo-96.jpg" alt="MetaLLM Logo" className="w-10 h-10 rounded-lg ring-1 ring-amber-500/20" width={40} height={40} decoding="async" />
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

                <h1 className="text-4xl font-bold font-display mb-2">Refund Policy</h1>
                <p className="text-muted-foreground mb-10">Last updated: March 5, 2026</p>

                <div className="prose prose-invert prose-sm max-w-none space-y-8">

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">1. Overview</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            MetaLLM operates a subscription-based billing system. Payments for monthly or yearly plans are <strong className="text-white">final and non-refundable</strong> once processed, except in cases of verified technical issues caused by MetaLLM. This policy explains the limited circumstances under which a refund may be granted.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">2. How Subscription Usage Works</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            Your plan gives you access to MetaLLM features and a simple monthly usage tracker. Each AI query still has underlying token costs based on model, input length, and output length, but the user-facing experience is shown as monthly subscription usage instead of a wallet balance.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">3. Refund Eligibility</h2>
                        <p className="text-muted-foreground leading-relaxed mb-3">
                            Refunds are <strong className="text-white">only considered in the following technical error cases</strong>:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                            <li>Your payment was charged but your subscription access was <strong className="text-white">not activated</strong> due to a platform error.</li>
                            <li>You were charged <strong className="text-white">more than once</strong> for the same transaction due to a technical fault.</li>
                            <li>A verified system outage prevented access to the platform immediately after purchase.</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-3">
                            All refund requests must be submitted within <strong className="text-white">3 days</strong> of the original transaction. Requests made after this window will not be considered under any circumstances.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">4. Non-Refundable Situations</h2>
                        <p className="text-muted-foreground leading-relaxed mb-3">
                            Refunds will <strong className="text-white">not</strong> be issued in the following cases:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                            <li>Change of mind or no longer needing the service after payment.</li>
                            <li>Subscription usage that has already been consumed through normal platform use.</li>
                            <li>Requests submitted more than <strong className="text-white">3 days</strong> after the transaction date.</li>
                            <li>Dissatisfaction with AI-generated output quality (AI responses are inherently non-deterministic).</li>
                            <li>Accounts closed or terminated due to violation of our Terms of Service.</li>
                            <li>Promotional or bonus access granted for free.</li>
                            <li>Any issue not directly caused by a MetaLLM platform technical fault.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">5. How to Request a Refund</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            If you believe you qualify for a refund due to a technical issue, contact us at <a href="mailto:support@metallm.tech" className="text-amber-400 hover:text-amber-300 transition-colors">support@metallm.tech</a> within <strong className="text-white">3 days</strong> of the transaction with the subject line "Refund Request — Technical Issue". Please include:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-3">
                            <li>Your registered email address.</li>
                            <li>The date and amount of the transaction.</li>
                            <li>A clear description of the technical issue experienced.</li>
                            <li>Any screenshots or error messages if available.</li>
                        </ul>
                        <p className="text-muted-foreground leading-relaxed mt-3">
                            We will review your request and respond within <strong className="text-white">3–5 business days</strong>. Approved refunds are processed back to your original payment method and may take 5–10 business days to appear depending on your bank.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">6. Disputes & Chargebacks</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We encourage you to contact us before initiating a chargeback with your bank. Filing a chargeback without contacting us first may result in account suspension. If a chargeback is filed, we reserve the right to pause any remaining access on the account pending resolution.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">7. Changes to This Policy</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            We may update this Refund Policy from time to time. Changes will be posted on this page with an updated date. Continued use of MetaLLM after changes constitutes acceptance of the updated policy.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold font-display text-amber-300">8. Contact Us</h2>
                        <p className="text-muted-foreground leading-relaxed">
                            For any refund-related questions, email us at{" "}
                            <a href="mailto:support@metallm.tech" className="text-amber-400 hover:text-amber-300 transition-colors">
                                support@metallm.tech
                            </a>
                            .
                        </p>
                    </section>
                </div>
            </motion.article>
        </div>
    );
}
