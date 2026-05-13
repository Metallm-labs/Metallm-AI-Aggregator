import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, User, ArrowRight, Loader2, Sparkles, Route, Wand2, Swords, Layers, Shield, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type AuthMode = "signin" | "signup" | "verify";

const modeShowcase = {
    signin: {
        eyebrow: "Welcome Back",
        title: "Return to your cinematic AI workspace.",
        copy: "Pick up your research, prompts, and model flows exactly where you left them.",
        cta: "New here? Create account",
        switchTo: "signup" as AuthMode,
        stat: "Smart routing, debate mode, and live model control in one place.",
    },
    signup: {
        eyebrow: "Create Account",
        title: "Open your AI lab in one elegant step.",
        copy: "Start with one account, then switch between direct, smart route, multi-model, and debate workflows instantly.",
        cta: "Already have an account? Sign in",
        switchTo: "signin" as AuthMode,
        stat: "Built for founders, researchers, students, and teams that move fast.",
    },
    verify: {
        eyebrow: "Secure Access",
        title: "Verify once, then step straight into MetaLLM.",
        copy: "We sent a code to your inbox so we can keep your workspace and chat history protected.",
        cta: "Back to Sign in",
        switchTo: "signin" as AuthMode,
        stat: "Your account stays protected before your first session even starts.",
    },
} as const;

const cinematicFeatures = [
    { icon: <Route className="w-4 h-4" />, label: "Smart routing to specialist AIs" },
    { icon: <Wand2 className="w-4 h-4" />, label: "Prompt refinement before every send" },
    { icon: <Swords className="w-4 h-4" />, label: "Debate mode with structured roles" },
    { icon: <Layers className="w-4 h-4" />, label: "Parallel model workflows in one command center" },
];

/* ── Page transition variants ── */
const pageVariants = {
    initial: (direction: number) => ({
        x: direction > 0 ? 40 : -40,
        opacity: 0,
        scale: 0.97,
    }),
    animate: {
        x: 0,
        opacity: 1,
        scale: 1,
        transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
    },
    exit: (direction: number) => ({
        x: direction > 0 ? -40 : 40,
        opacity: 0,
        scale: 0.97,
        transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
    }),
};

const fadeUp = {
    hidden: { opacity: 0, y: 18 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
    }),
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*   MAIN LOGIN COMPONENT                                                     */
/* ════════════════════════════════════════════════════════════════════════════ */
export default function Login() {
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [mode, setMode] = useState<AuthMode>("signin");
    const [redirectTarget, setRedirectTarget] = useState("/business-agent");
    const [isLoading, setIsLoading] = useState(false);
    const [direction, setDirection] = useState(0);
    const [showPassword, setShowPassword] = useState(false);

    // Form state
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [otp, setOtp] = useState("");
    const [targetEmail, setTargetEmail] = useState("");
    const activeShowcase = modeShowcase[mode];

    // OTP individual digit refs
    const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        const originalTitle = document.title;
        const metaDescription = document.querySelector('meta[name="description"]');
        const ogTitle = document.querySelector('meta[property="og:title"]');
        const ogDescription = document.querySelector('meta[property="og:description"]');
        const ogUrl = document.querySelector('meta[property="og:url"]');
        const twitterTitle = document.querySelector('meta[name="twitter:title"]');
        const twitterDescription = document.querySelector('meta[name="twitter:description"]');
        const twitterUrl = document.querySelector('meta[name="twitter:url"]');
        const robots = document.querySelector('meta[name="robots"]');
        const googlebot = document.querySelector('meta[name="googlebot"]');
        const canonical = document.querySelector('link[rel="canonical"]');

        const originalDescription = metaDescription?.getAttribute("content") || "";
        const originalOgTitle = ogTitle?.getAttribute("content") || "";
        const originalOgDescription = ogDescription?.getAttribute("content") || "";
        const originalOgUrl = ogUrl?.getAttribute("content") || "";
        const originalTwitterTitle = twitterTitle?.getAttribute("content") || "";
        const originalTwitterDescription = twitterDescription?.getAttribute("content") || "";
        const originalTwitterUrl = twitterUrl?.getAttribute("content") || "";
        const originalRobots = robots?.getAttribute("content") || "";
        const originalGooglebot = googlebot?.getAttribute("content") || "";
        const originalCanonical = canonical?.getAttribute("href") || "";

        const title = "Login | MetaLLM";
        const description = "Sign in to MetaLLM to access your AI workspace, chat history, and multi-model workflows.";
        const url = "https://metallm.tech/login";

        document.title = title;
        if (metaDescription) metaDescription.setAttribute("content", description);
        if (ogTitle) ogTitle.setAttribute("content", title);
        if (ogDescription) ogDescription.setAttribute("content", description);
        if (ogUrl) ogUrl.setAttribute("content", url);
        if (twitterTitle) twitterTitle.setAttribute("content", title);
        if (twitterDescription) twitterDescription.setAttribute("content", description);
        if (twitterUrl) twitterUrl.setAttribute("content", url);
        if (robots) robots.setAttribute("content", "noindex, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
        if (googlebot) googlebot.setAttribute("content", "noindex, follow");
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
            if (robots) robots.setAttribute("content", originalRobots);
            if (googlebot) googlebot.setAttribute("content", originalGooglebot);
            if (canonical) canonical.setAttribute("href", originalCanonical);
        };
    }, []);

    // Check for error in URL (from OAuth failure)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const modeParam = params.get("mode");
        const redirectParam = params.get("redirect");
        const error = params.get("error");
        if (modeParam === "signin" || modeParam === "signup") {
            setMode(modeParam);
        }
        if (redirectParam && redirectParam.startsWith("/")) {
            setRedirectTarget(redirectParam);
        }
        if (error) {
            toast({ title: "Authentication Error", description: error, variant: "destructive" });
            params.delete("error");
            const nextQuery = params.toString();
            window.history.replaceState({}, "", nextQuery ? `/login?${nextQuery}` : "/login");
        }
    }, [toast]);

    const switchMode = (newMode: AuthMode) => {
        setDirection(newMode === "signup" ? 1 : -1);
        setMode(newMode);
    };

    const handleResendOtp = async () => {
        try {
            const response = await fetch("/api/auth/resend-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: targetEmail }),
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            let endpoint = "";
            let body = {};
            if (mode === "signin") {
                endpoint = "/api/auth/login";
                body = { email, password };
            } else if (mode === "signup") {
                endpoint = "/api/auth/register";
                body = { email, password, firstName, lastName };
            } else if (mode === "verify") {
                endpoint = "/api/auth/verify";
                body = { email: targetEmail, otp };
            }
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            if (response.status === 403 && data.status === "unverified") {
                setTargetEmail(data.email);
                setDirection(1);
                setMode("verify");
                toast({ title: "Verification Required", description: "Please verify your email to continue." });
                return;
            }
            if (response.ok && data.status === "pending_verification") {
                setTargetEmail(data.email);
                setDirection(1);
                setMode("verify");
                toast({ title: "Verification Code Sent", description: "Please check your email for the code." });
                return;
            }
            if (!response.ok) throw new Error(data.message || "Authentication failed");
            toast({
                title: mode === "verify" ? "Verified!" : "Welcome back!",
                description: "Redirecting to chat...",
            });
            await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            setLocation(redirectTarget);
        } catch (error: any) {
            toast({ title: "Error", description: error.message || "Something went wrong", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    /* ── OTP handler for individual digit input ── */
    const handleOtpDigit = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const digits = otp.split("");
        digits[index] = value.slice(-1);
        const newOtp = digits.join("");
        setOtp(newOtp.padEnd(6, "").slice(0, 6));
        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#04070d] text-foreground">
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                <img src="/hero.png" alt="" className="absolute inset-0 h-full w-full object-cover object-center opacity-22" />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,12,0.9)_0%,rgba(3,7,14,0.78)_38%,rgba(5,8,14,0.74)_100%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(155,182,255,0.14),transparent_28%),radial-gradient(circle_at_80%_15%,rgba(250,204,21,0.12),transparent_24%),linear-gradient(180deg,rgba(4,7,12,0.2),rgba(4,7,12,0.72))]" />
            </div>

            <div className="relative z-10 flex min-h-screen">
                <div className="hidden lg:flex lg:w-[54%] xl:w-[58%] relative flex-col justify-between p-12 xl:p-16">
                    <a href="/" className="flex items-center gap-3 group">
                        <motion.img
                            src="/logo-96.jpg"
                            alt="MetaLLM Logo"
                            className="h-11 w-11 rounded-xl ring-1 ring-white/15 transition-all group-hover:ring-amber-300/50"
                            whileHover={{ scale: 1.04, rotate: 2 }}
                            width={44}
                            height={44}
                            decoding="async"
                        />
                        <span className="text-xl font-bold tracking-tight">
                            Meta<span className="bg-gradient-to-r from-amber-300 to-yellow-300 bg-clip-text text-transparent">LLM</span>
                        </span>
                    </a>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={mode}
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -18 }}
                            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                            className="max-w-xl"
                        >
                            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 backdrop-blur-md">
                                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                                <span className="text-[11px] uppercase tracking-[0.22em] text-white/70">{activeShowcase.eyebrow}</span>
                            </div>
                            <h1 className="max-w-xl text-4xl font-bold leading-[1.04] tracking-[-0.04em] text-white xl:text-6xl">
                                {activeShowcase.title}
                            </h1>
                            <p className="mt-5 max-w-lg text-lg leading-8 text-white/66">
                                {activeShowcase.copy}
                            </p>

                            <div className="mt-10 grid gap-3">
                                {cinematicFeatures.map((feature, i) => (
                                    <motion.div
                                        key={feature.label}
                                        custom={i}
                                        initial="hidden"
                                        animate="visible"
                                        variants={fadeUp}
                                        className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/18 px-4 py-3 text-sm text-white/72 backdrop-blur-sm"
                                    >
                                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/6 text-amber-300">
                                            {feature.icon}
                                        </div>
                                        <span>{feature.label}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </AnimatePresence>

                    <div className="max-w-md rounded-2xl border border-white/10 bg-black/16 p-4 text-sm text-white/62 backdrop-blur-sm">
                        {activeShowcase.stat}
                    </div>

                    <div className="pointer-events-none absolute -right-14 top-0 hidden h-full w-32 lg:block">
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.03))] opacity-25 [clip-path:polygon(12%_0,100%_0,66%_100%,0_100%)]" />
                        <div className="absolute inset-[1px] bg-[linear-gradient(180deg,rgba(8,12,18,0.84),rgba(8,12,18,0.2))] [clip-path:polygon(12%_0,100%_0,66%_100%,0_100%)]" />
                    </div>
                </div>

                <div className="flex w-full items-center justify-center p-4 sm:p-8 lg:w-[46%] xl:w-[42%]">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="w-full max-w-md"
                    >
                        <div className="mb-8 text-center lg:text-left">
                            <a href="/" className="mb-5 inline-flex items-center gap-2 transition-opacity hover:opacity-80 lg:hidden">
                                <img src="/logo-96.jpg" alt="MetaLLM Logo" className="h-10 w-10 rounded-lg ring-1 ring-white/15" width={40} height={40} decoding="async" />
                                <span className="text-xl font-bold tracking-tight">
                                    Meta<span className="bg-gradient-to-r from-amber-300 to-yellow-300 bg-clip-text text-transparent">LLM</span>
                                </span>
                            </a>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={mode}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.25 }}
                                >
                                    <h1 className="text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
                                        {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Verify email"}
                                    </h1>
                                    <p className="mt-2 text-sm text-white/58 sm:text-base">
                                        {mode === "signin"
                                            ? "Access your workspace and continue your AI sessions."
                                            : mode === "signup"
                                                ? "Start with one account and unlock the full MetaLLM flow."
                                                : `Enter the code sent to ${targetEmail}`}
                                    </p>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

                        {/* Animated form swapper */}
                        <AnimatePresence mode="wait" custom={direction}>
                            <motion.form
                                key={mode}
                                custom={direction}
                                variants={pageVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                onSubmit={handleSubmit}
                                className="space-y-4"
                            >
                                {mode === "verify" ? (
                                    /* ── OTP Verification ── */
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-center gap-2 text-amber-400 font-semibold mb-2">
                                            <Shield className="w-5 h-5" />
                                            <span>Email verification</span>
                                        </div>
                                        <div className="flex justify-center gap-2.5">
                                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                                <motion.div
                                                    key={i}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: i * 0.05 }}
                                                >
                                                    <input
                                                        ref={(el) => { otpRefs.current[i] = el; }}
                                                        type="text"
                                                        inputMode="numeric"
                                                        maxLength={1}
                                                        value={otp[i] || ""}
                                                        onChange={(e) => handleOtpDigit(i, e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Backspace" && !otp[i] && i > 0) {
                                                                otpRefs.current[i - 1]?.focus();
                                                            }
                                                        }}
                                                        className="w-11 h-14 sm:w-12 sm:h-16 text-center text-2xl font-bold rounded-xl bg-white/5 border border-white/10 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 text-white outline-none transition-all"
                                                        autoFocus={i === 0}
                                                    />
                                                </motion.div>
                                            ))}
                                        </div>
                                        <div className="text-center">
                                            <button type="button" onClick={handleResendOtp} className="text-sm text-amber-400 hover:text-amber-300 hover:underline transition-colors">
                                                Resend Code
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* ── Signup name fields ── */}
                                        <AnimatePresence>
                                            {mode === "signup" && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="firstName" className="text-xs text-muted-foreground uppercase tracking-wider">First Name</Label>
                                                            <div className="relative">
                                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                                                                <Input id="firstName" type="text" placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="pl-9 bg-white/5 border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/15 h-11 transition-all" />
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="lastName" className="text-xs text-muted-foreground uppercase tracking-wider">Last Name</Label>
                                                            <div className="relative">
                                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                                                                <Input id="lastName" type="text" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} className="pl-9 bg-white/5 border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/15 h-11 transition-all" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {/* ── Email ── */}
                                        <div className="space-y-1.5">
                                            <Label htmlFor="email" className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                                                <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-9 bg-white/5 border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/15 h-11 transition-all" />
                                            </div>
                                        </div>

                                        {/* ── Password ── */}
                                        <div className="space-y-1.5">
                                            <Label htmlFor="password" className="text-xs text-muted-foreground uppercase tracking-wider">Password</Label>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                                                <Input
                                                    id="password"
                                                    type={showPassword ? "text" : "password"}
                                                    placeholder="••••••••"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    required
                                                    minLength={6}
                                                    className="pl-9 pr-10 bg-white/5 border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/15 h-11 transition-all"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-white transition-colors"
                                                    tabIndex={-1}
                                                >
                                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            {mode === "signin" && (
                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => setLocation("/forgot-password")}
                                                        className="text-xs text-amber-400/80 hover:text-amber-300 transition-colors"
                                                    >
                                                        Forgot password?
                                                    </button>
                                                </div>
                                            )}
                                            {mode === "signup" && (
                                                <p className="text-xs text-muted-foreground/60 mt-1">Min. 6 characters</p>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* ── Submit button ── */}
                                <Button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full h-12 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-bold shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all duration-300 text-base mt-2"
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            {mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Verify Email"}
                                            <ArrowRight className="w-4 h-4 ml-2" />
                                        </>
                                    )}
                                </Button>
                            </motion.form>
                        </AnimatePresence>

                        {/* ── Divider + Google OAuth ── */}
                        {mode !== "verify" && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                                <div className="relative my-6">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-white/10" />
                                    </div>
                                    <div className="relative flex justify-center text-xs">
                                        <span className="bg-card px-3 text-muted-foreground">or continue with</span>
                                    </div>
                                </div>

                                <a href="/api/auth/google" className="block">
                                    <Button type="button" variant="outline" className="w-full h-12 border-white/10 hover:bg-white/5 hover:border-amber-500/20 transition-all duration-300 text-base">
                                        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                        Continue with Google
                                    </Button>
                                </a>
                            </motion.div>
                        )}

                        {/* Back to sign in for verify mode */}
                        {mode === "verify" && (
                            <div className="text-center mt-6">
                                <button onClick={() => switchMode("signin")} className="text-sm text-muted-foreground hover:text-white transition-colors">
                                    ← Back to Sign In
                                </button>
                            </div>
                        )}
                    </div>

                        {mode !== "verify" && (
                            <div className="mt-5 text-center">
                                <button
                                    type="button"
                                    onClick={() => switchMode(activeShowcase.switchTo)}
                                    className="text-sm text-white/56 transition-colors hover:text-white"
                                >
                                    {activeShowcase.cta}
                                </button>
                            </div>
                        )}

                        {mode === "verify" && (
                            <div className="mt-5 text-center">
                                <button
                                    type="button"
                                    onClick={() => switchMode("signin")}
                                    className="text-sm text-white/56 transition-colors hover:text-white"
                                >
                                    {activeShowcase.cta}
                                </button>
                            </div>
                        )}

                        <p className="mt-6 text-center text-xs text-white/38">
                            By continuing, you agree to our{" "}
                            <a href="/terms" className="text-amber-300/80 transition-colors hover:text-amber-200">Terms of Service</a>{" "}
                            and{" "}
                            <a href="/privacy" className="text-amber-300/80 transition-colors hover:text-amber-200">Privacy Policy</a>.
                        </p>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
