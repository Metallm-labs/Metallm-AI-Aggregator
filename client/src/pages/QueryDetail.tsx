import { useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { useQueryDetail } from "@/hooks/use-metallm";
import { useRoute } from "wouter";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function QueryDetail() {
  const [match, params] = useRoute("/query/:id");
  const id = params?.id ? parseInt(params.id) : null;
  const { data: queryData, isLoading, error } = useQueryDetail(id);

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !queryData) {
    return (
      <div className="flex min-h-screen bg-background text-foreground items-center justify-center flex-col gap-4">
        <h2 className="text-2xl font-bold">Query Not Found</h2>
        <Link href="/chat">
          <Button>Return to Chat</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      
      <main className="flex-1 lg:ml-64">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/history">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold font-display tracking-tight text-white">Analysis Result</h1>
                <Badge variant="secondary" className="uppercase text-xs tracking-wider">{queryData.role}</Badge>
              </div>
              <p className="text-muted-foreground text-sm font-mono">ID: #{queryData.id}</p>
            </div>
          </div>

          <div className="bg-card/50 border border-white/5 rounded-xl p-6 mb-8">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Original Prompt</h3>
            <p className="text-lg text-white leading-relaxed">{queryData.prompt}</p>
          </div>

          <ResultsDashboard data={queryData} />
        </div>
      </main>
    </div>
  );
}
