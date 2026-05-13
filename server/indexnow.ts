const INDEXNOW_KEY = "5a74e9d497aa7d0c1bb7b88e0ddea767";
const SITE_HOST = "metallm.tech";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

const ALL_URLS = [
  "/",
  "/agent",
  "/chat",
  "/compare",
  "/compare-competitors",
  "/compare/poe",
  "/compare/typingmind",
  "/compare/chathub",
  "/compare/perplexity",
  "/compare/openrouter",
  "/compare/huggingchat",
  "/compare/merlin",
  "/blogs",
  "/terms",
  "/privacy",
  "/refund",
];

export async function submitToIndexNow(urls?: string[]): Promise<{ success: boolean; status?: number; error?: string }> {
  const urlList = (urls || ALL_URLS).map((path) =>
    path.startsWith("http") ? path : `https://${SITE_HOST}${path}`
  );

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: SITE_HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${SITE_HOST}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
    });

    if (response.ok || response.status === 202) {
      console.log(`[IndexNow] Submitted ${urlList.length} URLs successfully (status: ${response.status})`);
      return { success: true, status: response.status };
    }

    const text = await response.text().catch(() => "");
    console.error(`[IndexNow] Failed with status ${response.status}: ${text}`);
    return { success: false, status: response.status, error: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[IndexNow] Network error: ${msg}`);
    return { success: false, error: msg };
  }
}

export { INDEXNOW_KEY, ALL_URLS };
