import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, AlertTriangle } from "lucide-react";
import React, { Suspense, lazy } from "react";

import Landing from "@/pages/Landing";
const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const History = lazy(() => import("@/pages/History"));
const QueryDetail = lazy(() => import("@/pages/QueryDetail"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Refund = lazy(() => import("@/pages/Refund"));

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
    location === "/login" ||
    location === "/terms" ||
    location === "/privacy" ||
    location === "/refund";
  const [authEnabled, setAuthEnabled] = React.useState(!isPublicRoute);

  React.useEffect(() => {
    if (!isPublicRoute) {
      setAuthEnabled(true);
      return;
    }

    const timeoutId = window.setTimeout(() => setAuthEnabled(true), 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isPublicRoute]);

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
        {user ? <Redirect to="/dashboard" /> : <Landing />}
      </Route>

      {/* Login Page */}
      <Route path="/login">
        {user ? <Redirect to="/dashboard" /> : <Login />}
      </Route>

      {/* Public Legal Pages */}
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/refund" component={Refund} />

      {/* Protected App Routes */}
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/history">
        <ProtectedRoute component={History} />
      </Route>
      <Route path="/query/:id">
        <ProtectedRoute component={QueryDetail} />
      </Route>

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
