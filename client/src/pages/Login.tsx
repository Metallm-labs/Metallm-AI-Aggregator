import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hexagon, Mail, Lock, User, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type AuthMode = "signin" | "signup" | "verify";

export default function Login() {
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [mode, setMode] = useState<AuthMode>("signin");
    const [isLoading, setIsLoading] = useState(false);

    // Form state
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [otp, setOtp] = useState("");
    const [targetEmail, setTargetEmail] = useState(""); // Email to verify

    // Check for error in URL (from OAuth failure)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const error = params.get("error");
        if (error) {
            toast({
                title: "Authentication Error",
                description: error,
                variant: "destructive",
            });
            window.history.replaceState({}, "", "/login");
        }
    }, [toast]);

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
        } catch (error) {
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

            // Handle unverified user from login
            if (response.status === 403 && data.status === "unverified") {
                setTargetEmail(data.email);
                setMode("verify");
                toast({
                    title: "Verification Required",
                    description: "Please verify your email to continue.",
                });
                return;
            }

            // Handle pending verification from signup
            if (response.ok && data.status === "pending_verification") {
                setTargetEmail(data.email);
                setMode("verify");
                toast({
                    title: "Verification Code Sent",
                    description: "Please check your email for the code.",
                });
                return;
            }

            if (!response.ok) {
                throw new Error(data.message || "Authentication failed");
            }

            toast({
                title: mode === "verify" ? "Verified!" : "Welcome back!",
                description: "Redirecting to dashboard...",
            });

            await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            setLocation("/dashboard");
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Something went wrong",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary/15 rounded-full blur-[100px]"></div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative z-10 w-full max-w-md"
            >
                {/* Logo & Title */}
                <div className="text-center mb-8">
                    <a href="/" className="inline-flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity">
                        <Hexagon className="w-10 h-10 text-primary fill-primary/20" />
                        <span className="text-2xl font-bold font-display tracking-tight">Metallm</span>
                    </a>
                    <h1 className="text-3xl font-bold font-display mb-2">
                        {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create account" : "Verify Email"}
                    </h1>
                    <p className="text-muted-foreground">
                        {mode === "signin"
                            ? "Sign in to access your AI-powered insights"
                            : mode === "signup"
                                ? "Join Metallm and unlock multi-model intelligence"
                                : `Enter the code sent to ${targetEmail}`}
                    </p>
                </div>

                {/* Auth Card */}
                <div className="bg-card/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
                    {/* Mode Tabs (Hide in verify mode) */}
                    {mode !== "verify" && (
                        <div className="flex mb-6 bg-white/5 rounded-lg p-1">
                            <button
                                onClick={() => setMode("signin")}
                                className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${mode === "signin"
                                    ? "bg-primary text-white shadow-lg"
                                    : "text-muted-foreground hover:text-white"
                                    }`}
                            >
                                Sign In
                            </button>
                            <button
                                onClick={() => setMode("signup")}
                                className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${mode === "signup"
                                    ? "bg-primary text-white shadow-lg"
                                    : "text-muted-foreground hover:text-white"
                                    }`}
                            >
                                Sign Up
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === "verify" ? (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="otp" className="text-sm text-muted-foreground">
                                        Verification Code
                                    </Label>
                                    <Input
                                        id="otp"
                                        type="text"
                                        placeholder="123456"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                        className="text-center text-2xl tracking-widest bg-white/5 border-white/10 focus:border-primary h-14"
                                        maxLength={6}
                                        autoFocus
                                    />
                                </div>
                                <div className="text-center">
                                    <button
                                        type="button"
                                        onClick={handleResendOtp}
                                        className="text-sm text-primary hover:underline"
                                    >
                                        Resend Code
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Existing Signup/Login Fields */}
                                {mode === "signup" && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="firstName" className="text-sm text-muted-foreground">
                                                First Name
                                            </Label>
                                            <Input
                                                id="firstName"
                                                type="text"
                                                placeholder="John"
                                                value={firstName}
                                                onChange={(e) => setFirstName(e.target.value)}
                                                className="bg-white/5 border-white/10 focus:border-primary"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="lastName" className="text-sm text-muted-foreground">
                                                Last Name
                                            </Label>
                                            <Input
                                                id="lastName"
                                                type="text"
                                                placeholder="Doe"
                                                value={lastName}
                                                onChange={(e) => setLastName(e.target.value)}
                                                className="bg-white/5 border-white/10 focus:border-primary"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-sm text-muted-foreground">
                                        Email
                                    </Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="bg-white/5 border-white/10 focus:border-primary"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="password" className="text-sm text-muted-foreground">
                                        Password
                                    </Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        className="bg-white/5 border-white/10 focus:border-primary"
                                    />
                                    {mode === "signup" && (
                                        <p className="text-xs text-muted-foreground mt-1">Must be at least 6 characters</p>
                                    )}
                                </div>
                            </>
                        )}

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-11 bg-white text-black hover:bg-white/90 font-medium"
                        >
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    {mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Verify Email"}
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </>
                            )}
                        </Button>
                    </form>

                    {/* Divider - distinct for verify */}
                    {mode !== "verify" && (
                        <>
                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-white/10"></div>
                                </div>
                                <div className="relative flex justify-center text-xs">
                                    <span className="bg-card px-3 text-muted-foreground">or continue with</span>
                                </div>
                            </div>

                            <a href="/api/auth/google" className="block">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full h-11 border-white/10 hover:bg-white/5 hover:border-white/20"
                                >
                                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                                        <path
                                            fill="currentColor"
                                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        />
                                    </svg>
                                    Continue with Google
                                </Button>
                            </a>
                        </>
                    )}

                    {/* Back to sign in link for verify mode */}
                    {mode === "verify" && (
                        <div className="text-center mt-6">
                            <button
                                onClick={() => setMode("signin")}
                                className="text-sm text-muted-foreground hover:text-white transition-colors"
                            >
                                Back to Sign In
                            </button>
                        </div>
                    )}
                </div>

                <p className="text-center text-sm text-muted-foreground mt-6">
                    By continuing, you agree to our Terms of Service and Privacy Policy.
                </p>
            </motion.div>
        </div>
    );
}
