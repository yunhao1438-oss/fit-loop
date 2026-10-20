"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, NotConfigured, Sheet, Stepper, toast } from "./ui";
import { useApp } from "./AppProvider";
import { defaultCookingFor } from "./FoodAdder";
import { COOKING_LABEL, suggestOilG } from "@/lib/nutrition";
import { searchLocalFoods } from "@/lib/repo";
import type { CookingMethod, Food, FoodEntry, MealSlot, VisionResult } from "@/lib/types";
import { cx, uid } from "@/lib/utils";

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

/** 与 /api/vision/analyze 的体积上限保持一致 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * 拍照辅助识别
 * ---------------------------------------------------------------------------
 * 铁律：
 * 1. 上传前说明用途并取得同意；
 * 2. 不输出虚假精确值 —— 只给区间，并说明照片无法确定重量与隐藏配料；
 * 3. 不自动写入饮食日志 —— 必须用户确认；
 * 4. 接口不可用时保留手动记录入口，不模拟识别成功。
 */
export function PhotoPanel({
  open,
  onClose,
  date,
  slot,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  slot: MealSlot;
}) {
  const { foods, saveEntry } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VisionResult | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [grams, setGrams] = useState(150);
  const [method, setMethod] = useState<CookingMethod>("stir_fried");
  const [oil, setOil] = useState(() => suggestOilG("stir_fried", 150));
  /** 用户手动改过用油后，不再随份量自动覆盖 */
  const [oilTouched, setOilTouched] = useState(false);

  /** 候选名在本地食物库里的模糊匹配（用于给区间；匹配不到就不给数字） */
  const matched = useMemo<Food | undefined>(() => {
    if (!chosen) return undefined;
    return searchLocalFoods(foods, chosen)[0];
  }, [chosen, foods]);

  const estimate = useMemo(() => {
    if (!matched) return null;
    const base = (matched.per100g.kcal * grams) / 100 + oil * 8.84;
    const lo = Math.round(base * 0.7);
    const hi = Math.round(base * 1.35);
    const proteinLo = Math.round((matched.per100g.proteinG * grams) / 100 * 0.7 * 10) / 10;
    const proteinHi = Math.round((matched.per100g.proteinG * grams) / 100 * 1.35 * 10) / 10;
    return { lo, hi, proteinLo, proteinHi, matchedName: matched.name };
  }, [matched, grams, oil]);

  function releasePreview() {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  }

  // 卸载时释放 blob URL（照片只在本地预览，不保留）
  useEffect(() => releasePreview, []);

  // 关闭面板后清空上一次的照片与识别结果，避免 blob URL 常驻内存
  useEffect(() => {
    if (open) return;
    releasePreview();
    setPreview(null);
    setFile(null);
    setResult(null);
    setChosen(null);
  }, [open]);

  function reset() {
    setFile(null);
    releasePreview();
    setPreview(null);
    setResult(null);
    setChosen(null);
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("请选择图片文件（jpg / png / webp 等）", "err");
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      toast("图片过大（上限 8MB），请压缩后再试", "err");
      return;
    }
    setFile(f);
    releasePreview();
    const url = URL.createObjectURL(f);
    previewRef.current = url;
    setPreview(url);
    setResult(null);
    setChosen(null);
  }

  async function analyze() {
    if (!file) return;
    // 静态部署没有服务端识别代理：保留既有「未接入」提示，不发起必然 404 的请求。
    if (process.env.NEXT_PUBLIC_STATIC_DEPLOY === "1") {
      setResult({ status: "not_configured", limitations: [] });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/vision/analyze", { method: "POST", body: fd });
      const json = (await res.json()) as VisionResult;
      setResult(json);
    } catch (e) {
      setResult({
        status: "error",
        message: `请求失败：${e instanceof Error ? e.message : String(e)}`,
        limitations: [],
      });
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!chosen) return;
    const entry: FoodEntry = {
      id: uid("fe"),
      date,
      slot,
      foodId: matched?.id,
      foodName: matched?.name ?? chosen,
      grams,
      basis: matched?.basis ?? "na",
      cookingMethod: method,
      oilG: oil,
      source: matched
        ? matched.custom
          ? { kind: "user", note: `拍照识别后匹配你录入的食物：${matched.name}（份量由用户确认）` }
          : { kind: "builtin", note: `拍照识别后匹配内置食物：${matched.name}（份量由用户确认）` }
        : { kind: "user", note: "由拍照识别产生，未能匹配到可靠营养数据，热量未计入" },
      fromPhoto: true,
      estimateRange: estimate ? [estimate.lo, estimate.hi] : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveEntry(entry);
    } catch {
      toast("记入饮食日志失败，请重试", "err");
      return;
    }
    toast("已记入饮食日志（标注为拍照识别）", "ok");
    reset();
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="拍照辅助识别" maxH="92vh">
      <div className="space-y-3">
        <div className="rounded-xl border border-paper-line bg-paper px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-soft">
          <div className="font-medium text-ink">用途与保存说明</div>
          照片会发送到服务端用于识别食物种类，识别完成后服务端不保留原图，本应用也不会把照片同步到任何云端。
          照片只用于<span className="text-ink">建议候选食物</span>，份量、烹饪方式和用油都要你确认。
        </div>

        <label className="flex items-start gap-2 text-[13px] leading-relaxed">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-moss-600"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-ink-soft">我已了解上述用途，同意上传这张照片用于识别。</span>
        </label>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            // 清空 input，允许重新选择同一张照片
            e.currentTarget.value = "";
          }}
        />
        <button
          className="btn-secondary w-full"
          disabled={!agreed}
          onClick={() => inputRef.current?.click()}
        >
          {file ? "重新选择照片" : "拍照 / 选择照片"}
        </button>

        {preview && (
          <div className="overflow-hidden rounded-xl border border-paper-line">
            {/* 本地预览，未做任何上传；next/image 未启用，直接用 img */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="待识别的食物照片" className="w-full object-cover" />
          </div>
        )}

        {file && (
          <button className="btn-primary w-full" onClick={() => void analyze()} disabled={loading}>
            {loading ? "识别中…" : "开始识别"}
          </button>
        )}

        {result?.status === "not_configured" && <NotConfigured what="拍照识别" />}
        {result?.status === "error" && (
          <div className="rounded-xl border border-alert/25 bg-alert/5 px-3 py-2.5 text-[13px] text-alert">
            {result.message}
            <button className="ml-2 underline" onClick={() => void analyze()}>
              重试
            </button>
          </div>
        )}
        {result?.status === "not_found" && (
          <div className="rounded-xl border border-paper-line bg-paper px-3 py-2.5 text-[13px] leading-relaxed text-ink-soft">
            {result.message}
            <div className="mt-1 text-ink-faint">请改用「添加食物 → 手动录入」。</div>
          </div>
        )}

        {result?.limitations?.length ? (
          <div className="rounded-xl border border-warn/25 bg-warn/5 px-3 py-2.5">
            <div className="text-[12.5px] font-medium text-warn">识别的局限</div>
            <ul className="mt-1 space-y-0.5 text-[12.5px] leading-relaxed text-ink-soft">
              {result.limitations.map((l, i) => (
                <li key={i}>· {l}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {(result?.status === "ok" || result?.status === "conflict") && result.candidates?.length ? (
          <>
            <div className="section-title">识别到的候选（请选择）</div>
            <div className="space-y-1.5">
              {result.candidates.map((c) => (
                <button
                  key={c.name}
                  onClick={() => {
                    setChosen(c.name);
                    // 默认烹饪方式取自匹配到的本地食物（类别 / cookingHints）；
                    // 匹配不到时不假设用油，交给用户自己选。
                    const food = searchLocalFoods(foods, c.name)[0];
                    const nextMethod = food ? defaultCookingFor(food) : "raw";
                    setMethod(nextMethod);
                    setOil(suggestOilG(nextMethod, grams));
                    setOilTouched(false);
                  }}
                  className={cx(
                    "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left",
                    chosen === c.name ? "border-moss-600 bg-moss-50" : "border-paper-line bg-paper-card",
                  )}
                >
                  <span className="text-[14px]">{c.name}</span>
                  {c.confidence !== undefined && (
                    <span className="text-[11.5px] text-ink-faint">
                      置信度 {Math.round(c.confidence * 100)}%（仅参考）
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {chosen && (
          <div className="space-y-3 border-t border-dashed border-paper-line pt-3">
            <div className="text-[14px] font-medium">确认：{chosen}</div>
            <div className="flex items-center justify-between">
              <span className="text-[14px]">份量（请自行估计或称量）</span>
              <Stepper
                value={grams}
                onChange={(v) => {
                  setGrams(v);
                  if (!oilTouched) setOil(suggestOilG(method, v));
                }}
                step={10}
                min={10}
                max={2000}
                unit="g"
              />
            </div>
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

            {estimate ? (
              <div className="rounded-xl2 border border-moss-300 bg-moss-50 px-3 py-3">
                <div className="text-[12.5px] text-moss-700">热量估算区间（按「{estimate.matchedName}」近似）</div>
                <div className="mt-0.5 text-2xl font-semibold tabular-nums text-moss-700">
                  {estimate.lo} – {estimate.hi} <span className="text-sm font-normal">kcal</span>
                </div>
                <div className="mt-1 text-[12px] text-moss-700">
                  蛋白质约 {estimate.proteinLo} – {estimate.proteinHi} g
                </div>
                <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-soft">
                  区间来自「份量估计误差 + 烹饪用油不确定」。这不是精确值，仅供记录参考。
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-warn/25 bg-warn/5 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-soft">
                未能匹配到可靠的营养数据，因此<span className="font-medium">不给出热量估算</span>。
                你仍然可以先记录这条食物（热量记为 0 并标注来源），或改用手动录入填写营养值。
              </div>
            )}

            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={reset}>
                重新识别
              </button>
              <button className="btn-primary flex-1" onClick={commit}>
                确认并记入日志
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
