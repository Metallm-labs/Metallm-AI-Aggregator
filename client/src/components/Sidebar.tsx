import { Menu, MessageSquare, Trash2, PanelLeftClose, PanelLeft, LogOut, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
}

export const Sidebar = memo(function Sidebar({ activeConversationId, onSelectConversation, onNewChat, onConversationDeleted, onCollapseChange }: SidebarProps) {
  const { logout, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: conversations = [], isLoading } = useConversations();

  const toggleCollapse = (next: boolean) => {
    setIsCollapsed(next);
    onCollapseChange?.(next);
  };

  const filteredConversations = searchQuery.trim()
    ? conversations.filter(c => c.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;
  const deleteConversation = useDeleteConversation();

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    deleteConversation.mutate(id, {
      onSuccess: () => {
        onConversationDeleted?.(id);
      }
    });
  };

  const NavContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className={cn(
      "flex flex-col h-full bg-card/50 backdrop-blur-xl border-r border-white/5 transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Header with collapse button */}
      <div className={cn("p-4 border-b border-white/5", collapsed && "px-2")}>
        <div className={cn("flex items-center justify-between mb-6", collapsed && "justify-center")}>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <img src="/favicon.png" alt="Metallm" className={collapsed ? "w-9 h-9" : "w-10 h-10"} style={{ objectFit: "contain" }} />
            </div>
            {!collapsed && (
              <div>
                <h1 className="text-lg font-bold font-display tracking-tight text-white">Metallm</h1>
                <p className="text-xs text-muted-foreground">AI Aggregator</p>
              </div>
            )}
          </div>
          {/* Collapse Toggle (Desktop Only) */}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleCollapse(true)}
              className="w-8 h-8 text-muted-foreground hover:text-white hover:bg-white/5 hidden lg:flex"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          )}
          {collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleCollapse(false)}
              className="w-8 h-8 text-muted-foreground hover:text-white hover:bg-white/5 hidden lg:flex absolute right-2 top-4"
              title="Expand sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* New Chat */}
        <button
          onClick={() => {
            onNewChat?.();
            setIsOpen(false);
          }}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5 transition-all duration-200",
            collapsed && "justify-center px-2"
          )}
        >
          <MessageSquare className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* Chat History */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Search bar */}
        {!collapsed && (
          <div className="px-3 pt-2 pb-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search chats…"
                className="w-full bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder:text-muted-foreground/40 pl-7 pr-7 py-1.5 focus:outline-none focus:border-white/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 px-2 py-2 space-y-1 overflow-y-auto scrollbar-hide">
          {!collapsed && (
            <div className="px-2 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {searchQuery ? `Results (${filteredConversations.length})` : "Chats"}
            </div>
          )}

        <AnimatePresence>
          {filteredConversations.map((chat) => (
            <motion.div
              key={chat.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className={cn(
                "group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer",
                activeConversationId === chat.id
                  ? "bg-white/10 text-white shadow-inner border border-white/5"
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
              )}
              onClick={() => {
                onSelectConversation?.(chat.id);
                setIsOpen(false);
              }}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{chat.title}</span>
                  <button
                    onClick={(e) => handleDelete(e, chat.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

          {filteredConversations.length === 0 && !isLoading && !collapsed && (
            <p className="text-xs text-muted-foreground/50 px-3 py-4 text-center">
              {searchQuery ? "No chats match your search." : "No chats yet. Start a new conversation!"}
            </p>
          )}
        </div>
      </div>

      {/* User Section */}
      <div className={cn("p-3 mt-auto border-t border-white/5 bg-black/20", collapsed && "p-2")}>
        {!collapsed && (
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
              {user?.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt={user.firstName || "User"}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextSibling as HTMLElement).style.display = 'flex'; }}
                />
              ) : null}
              <div
                className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 items-center justify-center text-xs font-bold text-white shadow-inner"
                style={{ display: user?.profileImageUrl ? 'none' : 'flex' }}
              >
                {user?.firstName?.[0]?.toUpperCase() || "U"}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName || "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email || "user@example.com"}
              </p>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          className={cn(
            "w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10",
            collapsed ? "px-2" : "justify-start gap-2"
          )}
          size={collapsed ? "icon" : "default"}
          onClick={() => logout()}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && "Sign Out"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <motion.div
        className="hidden lg:block h-screen fixed left-0 top-0 z-40"
        animate={{ width: isCollapsed ? 64 : 256 }}
        transition={{ duration: 0.2 }}
      >
        <NavContent collapsed={isCollapsed} />
      </motion.div>

      {/* Mobile Trigger */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="bg-card border-white/10">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-80 bg-background border-r border-white/10">
            <NavContent collapsed={false} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
});
