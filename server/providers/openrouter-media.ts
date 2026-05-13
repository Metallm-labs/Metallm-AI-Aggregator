// ============================================================
// OpenRouter Media Provider — Image & Video Generation
// ============================================================

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_CHAT_URL = `${OPENROUTER_BASE}/chat/completions`;
const OPENROUTER_VIDEO_URL = `${OPENROUTER_BASE}/videos`;

const VIDEO_POLL_INTERVAL_MS = 3_000;
const VIDEO_MAX_POLL_ATTEMPTS = 120; // ~6 min max

function getApiKey(): string {
  const key = process.env["AI-INTEGRATIONS-OPEN-ROUTER-API-KEY"];
  if (!key) throw new Error("OpenRouter API key not configured");
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://metallm.com",
    "X-Title": "Metallm AI Aggregator",
  };
}

// ── Types ────────────────────────────────────────────────────

export interface ImageGenerationOptions {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
}

export interface ImageGenerationResult {
  images: { url: string; b64Data?: string }[];
  modelId: string;
  estimatedCost: number;
}

export interface VideoGenerationOptions {
  modelId: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  generateAudio?: boolean;
}

export interface VideoGenerationResult {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  thumbnailUrl?: string;
  modelId: string;
  estimatedCost: number;
  duration?: number;
}

// ── Image Generation (chat/completions with modalities) ─────

const IMAGE_ONLY_MODELS = new Set(["black-forest-labs/flux.2-pro"]);

function toImageResult(rawUrl: string): { url: string; b64Data?: string } {
  const url = rawUrl.trim();
  const dataUrlMatch = url.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (dataUrlMatch) {
    return { url, b64Data: dataUrlMatch[1] };
  }
  return { url };
}

export async function generateImage(
  options: ImageGenerationOptions
): Promise<ImageGenerationResult> {
  const { modelId, prompt, aspectRatio, imageSize } = options;

  const isImageOnly = IMAGE_ONLY_MODELS.has(modelId);

  const body: any = {
    model: modelId,
    messages: [{ role: "user", content: prompt }],
    modalities: isImageOnly ? ["image"] : ["image", "text"],
  };

  if (aspectRatio || imageSize) {
    body.image_config = {};
    if (aspectRatio) body.image_config.aspect_ratio = aspectRatio;
    if (imageSize) body.image_config.image_size = imageSize;
  }

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const images: { url: string; b64Data?: string }[] = [];

  // Log full response structure for debugging
  console.log("[MEDIA] OpenRouter response keys:", JSON.stringify(Object.keys(data)));
  if (data.choices?.[0]) {
    const msg = data.choices[0].message;
    console.log("[MEDIA] Choice message keys:", msg ? JSON.stringify(Object.keys(msg)) : "null");
    if (msg?.images) {
      console.log("[MEDIA] message.images type:", typeof msg.images, Array.isArray(msg.images) ? `array[${msg.images.length}]` : "");
      if (Array.isArray(msg.images) && msg.images[0]) {
        const first = msg.images[0];
        console.log("[MEDIA] First image type:", typeof first);
        if (typeof first === "object") {
          console.log("[MEDIA] First image keys:", JSON.stringify(Object.keys(first)));
          console.log("[MEDIA] First image sample:", JSON.stringify(first).slice(0, 300));
        } else {
          console.log("[MEDIA] First image value:", String(first).slice(0, 200));
        }
      }
    }
    if (msg?.content) {
      console.log("[MEDIA] Content type:", typeof msg.content, Array.isArray(msg.content) ? `array[${msg.content.length}]` : "");
      if (Array.isArray(msg.content) && msg.content[0]) {
        console.log("[MEDIA] First content part:", JSON.stringify(msg.content[0]).slice(0, 300));
      }
    }
  }

  const choices = data.choices || [];
  for (const choice of choices) {
    // Extract from message.images array (Gemini, Flux, etc.) — take only first image
    const msgImages = choice.message?.images;
    if (Array.isArray(msgImages) && msgImages.length > 0) {
      const img = msgImages[0];
      if (typeof img === "string") {
        images.push(toImageResult(img));
      } else if (img?.type === "image_url" && img?.image_url?.url) {
        const url = img.image_url.url;
        images.push(toImageResult(url));
      } else if (img?.url) {
        images.push(toImageResult(img.url));
      } else if (img?.b64_json) {
        images.push({ url: `data:image/png;base64,${img.b64_json}`, b64Data: img.b64_json });
      }
    }

    // Only parse content if we didn't already get images from message.images
    if (images.length === 0) {
      const content = choice.message?.content;
      if (typeof content === "string") {
        if (content.startsWith("data:image")) {
          images.push(toImageResult(content));
        } else if (content.startsWith("http")) {
          images.push({ url: content });
        }
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === "image_url" && part.image_url?.url) {
            images.push(toImageResult(part.image_url.url));
          }
          if (part.type === "image" && part.image?.url) {
            images.push(toImageResult(part.image.url));
          }
          if (part.b64_json) {
            images.push({ url: `data:image/png;base64,${part.b64_json}`, b64Data: part.b64_json });
          }
        }
      }
    }
  }

  if (data.data) {
    for (const item of data.data) {
      if (item.url) images.push({ url: item.url });
      if (item.b64_json) images.push({ url: `data:image/png;base64,${item.b64_json}`, b64Data: item.b64_json });
    }
  }

  // Check for image in output array (some OpenRouter image models)
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "image" && item.url) images.push({ url: item.url });
      if (item.type === "image" && item.image?.url) images.push({ url: item.image.url });
      if (item.type === "image_generation_call" && item.result) {
        images.push({ url: item.result });
      }
    }
  }

  const usage = data.usage || {};
  const estimatedCost = estimateImageCost(modelId, usage);

  return { images, modelId, estimatedCost };
}

// ── Video Generation (async /videos endpoint + polling) ─────

export async function submitVideoGeneration(
  options: VideoGenerationOptions
): Promise<{ jobId: string; pollingUrl: string }> {
  const { modelId, prompt, duration, resolution, aspectRatio, generateAudio } = options;

  const body: any = {
    model: modelId,
    prompt,
  };

  if (duration) body.duration = duration;
  if (resolution) body.resolution = resolution;
  if (aspectRatio) body.aspect_ratio = aspectRatio;
  if (generateAudio !== undefined) body.generate_audio = generateAudio;

  const response = await fetch(OPENROUTER_VIDEO_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Video generation submit failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return {
    jobId: data.id,
    pollingUrl: data.polling_url || `${OPENROUTER_VIDEO_URL}/${data.id}`,
  };
}

export async function pollVideoStatus(
  jobId: string
): Promise<VideoGenerationResult> {
  const response = await fetch(`${OPENROUTER_VIDEO_URL}/${jobId}`, {
    method: "GET",
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Video poll failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const status = data.status === "completed" ? "completed"
    : data.status === "failed" ? "failed"
    : data.status === "processing" ? "processing"
    : "pending";

  let videoUrl: string | undefined;
  if (status === "completed") {
    videoUrl = data.unsigned_urls?.[0] || data.video_url || data.url;
  }

  return {
    id: jobId,
    status,
    videoUrl,
    thumbnailUrl: data.thumbnail_url,
    modelId: data.model || "",
    estimatedCost: data.usage?.total_cost || 0,
    duration: data.duration,
  };
}

export async function generateVideoWithPolling(
  options: VideoGenerationOptions,
  onProgress?: (status: VideoGenerationResult) => void
): Promise<VideoGenerationResult> {
  const { jobId } = await submitVideoGeneration(options);

  for (let i = 0; i < VIDEO_MAX_POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL_MS));
    const result = await pollVideoStatus(jobId);

    if (onProgress) onProgress(result);

    if (result.status === "completed" || result.status === "failed") {
      if (result.estimatedCost === 0) {
        result.estimatedCost = estimateVideoCost(
          options.modelId,
          options.duration || 5,
          options.resolution || "1080p",
          options.generateAudio ?? false
        );
      }
      return result;
    }
  }

  return {
    id: jobId,
    status: "failed",
    modelId: options.modelId,
    estimatedCost: 0,
  };
}

// ── Cost Estimation ─────────────────────────────────────────

function estimateImageCost(modelId: string, usage?: any): number {
  const promptTokens = usage?.prompt_tokens || 500;
  const completionTokens = usage?.completion_tokens || 1000;

  if (modelId === "openai/gpt-5.4-image-2") {
    return (promptTokens * 8 + completionTokens * 15) / 1_000_000;
  }
  if (modelId === "google/gemini-3-pro-image-preview") {
    return (promptTokens * 2 + completionTokens * 12) / 1_000_000;
  }
  if (modelId === "black-forest-labs/flux.2-pro") {
    return 0.03;
  }
  return 0.01;
}

export function estimateVideoCost(
  modelId: string,
  duration: number,
  resolution: string,
  withAudio: boolean
): number {
  if (modelId === "kwaivgi/kling-v3.0-pro") {
    return duration * (withAudio ? 0.168 : 0.112);
  }
  if (modelId === "bytedance/seedance-2.0") {
    const resMap: Record<string, { w: number; h: number }> = {
      "480p": { w: 854, h: 480 },
      "720p": { w: 1280, h: 720 },
      "1080p": { w: 1920, h: 1080 },
    };
    const { w, h } = resMap[resolution] || resMap["720p"];
    const tokens = (h * w * duration * 24) / 1024;
    return tokens * 0.000007;
  }
  if (modelId === "google/veo-3.1") {
    if (resolution === "4K" || resolution === "4k") {
      return duration * (withAudio ? 0.60 : 0.40);
    }
    return duration * (withAudio ? 0.40 : 0.20);
  }
  return duration * 0.10;
}

export function estimateMediaCostForCredits(
  modelId: string,
  type: "image" | "video",
  config?: { duration?: number; resolution?: string; generateAudio?: boolean }
): number {
  if (type === "image") {
    return estimateImageCost(modelId);
  }
  return estimateVideoCost(
    modelId,
    config?.duration || 5,
    config?.resolution || "1080p",
    config?.generateAudio ?? false
  );
}
