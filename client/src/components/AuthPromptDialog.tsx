import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, Sparkles } from "lucide-react";

type AuthIntent = "signin" | "signup";

interface AuthPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent?: AuthIntent;
  reason?: "send" | "sidebar" | "header";
  redirectTarget?: string;
}

function buildAuthHref(mode: AuthIntent, redirect: string = "/chat") {
  return `/login?mode=${mode}&redirect=${encodeURIComponent(redirect)}`;
}

export function AuthPromptDialog({
  open,
  onOpenChange,
  intent = "signin",
  reason = "send",
  redirectTarget = "/chat",
}: AuthPromptDialogProps) {
  const title =
    reason === "send"
      ? "Sign in to send messages"
      : intent === "signup"
        ? "Create your MetaLLM account"
        : "Welcome back to MetaLLM";

  const description =
    reason === "send"
      ? "The chat workspace is public, but sending messages, saving history, and syncing settings requires an account."
      : "Use your account to chat with top AI models, keep history, and unlock personalization.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-white/10 bg-[#09090c]/95 text-white backdrop-blur-xl">
        <DialogHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10">
            <Lock className="h-5 w-5 text-amber-300" />
          </div>
          <DialogTitle className="text-left text-xl font-semibold text-white">{title}</DialogTitle>
          <DialogDescription className="text-left text-sm text-white/65">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-start gap-3 text-sm text-white/80">
            <Sparkles className="mt-0.5 h-4 w-4 text-amber-300" />
            <p>
              Sign in when you are ready to send prompts, save conversations, and use memory and personalization.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="outline" className="flex-1 border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
            <a href={buildAuthHref("signin", redirectTarget)}>
              Sign In
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
          <Button asChild className="flex-1 bg-white text-black hover:bg-white/90">
            <a href={buildAuthHref("signup", redirectTarget)}>
              Create Account
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
