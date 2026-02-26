import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Save, RotateCcw, ChevronDown, ChevronUp, Settings2, Check, Users, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { ModelIcon } from "@/components/ModelIcon";
import type { ChatMode, DebateParticipant } from "@/components/ChatInput";

export const MAX_MULTI_MODELS = 6;

interface ServerModelConfig {
    id: string;
    displayName: string;
    role: string;
    systemPrompt: string;
    iconUrl?: string;
    color: string;
}

interface AvailableModel {
    id: string;
    displayName: string;
    role: string;
    iconUrl?: string;
    provider: string;
}

interface ModelSettingsProps {
    mode: ChatMode;
    availableModels: AvailableModel[];
    selectedMultiModelIds: string[];
    onMultiModelsChange: (ids: string[]) => void;
    debateParticipants: DebateParticipant[];
    onDebateConfigChange: (p: DebateParticipant[]) => void;
    onClose: () => void;
    onSave?: () => void;
}

// ─── Single/Route mode: full server-side config ───────────────────────────────
function SingleModeSettings({ onClose, onSave }: { onClose: () => void; onSave?: () => void }) {
    const [models, setModels] = useState<ServerModelConfig[]>([]);
    const [mainModelId, setMainModelId] = useState("");
    const [expandedModel, setExpandedModel] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => { fetchModels(); }, []);

    const fetchModels = async () => {
        try {
            const res = await fetch("/api/models", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setModels(data.models);
                setMainModelId(data.mainModelId);
            }
        } catch (e) { console.error("Failed to fetch models:", e); }
        finally { setIsLoading(false); }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch("/api/models", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ models, mainModelId }),
                credentials: "include",
            });
            if (res.ok) { toast({ description: "Model settings saved!" }); onSave?.(); }
            else toast({ description: "Failed to save settings", variant: "destructive" });
        } catch (e) { toast({ description: "Error saving settings", variant: "destructive" }); }
        finally { setIsSaving(false); }
    };

    const handleReset = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/models", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
                credentials: "include",
            });
            if (res.ok) { await fetchModels(); toast({ description: "Reset to defaults" }); onSave?.(); }
        } catch (e) { console.error("Reset failed:", e); }
        finally { setIsLoading(false); }
    };

    const updateModel = (index: number, field: keyof ServerModelConfig, value: string) => {
        setModels(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    if (isLoading) return <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>;

    return (
        <div className="p-4 max-h-[55vh] overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-3">
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                        Orchestrator (routing &amp; summarization)
                    </label>
                    <select value={mainModelId} onChange={(e) => setMainModelId(e.target.value)}
                        className="w-full bg-background/50 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary">
                        {models.map(m => <option key={m.id} value={m.id}>{m.displayName} ({m.role})</option>)}
                    </select>
                </div>
                <div className="space-y-2">
                    {models.map((model, index) => (
                        <motion.div key={model.id} layout className="rounded-lg border border-white/10 overflow-hidden bg-white/5">
                            <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                                onClick={() => setExpandedModel(expandedModel === model.id ? null : model.id)}>
                                <ModelIcon modelName={model.displayName} iconUrl={model.iconUrl} size={22} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-white truncate">{model.displayName}</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-muted-foreground">{model.role}</span>
                                        {model.id === mainModelId && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">Main</span>}
                                    </div>
                                </div>
                                <span className="text-[10px] text-muted-foreground/50 font-mono truncate max-w-[150px] hidden sm:block">{model.id}</span>
                                {expandedModel === model.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </div>
                            <AnimatePresence>
                                {expandedModel === model.id && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                        <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
                                            <div>
                                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Display Name</label>
                                                <input type="text" value={model.displayName} onChange={(e) => updateModel(index, "displayName", e.target.value)}
                                                    className="w-full bg-background/50 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Role / Specialty</label>
                                                <input type="text" value={model.role} onChange={(e) => updateModel(index, "role", e.target.value)}
                                                    className="w-full bg-background/50 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">System Prompt</label>
                                                <textarea value={model.systemPrompt} onChange={(e) => updateModel(index, "systemPrompt", e.target.value)}
                                                    className="w-full bg-background/50 border border-white/10 rounded-md px-3 py-2 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-primary resize-none font-mono leading-relaxed" rows={4} />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-muted-foreground hover:text-white">
                        <RotateCcw className="w-3 h-3 mr-1" /> Reset
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs bg-primary hover:bg-primary/90">
                        <Save className="w-3 h-3 mr-1" /> {isSaving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Multi mode: model selection checkboxes ────────────────────────────────────
function MultiModeSettings({ availableModels, selectedIds, onSelectionChange }: {
    availableModels: AvailableModel[];
    selectedIds: string[];
    onSelectionChange: (ids: string[]) => void;
}) {
    const { toast } = useToast();
    const toggle = (id: string) => {
        if (selectedIds.includes(id)) {
            if (selectedIds.length <= 1) return;
            onSelectionChange(selectedIds.filter(x => x !== id));
        } else {
            if (selectedIds.length >= MAX_MULTI_MODELS) {
                toast({
                    variant: "destructive",
                    description: `You can select up to ${MAX_MULTI_MODELS} models in All Models mode.`,
                });
                return;
            }
            onSelectionChange([...selectedIds, id]);
        }
    };
    const maxSelectable = Math.min(availableModels.length, MAX_MULTI_MODELS);
    const allSelected = selectedIds.length >= maxSelectable;
    return (
        <div className="p-4 max-h-[55vh] overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-2">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground">Pick which models respond to your query (max {MAX_MULTI_MODELS}).</p>
                    <button type="button"
                        onClick={() =>
                            onSelectionChange(
                                allSelected
                                    ? [availableModels[0].id]
                                    : availableModels.slice(0, MAX_MULTI_MODELS).map(m => m.id)
                            )
                        }
                        className="text-[10px] text-primary hover:text-primary/80 transition-colors">
                        {allSelected ? "Deselect all" : "Select all"}
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {availableModels.map(model => {
                        const selected = selectedIds.includes(model.id);
                        return (
                            <button key={model.id} type="button" onClick={() => toggle(model.id)}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all",
                                    selected ? "bg-purple-500/10 border-purple-500/30 text-white" : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                                )}>
                                <ModelIcon modelName={model.displayName} iconUrl={model.iconUrl} size={20} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium truncate">{model.displayName}</div>
                                    <div className="text-[10px] text-muted-foreground/60 truncate">{model.role}</div>
                                </div>
                                <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
                                    selected ? "bg-purple-500 border-purple-500" : "border-white/20")}>
                                    {selected && <Check className="w-2.5 h-2.5 text-white" />}
                                </div>
                            </button>
                        );
                    })}
                </div>
                <p className="text-[10px] text-muted-foreground/50 pt-1 text-center">
                    {selectedIds.length} selected (max {MAX_MULTI_MODELS})
                </p>
            </div>
        </div>
    );
}

// ─── Debate mode: 2-participant config ────────────────────────────────────────
function DebateModeSettings({ availableModels, participants, onChange }: {
    availableModels: AvailableModel[];
    participants: DebateParticipant[];
    onChange: (p: DebateParticipant[]) => void;
}) {
    const updateParticipant = (idx: number, field: keyof DebateParticipant, value: string) => {
        onChange(participants.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    };
    const modelFor = (idx: number) => availableModels.find(m => m.id === participants[idx]?.modelId);

    return (
        <div className="p-4 max-h-[55vh] overflow-y-auto">
            <div className="max-w-4xl mx-auto">
                <p className="text-xs text-muted-foreground mb-3">
                    Configure two debaters with their own model, role, and optional system prompt.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[0, 1].map(idx => {
                        const p = participants[idx];
                        const m = modelFor(idx);
                        if (!p) return null;
                        const isFirst = idx === 0;
                        return (
                            <div key={idx} className={cn("rounded-lg border p-3 space-y-2.5",
                                isFirst ? "border-orange-500/30 bg-orange-500/5" : "border-blue-500/30 bg-blue-500/5")}>
                                <span className={cn("inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide",
                                    isFirst ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400")}>
                                    Debater {idx + 1}
                                </span>
                                <div>
                                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Model</label>
                                    <div className="relative">
                                        <select value={p.modelId} onChange={e => updateParticipant(idx, "modelId", e.target.value)}
                                            className="w-full appearance-none bg-background/50 border border-white/10 rounded-md pl-9 pr-7 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary">
                                            {availableModels.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                                        </select>
                                        {m && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><ModelIcon modelName={m.displayName} iconUrl={m.iconUrl} size={16} /></span>}
                                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Role / Perspective</label>
                                    <input type="text" value={p.customRole} onChange={e => updateParticipant(idx, "customRole", e.target.value)}
                                        placeholder="e.g. Skeptic, Optimist, Devil's Advocate..."
                                        className="w-full bg-background/50 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">System Prompt (optional)</label>
                                    <textarea value={p.customSystemPrompt} onChange={e => updateParticipant(idx, "customSystemPrompt", e.target.value)}
                                        placeholder="Leave empty to use model defaults..."
                                        className="w-full bg-background/50 border border-white/10 rounded-md px-3 py-2 text-xs text-white/80 placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none font-mono leading-relaxed"
                                        rows={3} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────
const PANEL_TITLE: Partial<Record<ChatMode, string>> = {
    single: "Model Configuration",
    multi: "Select Models",
    debate: "Configure Debaters",
};

const PANEL_ICON: Partial<Record<ChatMode, JSX.Element>> = {
    single: <Settings2 className="w-4 h-4 text-primary" />,
    multi: <Users className="w-4 h-4 text-purple-400" />,
    debate: <MessageSquare className="w-4 h-4 text-orange-400" />,
};

export function ModelSettings({
    mode, availableModels, selectedMultiModelIds, onMultiModelsChange,
    debateParticipants, onDebateConfigChange, onClose, onSave,
}: ModelSettingsProps) {
    return (
        <div className="bg-card/30 backdrop-blur-sm">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                    {PANEL_ICON[mode as keyof typeof PANEL_ICON]}
                    <span className="text-sm font-semibold text-white">
                        {PANEL_TITLE[mode as keyof typeof PANEL_TITLE] ?? "Settings"}
                    </span>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-muted-foreground hover:text-white">
                    <X className="w-4 h-4" />
                </Button>
            </div>
            {mode === "single" && <SingleModeSettings onClose={onClose} onSave={onSave} />}
            {mode === "multi" && <MultiModeSettings availableModels={availableModels} selectedIds={selectedMultiModelIds} onSelectionChange={onMultiModelsChange} />}
            {mode === "debate" && <DebateModeSettings availableModels={availableModels} participants={debateParticipants} onChange={onDebateConfigChange} />}
        </div>
    );
}
