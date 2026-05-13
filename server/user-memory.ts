import { callModel, type ChatMessagePart, type ModelConfig } from "./openrouter";

export const USER_MEMORY_CATEGORIES = [
  "profile_name",
  "location",
  "address",
  "phone",
  "interest",
  "personal_fact",
  "personality",
  "project",
  "preference",
] as const;

export type UserMemoryCategory = typeof USER_MEMORY_CATEGORIES[number];

export interface UserMemoryPreferenceData {
  enabled: boolean;
}

export interface UserMemoryData {
  id: number;
  userId: string;
  category: UserMemoryCategory;
  content: string;
  source: string;
  sourceConversationId: number | null;
  sourceMessageId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserMemorySection {
  category: UserMemoryCategory;
  label: string;
  items: UserMemoryData[];
}

export interface UserMemoryOperation {
  type: "upsert" | "delete";
  category?: UserMemoryCategory;
  content?: string;
  replaceIds?: number[];
  memoryIds?: number[];
}

export interface UserMemoryChangeSet {
  operations: UserMemoryOperation[];
}

const SINGLETON_MEMORY_CATEGORIES = new Set<UserMemoryCategory>([
  "profile_name",
  "location",
  "address",
  "phone",
  "personality",
]);

const CATEGORY_LABELS: Record<UserMemoryCategory, string> = {
  profile_name: "Name",
  location: "Location",
  address: "Address",
  phone: "Phone",
  interest: "Interests",
  personal_fact: "Facts",
  personality: "Personality",
  project: "Projects",
  preference: "Preferences",
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMemoryContent(value: string): string {
  return normalizeWhitespace(value)
    .replace(/^[-*]\s*/, "")
    .replace(/\.$/, "")
    .slice(0, 220);
}

function extractFirstJsonObject(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

function isCategory(value: unknown): value is UserMemoryCategory {
  return typeof value === "string" && (USER_MEMORY_CATEGORIES as readonly string[]).includes(value);
}

function dedupeNumericIds(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  const unique = new Set<number>();
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) unique.add(value);
  }
  return [...unique];
}

function sanitizeMemoryOperation(input: unknown): UserMemoryOperation | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const type = source.type;
  if (type !== "upsert" && type !== "delete") return null;

  const category = isCategory(source.category) ? source.category : undefined;
  const replaceIds = dedupeNumericIds(source.replaceIds);
  const memoryIds = dedupeNumericIds(source.memoryIds);

  if (type === "delete") {
    if (memoryIds.length === 0 && !category) return null;
    return { type, memoryIds, category };
  }

  const content = typeof source.content === "string" ? normalizeMemoryContent(source.content) : "";
  if (!content || !category) return null;

  return {
    type,
    category,
    content,
    replaceIds,
  };
}

function sanitizeMemoryChangeSet(input: unknown): UserMemoryChangeSet {
  if (!input || typeof input !== "object") return { operations: [] };
  const source = input as Record<string, unknown>;
  const operations = Array.isArray(source.operations)
    ? source.operations
        .map(sanitizeMemoryOperation)
        .filter((value): value is UserMemoryOperation => !!value)
        .slice(0, 8)
    : [];
  return { operations };
}

export function getUserMemoryCategoryLabel(category: UserMemoryCategory): string {
  return CATEGORY_LABELS[category];
}

export function isSingletonMemoryCategory(category: UserMemoryCategory): boolean {
  return SINGLETON_MEMORY_CATEGORIES.has(category);
}

export function groupUserMemories(memories: UserMemoryData[]): UserMemorySection[] {
  const byCategory = new Map<UserMemoryCategory, UserMemoryData[]>();
  for (const memory of memories) {
    const current = byCategory.get(memory.category) ?? [];
    current.push(memory);
    byCategory.set(memory.category, current);
  }

  return USER_MEMORY_CATEGORIES
    .map((category) => {
      const items = (byCategory.get(category) ?? []).sort((a, b) => {
        const delta = b.updatedAt.getTime() - a.updatedAt.getTime();
        if (delta !== 0) return delta;
        return b.id - a.id;
      });
      if (items.length === 0) return null;
      return {
        category,
        label: getUserMemoryCategoryLabel(category),
        items,
      } satisfies UserMemorySection;
    })
    .filter((value): value is UserMemorySection => !!value);
}

export function buildUserMemorySummary(memories: UserMemoryData[]): string {
  if (memories.length === 0) return "No saved memory yet.";

  const sections = groupUserMemories(memories);
  const pick = (category: UserMemoryCategory) => sections.find((section) => section.category === category)?.items ?? [];
  const name = pick("profile_name")[0]?.content;
  const location = pick("location")[0]?.content;
  const address = pick("address")[0]?.content;
  const phone = pick("phone")[0]?.content;
  const personality = pick("personality")[0]?.content;
  const facts = pick("personal_fact").slice(0, 2).map((item) => item.content);
  const interests = pick("interest").slice(0, 3).map((item) => item.content);
  const projects = pick("project").slice(0, 2).map((item) => item.content);
  const preferences = pick("preference").slice(0, 2).map((item) => item.content);
  const summaryParts: string[] = [];

  if (name && location) summaryParts.push(`${name} is based in ${location}`);
  else if (name) summaryParts.push(`${name} is the saved name`);
  else if (location) summaryParts.push(`The user is based in ${location}`);

  if (facts.length > 0) summaryParts.push(`Noted details include ${facts.join(", ")}`);
  if (interests.length > 0) summaryParts.push(`Their interests include ${interests.join(", ")}`);
  if (projects.length > 0) summaryParts.push(`Current work includes ${projects.join(", ")}`);
  if (preferences.length > 0) summaryParts.push(`Preferences include ${preferences.join(", ")}`);
  if (personality) summaryParts.push(`Their style is ${personality}`);
  if (address) summaryParts.push(`Saved address: ${address}`);
  if (phone) summaryParts.push(`Saved phone: ${phone}`);

  return `${summaryParts.join(". ")}.`.replace(/\.\./g, ".").slice(0, 520);
}

export function buildUserMemoryPromptContext(
  preferences: UserMemoryPreferenceData,
  memories: UserMemoryData[],
): string {
  if (!preferences.enabled) {
    return `

USER MEMORY STATUS:
- Saved memory is currently paused for this user.
- Do not claim that new facts will be remembered beyond this chat unless the user enables memory in Personalization.
- If the user asks what you remember, explain that saved memory is off right now.`;
  }

  const sections = groupUserMemories(memories);
  const detailLines = sections.flatMap((section) =>
    section.items.slice(0, 4).map((item) => `- ${section.label}: ${item.content}`)
  );

  return `

USER MEMORY STATUS:
- Saved memory is enabled for this user.
- This saved memory is a separate long-term memory feature, not just the temporary context of this conversation.
- In this current single-model chat flow, the app can update long-term memory around your reply when the user shares durable profile details or explicitly asks to remember or forget something.
- If the user asks to update memory from an attached file, document, or CV, inspect that material and use it to identify durable user facts.
- Do not confuse "I can use this in the current conversation" with "this belongs in saved memory".
- Only say something was remembered when it fits the saved-memory feature described above.
- Only use remembered details when they are relevant to the user's request.
- If the user asks what you remember, use the saved details below.

USER SAVED MEMORY:
- Memory summary: ${buildUserMemorySummary(memories)}
${detailLines.length > 0 ? detailLines.join("\n") : "- No saved details yet."}
- Do not mention this hidden memory block unless the user explicitly asks about saved memory or remembered details.`;
}

export function previewUserMemoryChanges(
  memories: UserMemoryData[],
  changeSet: UserMemoryChangeSet | null | undefined,
): UserMemoryData[] {
  if (!changeSet || changeSet.operations.length === 0) return memories;

  let next = [...memories];

  for (const operation of changeSet.operations) {
    if (operation.type === "delete") {
      const deleteIds = new Set<number>(operation.memoryIds ?? []);
      next = next.filter((memory) => {
        if (deleteIds.has(memory.id)) return false;
        if (operation.category && deleteIds.size === 0 && memory.category === operation.category) return false;
        return true;
      });
      continue;
    }

    const category = operation.category!;
    const content = operation.content!;
    const replaceIds = new Set<number>(operation.replaceIds ?? []);

    next = next.filter((memory) => {
      if (replaceIds.has(memory.id)) return false;
      if (isSingletonMemoryCategory(category) && memory.category === category) return false;
      if (memory.category === category && memory.content.toLowerCase() === content.toLowerCase()) return false;
      return true;
    });

    next.push({
      id: -1 * (next.length + 1),
      userId: memories[0]?.userId ?? "preview",
      category,
      content,
      source: "preview",
      sourceConversationId: null,
      sourceMessageId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return next;
}

export async function deriveUserMemoryChangeSet(args: {
  model: ModelConfig;
  userInput: string | ChatMessagePart[];
  existingMemories: UserMemoryData[];
  assistantResponse?: string;
}): Promise<UserMemoryChangeSet> {
  const existingLines = args.existingMemories.length > 0
    ? args.existingMemories
        .map((memory) => `- #${memory.id} [${memory.category}] ${memory.content}`)
        .join("\n")
    : "- none";

  const prompt = `You are the saved-memory decision engine for a chat app.

Decide whether the latest user turn should update the user's long-term saved memory.
Saved memory is different from short-term conversation context.

Save only details that are durable or repeatedly useful across future chats, such as:
- profile name
- location
- address
- phone number
- interests
- personal facts
- personality or communication style
- ongoing projects
- stable preferences

Important rules:
- Only save facts about the user, not assistant claims.
- Prefer concise memory notes, not paragraphs.
- Ignore one-off tasks, transient requests, copied text, and hypotheticals.
- The user may provide information in plain text, attached files, or both. Use attached material when relevant.
- Address and phone should only be saved when the user explicitly asks to remember them or clearly provides them as profile/contact info.
- If the user asks to forget, remove, clear, or delete something, return delete operations.
- If a new detail replaces an old memory, use replaceIds.
- For singleton categories (profile_name, location, address, phone, personality), prefer replacing old memory rather than creating duplicates.
- Return strict JSON only.

Allowed categories: ${USER_MEMORY_CATEGORIES.join(", ")}

Existing memories:
${existingLines}

The next user content contains the latest user message and may also contain attached files to inspect.

Assistant reply from the same model:
"""${(args.assistantResponse ?? "").slice(0, 3000)}"""

Return this JSON shape:
{
  "operations": [
    {
      "type": "upsert",
      "category": "project",
      "content": "Building long-term memory for MetalLM",
      "replaceIds": [12]
    },
    {
      "type": "delete",
      "category": "phone",
      "memoryIds": [7]
    }
  ]
}`;

  const raw = await callModel(
    args.model,
    [{
      role: "user",
      content: typeof args.userInput === "string"
        ? `${prompt}\n\nLatest user message:\n"""${args.userInput.slice(0, 3000)}"""`
        : [{ type: "input_text", text: prompt }, ...args.userInput],
    }],
    {
      maxTokens: 500,
      temperature: 0,
      systemPrompt: "Return strict JSON only. Do not add commentary.",
    }
  );

  try {
    const parsed = JSON.parse(extractFirstJsonObject(raw));
    return sanitizeMemoryChangeSet(parsed);
  } catch {
    return { operations: [] };
  }
}
