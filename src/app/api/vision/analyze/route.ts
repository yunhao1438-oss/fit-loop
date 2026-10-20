import { NextResponse } from "next/server";
import type { CookingMethod, VisionResult } from "@/lib/types";
import { NO_STORE_HEADERS, clientKey, rateLimit } from "../../_lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 拍照辅助识别（服务端代理）
 * ---------------------------------------------------------------------------
 * - 未配置 VISION_PROVIDER 时返回 not_configured，前端明确提示「未接入」并保留手动记录，
 *   绝不模拟识别成功。
 * - 结果只给「候选食物」，重量、配料、用油必须由用户确认；照片无法可靠确定这些。
 * - 照片默认不长期保存：请求体内即时处理，服务端不写盘、不落库。
 *
 * 代理侧的边界：
 * - 先按 Content-Length 与流式字节上限拦截超大请求体（formData() 会把整个 body 读进内存）；
 * - 只接受 multipart/form-data 与常见图片 MIME，避免把任意文件转发给上游；
 * - 每客户端限流：识别按次计费，公开部署时这是唯一的成本闸门；
 * - 模型返回的 suggestedCooking 必须落在已知枚举内，避免脏值写进饮食记录。
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** multipart 的边界与字段头留出余量，先按整体请求体挡掉超大上传 */
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 256 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const COOKING_METHODS: CookingMethod[] = [
  "raw",
  "steamed",
  "boiled",
  "stir_fried",
  "pan_fried",
  "deep_fried",
  "braised",
  "roasted",
  "air_fryer",
  "other",
];

/** 同一客户端 60 秒内最多 8 次识别 */
const RATE_LIMIT = { limit: 8, windowMs: 60_000 };

const LIMITATIONS = [
  "照片无法可靠判断食物重量，必须由你自己估计或称量份量。",
  "看不到隐藏配料（调味汁、糖、油、酱料），需要你手动补充。",
  "识别结果只是候选，可能有误；请确认后再入账。",
  "热量为区间估算，不是精确值。",
];

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

interface ParsedCandidates {
  candidates?: { name?: string; confidence?: number; suggestedCooking?: string }[];
}

function json(
  body: VisionResult,
  status = 200,
  extraHeaders: Record<string, string> = {},
): NextResponse<VisionResult> {
  return NextResponse.json<VisionResult>(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders },
  });
}

/**
 * 带字节上限地读取请求体：超过上限立即取消读取，避免把超大 multipart 全部缓冲进内存。
 * 返回 null 表示超限。
 */
async function readBodyLimited(
  req: Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  // 没有 body 时交给后面的 multipart 解析失败分支处理（400），不要误报「图片过大」
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        // 超限后不再继续读取：由调用方回 413。
        // 这里不调用 reader.cancel()：在部分 Node/undici 组合下，取消带源（Blob/FormData）的
        // 请求体流会让源继续 enqueue 到已关闭的流并抛出未捕获异常；停止读取则依靠背压
        // （byte stream 的 highWaterMark 0）让 socket 暂停，内存不会被撑大。
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function POST(req: Request) {
  const provider = (process.env.VISION_PROVIDER ?? "none").toLowerCase();

  if (provider !== "openai") {
    return json({
      status: "not_configured",
      message:
        "后端尚未配置拍照识别服务（VISION_PROVIDER）。为避免给出不可靠结果，这里不会模拟识别成功，请改用手动记录。",
      limitations: LIMITATIONS,
    });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return json({
      status: "not_configured",
      message: "VISION_PROVIDER=openai 但缺少 OPENAI_API_KEY。",
      limitations: LIMITATIONS,
    });
  }

  const limited = rateLimit(`vision:${clientKey(req)}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (!limited.ok) {
    return json(
      {
        status: "error",
        message: `识别请求过于频繁，请 ${limited.retryAfterSec} 秒后再试，或先手动记录。`,
        limitations: LIMITATIONS,
      },
      429,
      { "Retry-After": String(limited.retryAfterSec) },
    );
  }

  // 注意：boundary 可能含大小写，不能把整个 header 转小写后用于解析，只对媒体类型做比较。
  const contentType = req.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mediaType !== "multipart/form-data") {
    return json(
      {
        status: "error",
        message: "无法读取上传的图片：请求必须是 multipart/form-data。",
        limitations: LIMITATIONS,
      },
      415,
    );
  }

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(
      {
        status: "error",
        message: `图片过大（上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB）。`,
        limitations: LIMITATIONS,
      },
      413,
    );
  }

  let rawBody: Uint8Array<ArrayBuffer> | null;
  try {
    rawBody = await readBodyLimited(req, MAX_BODY_BYTES);
  } catch {
    return json(
      { status: "error", message: "无法读取上传的图片。", limitations: LIMITATIONS },
      400,
    );
  }
  if (!rawBody) {
    return json(
      {
        status: "error",
        message: `图片过大（上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB）。`,
        limitations: LIMITATIONS,
      },
      413,
    );
  }

  let form: FormData;
  try {
    // 已按上限读取为字节，再交给 undici 解析 multipart（避免 formData() 直接把超大 body 读进内存）
    form = await new Response(new Blob([rawBody]), {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    return json(
      { status: "error", message: "无法读取上传的图片。", limitations: LIMITATIONS },
      400,
    );
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return json({ status: "error", message: "没有收到图片。", limitations: LIMITATIONS }, 400);
  }
  if (file.size === 0) {
    return json({ status: "error", message: "图片内容为空。", limitations: LIMITATIONS }, 400);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return json(
      {
        status: "error",
        message: `图片过大（上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB）。`,
        limitations: LIMITATIONS,
      },
      413,
    );
  }

  const fileType = (file.type || "").toLowerCase();
  if (fileType && !ALLOWED_IMAGE_TYPES.has(fileType)) {
    return json(
      {
        status: "error",
        message: "只支持 JPEG / PNG / WebP / GIF / HEIC 格式的图片。",
        limitations: LIMITATIONS,
      },
      415,
    );
  }

  // 兼容代理地址末尾带斜杠的配置，避免拼出 //chat/completions
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.VISION_MODEL || "gpt-4o-mini";

  const prompt = [
    "你是一个食物识别助手。看图后只输出 JSON，格式如下：",
    '{"candidates":[{"name":"中文食物名","confidence":0.0-1,"suggestedCooking":"raw|steamed|boiled|stir_fried|pan_fried|deep_fried|braised|roasted|air_fryer|other"}]}',
    "规则：",
    "1. 只列出你能在图中看到的食物，最多 5 个，按置信度降序。",
    "2. 不确定时不要猜具体菜品，用更宽泛的名称（如「炒青菜」而不是「清炒菠菜」）。",
    "3. 不要估计重量或热量，只识别是什么。",
    "4. 如果图中没有食物，返回空数组。",
  ].join("\n");

  try {
    const body = new FormData();
    body.append("model", model);
    body.append("response_format", JSON.stringify({ type: "json_object" }));
    const textPart = { type: "text", text: prompt };

    // 需要 base64，先转换（已按大小校验，文件不再超过 MAX_IMAGE_BYTES）
    const buf = Buffer.from(await file.arrayBuffer());
    const imagePart = {
      type: "image_url",
      image_url: { url: `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}` },
    };
    body.append("messages", JSON.stringify([{ role: "user", content: [textPart, imagePart] }]));
    body.append("max_tokens", "400");

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body,
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      return json(
        {
          status: "error",
          message: `识别服务返回 ${res.status}。请稍后重试或手动记录。`,
          limitations: LIMITATIONS,
        },
        502,
      );
    }

    let upstream: ChatCompletion;
    try {
      upstream = (await res.json()) as ChatCompletion;
    } catch {
      return json(
        {
          status: "error",
          message: "识别服务返回了无法解析的内容，请稍后重试或手动记录。",
          limitations: LIMITATIONS,
        },
        502,
      );
    }

    const content = upstream.choices?.[0]?.message?.content ?? "{}";
    let parsed: ParsedCandidates = {};
    try {
      parsed = JSON.parse(content) as ParsedCandidates;
    } catch {
      parsed = {};
    }

    const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    const candidates = rawCandidates
      .filter((c) => typeof c?.name === "string" && c.name.trim())
      .slice(0, 5)
      .map((c) => {
        const cooking =
          typeof c.suggestedCooking === "string" &&
          (COOKING_METHODS as string[]).includes(c.suggestedCooking)
            ? (c.suggestedCooking as CookingMethod)
            : undefined;
        return {
          name: (c.name ?? "").trim().slice(0, 40),
          confidence:
            typeof c.confidence === "number" && Number.isFinite(c.confidence)
              ? Math.min(1, Math.max(0, c.confidence))
              : undefined,
          suggestedCooking: cooking,
        };
      })
      .filter((c) => c.name.length > 0);

    if (!candidates.length) {
      return json({
        status: "not_found",
        message: "未找到足够可靠信息：没能从这张照片里识别出确定的食物，请手动记录。",
        limitations: LIMITATIONS,
        provider: model,
        queriedAt: new Date().toISOString(),
      });
    }

    return json({
      status: "ok",
      candidates,
      limitations: LIMITATIONS,
      provider: model,
      queriedAt: new Date().toISOString(),
    });
  } catch (e) {
    // 只记录异常类型，不回传原始 message（其中可能带上游主机名等内部信息）。
    console.error("[api/vision/analyze] upstream request failed:", e instanceof Error ? e.name : "unknown");
    return json(
      {
        status: "error",
        message: "识别失败：暂时无法连接识别服务，请稍后重试或手动记录。",
        limitations: LIMITATIONS,
      },
      502,
    );
  }
}
