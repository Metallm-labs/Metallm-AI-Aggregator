// ============================================================
// OpenAI Media Provider — Image Generation (Direct API)
// Uses /v1/images/generations endpoint
// ============================================================

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  return key;
}

function getBaseUrl(): string {
  const raw = process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";
  return raw.replace(/\/+$/, "");
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

export interface OpenAIImageGenerationOptions {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
}

export interface OpenAIImageGenerationResult {
  images: { url: string; b64Data?: string }[];
  modelId: string;
  estimatedCost: number;
  usage?: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
}

// Map aspect ratio to OpenAI size format
function getSize(aspectRatio?: string, imageSize?: string): string {
  if (imageSize) {
    const sizeMap: Record<string, string> = {
      "1K": "1024x1024",
      "2K": "2048x2048",
      "4K": "4096x4096",
    };
    if (sizeMap[imageSize]) return sizeMap[imageSize];
  }

  const ratioSizeMap: Record<string, string> = {
    "1:1": "1024x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
    "4:3": "1024x768",
    "3:4": "768x1024",
    "3:2": "1536x1024",
    "2:3": "1024x1536",
  };

  return ratioSizeMap[aspectRatio || "1:1"] || "1024x1024";
}

export async function generateOpenAIImage(
  options: OpenAIImageGenerationOptions
): Promise<OpenAIImageGenerationResult> {
  const { modelId, prompt, aspectRatio, imageSize } = options;

  const baseUrl = getBaseUrl();
  const url = /\/v\d+$/.test(baseUrl) ? `${baseUrl}/images/generations` : `${baseUrl}/v1/images/generations`;

  const model = modelId.replace("openai/", "");
  const size = getSize(aspectRatio, imageSize);

  const body: any = {
    model,
    prompt,
    n: 1,
    size,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI image generation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const images: { url: string; b64Data?: string }[] = [];

  if (data.data && Array.isArray(data.data)) {
    for (const item of data.data) {
      if (item.b64_json) {
        const dataUrl = `data:image/png;base64,${item.b64_json}`;
        images.push({ url: dataUrl, b64Data: item.b64_json });
      } else if (item.url) {
        images.push({ url: item.url });
      }
    }
  }

  const estimatedCost = estimateOpenAIImageCost(size);
  const usage = data.usage || undefined;

  return { images, modelId, estimatedCost, usage };
}

function estimateOpenAIImageCost(size: string): number {
  // GPT image pricing varies by size
  if (size.includes("1792") || size.includes("1536")) return 0.080;
  if (size.includes("2048") || size.includes("4096")) return 0.120;
  return 0.040;
}
