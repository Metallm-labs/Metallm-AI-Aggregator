import { Link, useLocation } from "wouter";
import { PlusCircle, History, Settings, LogOut, Hexagon, Brain, Menu } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const NavContent = () => (
    <div className="flex flex-col h-full bg-card/50 backdrop-blur-xl border-r border-white/5">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-gradient-to-br from-primary to-secondary rounded-lg shadow-lg shadow-primary/20">
            <Hexagon className="w-6 h-6 text-white fill-current" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight text-white">Metallm</h1>
            <p className="text-xs text-muted-foreground">Multi-AI Aggregator</p>
          </div>
        </div>

        <Link href="/dashboard" onClick={() => setIsOpen(false)}>
          <Button 
            className="w-full justify-start gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all duration-300 group"
            size="lg"
          >
            <PlusCircle className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
            New Query
          </Button>
        </Link>
      </div>

      <div className="flex-1 px-4 py-2 space-y-2 overflow-y-auto scrollbar-hide">
        <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Menu
        </div>
        
        <Link href="/history" onClick={() => setIsOpen(false)}>
          <div className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
            location === "/history" 
              ? "bg-white/10 text-white shadow-inner border border-white/5" 
              : "text-muted-foreground hover:text-white hover:bg-white/5"
          )}>
            <History className="w-4 h-4" />
            Query History
          </div>
        </Link>

        {/* Placeholder for future features */}
        <Link href="/models" onClick={() => setIsOpen(false)}>
          <div className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
            location === "/models" 
              ? "bg-white/10 text-white shadow-inner border border-white/5" 
              : "text-muted-foreground hover:text-white hover:bg-white/5"
          )}>
            <Brain className="w-4 h-4" />
            Models
          </div>
        </Link>
      </div>

      <div className="p-4 mt-auto border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white shadow-inner">
            {user?.firstName?.[0] || "U"}
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
        
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => logout()}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-64 h-screen fixed left-0 top-0 z-40">
        <NavContent />
      </div>

      {/* Mobile Trigger */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="bg-card border-white/10">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-80 bg-background border-r border-white/10">
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
