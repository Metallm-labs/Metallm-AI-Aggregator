import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ModelIcon } from "@/components/ModelIcon";
import { Settings, MessageSquare, LogOut, Trash2, Send, UserRound } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AvailableModel {
  id: string;
  displayName: string;
  role: string;
  iconUrl?: string;
  provider: string;
}

interface UserSettingsPanelProps {
  availableModels: AvailableModel[];
  mainModelId: string;
  onMainModelChange: (modelId: string) => void;
}

export function UserSettingsPanel({ availableModels, mainModelId, onMainModelChange }: UserSettingsPanelProps) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [feedback, setFeedback] = useState("");
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingModelId, setPendingModelId] = useState(mainModelId);

  const handleSaveModel = async () => {
    if (pendingModelId === mainModelId) {
      toast({ description: "No changes to save." });
      return;
    }
    setIsSavingModel(true);
    try {
      const res = await fetch("/api/models", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const saveRes = await fetch("/api/models", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ models: data.models, mainModelId: pendingModelId }),
          credentials: "include",
        });
        if (saveRes.ok) {
          onMainModelChange(pendingModelId);
          toast({ description: "Main model updated!" });
        } else {
          toast({ description: "Failed to save model setting.", variant: "destructive" });
        }
      }
    } catch {
      toast({ description: "Error saving model setting.", variant: "destructive" });
    } finally {
      setIsSavingModel(false);
    }
  };

  const handleSendFeedback = async () => {
    if (!feedback.trim()) return;
    setIsSendingFeedback(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() }),
        credentials: "include",
      });
    } catch {
      // silently ignore — thank the user regardless
    } finally {
      toast({ description: "Thank you for your feedback! 🙏" });
      setFeedback("");
      setIsSendingFeedback(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ description: "Account deleted. Goodbye!", variant: "destructive" });
        setTimeout(() => logout(), 1200);
      } else {
        toast({ description: "Failed to delete account. Please try again.", variant: "destructive" });
        setIsDeleting(false);
      }
    } catch {
      toast({ description: "Error deleting account. Please try again.", variant: "destructive" });
      setIsDeleting(false);
    }
  };

  const selectedModel = availableModels.find((m) => m.id === pendingModelId);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8">
      <div className="max-w-xl mx-auto space-y-5">

        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2"
        >
          <h1 className="text-2xl font-bold text-white tracking-tight">Account Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your profile, preferences, and account.</p>
        </motion.div>

        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="rounded-2xl bg-card/60 border border-white/10 p-5 flex items-center gap-4"
        >
          <div className="relative w-14 h-14 rounded-full flex-shrink-0 overflow-hidden shadow-lg">
            {user?.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={user.firstName || "User"}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  (e.currentTarget.nextSibling as HTMLElement).style.display = "flex";
                }}
              />
            ) : null}
            <div
              className="w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 items-center justify-center text-xl font-bold text-white"
              style={{ display: user?.profileImageUrl ? "none" : "flex" }}
            >
              {user?.firstName?.[0]?.toUpperCase() ?? "U"}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-white truncate">
              {user?.firstName
                ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
                : "User"}
            </p>
            <p className="text-sm text-muted-foreground truncate mt-0.5">{user?.email ?? ""}</p>
          </div>
          <div className="flex-shrink-0">
            <UserRound className="w-5 h-5 text-muted-foreground/40" />
          </div>
        </motion.div>

        {/* Main Model Selector */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl bg-card/60 border border-white/10 p-5"
        >
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-white">Main Model</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            This model orchestrates routing for all your single-mode queries.
          </p>

          {/* Current selection preview */}
          {selectedModel && (
            <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-white/5 border border-white/10">
              <ModelIcon modelName={selectedModel.displayName} iconUrl={selectedModel.iconUrl} size={20} />
              <span className="text-sm text-white font-medium">{selectedModel.displayName}</span>
              <span className="text-xs text-muted-foreground ml-1">— {selectedModel.role}</span>
            </div>
          )}

          <select
            value={pendingModelId}
            onChange={(e) => setPendingModelId(e.target.value)}
            className="w-full bg-background/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary mb-3"
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} — {m.role}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            onClick={handleSaveModel}
            disabled={isSavingModel || pendingModelId === mainModelId}
            className="w-full"
          >
            {isSavingModel ? "Saving…" : pendingModelId === mainModelId ? "No Changes" : "Save Main Model"}
          </Button>
        </motion.div>

        {/* Feedback */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-2xl bg-card/60 border border-white/10 p-5"
        >
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-white">Send Feedback</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Share your thoughts, report an issue, or suggest improvements.
          </p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What's on your mind?"
            rows={4}
            className="w-full bg-background/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none mb-3"
          />
          <Button
            size="sm"
            onClick={handleSendFeedback}
            disabled={isSendingFeedback || !feedback.trim()}
            className="w-full"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {isSendingFeedback ? "Sending…" : "Send Feedback"}
          </Button>
        </motion.div>

        {/* Account Actions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="rounded-2xl bg-card/60 border border-white/10 p-5 space-y-2"
        >
          <h3 className="text-sm font-semibold text-white mb-3">Account</h3>

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-white hover:bg-white/5"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>

          <div className="h-px bg-white/5" />

          <AnimatePresence>
            {showDeleteConfirm ? (
              <motion.div
                key="delete-confirm"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 space-y-3 mt-2">
                  <p className="text-sm text-red-300 font-medium">
                    ⚠️ This action is permanent and cannot be undone. All your conversations and data will be deleted.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 text-muted-foreground hover:text-white"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                      onClick={handleDeleteAccount}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting…" : "Yes, Delete My Account"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <Button
                key="delete-btn"
                variant="ghost"
                className="w-full justify-start gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={handleDeleteAccount}
              >
                <Trash2 className="w-4 h-4" />
                Delete Account
              </Button>
            )}
          </AnimatePresence>
        </motion.div>

      </div>
    </div>
  );
}
