import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { QueryInput } from "@/components/QueryInput";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { useQueryDetail } from "@/hooks/use-metallm";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const [activeQueryId, setActiveQueryId] = useState<number | null>(null);
  const { data: queryData, isLoading } = useQueryDetail(activeQueryId);
  const { user, isLoading: authLoading } = useAuth();

  // Redirect if not logged in (handled by wrapper or useEffect, but adding safeguard)
  if (authLoading) return <div className="h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!user) return null; // Should redirect

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      
      <main className="flex-1 lg:ml-64 relative">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
          
          {/* Header */}
          <header className="flex flex-col gap-2 mb-12">
            <h1 className="text-3xl font-bold font-display tracking-tight text-white">
              Query Orchestrator
            </h1>
            <p className="text-muted-foreground">
              Deploy multiple AI agents to analyze complex problems from every angle.
            </p>
          </header>

          {/* Input Section - Sticky or Top */}
          <div className="relative z-10">
            <QueryInput onSuccess={setActiveQueryId} />
          </div>

          {/* Results Section */}
          <div className="min-h-[400px]">
            <AnimatePresence mode="wait">
              {isLoading && activeQueryId ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-20 gap-4"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full"></div>
                    <Loader2 className="w-12 h-12 animate-spin text-primary relative z-10" />
                  </div>
                  <p className="text-muted-foreground animate-pulse">Aggregating intelligence streams...</p>
                </motion.div>
              ) : queryData ? (
                <ResultsDashboard data={queryData} />
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-center space-y-4 border border-dashed border-white/10 rounded-2xl bg-white/5"
                >
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center">
                    <span className="text-4xl">✨</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-medium text-white">Ready to Analyze</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                      Enter a prompt above to see how different AI models tackle the same problem.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
