import {
  Menu,
  Bot,
  MessageSquare,
  MessageSquarePlus,
  Trash2,
  Search,
  X,
  Activity,
  ChevronRight,
  Settings2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import { useConversations, useDeleteConversation } from "@/hooks/use-chat";
import { motion, AnimatePresence } from "framer-motion";

interface SidebarProps {
  activeConversationId?: number | null;
  onSelectConversation?: (id: number) => void;
  onNewChat?: () => void;
  onConversationDeleted?: (id: number) => void;
  onCollapseChange?: (collapsed: boolean) => void;
  onProfileClick?: () => void;
  onUpgradeClick?: () => void;
  onAuthAction?: (mode: "signin" | "signup") => void;
  wsConnected?: boolean;
  wsLatencyMs?: number | null;
  publicMode?: boolean;
}

const DESKTOP_SIDEBAR_WIDTH = 288;

export const Sidebar = memo(function Sidebar({
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onConversationDeleted,
  onCollapseChange,
  onProfileClick,
  onUpgradeClick,
  onAuthAction,
  wsConnected = false,
  wsLatencyMs = null,
  publicMode = false,
}: SidebarProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const isGuestView = publicMode && !user;
  const hasActivePlan = Number(user?.credits ?? 0) > 0;
  const { data: conversations = [], isLoading } = useConversations({ enabled: !!user });
  const deleteConversation = useDeleteConversation();

  const toggleDesktopSidebar = (nextCollapsed: boolean) => {
    setIsCollapsed(nextCollapsed);
    onCollapseChange?.(nextCollapsed);
  };

  const filteredConversations = searchQuery.trim()
    ? conversations.filter((conversation) => conversation.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    deleteConversation.mutate(id, {
      onSuccess: () => onConversationDeleted?.(id),
    });
  };

  const pingToneClass = !wsConnected
    ? "bg-red-400"
    : wsLatencyMs !== null && wsLatencyMs <= 120
      ? "bg-emerald-400"
      : wsLatencyMs !== null && wsLatencyMs <= 280
        ? "bg-yellow-400"
        : "bg-orange-400";
  const pingLabel = !wsConnected
    ? "Reconnecting"
    : wsLatencyMs === null
      ? "Measuring..."
      : `${wsLatencyMs} ms`;

  const upgradePill = (
    <button
      type="button"
      onClick={() => {
        onUpgradeClick?.();
        setIsOpen(false);
      }}
      className="group mt-4 w-full rounded-full border border-white/20 bg-[radial-gradient(circle_at_top,rgba(172,139,255,0.36),rgba(54,88,255,0.18)_42%,rgba(255,255,255,0.04)_80%)] px-4 py-3 text-left shadow-[0_0_22px_rgba(112,146,255,0.28),inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-xl transition-all hover:scale-[1.01] hover:shadow-[0_0_30px_rgba(112,146,255,0.38),inset_0_1px_0_rgba(255,255,255,0.45)]"
      title="Upgrade to Pro"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/70">Upgrade</p>
          <p className="mt-1 text-sm font-semibold text-white">Upgrade to Pro</p>
        </div>
        <div className="h-9 w-9 rounded-full border border-white/20 bg-white/10 shadow-[0_0_18px_rgba(137,169,255,0.35)]" />
      </div>
    </button>
  );

  const renderNavContent = ({ isMobile = false }: { isMobile?: boolean } = {}) => (
    <div className="flex h-full flex-col bg-background px-3 py-4">
      <div className="px-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.05]">
              <img src="/favicon.svg" alt="Metallm" className="h-7 w-7" style={{ objectFit: "contain", mixBlendMode: "screen" }} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Metallm</h1>
              <p className="text-xs text-muted-foreground">AI Aggregator</p>
            </div>
          </div>

          {isMobile && (
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-2xl text-muted-foreground hover:bg-white/[0.06] hover:text-white"
                title="Close sidebar"
              >
                <X className="h-4 w-4" />
              </Button>
            </SheetClose>
          )}
        </div>

        <button
          onClick={() => {
            onNewChat?.();
            setIsOpen(false);
          }}
          className="mt-5 flex w-full items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition-all hover:bg-white/[0.08]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.06]">
            <MessageSquarePlus className="h-4 w-4" />
          </span>
          <span>New Chat</span>
        </button>

        {user && (
          <a
            href="/business-agent"
            onClick={() => setIsOpen(false)}
            className="mt-3 flex w-full items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition-all hover:bg-white/[0.08]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.06]">
              <Bot className="h-4 w-4" />
            </span>
            <span>Business Agent</span>
          </a>
        )}

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/45" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full rounded-[20px] border border-white/10 bg-white/[0.04] py-3 pl-10 pr-10 text-sm text-white placeholder:text-muted-foreground/35 focus:outline-none focus:ring-1 focus:ring-white/15"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/55 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/45">
          {searchQuery ? `Results ${filteredConversations.length}` : "Chats"}
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto px-1 scrollbar-hide">
          <AnimatePresence initial={false}>
            {filteredConversations.map((chat) => (
              <motion.div
                key={chat.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16 }}
                onClick={() => {
                  onSelectConversation?.(chat.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "group flex w-full cursor-pointer items-center gap-3 rounded-[22px] px-3 py-3 text-left transition-all",
                  activeConversationId === chat.id
                    ? "bg-white/[0.1] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                    : "text-muted-foreground hover:bg-white/[0.05] hover:text-white"
                )}
              >
                <span className={cn(
                  "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl",
                  activeConversationId === chat.id ? "bg-white/[0.08]" : "bg-white/[0.04]"
                )}>
                  <MessageSquare className="h-4 w-4" />
                </span>

                <span className="min-w-0 flex-1 truncate text-sm">{chat.title}</span>

                <button
                  onClick={(e) => handleDelete(e, chat.id)}
                  className={cn(
                    "transition-all text-muted-foreground/70 hover:text-red-300",
                    isMobile
                      ? "opacity-100 rounded-xl p-1.5 -mr-1"
                      : "opacity-0 group-hover:opacity-100"
                  )}
                  aria-label={`Delete ${chat.title || "chat"}`}
                  title="Delete chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredConversations.length === 0 && !isLoading && (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground/45">
              {searchQuery
                ? "No chats match your search."
                : isGuestView
                  ? "Sign in to save and revisit chats."
                  : "No chats yet. Start a new conversation."}
            </p>
          )}
        </div>
      </div>

      {user && !hasActivePlan ? upgradePill : null}

      {isGuestView ? (
        <div className="mt-4 grid gap-2">
          <Button
            type="button"
            className="w-full rounded-[18px] bg-white text-black hover:bg-white/90"
            onClick={() => {
              onAuthAction?.("signup");
              setIsOpen(false);
            }}
          >
            Create Account
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-[18px] border-white/12 bg-white/[0.03] text-white hover:bg-white/[0.08]"
            onClick={() => {
              onAuthAction?.("signin");
              setIsOpen(false);
            }}
          >
            Sign In
          </Button>
        </div>
      ) : (
        <button
          onClick={() => {
            onProfileClick?.();
            setIsOpen(false);
          }}
          className="mt-4 flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/[0.05] px-3 py-3 text-left transition-all hover:bg-white/[0.08]"
          title="Open control center"
        >
          <div className="relative h-11 w-11 overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.04]">
            {user?.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={user.firstName || "User"}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  (e.currentTarget.nextSibling as HTMLElement).style.display = "flex";
                }}
              />
            ) : null}
            <div
              className="h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-600 text-sm font-bold text-white"
              style={{ display: user?.profileImageUrl ? "none" : "flex" }}
            >
              {user?.firstName?.[0]?.toUpperCase() || "U"}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-white">{user?.firstName || "User"}</p>
              <span className={cn("h-2 w-2 rounded-full", pingToneClass, wsConnected && "animate-pulse")} />
            </div>
            <p className="truncate text-xs text-muted-foreground">{user?.email || "user@example.com"}</p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/80">
              <Activity className="h-3 w-3" />
              {pingLabel}
            </span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/[0.06] text-muted-foreground">
              <Settings2 className="h-4 w-4" />
            </span>
          </div>
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="hidden lg:block">
        <motion.aside
          className="fixed left-0 top-0 z-40 h-screen"
          animate={{ x: isCollapsed ? -(DESKTOP_SIDEBAR_WIDTH + 18) : 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 28 }}
          style={{ width: DESKTOP_SIDEBAR_WIDTH }}
        >
          {renderNavContent()}
        </motion.aside>

        <motion.button
          type="button"
          onClick={() => toggleDesktopSidebar(!isCollapsed)}
          className="fixed top-1/2 z-50 flex h-16 w-9 -translate-y-1/2 items-center justify-center rounded-r-full border border-white/10 bg-background/95 text-white shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur"
          animate={{ x: isCollapsed ? 0 : DESKTOP_SIDEBAR_WIDTH - 2 }}
          transition={{ type: "spring", stiffness: 240, damping: 28 }}
          title={isCollapsed ? "Open sidebar" : "Hide sidebar"}
        >
          <div className="flex flex-col items-center gap-1">
            <span className="h-5 w-[3px] rounded-full bg-white/15" />
            <ChevronRight className={cn("h-4 w-4 transition-transform", !isCollapsed && "rotate-180")} />
          </div>
        </motion.button>
      </div>

      <div className="fixed left-4 top-4 z-50 lg:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-2xl border-white/10 bg-background/95">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 border-r border-white/10 bg-background p-0" hideClose>
            {renderNavContent({ isMobile: true })}
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
});
