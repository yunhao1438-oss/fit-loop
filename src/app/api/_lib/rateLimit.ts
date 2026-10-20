/**
 * 极简内存限流（按「路由 + 客户端」计数）。
 * ---------------------------------------------------------------------------
 * 两个 /api 路由都是「密钥不出端」的代理：一旦对外公开，就会被当成免费中继
 * 消耗上游额度（USDA 配额 / OpenAI 计费）。这里提供第一道、实例内的闸门。
 *
 * 说明与限制：
 * - 单进程内存计数，进程重启归零；多实例部署时各实例独立计数（尽力而为）。
 * - 客户端标识取自反向代理写入的 x-forwarded-for / x-real-ip；直连时该头可伪造，
 *   因此它只能降低滥用速率，不能替代真正的身份认证与配额系统。
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
/** 防止大量伪造 IP 把 Map 撑爆 */
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  /** 建议的 Retry-After 秒数（0 表示无需等待） */
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size >= MAX_KEYS) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
    if (buckets.size >= MAX_KEYS) buckets.clear();
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** 取客户端标识：反代后的首个 x-forwarded-for，缺失时退化为 x-real-ip / local */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = (forwarded?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim();
  return ip.slice(0, 64) || "local";
}

/** 代理响应一律不缓存：避免中间层把「未配置 / 结果」按 URL 缓存后串给别人 */
export const NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
