import { NextResponse } from "next/server";
import type { NutrientsPer100g, RemoteFoodItem, RemoteFoodResult } from "@/lib/types";
import { NO_STORE_HEADERS, clientKey, rateLimit } from "../../_lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 食物联网查询（服务端代理）
 * ---------------------------------------------------------------------------
 * 密钥只存在于服务端环境变量，不下发到浏览器。
 * 未配置 FOOD_DATA_PROVIDER 时返回 not_configured，前端据此显示「未接入」并保留手动录入，
 * 绝不返回伪造数据。
 *
 * 代理侧的边界：
 * - 查询词长度上限，避免超长输入撑爆上游 URL / 响应回显；
 * - 每客户端限流，避免被当成免费中继刷上游配额；
 * - 上游异常只回显通用文案，不把异常栈 / 上游 URL（含 api_key）带回浏览器；
 * - 缺热量字段的条目直接丢弃，而不是按 0 kcal 展示（0 会被当成「真实数据」）。
 */

const USDA_ENDPOINT = "https://api.nal.usda.gov/fdc/v1/foods/search";

/** 查询词上限：中文食物名 64 字足够，同时限制上游 URL 长度与回显体积 */
const MAX_QUERY_LENGTH = 64;
/** 同一客户端 60 秒内最多 20 次查询 */
const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

const USDA_NUTRIENT_IDS = {
  kcal: "1008",
  protein: "1003",
  carb: "1005",
  fat: "1004",
  fiber: "1079",
};

interface UsdaFood {
  fdcId?: number;
  description?: string;
  dataType?: string;
  foodNutrients?: { nutrientId?: number; nutrientNumber?: string; value?: number }[];
}

interface UsdaResponse {
  foods?: UsdaFood[];
}

function json(
  body: RemoteFoodResult,
  status = 200,
  extraHeaders: Record<string, string> = {},
): NextResponse<RemoteFoodResult> {
  return NextResponse.json<RemoteFoodResult>(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders },
  });
}

function pick(
  nutrients: { nutrientId?: number; nutrientNumber?: string; value?: number }[],
  id: string,
): number | undefined {
  const hit = nutrients.find((n) => String(n.nutrientId) === id || n.nutrientNumber === id);
  return typeof hit?.value === "number" && Number.isFinite(hit.value) ? hit.value : undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const provider = (process.env.FOOD_DATA_PROVIDER ?? "none").toLowerCase();

  if (!q) {
    return json({ status: "error", message: "请输入要查询的食物名称。" }, 400);
  }

  // 超长查询词既浪费上游配额，也可能把上游 URL 顶爆；直接拒绝并提示。
  if (q.length > MAX_QUERY_LENGTH) {
    return json(
      { status: "error", message: `查询词过长（上限 ${MAX_QUERY_LENGTH} 字），请缩短后再试。` },
      400,
    );
  }

  const limited = rateLimit(`food:${clientKey(req)}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (!limited.ok) {
    return json(
      { status: "error", message: `查询过于频繁，请 ${limited.retryAfterSec} 秒后再试。` },
      429,
      { "Retry-After": String(limited.retryAfterSec) },
    );
  }

  if (provider !== "usda") {
    return json({
      status: "not_configured",
      message:
        "后端尚未配置食物数据服务（FOOD_DATA_PROVIDER）。未接入时不会返回任何估算结果，请使用内置食物库或手动录入。",
    });
  }

  const key = process.env.USDA_API_KEY;
  if (!key) {
    return json({
      status: "not_configured",
      message: "FOOD_DATA_PROVIDER=usda 但缺少 USDA_API_KEY，无法查询。",
    });
  }

  try {
    const res = await fetch(
      `${USDA_ENDPOINT}?query=${encodeURIComponent(q)}&pageSize=8&api_key=${encodeURIComponent(key)}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) {
      return json(
        {
          status: "error",
          message: `食物数据服务返回 ${res.status}。请稍后重试，或改用手动录入。`,
        },
        502,
      );
    }

    // 上游可能返回 HTML 错误页 / 网关页：解析失败时给通用文案，不把解析异常抛给浏览器。
    let jsonBody: UsdaResponse;
    try {
      jsonBody = (await res.json()) as UsdaResponse;
    } catch {
      return json(
        { status: "error", message: "食物数据服务返回了无法解析的内容，请稍后重试，或改用手动录入。" },
        502,
      );
    }

    const foods = Array.isArray(jsonBody.foods)
      ? jsonBody.foods.filter((f) => typeof f?.description === "string" && f.description.trim())
      : [];

    if (!foods.length) {
      return json({
        status: "not_found",
        message: `未找到足够可靠信息：服务中没有与「${q}」匹配的条目。可以换个说法，或手动录入并标注来源。`,
        provider: "USDA FoodData Central",
        queriedAt: new Date().toISOString(),
      });
    }

    const items: RemoteFoodItem[] = [];
    for (const f of foods) {
      const nutrients = Array.isArray(f.foodNutrients) ? f.foodNutrients : [];
      const kcal = pick(nutrients, USDA_NUTRIENT_IDS.kcal);
      // 没有热量字段的条目不能按 0 kcal 展示（那等于伪造「零热量」），直接跳过。
      if (kcal === undefined) continue;
      const per100g: NutrientsPer100g = {
        kcal,
        proteinG: pick(nutrients, USDA_NUTRIENT_IDS.protein) ?? 0,
        carbG: pick(nutrients, USDA_NUTRIENT_IDS.carb) ?? 0,
        fatG: pick(nutrients, USDA_NUTRIENT_IDS.fat) ?? 0,
      };
      const fiber = pick(nutrients, USDA_NUTRIENT_IDS.fiber);
      if (fiber !== undefined) per100g.fiberG = fiber;
      items.push({
        name: f.description!.trim(),
        externalId: String(f.fdcId ?? ""),
        per100g,
        basis: /cooked|boiled|fried|roasted/i.test(f.description!) ? "cooked" : "raw",
        url: `https://fdc.nal.usda.gov/food-details/${f.fdcId ?? ""}`,
        provider: "USDA FoodData Central",
      });
    }

    if (!items.length) {
      return json(
        {
          status: "not_found",
          message: `未找到足够可靠信息：与「${q}」匹配的条目缺少可靠的营养数据，请改用手动录入。`,
          provider: "USDA FoodData Central",
          queriedAt: new Date().toISOString(),
        },
      );
    }

    // 同名不同条目的数值差异（来源冲突）
    const conflicts: string[] = [];
    const byName = new Map<string, RemoteFoodItem[]>();
    items.forEach((i) => {
      const k = i.name.toLowerCase().slice(0, 24);
      byName.set(k, [...(byName.get(k) ?? []), i]);
    });
    byName.forEach((group) => {
      if (group.length < 2) return;
      const kcals = group.map((g) => g.per100g.kcal).filter((x) => x > 0);
      if (kcals.length < 2) return;
      const min = Math.min(...kcals);
      const max = Math.max(...kcals);
      if (max - min > Math.max(15, min * 0.2)) {
        conflicts.push(
          `「${group[0].name}」存在多个条目，每 100g 热量从 ${min} 到 ${max} kcal 不等，可能对应不同品牌/做法，请按包装选择最贴近的。`,
        );
      }
    });

    return json({
      status: conflicts.length ? "conflict" : "ok",
      items,
      conflicts: conflicts.length ? conflicts : undefined,
      provider: "USDA FoodData Central",
      queriedAt: new Date().toISOString(),
      sourceUrl: "https://fdc.nal.usda.gov/",
      unitNote: "所有数值均为「每 100 克」基准；basis 字段标注该条目更接近生重还是熟重。",
    });
  } catch (e) {
    // 只记录异常类型，不记录请求 URL（其中含 api_key），也不把原始 message 回给浏览器。
    console.error("[api/food/search] upstream request failed:", e instanceof Error ? e.name : "unknown");
    return json(
      {
        status: "error",
        message: "查询失败：暂时无法连接食物数据服务，请稍后重试，或改用手动录入。",
      },
      502,
    );
  }
}
