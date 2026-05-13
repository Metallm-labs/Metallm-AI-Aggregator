// ============================================================
// Grok Media Provider — xAI Image & Video Generation (Direct API)
// ============================================================

const XAI_BASE = "https://api.x.ai/v1";
const XAI_IMAGE_URL = `${XAI_BASE}/images/generations`;
const XAI_VIDEO_URL = `${XAI_BASE}/videos/generations`;
const XAI_VIDEO_STATUS_URL = `${XAI_BASE}/videos`;

const VIDEO_POLL_INTERVAL_MS = 4_000;
const VIDEO_MAX_POLL_ATTEMPTS = 90; // ~6 min max

function getApiKey(): string {
  const key = process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.AI_INTEGRATIONS_GROK_API_KEY;
  if (!key) throw new Error("xAI API key not configured — set GROK_API_KEY in your environment");
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

// ── Types ────────────────────────────────────────────────────

export interface GrokImageGenerationOptions {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  n?: number;
}

export interface GrokImageGenerationResult {
  images: { url: string; b64Data?: string }[];
  modelId: string;
  estimatedCost: number;
}

export interface GrokVideoGenerationOptions {
  modelId: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
}

export interface GrokVideoGenerationResult {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  thumbnailUrl?: string;
  modelId: string;
  estimatedCost: number;
  duration?: number;
}

// ── Image Generation ─────────────────────────────────────────

export async function generateGrokImage(
  options: GrokImageGenerationOptions
): Promise<GrokImageGenerationResult> {
  const { modelId, prompt, aspectRatio, resolution, n } = options;

  const body: any = {
    model: modelId,
    prompt,
    n: n || 1,
    response_format: "b64_json",
  };

  if (aspectRatio) body.aspect_ratio = aspectRatio;
  if (resolution) body.resolution = resolution;

  const response = await fetch(XAI_IMAGE_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grok image generation failed: ${response.status} - ${errorText}`);
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

  const estimatedCost = estimateGrokImageCost(modelId);

  return { images, modelId, estimatedCost };
}

// ── Video Generation (async with polling) ────────────────────

export async function submitGrokVideoGeneration(
  options: GrokVideoGenerationOptions
): Promise<{ jobId: string }> {
  const { modelId, prompt, duration, resolution, aspectRatio } = options;

  const body: any = {
    model: modelId,
    prompt,
  };

  if (duration) body.duration = duration;
  if (resolution) body.resolution = resolution;
  if (aspectRatio) body.aspect_ratio = aspectRatio;

  const response = await fetch(XAI_VIDEO_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grok video generation submit failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return { jobId: data.id || data.request_id };
}

export async function pollGrokVideoStatus(
  jobId: string
): Promise<GrokVideoGenerationResult> {
  const response = await fetch(`${XAI_VIDEO_STATUS_URL}/${jobId}`, {
    method: "GET",
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grok video poll failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  let status: "pending" | "processing" | "completed" | "failed";
  if (data.status === "done" || data.status === "completed") {
    status = "completed";
  } else if (data.status === "failed" || data.status === "expired") {
    status = "failed";
  } else if (data.status === "processing" || data.status === "in_progress") {
    status = "processing";
  } else {
    status = "pending";
  }

  let videoUrl: string | undefined;
  if (status === "completed") {
    videoUrl = data.video_url || data.url || data.unsigned_urls?.[0];
    if (!videoUrl && data.data?.[0]?.url) {
      videoUrl = data.data[0].url;
    }
  }

  return {
    id: jobId,
    status,
    videoUrl,
    thumbnailUrl: data.thumbnail_url,
    modelId: data.model || "",
    estimatedCost: 0,
    duration: data.duration,
  };
}

export async function generateGrokVideoWithPolling(
  options: GrokVideoGenerationOptions,
  onProgress?: (status: GrokVideoGenerationResult) => void
): Promise<GrokVideoGenerationResult> {
  const { jobId } = await submitGrokVideoGeneration(options);

  for (let i = 0; i < VIDEO_MAX_POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL_MS));
    const result = await pollGrokVideoStatus(jobId);

    if (onProgress) onProgress(result);

    if (result.status === "completed" || result.status === "failed") {
      if (result.estimatedCost === 0) {
        result.estimatedCost = estimateGrokVideoCost(options.modelId, options.duration || 5, options.resolution || "480p");
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

function estimateGrokImageCost(modelId: string): number {
  if (modelId === "grok-imagine-image-pro") return 0.07;
  return 0.02;
}

export function estimateGrokVideoCost(modelId: string, duration: number, _resolution: string): number {
  return duration * 0.07;
}
