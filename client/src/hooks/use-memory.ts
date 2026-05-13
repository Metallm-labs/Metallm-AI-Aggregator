import { useCallback, useEffect, useState } from "react";

export interface UserMemoryPreference {
  enabled: boolean;
}

export interface UserMemoryItem {
  id: number;
  category: string;
  label: string;
  content: string;
  source: string;
  sourceConversationId: number | null;
  sourceMessageId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserMemorySection {
  category: string;
  label: string;
  items: UserMemoryItem[];
}

interface UserMemoryResponse {
  preferences: UserMemoryPreference;
  summary: string;
  memories: UserMemoryItem[];
  sections: UserMemorySection[];
}

const EMPTY_MEMORY_RESPONSE: UserMemoryResponse = {
  preferences: { enabled: true },
  summary: "No saved memories yet.",
  memories: [],
  sections: [],
};

function sanitizeMemoryItem(input: unknown): UserMemoryItem | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  if (typeof source.id !== "number" || !Number.isFinite(source.id)) return null;
  if (typeof source.category !== "string" || typeof source.content !== "string") return null;

  return {
    id: source.id,
    category: source.category,
    label: typeof source.label === "string" ? source.label : source.category,
    content: source.content,
    source: typeof source.source === "string" ? source.source : "model",
    sourceConversationId: typeof source.sourceConversationId === "number" ? source.sourceConversationId : null,
    sourceMessageId: typeof source.sourceMessageId === "number" ? source.sourceMessageId : null,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date(0).toISOString(),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date(0).toISOString(),
  };
}

function sanitizeMemoryResponse(input: unknown): UserMemoryResponse {
  if (!input || typeof input !== "object") return EMPTY_MEMORY_RESPONSE;
  const source = input as Record<string, unknown>;
  const memories = Array.isArray(source.memories)
    ? source.memories.map(sanitizeMemoryItem).filter((value): value is UserMemoryItem => !!value)
    : [];
  const sections = Array.isArray(source.sections)
    ? source.sections
        .map((section) => {
          if (!section || typeof section !== "object") return null;
          const entry = section as Record<string, unknown>;
          if (typeof entry.category !== "string" || typeof entry.label !== "string") return null;
          const items = Array.isArray(entry.items)
            ? entry.items.map(sanitizeMemoryItem).filter((value): value is UserMemoryItem => !!value)
            : [];
          return {
            category: entry.category,
            label: entry.label,
            items,
          } satisfies UserMemorySection;
        })
        .filter((value): value is UserMemorySection => !!value)
    : [];

  return {
    preferences: {
      enabled:
        !!(
          source.preferences &&
          typeof source.preferences === "object" &&
          (source.preferences as Record<string, unknown>).enabled !== false
        ),
    },
    summary: typeof source.summary === "string" ? source.summary : EMPTY_MEMORY_RESPONSE.summary,
    memories,
    sections,
  };
}

export function useMemory(userId?: string | null) {
  const [state, setState] = useState<UserMemoryResponse>(EMPTY_MEMORY_RESPONSE);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setState(EMPTY_MEMORY_RESPONSE);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/memory", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load memory");
      setState(sanitizeMemoryResponse(await res.json()));
    } catch {
      setState((prev) => prev);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    if (!userId) return false;
    setIsSaving(true);
    try {
      const res = await fetch("/api/memory/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to save memory preferences");
      setState(sanitizeMemoryResponse(await res.json()));
      return true;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [userId]);

  const deleteMemory = useCallback(async (memoryId: number) => {
    if (!userId) return false;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/memory/${memoryId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete memory");
      setState(sanitizeMemoryResponse(await res.json()));
      return true;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [userId]);

  const clearAll = useCallback(async () => {
    if (!userId) return false;
    setIsSaving(true);
    try {
      const res = await fetch("/api/memory", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to clear memory");
      setState(sanitizeMemoryResponse(await res.json()));
      return true;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [userId]);

  return {
    memory: state,
    isLoading,
    isSaving,
    refresh,
    setEnabled,
    deleteMemory,
    clearAll,
  };
}
