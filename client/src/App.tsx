import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, AlertTriangle } from "lucide-react";
import React, { Suspense, lazy, useEffect } from "react";

import Landing from "@/pages/Landing";
const LandingWhatsapp = lazy(() => import("@/pages/LandingWhatsapp"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const BusinessAgent = lazy(() => import("@/pages/BusinessAgent"));
const History = lazy(() => import("@/pages/History"));
const QueryDetail = lazy(() => import("@/pages/QueryDetail"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Refund = lazy(() => import("@/pages/Refund"));
const Blogs = lazy(() => import("@/pages/Blogs"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const ModelCompareTool = lazy(() => import("@/pages/ModelCompareTool"));
const Admin = lazy(() => import("@/pages/Admin"));
const CompareCompetitors = lazy(() => import("@/pages/CompareCompetitors"));
const CompareDetail = lazy(() => import("@/pages/CompareDetail"));

function isLikelyCrawler(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /(googlebot|bingbot|duckduckbot|slurp|baiduspider|yandex|crawler|spider|bot)/.test(ua);
}

// ─── Top-level error boundary ─────────────────────────────────────────────────
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-8">
          <div className="max-w-lg w-full rounded-xl border border-destructive/30 bg-destructive/10 p-6 space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-semibold">Something went wrong</span>
            </div>
            <p className="text-sm text-muted-foreground break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="text-xs text-primary underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Redirect to landing page instead of login directly, gives user context
    return <Redirect to="/" />;
  }

  return <Component />;
}

function Router() {
  const [location] = useLocation();
  const isPublicRoute =
    location === "/" ||
    location === "/chat" ||
    location === "/agent" ||
    location === "/login" ||
    location === "/forgot-password" ||
    location === "/reset-password" ||
    location === "/compare" ||
    location === "/compare-competitors" ||
    location.startsWith("/compare/") ||
    location === "/terms" ||
    location === "/privacy" ||
    location === "/blogs" ||
    location === "/refund" ||
    location === "/admin";
  const isCrawler = isLikelyCrawler();
  const [authEnabled, setAuthEnabled] = React.useState(!isPublicRoute);

  React.useEffect(() => {
    if (!isPublicRoute) {
      setAuthEnabled(true);
      return;
    }

    // Avoid bot-triggered auth XHR calls on public SEO pages.
    if (isCrawler) {
      setAuthEnabled(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setAuthEnabled(true), 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isPublicRoute, isCrawler]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success" && typeof window.gtag === "function") {
      const amount = parseFloat(params.get("amount") || "0");
      window.gtag("event", "conversion", {
        send_to: "AW-18126600047/uYRLCL7_26QcEO_ut8ND",
        value: amount || 19,
        currency: "USD",
        transaction_id: `ls_${Date.now()}`,
      });
    }
  }, []);

  const { user, isLoading } = useAuth({ enabled: authEnabled });

  if (isLoading && !isPublicRoute) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      {/* Public Landing Page */}
      <Route path="/">
        {user ? <Redirect to="/chat" /> : <Landing />}
      </Route>

      <Route path="/agent">
        {user ? <Redirect to="/business-agent" /> : <LandingWhatsapp />}
      </Route>

      <Route path="/chat">
        <Dashboard allowGuest />
      </Route>

      <Route path="/compare" component={ModelCompareTool} />
      <Route path="/compare-competitors" component={CompareCompetitors} />
      <Route path="/compare/:competitor" component={CompareDetail} />

      {/* Login Page */}
      <Route path="/login">
        {user ? <Redirect to="/chat" /> : <Login />}
      </Route>
      <Route path="/forgot-password">
        {user ? <Redirect to="/chat" /> : <ForgotPassword />}
      </Route>
      <Route path="/reset-password">
        {user ? <Redirect to="/chat" /> : <ResetPassword />}
      </Route>

      {/* Public Legal Pages */}
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/blogs" component={Blogs} />
      <Route path="/refund" component={Refund} />

      {/* Protected App Routes */}
      <Route path="/dashboard">
        <Redirect to="/chat" />
      </Route>
      <Route path="/business-agent">
        <ProtectedRoute component={BusinessAgent} />
      </Route>
      <Route path="/history">
        <ProtectedRoute component={History} />
      </Route>
      <Route path="/query/:id">
        <ProtectedRoute component={QueryDetail} />
      </Route>

      {/* Admin Panel */}
      <Route path="/admin" component={Admin} />

      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Suspense
            fallback={
              <div className="h-screen w-screen flex items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            }
          >
            <ErrorBoundary>
              <Router />
            </ErrorBoundary>
          </Suspense>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
