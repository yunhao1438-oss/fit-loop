"use client";

import { useEffect, useMemo, useState } from "react";
import { Chip, NotConfigured, Segmented, Sheet, Stepper, toast } from "./ui";
import { useApp } from "./AppProvider";
import { COOKING_LABEL, OIL_BY_METHOD, SLOT_LABEL, nutrientsFor, suggestOilG } from "@/lib/nutrition";
import { searchLocalFoods } from "@/lib/repo";
import { FOOD_CATEGORY_LABEL, FOOD_SUBSTITUTES } from "@/lib/seed/foods";
import type {
  CookingMethod,
  Food,
  FoodCategory,
  FoodEntry,
  MealSlot,
  RemoteFoodItem,
  RemoteFoodResult,
} from "@/lib/types";
import { cx, todayISO, uid } from "@/lib/utils";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const METHODS: CookingMethod[] = [
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

const BASIS_LABEL: Record<"raw" | "cooked" | "na", string> = {
  raw: "生重",
  cooked: "熟重",
  na: "不区分",
};

/** 手动录入的数值校验：非数字 / 负数按 0，并限制合理上限 */
function clampInput(raw: string, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, n);
}

/**
 * 新加入食物时的默认烹饪方式（只决定初始值，用户仍可改）。
 * 目的：不给饮料 / 乳制品 / 水果 / 油脂类默认加烹调用油，也优先采纳食物数据里的 cookingHints。
 * 注意：不能用 basis === "raw" 判断「生食」——生鸡胸的 basis 也是 raw，但它并不生吃。
 */
const RAW_DEFAULT_CATEGORIES: FoodCategory[] = ["drink", "dairy", "fruit", "fat"];

const METHOD_KEYWORDS: { re: RegExp; method: CookingMethod }[] = [
  { re: /空气炸锅/, method: "air_fryer" },
  { re: /红烧|炖/, method: "braised" },
  { re: /油炸|炸/, method: "deep_fried" },
  { re: /煎/, method: "pan_fried" },
  { re: /炒/, method: "stir_fried" },
  { re: /蒸/, method: "steamed" },
  { re: /水煮|焯|煮/, method: "boiled" },
  { re: /烤/, method: "roasted" },
  { re: /生食|生吃|凉拌|免烹饪|无需加热/, method: "raw" },
];

export function defaultCookingFor(
  food: Pick<Food, "category" | "cookingHints" | "source">,
): CookingMethod {
  // 1) 数据已经给出烹饪提示时，取提示里最靠前出现的烹饪方式（不覆盖数据建议）
  for (const hint of food.cookingHints ?? []) {
    let picked: { method: CookingMethod; index: number } | null = null;
    for (const { re, method } of METHOD_KEYWORDS) {
      const hit = re.exec(hint);
      if (!hit) continue;
      if (!picked || hit.index < picked.index) picked = { method, index: hit.index };
    }
    if (picked) return picked.method;
  }
  // 2) 联网条目没有分类信息：不假设用油，默认生食/不加油，让用户自己选烹饪方式
  if (food.source.kind === "remote") return "raw";
  // 3) 数据没给提示时按类别给保守默认：饮料 / 乳制品 / 水果 / 油脂不加炒菜油
  if (RAW_DEFAULT_CATEGORIES.includes(food.category)) return "raw";
  // 4) 主食默认蒸/煮（无油），肉类与蔬菜默认家常小炒
  if (food.category === "grain") return "steamed";
  return "stir_fried";
}

function foodFromRemote(item: RemoteFoodItem): Food {
  return {
    id: `remote_${item.provider.replace(/\s/g, "")}_${item.externalId}`,
    name: item.name,
    category: "other",
    per100g: item.per100g,
    basis: item.basis,
    portions: [{ id: "p100", label: "100g", grams: 100, state: item.basis, isDefault: true }],
    source: {
      kind: "remote",
      provider: item.provider,
      externalId: item.externalId,
      url: item.url,
      queriedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function FoodAdder({
  open,
  onClose,
  date,
  defaultSlot = "lunch",
  onPhoto,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  defaultSlot?: MealSlot;
  onPhoto?: () => void;
}) {
  const { foods, saveEntry, saveFood } = useApp();
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<RemoteFoodResult | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [picked, setPicked] = useState<Food | null>(null);
  const [manual, setManual] = useState(false);

  const local = useMemo(() => searchLocalFoods(foods, q).slice(0, 30), [foods, q]);

  // 关闭面板时清空上一次的浏览 / 录入状态，避免下次点「+ 添加」还停在上一次的表单里
  useEffect(() => {
    if (open) return;
    setPicked(null);
    setManual(false);
    setRemote(null);
    setQ("");
  }, [open]);

  async function queryRemote() {
    // 静态部署（GitHub Pages 等）没有 Node 服务端，/api 不存在。
    // 直接走既有的「未接入」UI，而不是让用户看到 404 的「请求失败」。
    if (process.env.NEXT_PUBLIC_STATIC_DEPLOY === "1") {
      setRemote({ status: "not_configured" });
      return;
    }
    setRemoteLoading(true);
    setRemote(null);
    try {
      const res = await fetch(`/api/food/search?q=${encodeURIComponent(q)}`);
      const json = (await res.json()) as RemoteFoodResult;
      setRemote(json);
    } catch (e) {
      setRemote({
        status: "error",
        message: `请求失败：${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setRemoteLoading(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="添加食物" maxH="92vh">
      {picked ? (
        <PortionForm
          key={picked.id}
          food={picked}
          date={date}
          defaultSlot={defaultSlot}
          onCancel={() => {
            setPicked(null);
            setManual(false);
          }}
          onPickFood={setPicked}
          onSave={async (entry) => {
            let next = entry;
            // 联网结果不在本地食物库中：先落库并让记录引用它，
            // 否则饮食页按 foodId 查不到营养值，这条记录会被算成 0 kcal。
            if (!entry.foodId && picked.source.kind === "remote") {
              await saveFood(picked);
              next = { ...entry, foodId: picked.id };
            }
            await saveEntry(next);
            toast("已记入饮食日志", "ok");
            setPicked(null);
            onClose();
          }}
        />
      ) : manual ? (
        <ManualFoodForm
          initialName={q}
          onCancel={() => setManual(false)}
          onSave={(f) => {
            void saveFood(f);
            setManual(false);
            setPicked(f);
          }}
        />
      ) : (
        <div className="space-y-3">
          <input
            className="input"
            placeholder="搜索食物，如「鸡胸」"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />

          <div className="flex gap-2">
            <button className="btn-secondary flex-1 !py-2 text-[13px]" onClick={() => void queryRemote()} disabled={!q.trim() || remoteLoading}>
              {remoteLoading ? "查询中…" : "联网查询"}
            </button>
            <button className="btn-secondary flex-1 !py-2 text-[13px]" onClick={() => setManual(true)}>
              手动录入
            </button>
            {onPhoto && (
              <button className="btn-secondary flex-1 !py-2 text-[13px]" onClick={onPhoto}>
                拍照识别
              </button>
            )}
          </div>

          {remote && (
            <div className="space-y-2">
              {remote.status === "not_configured" && <NotConfigured what="食物联网查询" />}
              {remote.status === "not_found" && (
                <div className="rounded-xl border border-paper-line bg-paper px-3 py-2.5 text-[13px] leading-relaxed text-ink-soft">
                  {remote.message ?? "未找到足够可靠信息。"}
                  <button className="ml-1 text-moss-600 underline" onClick={() => setManual(true)}>
                    手动录入
                  </button>
                </div>
              )}
              {remote.status === "error" && (
                <div className="rounded-xl border border-alert/25 bg-alert/5 px-3 py-2.5 text-[13px] text-alert">
                  {remote.message}
                  <button className="ml-2 underline" onClick={() => void queryRemote()}>
                    重试
                  </button>
                </div>
              )}
              {remote.conflicts?.map((c, i) => (
                <div key={i} className="rounded-xl border border-warn/25 bg-warn/5 px-3 py-2 text-[12.5px] leading-relaxed text-ink-soft">
                  来源差异：{c}
                </div>
              ))}
              {(remote.status === "ok" || remote.status === "conflict") && remote.items && (
                <>
                  <div className="section-title">
                    联网结果
                    {remote.provider && (
                      <a
                        className="text-[11.5px] font-normal text-moss-600 underline"
                        href={remote.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        来源：{remote.provider}
                      </a>
                    )}
                  </div>
                  <div className="divide-y divide-paper-line border-y border-paper-line">
                    {remote.items.map((it) => (
                      <button
                        key={it.externalId}
                        className="flex w-full items-center justify-between gap-2 py-2.5 text-left"
                        onClick={() => setPicked(foodFromRemote(it))}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[14px]">{it.name}</div>
                          <div className="truncate text-[11.5px] text-ink-faint">
                            每 100g：{Math.round(it.per100g.kcal)} kcal · 蛋白 {it.per100g.proteinG}g ·{" "}
                            {it.basis === "cooked" ? "熟重" : it.basis === "raw" ? "生重" : "未标注"}
                          </div>
                        </div>
                        <span className="chip shrink-0 !py-0 text-[10px]">联网</span>
                      </button>
                    ))}
                  </div>
                  {remote.queriedAt && (
                    <div className="text-[11.5px] text-ink-faint">
                      查询时间：{new Date(remote.queriedAt).toLocaleString("zh-CN")} ·{" "}
                      {remote.unitNote ?? "数值基准为每 100 克"}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="section-title">内置食物库 {q ? `· 匹配 ${local.length} 条` : ""}</div>
          <div className="divide-y divide-paper-line border-y border-paper-line">
            {local.length === 0 && (
              <div className="py-6 text-center text-[13px] text-ink-faint">
                没有匹配的内置食物。可以
                <button className="mx-1 text-moss-600 underline" onClick={() => setManual(true)}>
                  手动录入
                </button>
                或联网查询。
              </div>
            )}
            {local.map((f) => (
              <button
                key={f.id}
                className="flex w-full items-center justify-between gap-2 py-2.5 text-left"
                onClick={() => setPicked(f)}
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px]">{f.name}</div>
                  <div className="truncate text-[11.5px] text-ink-faint">
                    {FOOD_CATEGORY_LABEL[f.category]} · 每 100g {Math.round(f.per100g.kcal)} kcal ·{" "}
                    {f.basis === "cooked" ? "熟重" : f.basis === "raw" ? "生重" : "—"}
                  </div>
                </div>
                <span className="shrink-0 text-[12px] text-ink-faint">+ 记录</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------- 份量表单 -------------------------------- */

function PortionForm({
  food,
  date,
  defaultSlot,
  onCancel,
  onPickFood,
  onSave,
}: {
  food: Food;
  date: string;
  defaultSlot: MealSlot;
  onCancel: () => void;
  onPickFood?: (f: Food) => void;
  onSave: (e: FoodEntry) => void | Promise<void>;
}) {
  const { foods, saveFood } = useApp();
  const def = food.portions.find((p) => p.isDefault) ?? food.portions[0];
  const [grams, setGrams] = useState(def?.grams ?? 100);
  const [basis, setBasis] = useState<"raw" | "cooked" | "na">(food.basis);
  const [slot, setSlot] = useState<MealSlot>(defaultSlot);
  // 默认烹饪方式按食物类别 / cookingHints 推导：饮料、乳制品、水果等默认「生食/不加油」
  const initialMethod = defaultCookingFor(food);
  const [method, setMethod] = useState<CookingMethod>(initialMethod);
  const [oil, setOil] = useState(() => suggestOilG(initialMethod, def?.grams ?? 100));
  /** 用户手动改过用油后，不再随份量自动覆盖 */
  const [oilTouched, setOilTouched] = useState(false);

  /** 份量变化时同步按烹饪方式的建议用油（除非用户已手动调整） */
  function changeGrams(v: number) {
    setGrams(v);
    if (!oilTouched) setOil(suggestOilG(method, v));
  }

  const n = useMemo(
    () => nutrientsFor({ grams, oilG: oil } as FoodEntry, food.per100g),
    [grams, oil, food.per100g],
  );

  const subs = (FOOD_SUBSTITUTES[food.id] ?? [])
    .map((id) => foods.find((f) => f.id === id))
    .filter((f): f is Food => !!f);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-semibold">{food.name}</div>
          <div className="text-[11.5px] text-ink-faint">
            {food.source.kind === "remote"
              ? `来源：${food.source.provider} · ${new Date(food.source.queriedAt).toLocaleString("zh-CN")}`
              : food.source.kind === "user"
                ? "来源：你自己录入的数据"
                : "来源：内置参考值"}
          </div>
        </div>
        <button className="btn-ghost shrink-0 !px-2 text-[13px]" onClick={onCancel}>
          换一个
        </button>
      </div>

      {/* 每 100g 基准 */}
      <div className="rounded-xl border border-paper-line bg-paper px-3 py-2.5">
        <div className="mb-1 text-[12px] text-ink-faint">
          每 100 克（{food.basis === "raw" ? "生重" : food.basis === "cooked" ? "熟重" : "未区分"}基准）
        </div>
        <div className="grid grid-cols-4 gap-1 text-center">
          <Metric label="热量" value={`${Math.round(food.per100g.kcal)}`} unit="kcal" />
          <Metric label="蛋白质" value={`${food.per100g.proteinG}`} unit="g" />
          <Metric label="碳水" value={`${food.per100g.carbG}`} unit="g" />
          <Metric label="脂肪" value={`${food.per100g.fatG}`} unit="g" />
        </div>
      </div>

      {/* 份量 */}
      {food.portions.length > 0 && (
        <div>
          <div className="section-title">常见份量</div>
          <div className="flex flex-wrap gap-1.5">
            {food.portions.map((p) => (
              <Chip
                key={p.id}
                active={grams === p.grams}
                onClick={() => {
                  setBasis(p.state);
                  changeGrams(p.grams);
                }}
              >
                {p.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[14px]">份量</span>
        <Stepper value={grams} onChange={changeGrams} step={5} min={1} max={3000} unit="g" />
      </div>

      {food.basis !== "na" && (
        <div>
          <div className="section-title">这次称量的是</div>
          <Segmented
            value={basis}
            onChange={(v) => setBasis(v)}
            options={[
              { value: "raw", label: "生重" },
              { value: "cooked", label: "熟重" },
              { value: "na", label: "不区分" },
            ]}
          />
          {basis !== "na" && basis !== food.basis && (
            <div className="mt-1.5 rounded-lg border border-warn/25 bg-warn/5 px-2.5 py-1.5 text-[12px] text-ink-soft">
              注意：这条数据的基准是{BASIS_LABEL[food.basis]}，你选的是{BASIS_LABEL[basis]}
              ；本份数值仍按「{BASIS_LABEL[food.basis]}每 100 克」换算，未做生熟换算，实际可能有偏差。
            </div>
          )}
        </div>
      )}

      <div>
        <div className="section-title">烹饪方式</div>
        <div className="flex flex-wrap gap-1.5">
          {METHODS.map((m) => (
            <Chip
              key={m}
              active={method === m}
              onClick={() => {
                setMethod(m);
                setOil(suggestOilG(m, grams));
                setOilTouched(false);
              }}
            >
              {COOKING_LABEL[m]}
            </Chip>
          ))}
        </div>
        {OIL_BY_METHOD[method] && (
          <div className="mt-1 text-[11.5px] text-ink-faint">{OIL_BY_METHOD[method].note}</div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[14px]">用油（克）</span>
        <Stepper
          value={oil}
          onChange={(v) => {
            setOil(v);
            setOilTouched(true);
          }}
          step={1}
          min={0}
          max={100}
          unit="g"
        />
      </div>

      {/* 本份合计 */}
      <div className="rounded-xl2 border border-moss-300 bg-moss-50 px-3 py-3">
        <div className="mb-1.5 text-[12.5px] text-moss-700">
          本份（{grams} g{basis === "raw" ? "，生重" : basis === "cooked" ? "，熟重" : ""}）
        </div>
        <div className="grid grid-cols-4 gap-1 text-center">
          <Metric label="热量" value={`${Math.round(n.kcal)}`} unit="kcal" strong />
          <Metric label="蛋白质" value={`${n.proteinG}`} unit="g" strong />
          <Metric label="碳水" value={`${n.carbG}`} unit="g" strong />
          <Metric label="脂肪" value={`${n.fatG}`} unit="g" strong />
        </div>
        {oil > 0 && (
          <div className="mt-1.5 text-[11.5px] text-moss-700">
            其中用油 {oil}g 计入约 {Math.round(oil * 8.84)} kcal
          </div>
        )}
      </div>

      <div>
        <div className="section-title">归入哪一餐</div>
        <Segmented value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} />
      </div>

      {subs.length > 0 && (
        <div>
          <div className="section-title">换成同类食材</div>
          <div className="flex flex-wrap gap-1.5">
            {subs.map((f) => (
              <Chip
                key={f.id}
                onClick={() => {
                  if (onPickFood) onPickFood(f);
                  else onCancel();
                }}
              >
                {f.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pb-2">
        <button className="btn-secondary flex-1" onClick={onCancel}>
          返回
        </button>
        <button
          className="btn-primary flex-1"
          onClick={async () => {
            try {
              await onSave({
                id: uid("fe"),
                date,
                slot,
                foodId: food.source.kind === "remote" ? undefined : food.id,
                foodName: food.name,
                grams,
                basis,
                cookingMethod: method,
                oilG: oil,
                source:
                  food.source.kind === "remote"
                    ? food.source
                    : { kind: "builtin", note: `内置食物库：${food.name}` },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            } catch {
              toast("保存失败，请重试", "err");
            }
          }}
        >
          加入{date === todayISO() ? "今天" : "该日"}
        </button>
      </div>
      {food.source.kind === "remote" && (
        <button
          className="w-full text-[12px] text-moss-600 underline"
          onClick={() => {
            void saveFood({ ...food, custom: true });
            toast("已保存到我的食物库", "ok");
          }}
        >
          把这条联网结果存入我的食物库
        </button>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  strong,
}: {
  label: string;
  value: string;
  unit: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div className={cx("tabular-nums", strong ? "text-[16px] font-semibold" : "text-[14px] font-medium")}>
        {value}
        <span className="ml-0.5 text-[10px] font-normal text-ink-faint">{unit}</span>
      </div>
      <div className="text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}

/* ------------------------------- 手动录入 -------------------------------- */

function ManualFoodForm({
  initialName,
  onCancel,
  onSave,
}: {
  initialName: string;
  onCancel: () => void;
  onSave: (f: Food) => void;
}) {
  const [name, setName] = useState(initialName);
  const [kcal, setKcal] = useState(100);
  const [protein, setProtein] = useState(5);
  const [carb, setCarb] = useState(10);
  const [fat, setFat] = useState(3);
  const [basis, setBasis] = useState<"raw" | "cooked" | "na">("raw");
  const [note, setNote] = useState("");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-paper-line bg-paper px-3 py-2 text-[12.5px] leading-relaxed text-ink-soft">
        手动录入的食物会以「用户来源」标注，并保留你填写的依据说明，方便日后核对。
      </div>
      <div>
        <label className="label" htmlFor="manual-name">
          食物名称
        </label>
        <input
          id="manual-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：妈妈做的红烧排骨"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="manual-kcal">
            每 100g 热量（kcal）
          </label>
          <input
            id="manual-kcal"
            className="input"
            type="number"
            min={0}
            max={1000}
            value={kcal}
            onChange={(e) => setKcal(clampInput(e.target.value, 1000))}
          />
        </div>
        <div>
          <label className="label" htmlFor="manual-protein">
            每 100g 蛋白质（g）
          </label>
          <input
            id="manual-protein"
            className="input"
            type="number"
            min={0}
            max={100}
            value={protein}
            onChange={(e) => setProtein(clampInput(e.target.value, 100))}
          />
        </div>
        <div>
          <label className="label" htmlFor="manual-carb">
            每 100g 碳水（g）
          </label>
          <input
            id="manual-carb"
            className="input"
            type="number"
            min={0}
            max={100}
            value={carb}
            onChange={(e) => setCarb(clampInput(e.target.value, 100))}
          />
        </div>
        <div>
          <label className="label" htmlFor="manual-fat">
            每 100g 脂肪（g）
          </label>
          <input
            id="manual-fat"
            className="input"
            type="number"
            min={0}
            max={100}
            value={fat}
            onChange={(e) => setFat(clampInput(e.target.value, 100))}
          />
        </div>
      </div>
      <div>
        <div className="section-title">基准</div>
        <Segmented
          value={basis}
          onChange={setBasis}
          options={[
            { value: "raw", label: "生重" },
            { value: "cooked", label: "熟重" },
            { value: "na", label: "不区分" },
          ]}
        />
      </div>
      <div>
        <label className="label" htmlFor="manual-source">
          数值来源说明（会一起保存）
        </label>
        <input
          id="manual-source"
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="如：包装营养标签 / 餐厅公示 / 自己估算"
        />
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={onCancel}>
          取消
        </button>
        <button
          className="btn-primary flex-1"
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              id: uid("food"),
              name: name.trim(),
              category: "other",
              per100g: { kcal, proteinG: protein, carbG: carb, fatG: fat },
              basis,
              portions: [{ id: "p", label: "100g", grams: 100, state: basis, isDefault: true }],
              source: { kind: "user", note: note.trim() || "用户手动录入，未注明来源" },
              custom: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          }
        >
          保存并继续
        </button>
      </div>
    </div>
  );
}
