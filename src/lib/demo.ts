import { EXERCISES } from "./seed/exercises";
import { FOODS, FOOD_MAP } from "./seed/foods";
import type {
  BodyWeightLog,
  FoodEntry,
  MealPlan,
  MealSlot,
  RecoveryLog,
  ShoppingItem,
  SorenessLevel,
  WorkoutPlan,
  WorkoutSession,
} from "./types";
import { addDays, makeRng, todayISO } from "./utils";
import { uid } from "./utils";

/**
 * 演示数据生成器
 * ---------------------------------------------------------------------------
 * 所有产出均带 isDemo = true，UI 必须显示「演示」角标，绝不能与真实记录混淆。
 * 用户可在「我的 → 数据管理」一键清除。
 */

const DEMO_PLAN_DAYS: { title: string; exercises: string[] }[] = [
  { title: "全身 A · 下肢为主", exercises: ["goblet_squat", "romanian_deadlift", "dumbbell_bench_press", "dumbbell_row", "plank"] },
  { title: "全身 B · 上肢为主", exercises: ["dumbbell_shoulder_press", "lat_pulldown", "reverse_lunge", "push_up", "dead_bug"] },
  { title: "全身 C · 髋与肩", exercises: ["hip_thrust", "seated_cable_row", "incline_dumbbell_press", "lateral_raise", "side_plank"] },
];

export function buildDemoPlan(): WorkoutPlan {
  const now = new Date().toISOString();
  return {
    id: "demo_plan",
    name: "演示计划 · 全身 3 分化",
    isDemo: true,
    active: true,
    venueId: "venue_gym",
    createdAt: now,
    updatedAt: now,
    rationale: "这是一份用于演示的计划，动作组次为示例值，不代表你的真实能力。",
    generatedFrom: {
      goal: "recomp",
      experience: "beginner",
      daysPerWeek: 3,
      sessionMinutes: 45,
      availableEquipment: ["barbell", "dumbbell", "machine", "cable", "bench", "bodyweight"],
      limitationAreas: [],
      avoidPatterns: [],
    },
    days: DEMO_PLAN_DAYS.map((d, i) => ({
      id: `demo_pd_${i}`,
      weekday: i * 2,
      title: d.title,
      focusMuscles: [],
      estimatedMinutes: 45,
      items: d.exercises.map((exId, k) => {
        const ex = EXERCISES.find((e) => e.id === exId)!;
        const isCore = ex.movementPattern === "core";
        return {
          id: `demo_pe_${i}_${k}`,
          exerciseId: exId,
          rationale: "演示数据：示例安排理由。",
          sets: Array.from({ length: isCore ? 3 : 3 }, () => ({
            repsMin: isCore ? 0 : 8,
            repsMax: isCore ? 0 : 12,
            durationSec: isCore ? 30 : undefined,
            restSec: isCore ? 45 : 90,
          })),
        };
      }),
    })),
  };
}

const DEMO_WEIGHTS: Record<string, number> = {
  goblet_squat: 12,
  romanian_deadlift: 20,
  dumbbell_bench_press: 8,
  dumbbell_row: 10,
  plank: 0,
  dumbbell_shoulder_press: 6,
  lat_pulldown: 25,
  reverse_lunge: 0,
  push_up: 0,
  dead_bug: 0,
  hip_thrust: 30,
  seated_cable_row: 25,
  incline_dumbbell_press: 8,
  lateral_raise: 4,
  side_plank: 0,
};

export function buildDemoSessions(daysBack = 28): WorkoutSession[] {
  const rng = makeRng(20260101);
  const today = todayISO();
  const out: WorkoutSession[] = [];
  let n = 0;
  for (let d = daysBack; d >= 1; d--) {
    const date = addDays(today, -d);
    const weekday = new Date(`${date}T00:00:00`).getDay();
    // 每周一三五训练
    if (weekday !== 1 && weekday !== 3 && weekday !== 5) continue;
    if (rng() < 0.12) continue; // 偶尔缺席
    const dayIdx = n % 3;
    n++;
    const tpl = DEMO_PLAN_DAYS[dayIdx];
    const progress = 1 + (daysBack - d) * 0.008; // 缓慢进步
    // 19:10 是「本地时间」的傍晚训练。这里必须由本地时间转成 UTC ISO 再存，
    // 否则 UTC+8 会把 19:10Z 显示成次日 03:10，周报 / 历史记录都会算错日期。
    const started = new Date(`${date}T19:10:00`);
    const ended = new Date(started.getTime() + 42 * 60 * 1000);
    const startedAt = started.toISOString();
    out.push({
      id: `demo_sess_${d}`,
      planId: "demo_plan",
      title: tpl.title,
      isDemo: true,
      status: "completed",
      startedAt,
      endedAt: ended.toISOString(),
      createdAt: startedAt,
      updatedAt: startedAt,
      warmups: [],
      logs: tpl.exercises.map((exId) => {
        const ex = EXERCISES.find((e) => e.id === exId)!;
        const base = DEMO_WEIGHTS[exId] ?? 0;
        const isCore = ex.movementPattern === "core";
        return {
          exerciseId: exId,
          sets: Array.from({ length: 3 }, (_, i) => ({
            index: i,
            status: "done" as const,
            weightKg: base ? Math.round(base * progress * 2) / 2 : undefined,
            reps: isCore ? undefined : 8 + Math.floor(rng() * 3) + (i === 0 ? 2 : 0),
            durationSec: isCore ? 30 : undefined,
            rpe: Math.round((6.5 + rng() * 1.8) * 10) / 10,
            completedAt: startedAt,
          })),
        };
      }),
      overallFeel: 3 + Math.floor(rng() * 2),
    });
  }
  return out;
}

export function buildDemoWeights(daysBack = 28): BodyWeightLog[] {
  const rng = makeRng(777);
  const today = todayISO();
  const out: BodyWeightLog[] = [];
  let base = 62.4;
  for (let d = daysBack; d >= 0; d -= 2) {
    base -= 0.06 + rng() * 0.08; // 缓慢下降
    const date = addDays(today, -d);
    out.push({
      id: `demo_bw_${d}`,
      date,
      weightKg: Math.round((base + (rng() - 0.5) * 0.5) * 10) / 10,
      isDemo: true,
      createdAt: `${date}T07:00:00.000Z`,
      updatedAt: `${date}T07:00:00.000Z`,
    });
  }
  return out;
}

const DEMO_MEALS: Record<MealSlot, { foodId: string; grams: number }[]> = {
  breakfast: [
    { foodId: "oats", grams: 40 },
    { foodId: "milk_whole", grams: 250 },
    { foodId: "egg", grams: 100 },
    { foodId: "banana", grams: 120 },
  ],
  lunch: [
    { foodId: "rice_white_cooked", grams: 150 },
    { foodId: "chicken_breast_cooked", grams: 120 },
    { foodId: "broccoli", grams: 150 },
    { foodId: "olive_oil", grams: 5 },
  ],
  dinner: [
    { foodId: "sweet_potato", grams: 150 },
    { foodId: "salmon_raw", grams: 120 },
    { foodId: "spinach", grams: 100 },
    { foodId: "olive_oil", grams: 5 },
  ],
  snack: [{ foodId: "greek_yogurt", grams: 150 }],
};

export function buildDemoEntries(daysBack = 9): FoodEntry[] {
  const rng = makeRng(4242);
  const today = todayISO();
  const out: FoodEntry[] = [];
  for (let d = daysBack; d >= 0; d--) {
    const date = addDays(today, -d);
    if (rng() < 0.12) continue; // 偶尔漏记
    (Object.keys(DEMO_MEALS) as (keyof typeof DEMO_MEALS)[]).forEach((slot) => {
      if (slot === "snack" && rng() < 0.5) return;
      for (const item of DEMO_MEALS[slot]) {
        const food = FOOD_MAP[item.foodId];
        if (!food) continue;
        const grams = Math.round(item.grams * (0.9 + rng() * 0.2));
        out.push({
          id: `demo_fe_${d}_${slot}_${item.foodId}`,
          date,
          slot,
          foodId: food.id,
          foodName: food.name,
          grams,
          basis: food.basis,
          cookingMethod: slot === "breakfast" ? "boiled" : "stir_fried",
          // 午餐/晚餐已经单独记录了 5g 橄榄油条目，这里不能再按烹饪方式
          // 重复加一份用油，否则演示数据每天会凭空多出 40g 油（约 350 kcal）。
          oilG: 0,
          source: food.source,
          isDemo: true,
          createdAt: `${date}T12:00:00.000Z`,
          updatedAt: `${date}T12:00:00.000Z`,
        });
      }
    });
  }
  return out;
}

export function buildDemoRecovery(daysBack = 9): RecoveryLog[] {
  const rng = makeRng(99);
  const today = todayISO();
  const out: RecoveryLog[] = [];
  for (let d = daysBack; d >= 0; d--) {
    if (rng() < 0.2) continue;
    const date = addDays(today, -d);
    out.push({
      id: `demo_rec_${d}`,
      date,
      sleepHours: Math.round((6 + rng() * 2.5) * 10) / 10,
      sleepQuality: 2 + Math.floor(rng() * 4),
      fatigue: 1 + Math.floor(rng() * 4),
      soreness: Math.floor(rng() * 4) as SorenessLevel,
      hasPain: false,
      isDemo: true,
      createdAt: `${date}T08:00:00.000Z`,
      updatedAt: `${date}T08:00:00.000Z`,
    });
  }
  return out;
}

export function buildDemoMealPlan(date: string): MealPlan {
  const items = (Object.keys(DEMO_MEALS) as MealSlot[]).flatMap((slot) =>
    DEMO_MEALS[slot].map((i) => ({
      foodId: i.foodId,
      foodName: FOOD_MAP[i.foodId]?.name ?? i.foodId,
      grams: i.grams,
      slot,
    })),
  );
  return {
    id: `demo_meal_${date}`,
    date,
    items,
    isDemo: true,
    createdAt: `${date}T06:00:00.000Z`,
    updatedAt: `${date}T06:00:00.000Z`,
  };
}

export function buildDemoShopping(): ShoppingItem[] {
  const now = new Date().toISOString();
  const names: [string, string][] = [
    ["鸡胸肉", "500g"],
    ["西兰花", "2 颗"],
    ["鸡蛋", "1 盒（10 个）"],
    ["无糖酸奶", "1 大桶"],
    ["燕麦片", "1 袋"],
    ["橄榄油", "1 瓶（已在用）"],
    ["红薯", "1 kg"],
  ];
  return names.map(([name, amount], i) => ({
    id: `demo_shop_${i}`,
    name,
    amount,
    checked: i < 2,
    createdAt: now,
    updatedAt: now,
  }));
}

export function demoFoodCountHint(): number {
  return FOODS.length;
}

export async function demoNewId(): Promise<string> {
  return uid("demo");
}
