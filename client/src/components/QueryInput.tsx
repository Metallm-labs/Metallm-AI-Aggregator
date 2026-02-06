import { useState } from "react";
import { useSubmitQuery } from "@/hooks/use-metallm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface QueryInputProps {
  onSuccess?: (id: number) => void;
}

export function QueryInput({ onSuccess }: QueryInputProps) {
  const [prompt, setPrompt] = useState("");
  const [role, setRole] = useState("general");
  const { mutate: submit, isPending } = useSubmitQuery();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    submit(
      { prompt, role, userId: "current" }, // userId handled by backend/auth context
      {
        onSuccess: (data) => {
          setPrompt("");
          toast({
            title: "Query Dispatched",
            description: "Orchestrating AI models for analysis...",
          });
          onSuccess?.(data.id);
        },
        onError: (err) => {
          toast({
            title: "Error",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSubmit(e as any);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-3xl mx-auto"
    >
      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-secondary to-accent rounded-2xl opacity-20 group-hover:opacity-40 transition duration-500 blur"></div>
        <div className="relative bg-card rounded-xl p-4 border border-white/10 shadow-2xl">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What would you like the collective intelligence to analyze?"
            className="min-h-[120px] bg-transparent border-0 resize-none focus-visible:ring-0 text-lg placeholder:text-muted-foreground/50"
          />
          
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-3">
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-[140px] bg-white/5 border-white/10 h-9">
                  <SelectValue placeholder="Select Role" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-white/10">
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="trader">Trader</SelectItem>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="creative">Creative</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground hidden sm:inline-block">
                ⌘ + Enter to send
              </span>
            </div>

            <Button 
              type="submit" 
              disabled={isPending || !prompt.trim()}
              className="bg-primary hover:bg-primary/90 text-white min-w-[120px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Thinking...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Analyze
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </motion.div>
  );
}
