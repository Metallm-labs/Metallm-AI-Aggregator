import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Mail, Lock, User, ArrowRight, Loader2, Sparkles,
    Route, Wand2, Swords, Layers, Shield, Eye, EyeOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type AuthMode = "signin" | "signup" | "verify";

/* ── Floating particles ── */
function FloatingDots() {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
            {[...Array(15)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                        width: Math.random() * 3 + 1.5,
                        height: Math.random() * 3 + 1.5,
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        background:
                            i % 3 === 0
                                ? "rgba(212,175,55,0.35)"
                                : i % 3 === 1
                                    ? "rgba(139,92,246,0.25)"
                                    : "rgba(34,197,94,0.25)",
                    }}
                    animate={{ y: [0, -20, 0], opacity: [0.15, 0.6, 0.15] }}
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

/* ── Feature pill shown on the left panel ── */
const leftFeatures = [
    { icon: <Route className="w-4 h-4" />, label: "Smart Routing to specialist AIs" },
    { icon: <Wand2 className="w-4 h-4" />, label: "Auto Prompt Enhancement" },
    { icon: <Swords className="w-4 h-4" />, label: "AI Debate Mode" },
    { icon: <Layers className="w-4 h-4" />, label: "9 models queried in parallel" },
];

/* ── Sliding tab indicator ── */
function TabIndicator({ active }: { active: "signin" | "signup" }) {
    return (
        <motion.div
            className="absolute inset-y-1 rounded-md bg-gradient-to-r from-amber-500 to-yellow-500 shadow-lg shadow-amber-500/25"
            layoutId="auth-tab"
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            style={{
                left: active === "signin" ? "4px" : "50%",
                right: active === "signin" ? "50%" : "4px",
            }}
        />
    );
}

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

    // OTP individual digit refs
    const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Check for error in URL (from OAuth failure)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const error = params.get("error");
        if (error) {
            toast({ title: "Authentication Error", description: error, variant: "destructive" });
            window.history.replaceState({}, "", "/login");
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
                description: "Redirecting to dashboard...",
            });
            await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            setLocation("/dashboard");
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
        <div className="min-h-screen bg-background text-foreground flex relative overflow-hidden">
            {/* ── Background effects ── */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-amber-500/8 rounded-full blur-[180px]" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-[150px]" />
                <FloatingDots />
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {/* LEFT PANEL — Brand & Features (hidden on mobile)                      */}
            {/* ═══════════════════════════════════════════════════════════════════════ */}
            <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative flex-col justify-between p-12 xl:p-16 z-10">
                {/* Logo */}
                <a href="/" className="flex items-center gap-3 group">
                    <motion.img
                        src="/logo-96.jpg"
                        alt="MetaLLM Logo"
                        className="w-11 h-11 rounded-lg ring-1 ring-amber-500/20 group-hover:ring-amber-400/50 transition-all"
                        whileHover={{ scale: 1.06, rotate: 2 }}
                        width={44}
                        height={44}
                        decoding="async"
                    />
                    <span className="text-xl font-bold font-display tracking-tight">
                        Meta<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">LLM</span>
                    </span>
                </a>

                {/* Headline */}
                <div className="max-w-lg">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7 }}
                        className="text-4xl xl:text-5xl font-bold font-display leading-[1.15] mb-6"
                    >
                        One query.{" "}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400">
                            Nine AI models.
                        </span>
                        <br />
                        One synthesized answer.
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.15 }}
                        className="text-lg text-muted-foreground leading-relaxed mb-10"
                    >
                        Smart routing, auto-enhanced prompts, debate mode, and live web search — all in one platform.
                    </motion.p>

                    {/* Feature pills */}
                    <div className="space-y-3">
                        {leftFeatures.map((f, i) => (
                            <motion.div
                                key={i}
                                custom={i}
                                initial="hidden"
                                animate="visible"
                                variants={fadeUp}
                                className="flex items-center gap-3 text-sm text-muted-foreground"
                            >
                                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                                    {f.icon}
                                </div>
                                <span>{f.label}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Bottom social proof */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="flex items-center gap-3"
                >
                    <div className="flex -space-x-2">
                        {["SK", "AR", "PM", "JC"].map((initials, i) => (
                            <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/30 to-purple-500/30 border-2 border-background flex items-center justify-center text-[10px] font-bold text-amber-300">
                                {initials}
                            </div>
                        ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        <strong className="text-white">5,000+</strong> researchers & founders already use MetaLLM
                    </p>
                </motion.div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════ */}
            {/* RIGHT PANEL — Auth Form                                               */}
            {/* ═══════════════════════════════════════════════════════════════════════ */}
            <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-4 sm:p-8 z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-md"
                >
                    {/* Mobile logo */}
                    <div className="lg:hidden text-center mb-8">
                        <a href="/" className="inline-flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity">
                            <img src="/logo-96.jpg" alt="MetaLLM Logo" className="w-10 h-10 rounded-lg ring-1 ring-amber-500/20" width={40} height={40} decoding="async" />
                            <span className="text-xl font-bold font-display tracking-tight">
                                Meta<span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">LLM</span>
                            </span>
                        </a>
                    </div>

                    {/* Title */}
                    <div className="text-center mb-8">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={mode}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.25 }}
                            >
                                <h1 className="text-2xl sm:text-3xl font-bold font-display mb-2">
                                    {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Verify your email"}
                                </h1>
                                <p className="text-muted-foreground text-sm sm:text-base">
                                    {mode === "signin"
                                        ? "Sign in to access your multi-AI command center"
                                        : mode === "signup"
                                            ? "Join MetaLLM — unlock 9 AI models in one click"
                                            : `Enter the code sent to ${targetEmail}`}
                                </p>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* ── Auth Card ── */}
                    <div className="bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/30 relative overflow-hidden">
                        {/* Gold shimmer line */}
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

                        {/* Mode Tabs (hide in verify) */}
                        {mode !== "verify" && (
                            <div className="relative flex mb-7 bg-white/5 rounded-lg p-1">
                                <TabIndicator active={mode as "signin" | "signup"} />
                                <button
                                    onClick={() => switchMode("signin")}
                                    className={`relative z-10 flex-1 py-2.5 px-4 rounded-md text-sm font-semibold transition-colors duration-200 ${mode === "signin" ? "text-black" : "text-muted-foreground hover:text-white"
                                        }`}
                                >
                                    Sign In
                                </button>
                                <button
                                    onClick={() => switchMode("signup")}
                                    className={`relative z-10 flex-1 py-2.5 px-4 rounded-md text-sm font-semibold transition-colors duration-200 ${mode === "signup" ? "text-black" : "text-muted-foreground hover:text-white"
                                        }`}
                                >
                                    Sign Up
                                </button>
                            </div>
                        )}

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

                    {/* Bottom legal */}
                    <p className="text-center text-xs text-muted-foreground/50 mt-6">
                        By continuing, you agree to our{" "}
                        <a href="/terms" className="text-amber-400/70 hover:text-amber-300 transition-colors">Terms of Service</a>{" "}
                        and{" "}
                        <a href="/privacy" className="text-amber-400/70 hover:text-amber-300 transition-colors">Privacy Policy</a>.
                    </p>
                </motion.div>
            </div>
        </div>
    );
}
