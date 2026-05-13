import { Sidebar } from "@/components/Sidebar";
import { useQueries } from "@/hooks/use-metallm";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

export default function History() {
  const { data: queries, isLoading } = useQueries();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      
      <main className="flex-1 lg:ml-64">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
          <header>
            <h1 className="text-3xl font-bold font-display tracking-tight text-white mb-2">
              Query History
            </h1>
            <p className="text-muted-foreground">
              Archive of all your multi-model analyses.
            </p>
          </header>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {queries?.map((query) => (
                <Link key={query.id} href={`/query/${query.id}`}>
                  <Card className="bg-card border-white/5 hover:border-primary/50 transition-all cursor-pointer group hover:shadow-lg hover:shadow-primary/10 h-full flex flex-col">
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="text-xs font-mono uppercase text-muted-foreground border-white/10 group-hover:border-primary/30 group-hover:text-primary transition-colors">
                          {query.role}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(query.createdAt), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
                        {query.prompt}
                      </CardTitle>
                      <CardDescription className="line-clamp-3 mt-2 flex-1">
                        {query.orchestratorSummary || "Processing..."}
                      </CardDescription>
                      
                      <div className="pt-4 mt-auto flex items-center text-sm text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0 duration-300">
                        View Analysis <ArrowRight className="w-4 h-4 ml-1" />
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
              
              {!queries?.length && (
                <div className="col-span-full text-center py-20 text-muted-foreground">
                  No queries found. Start your first analysis!
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
