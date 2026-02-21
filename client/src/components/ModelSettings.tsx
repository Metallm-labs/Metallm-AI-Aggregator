import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Save, RotateCcw, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { ModelIcon } from "@/components/ModelIcon";

interface ModelConfig {
    id: string;
    displayName: string;
    role: string;
    systemPrompt: string;
    iconUrl?: string;
    color: string;
}

interface ModelSettingsProps {
    onClose: () => void;
    onSave?: () => void;
}

const colorOptions = [
    { value: "purple", label: "Purple", class: "bg-purple-500" },
    { value: "green", label: "Green", class: "bg-green-500" },
    { value: "blue", label: "Blue", class: "bg-blue-500" },
    { value: "cyan", label: "Cyan", class: "bg-cyan-500" },
    { value: "lime", label: "Lime", class: "bg-lime-500" },
    { value: "pink", label: "Pink", class: "bg-pink-500" },
    { value: "amber", label: "Amber", class: "bg-amber-500" },
    { value: "teal", label: "Teal", class: "bg-teal-500" },
];

export function ModelSettings({ onClose, onSave }: ModelSettingsProps) {
    const [models, setModels] = useState<ModelConfig[]>([]);
    const [mainModelId, setMainModelId] = useState("");
    const [expandedModel, setExpandedModel] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    // Fetch current model configs
    useEffect(() => {
        fetchModels();
    }, []);

    const fetchModels = async () => {
        try {
            const res = await fetch("/api/models", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setModels(data.models);
                setMainModelId(data.mainModelId);
            }
        } catch (e) {
            console.error("Failed to fetch models:", e);
        } finally {
            setIsLoading(false);
        }
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
            if (res.ok) {
                toast({ description: "✅ Model settings saved!" });
                onSave?.();
            } else {
                toast({ description: "Failed to save settings", variant: "destructive" });
            }
        } catch (e) {
            toast({ description: "Error saving settings", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        setIsLoading(true);
        try {
            // Reset to defaults by sending empty body
            const res = await fetch("/api/models", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
                credentials: "include",
            });
            if (res.ok) {
                await fetchModels();
                toast({ description: "♻️ Reset to default settings" });
                onSave?.();
            }
        } catch (e) {
            console.error("Reset failed:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const updateModel = (index: number, field: keyof ModelConfig, value: string) => {
        setModels(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    if (isLoading) {
        return (
            <div className="p-6 text-center text-muted-foreground">
                Loading model settings...
            </div>
        );
    }

    return (
        <div className="p-4 bg-card/30 backdrop-blur-sm max-h-[60vh] overflow-y-auto">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-primary" />
                        <h3 className="text-sm font-semibold text-white">Model Configuration</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            {models.length} models
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleReset}
                            className="text-xs text-muted-foreground hover:text-white"
                        >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Reset
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="text-xs bg-primary hover:bg-primary/90"
                        >
                            <Save className="w-3 h-3 mr-1" />
                            {isSaving ? "Saving..." : "Save"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-7 w-7 text-muted-foreground hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Main Model Selector */}
                <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Main Orchestrator Model (used for routing & summarization)
                    </label>
                    <select
                        value={mainModelId}
                        onChange={(e) => setMainModelId(e.target.value)}
                        className="w-full bg-background/50 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                        {models.map(m => (
                            <option key={m.id} value={m.id}>
                                {m.displayName} ({m.role})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Model Cards */}
                <div className="space-y-2">
                    {models.map((model, index) => (
                        <motion.div
                            key={model.id}
                            layout
                            className="rounded-lg border border-white/10 overflow-hidden bg-white/5"
                        >
                            {/* Collapsed header */}
                            <div
                                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                                onClick={() => setExpandedModel(expandedModel === model.id ? null : model.id)}
                            >
                                <span className="text-lg flex-shrink-0"><ModelIcon modelName={model.displayName} iconUrl={model.iconUrl} size={22} /></span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-white truncate">{model.displayName}</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-muted-foreground">
                                            {model.role}
                                        </span>
                                        {model.id === mainModelId && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                                                Main
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className="text-[10px] text-muted-foreground/50 font-mono truncate max-w-[150px] hidden sm:block">
                                    {model.id}
                                </span>
                                {expandedModel === model.id ? (
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                            </div>

                            {/* Expanded editor */}
                            <AnimatePresence>
                                {expandedModel === model.id && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
                                            {/* Display Name */}
                                            <div>
                                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                                                    Display Name
                                                </label>
                                                <input
                                                    type="text"
                                                    value={model.displayName}
                                                    onChange={(e) => updateModel(index, "displayName", e.target.value)}
                                                    className="w-full bg-background/50 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                            </div>

                                            {/* Role */}
                                            <div>
                                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                                                    Role / Specialty
                                                </label>
                                                <input
                                                    type="text"
                                                    value={model.role}
                                                    onChange={(e) => updateModel(index, "role", e.target.value)}
                                                    className="w-full bg-background/50 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
                                                />
                                            </div>

                                            {/* System Prompt */}
                                            <div>
                                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                                                    System Prompt
                                                </label>
                                                <textarea
                                                    value={model.systemPrompt}
                                                    onChange={(e) => updateModel(index, "systemPrompt", e.target.value)}
                                                    className="w-full bg-background/50 border border-white/10 rounded-md px-3 py-2 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-primary resize-none font-mono leading-relaxed"
                                                    rows={4}
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}
