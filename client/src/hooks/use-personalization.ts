import { useCallback, useEffect, useMemo, useState } from "react";

export interface UserPersonalization {
  nickname: string;
  occupation: string;
  customInstructions: string;
  moreAboutYou: string;
}

const EMPTY_PERSONALIZATION: UserPersonalization = {
  nickname: "",
  occupation: "",
  customInstructions: "",
  moreAboutYou: "",
};

function getStorageKey(userId?: string | null) {
  return userId ? `metallm.personalization:${userId}` : null;
}

function sanitizePersonalization(input?: Partial<UserPersonalization> | null): UserPersonalization {
  return {
    nickname: typeof input?.nickname === "string" ? input.nickname : "",
    occupation: typeof input?.occupation === "string" ? input.occupation : "",
    customInstructions: typeof input?.customInstructions === "string" ? input.customInstructions : "",
    moreAboutYou: typeof input?.moreAboutYou === "string" ? input.moreAboutYou : "",
  };
}

function loadLocalPersonalization(userId?: string | null): UserPersonalization {
  const key = getStorageKey(userId);
  if (!key || typeof window === "undefined") return EMPTY_PERSONALIZATION;

  try {
    return sanitizePersonalization(JSON.parse(window.localStorage.getItem(key) ?? "null"));
  } catch {
    return EMPTY_PERSONALIZATION;
  }
}

function persistLocalPersonalization(userId: string | null | undefined, value: UserPersonalization) {
  const key = getStorageKey(userId);
  if (!key || typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function clearLocalPersonalization(userId: string | null | undefined) {
  const key = getStorageKey(userId);
  if (!key || typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

export function usePersonalization(userId?: string | null) {
  const [draft, setDraft] = useState<UserPersonalization>(EMPTY_PERSONALIZATION);
  const [saved, setSaved] = useState<UserPersonalization>(EMPTY_PERSONALIZATION);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!userId) {
      setDraft(EMPTY_PERSONALIZATION);
      setSaved(EMPTY_PERSONALIZATION);
      setIsLoading(false);
      return;
    }

    const localFallback = loadLocalPersonalization(userId);
    setDraft(localFallback);
    setSaved(localFallback);
    setIsLoading(true);

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/personalization", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to load personalization");

        const data = await res.json();
        const serverValue = sanitizePersonalization(data?.personalization);
        const hasServerValue = Object.values(serverValue).some(Boolean);

        if (hasServerValue) {
          setDraft(serverValue);
          setSaved(serverValue);
          persistLocalPersonalization(userId, serverValue);
          return;
        }

        const hasLocalValue = Object.values(localFallback).some(Boolean);
        if (!hasLocalValue) {
          setDraft(EMPTY_PERSONALIZATION);
          setSaved(EMPTY_PERSONALIZATION);
          clearLocalPersonalization(userId);
          return;
        }

        const migrateRes = await fetch("/api/personalization", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(localFallback),
          signal: controller.signal,
        });

        if (!migrateRes.ok) return;

        const migrated = sanitizePersonalization((await migrateRes.json())?.personalization);
        setDraft(migrated);
        setSaved(migrated);
        persistLocalPersonalization(userId, migrated);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      } finally {
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [userId]);

  const updateField = useCallback((field: keyof UserPersonalization, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const save = useCallback(async () => {
    if (!userId) return false;
    setIsSaving(true);

    try {
      const res = await fetch("/api/personalization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("Failed to save personalization");

      const next = sanitizePersonalization((await res.json())?.personalization);
      setDraft(next);
      setSaved(next);
      persistLocalPersonalization(userId, next);
      return true;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [draft, userId]);

  const reset = useCallback(() => {
    setDraft(saved);
  }, [saved]);

  const clear = useCallback(async () => {
    if (!userId) {
      setDraft(EMPTY_PERSONALIZATION);
      setSaved(EMPTY_PERSONALIZATION);
      return true;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/personalization", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to clear personalization");

      clearLocalPersonalization(userId);
      setDraft(EMPTY_PERSONALIZATION);
      setSaved(EMPTY_PERSONALIZATION);
      return true;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [userId]);

  const hasChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved]
  );

  return {
    personalization: draft,
    savedPersonalization: saved,
    updateField,
    save,
    reset,
    clear,
    hasChanges,
    isLoading,
    isSaving,
  };
}
