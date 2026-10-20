"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { FoodAdder } from "@/components/FoodAdder";
import { PhotoPanel } from "@/components/PhotoPanel";
import { Bar, DemoBadge, Loading, Segmented, Sheet, Stepper, toast } from "@/components/ui";
import { SLOT_LABEL, nutrientsFor, targetsFor, computeTargets } from "@/lib/nutrition";
import { FOOD_MAP } from "@/lib/seed/foods";
import type { FoodEntry, MealSlot, NutritionTargets, ShoppingItem } from "@/lib/types";
import { addDays, cx, todayISO, uid } from "@/lib/utils";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export default function DietPage() {
  const {
    ready,
    profile,
    entries,
    foods,
    shopping,
    saveEntry,
    deleteEntry,
    saveShopping,
    deleteShopping,
    saveProfile,
  } = useApp();
  const [date, setDate] = useState(todayISO());
  const [adder, setAdder] = useState<{ open: boolean; slot: MealSlot }>({ open: false, slot: "lunch" });
  const [photo, setPhoto] = useState<{ open: boolean; slot: MealSlot }>({ open: false, slot: "lunch" });
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  const dayEntries = useMemo(() => entries.filter((e) => e.date === date), [entries, date]);
  const targets = useMemo(() => targetsFor(profile), [profile]);

  const totals = useMemo(() => {
    const list = dayEntries.map((e) => {
      // 内置库走 FOOD_MAP，用户自建食物只在 foods store；两者都要查，否则自建食物按 0 计算
      const food = e.foodId ? (FOOD_MAP[e.foodId] ?? foods.find((f) => f.id === e.foodId)) : undefined;
      const per100 = food?.per100g ?? { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };
      return nutrientsFor(e, per100);
    });
    return list.reduce(
      (acc, n) => ({
        kcal: acc.kcal + n.kcal,
        proteinG: acc.proteinG + n.proteinG,
        carbG: acc.carbG + n.carbG,
        fatG: acc.fatG + n.fatG,
      }),
      { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
    );
  }, [dayEntries, foods]);

  if (!ready) return <Loading />;

  return (
    <div className="space-y-3 p-4">
      {/* 日期 */}
      <div className="flex items-center justify-between">
        <button className="btn-ghost !px-2" onClick={() => setDate(addDays(date, -1))}>
          ‹ 前一天
        </button>
        <div className="text-center">
          <div className="text-[15px] font-semibold">{date === todayISO() ? "今天" : date}</div>
          <div className="text-[11.5px] text-ink-faint">{date}</div>
        </div>
        <button
          className="btn-ghost !px-2"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= todayISO()}
        >
          后一天 ›
        </button>
      </div>

      {/* 目标 */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[14px] font-medium">今日摄入</span>
          <button className="text-[12px] text-moss-600 underline" onClick={() => setTargetsOpen(true)}>
            依据 / 修改目标
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Num label="热量" v={Math.round(totals.kcal)} max={targets.kcal} unit="kcal" />
          <Num label="蛋白质" v={Math.round(totals.proteinG * 10) / 10} max={targets.proteinG} unit="g" />
          <Num label="碳水" v={Math.round(totals.carbG * 10) / 10} max={targets.carbG} unit="g" />
          <Num label="脂肪" v={Math.round(totals.fatG * 10) / 10} max={targets.fatG} unit="g" />
        </div>
        <div className="mt-3 space-y-1.5">
          <BarLine label="热量" v={totals.kcal} max={targets.kcal} />
          <BarLine label="蛋白质" v={totals.proteinG} max={targets.proteinG} tone="clay" />
        </div>
        {profile.nutritionOverride && (
          <div className="mt-2 text-[11.5px] text-warn">当前使用的是你手动修改过的目标，非自动计算值。</div>
        )}
      </div>

      {/* 餐次 */}
      {SLOTS.map((slot) => {
        const list = dayEntries.filter((e) => e.slot === slot);
        const kcal = list.reduce((sum, e) => {
          const food = e.foodId ? (FOOD_MAP[e.foodId] ?? foods.find((f) => f.id === e.foodId)) : undefined;
          return sum + nutrientsFor(e, food?.per100g ?? { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 }).kcal;
        }, 0);
        return (
          <div key={slot} className="card">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[14px] font-medium">
                {SLOT_LABEL[slot]}
                <span className="ml-1.5 text-[12px] font-normal text-ink-faint">
                  {list.length} 项 · {Math.round(kcal)} kcal
                </span>
              </span>
              <button
                className="btn-secondary !px-3 !py-1 text-[13px]"
                onClick={() => setAdder({ open: true, slot })}
              >
                + 添加
              </button>
            </div>
            {list.length === 0 ? (
              <div className="py-3 text-center text-[13px] text-ink-faint">还没有记录</div>
            ) : (
              <div className="divide-y divide-dashed">
                {list.map((e) => {
                  const food = e.foodId ? (FOOD_MAP[e.foodId] ?? foods.find((f) => f.id === e.foodId)) : undefined;
                  const n = nutrientsFor(e, food?.per100g ?? { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 });
                  return (
                    <button
                      key={e.id}
                      className="flex w-full items-center justify-between gap-2 py-2 text-left"
                      onClick={() => setEditing(e)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[14px]">{e.foodName}</span>
                          {e.isDemo && <DemoBadge />}
                          {e.fromPhoto && (
                            <span className="chip !py-0 text-[10px]">拍照识别</span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-ink-faint">
                          {e.grams}g · {e.basis === "raw" ? "生重" : e.basis === "cooked" ? "熟重" : "—"}
                          {e.cookingMethod ? ` · ${e.cookingMethod === "stir_fried" ? "小炒" : e.cookingMethod}` : ""}
                          {e.oilG ? ` · 用油 ${e.oilG}g` : ""}
                        </div>
                        {e.estimateRange && (
                          <div className="text-[11px] text-warn">
                            估算区间 {e.estimateRange[0]}–{e.estimateRange[1]} kcal
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[13.5px] font-medium tabular-nums">{Math.round(n.kcal)}</div>
                        <div className="text-[11px] text-ink-faint tabular-nums">P {n.proteinG}g</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={() => setPhoto({ open: true, slot: "lunch" })}>
          📷 拍照识别
        </button>
        <button className="btn-secondary flex-1" onClick={() => setShoppingOpen(true)}>
          购物清单 {shopping.length > 0 && `(${shopping.filter((s) => !s.checked).length})`}
        </button>
      </div>

      {/* 添加 */}
      <FoodAdder
        open={adder.open}
        onClose={() => setAdder({ ...adder, open: false })}
        date={date}
        defaultSlot={adder.slot}
        onPhoto={() => {
          setAdder({ ...adder, open: false });
          setPhoto({ open: true, slot: adder.slot });
        }}
      />
      <PhotoPanel
        open={photo.open}
        onClose={() => setPhoto({ ...photo, open: false })}
        date={date}
        slot={photo.slot}
      />

      {/* 编辑：用 key 保证每次打开都从该条目重新初始化草稿，不会带着上一条的改动 */}
      <EditEntrySheet
        key={editing ? editing.id : "closed"}
        entry={editing}
        onClose={() => setEditing(null)}
        onSave={async (e) => {
          await saveEntry(e);
          setEditing(null);
          toast("已更新", "ok");
        }}
        onDelete={async (id) => {
          await deleteEntry(id);
          setEditing(null);
          toast("已删除", "ok");
        }}
      />

      {/* 目标 */}
      <TargetsSheet
        open={targetsOpen}
        onClose={() => setTargetsOpen(false)}
        computed={computeTargets(profile)}
        current={targets}
        overridden={!!profile.nutritionOverride}
        onSave={(t) => {
          void saveProfile({ ...profile, nutritionOverride: t });
          setTargetsOpen(false);
          toast("目标已更新", "ok");
        }}
        onReset={() => {
          const p = { ...profile };
          delete p.nutritionOverride;
          void saveProfile(p);
          setTargetsOpen(false);
          toast("已恢复为自动计算值", "ok");
        }}
      />

      {/* 购物清单 */}
      <ShoppingSheet
        open={shoppingOpen}
        onClose={() => setShoppingOpen(false)}
        items={shopping}
        onAdd={(name, amount) =>
          void saveShopping({
            id: uid("shop"),
            name,
            amount,
            checked: false,
            sourceDate: date,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }
        onToggle={(item) => void saveShopping({ ...item, checked: !item.checked })}
        onDelete={(id) => void deleteShopping(id)}
        onGenerate={() => {
          const names = new Set(dayEntries.map((e) => e.foodName));
          let count = 0;
          names.forEach((n) => {
            void saveShopping({
              id: uid("shop"),
              name: n,
              amount: "按需",
              checked: false,
              sourceDate: date,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            count++;
          });
          toast(count ? `已把 ${count} 种食材加入清单` : "当天还没有食材可生成", "ok");
        }}
      />
    </div>
  );
}

function Num({ label, v, max, unit }: { label: string; v: number; max: number; unit: string }) {
  return (
    <div>
      <div className="text-[17px] font-semibold tabular-nums">
        {v}
        <span className="ml-0.5 text-[10px] font-normal text-ink-faint">{unit}</span>
      </div>
      <div className="text-[11px] text-ink-faint">
        {label} / {max}
        {unit}
      </div>
    </div>
  );
}

function BarLine({ label, v, max, tone }: { label: string; v: number; max: number; tone?: "clay" }) {
  const pct = max > 0 ? Math.round((v / max) * 100) : 0;
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[11.5px] text-ink-faint">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <Bar value={v} max={max} tone={tone} />
    </div>
  );
}

/* ------------------------------- 编辑条目 -------------------------------- */

function EditEntrySheet({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: FoodEntry | null;
  onClose: () => void;
  onSave: (e: FoodEntry) => void;
  onDelete: (id: string) => void;
}) {
  // 草稿态：改动只留在本地，点「保存」才写库。
  // （原实现每次 Stepper/Segmented 变更都直接 onSave → 父组件关掉弹层，一次只能改一格。）
  const [draft, setDraft] = useState<FoodEntry | null>(entry);
  if (!entry || !draft) return null;
  return (
    <Sheet
      open
      onClose={onClose}
      title={entry.foodName}
      footer={
        <div className="flex gap-2">
          <button className="btn-danger flex-1" onClick={() => onDelete(draft.id)}>
            删除
          </button>
          <button className="btn-primary flex-1" onClick={() => onSave(draft)}>
            保存
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="section-title">份量</div>
          <Stepper
            value={draft.grams}
            onChange={(v) => setDraft({ ...draft, grams: v })}
            step={5}
            min={1}
            max={3000}
            unit="g"
          />
        </div>
        <div>
          <div className="section-title">生重 / 熟重</div>
          <Segmented
            value={draft.basis}
            onChange={(v) => setDraft({ ...draft, basis: v })}
            options={[
              { value: "raw", label: "生重" },
              { value: "cooked", label: "熟重" },
              { value: "na", label: "不区分" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[14px]">用油（克）</span>
          <Stepper
            value={draft.oilG ?? 0}
            onChange={(v) => setDraft({ ...draft, oilG: v })}
            step={1}
            min={0}
            max={100}
            unit="g"
          />
        </div>
        {entry.source.kind === "remote" && (
          <div className="rounded-xl bg-paper px-3 py-2 text-[12px] text-ink-soft">
            来源：{entry.source.provider} ·{" "}
            <a className="text-moss-600 underline" href={entry.source.url} target="_blank" rel="noreferrer">
              查看原条目
            </a>
            <div className="text-ink-faint">查询于 {new Date(entry.source.queriedAt).toLocaleString("zh-CN")}</div>
          </div>
        )}
        {entry.source.kind === "user" && (
          <div className="rounded-xl bg-paper px-3 py-2 text-[12px] text-ink-soft">
            来源：手动录入 · {entry.source.note}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------- 营养目标 -------------------------------- */

function TargetsSheet({
  open,
  onClose,
  computed,
  current,
  overridden,
  onSave,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  computed: NutritionTargets;
  current: NutritionTargets;
  overridden: boolean;
  onSave: (t: NutritionTargets) => void;
  onReset: () => void;
}) {
  const [kcal, setKcal] = useState(current.kcal);
  const [protein, setProtein] = useState(current.proteinG);
  const [carb, setCarb] = useState(current.carbG);
  const [fat, setFat] = useState(current.fatG);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="营养目标"
      footer={
        <div className="flex gap-2">
          {overridden && (
            <button className="btn-secondary flex-1" onClick={onReset}>
              恢复自动计算
            </button>
          )}
          <button
            className="btn-primary flex-1"
            onClick={() =>
              onSave({
                kcal,
                proteinG: protein,
                carbG: carb,
                fatG: fat,
                basis: "用户手动修改的目标值。",
                caveats: ["这是你自己设定的目标，未经过自动计算校验。"],
              })
            }
          >
            保存
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-paper-line bg-paper px-3 py-2.5">
          <div className="text-[12.5px] font-medium text-ink">计算依据</div>
          <div className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{computed.basis}</div>
        </div>

        <div className="rounded-xl border border-warn/25 bg-warn/5 px-3 py-2.5">
          <div className="text-[12.5px] font-medium text-warn">适用限制</div>
          <ul className="mt-1 space-y-0.5 text-[12.5px] leading-relaxed text-ink-soft">
            {computed.caveats.map((c, i) => (
              <li key={i}>· {c}</li>
            ))}
            <li>· 本应用不生成极端减脂方案，热量不会低于安全下限。</li>
          </ul>
        </div>

        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[14px]">热量（kcal）</span>
            <Stepper value={kcal} onChange={setKcal} step={50} min={1000} max={5000} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[14px]">蛋白质（g）</span>
            <Stepper value={protein} onChange={setProtein} step={5} min={20} max={400} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[14px]">碳水（g）</span>
            <Stepper value={carb} onChange={setCarb} step={10} min={20} max={800} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[14px]">脂肪（g）</span>
            <Stepper value={fat} onChange={setFat} step={5} min={20} max={300} />
          </div>
        </div>
        <div className="text-[11.5px] text-ink-faint">
          改动只影响目标显示与达标判断，不会反向修改你的档案或历史记录。
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------- 购物清单 -------------------------------- */

function ShoppingSheet({
  open,
  onClose,
  items,
  onAdd,
  onToggle,
  onDelete,
  onGenerate,
}: {
  open: boolean;
  onClose: () => void;
  items: ShoppingItem[];
  onAdd: (name: string, amount: string) => void;
  onToggle: (item: ShoppingItem) => void;
  onDelete: (id: string) => void;
  onGenerate: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="购物清单"
      footer={
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="添加食材"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input w-24"
            placeholder="数量"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            className="btn-primary shrink-0"
            onClick={() => {
              if (!name.trim()) return;
              onAdd(name.trim(), amount.trim() || "按需");
              setName("");
              setAmount("");
            }}
          >
            添加
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        <button className="btn-secondary w-full !py-2 text-[13px]" onClick={onGenerate}>
          从当天饮食生成
        </button>
        {items.length === 0 && <div className="py-6 text-center text-[13px] text-ink-faint">清单是空的</div>}
        <div className="divide-y divide-dashed">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-moss-600"
                checked={i.checked}
                onChange={() => onToggle(i)}
              />
              <span className={cx("flex-1 text-[14px]", i.checked && "text-ink-faint line-through")}>
                {i.name}
                <span className="ml-1.5 text-[12px] text-ink-faint">{i.amount}</span>
              </span>
              <button className="btn-ghost !px-1 text-[12px] text-alert" onClick={() => onDelete(i.id)}>
                删除
              </button>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
