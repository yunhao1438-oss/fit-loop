import * as db from "./db";
import { EXERCISES } from "./seed/exercises";
import { FOODS } from "./seed/foods";
import type { Exercise } from "./types";
import type {
  BodyWeightLog,
  Food,
  FoodEntry,
  MealPlan,
  RecoveryLog,
  ShoppingItem,
  UserProfile,
  Venue,
  WaterLog,
  WorkoutPlan,
  WorkoutSession,
} from "./types";
import { nowISO, uid } from "./utils";

/* ================================ 个人档案 ================================ */

export const DEFAULT_PROFILE: UserProfile = {
  id: "me",
  displayName: "我",
  goal: "recomp",
  experience: "beginner",
  daysPerWeek: 3,
  sessionMinutes: 45,
  heightCm: 168,
  weightKg: 62,
  sex: "unspecified",
  limitations: { areas: [], avoidPatterns: [], skipped: true },
  reminders: {
    waterEnabled: false,
    waterIntervalMin: 60,
    moveEnabled: false,
    moveIntervalMin: 60,
    trainingEnabled: false,
  },
  onboarded: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export async function getProfile(): Promise<UserProfile> {
  const p = await db.getOne<UserProfile>("profile", "me");
  return p ?? DEFAULT_PROFILE;
}

export async function saveProfile(p: UserProfile): Promise<UserProfile> {
  const next = { ...p, id: "me", updatedAt: nowISO() };
  await db.put("profile", next);
  return next;
}

/* ================================= 场馆 ================================= */

export const SAMPLE_VENUES: Venue[] = [
  {
    id: "venue_home",
    name: "居家 · 客厅",
    kind: "home",
    location: "家中",
    isDefault: true,
    isDemo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    equipment: [
      { id: "eq_home_1", category: "other", name: "瑜伽垫", note: "1 张" },
      { id: "eq_home_2", category: "band", name: "弹力带", note: "轻/中/重各 1 条" },
      { id: "eq_home_3", category: "dumbbell", name: "可调哑铃", maxWeightKg: 10, incrementsKg: [2, 4, 6, 8, 10], adjustable: true, note: "2 只" },
      { id: "eq_home_4", category: "bodyweight", name: "徒手/自重" },
    ],
  },
  {
    id: "venue_gym",
    name: "健身房 · 商业健身房",
    kind: "gym",
    location: "小区附近",
    isDefault: false,
    isDemo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    equipment: [
      { id: "eq_gym_1", category: "barbell", name: "奥林匹克杠铃", maxWeightKg: 100, incrementsKg: [2.5, 5, 10, 15, 20], note: "2 根" },
      { id: "eq_gym_2", category: "dumbbell", name: "哑铃", maxWeightKg: 30, incrementsKg: [2.5, 5], note: "2.5-30kg" },
      { id: "eq_gym_3", category: "machine", name: "固定器械区", note: "腿举/划船/推胸等" },
      { id: "eq_gym_4", category: "cable", name: "龙门架/绳索", note: "2 台" },
      { id: "eq_gym_5", category: "bench", name: "可调训练凳", note: "3 张" },
      { id: "eq_gym_6", category: "kettlebell", name: "壶铃", maxWeightKg: 24, incrementsKg: [4, 8, 12, 16, 20, 24] },
      { id: "eq_gym_7", category: "cardio", name: "有氧器械", note: "跑步机/椭圆机/单车" },
    ],
  },
];

export async function listVenues(): Promise<Venue[]> {
  const list = await db.getAll<Venue>("venues");
  if (!list.length) {
    await db.putMany("venues", SAMPLE_VENUES);
    return SAMPLE_VENUES;
  }
  return list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export async function saveVenue(v: Venue): Promise<Venue> {
  const next = { ...v, updatedAt: nowISO() };
  if (next.isDefault) {
    const all = await db.getAll<Venue>("venues");
    for (const other of all) {
      if (other.id !== next.id && other.isDefault) {
        await db.put("venues", { ...other, isDefault: false, updatedAt: nowISO() });
      }
    }
  }
  await db.put("venues", next);
  return next;
}

export async function deleteVenue(id: string): Promise<void> {
  await db.remove("venues", id);
}

export async function setDefaultVenue(id: string): Promise<void> {
  const all = await db.getAll<Venue>("venues");
  for (const v of all) {
    await db.put("venues", { ...v, isDefault: v.id === id, updatedAt: nowISO() });
  }
}

/* ================================= 动作 ================================= */

/**
 * 自定义动作存放在 meta store 的 customExercises 键下（避免改动 DB schema 版本）。
 */
export async function listCustomExercises(): Promise<Exercise[]> {
  const list = await db.getOne<Exercise[]>("meta", "customExercises");
  return list ?? [];
}

export async function saveCustomExercise(e: Exercise): Promise<void> {
  const all = await listCustomExercises();
  const idx = all.findIndex((x) => x.id === e.id);
  if (idx >= 0) all[idx] = { ...e, updatedAt: nowISO() };
  else all.push({ ...e, updatedAt: nowISO() });
  // meta 是 out-of-line key 的 store：必须显式传 key，否则 IndexedDB 会抛
  // DataError 并被 db.put 的兜底吞掉，数据只写进内存、刷新即丢。
  await db.put("meta", [...all], "customExercises");
}

export async function deleteCustomExercise(id: string): Promise<void> {
  const all = await listCustomExercises();
  await db.put("meta", all.filter((x) => x.id !== id), "customExercises");
}

export async function listExercises(): Promise<Exercise[]> {
  const custom = await listCustomExercises();
  return [...EXERCISES, ...custom];
}

/* ================================ 训练计划 ================================ */

export async function listPlans(): Promise<WorkoutPlan[]> {
  return db.getAll<WorkoutPlan>("plans");
}

export async function getActivePlan(): Promise<WorkoutPlan | undefined> {
  const all = await listPlans();
  return all.find((p) => p.active) ?? all[0];
}

export async function savePlan(p: WorkoutPlan): Promise<WorkoutPlan> {
  const next = { ...p, updatedAt: nowISO() };
  if (next.active) {
    const all = await db.getAll<WorkoutPlan>("plans");
    for (const other of all) {
      if (other.id !== next.id && other.active) {
        await db.put("plans", { ...other, active: false, updatedAt: nowISO() });
      }
    }
  }
  await db.put("plans", next);
  return next;
}

export async function deletePlan(id: string): Promise<void> {
  await db.remove("plans", id);
}

/* ================================ 训练记录 ================================ */

export async function listSessions(): Promise<WorkoutSession[]> {
  const all = await db.getAll<WorkoutSession>("sessions");
  return all.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export async function getSession(id: string): Promise<WorkoutSession | undefined> {
  return db.getOne<WorkoutSession>("sessions", id);
}

export async function getInProgressSession(): Promise<WorkoutSession | undefined> {
  const all = await listSessions();
  return all.find((s) => s.status === "in_progress");
}

export async function saveSession(s: WorkoutSession): Promise<WorkoutSession> {
  const next = { ...s, updatedAt: nowISO() };
  await db.put("sessions", next);
  return next;
}

export async function deleteSession(id: string): Promise<void> {
  await db.remove("sessions", id);
}

/* ================================= 食物 ================================= */

export async function listFoods(): Promise<Food[]> {
  const custom = (await db.getAll<Food>("foods")).filter((f) => f.custom);
  return [...FOODS, ...custom];
}

export async function saveFood(f: Food): Promise<Food> {
  const next = { ...f, updatedAt: nowISO(), custom: true };
  await db.put("foods", next);
  return next;
}

export function searchLocalFoods(foods: Food[], q: string): Food[] {
  const kw = q.trim().toLowerCase();
  if (!kw) return foods;
  return foods.filter(
    (f) =>
      f.name.toLowerCase().includes(kw) ||
      (f.alias ?? []).some((a) => a.toLowerCase().includes(kw)),
  );
}

/* ================================ 饮食日志 ================================ */

export async function listEntries(): Promise<FoodEntry[]> {
  return db.getAll<FoodEntry>("foodEntries");
}

export async function listEntriesByDate(date: string): Promise<FoodEntry[]> {
  return db.getByIndex<FoodEntry>("foodEntries", "byDate", date);
}

export async function saveEntry(e: FoodEntry): Promise<FoodEntry> {
  const next = { ...e, updatedAt: nowISO() };
  await db.put("foodEntries", next);
  return next;
}

export async function deleteEntry(id: string): Promise<void> {
  await db.remove("foodEntries", id);
}

/* ================================= 餐单 ================================= */

export async function listMealPlans(): Promise<MealPlan[]> {
  return db.getAll<MealPlan>("mealPlans");
}

export async function saveMealPlan(m: MealPlan): Promise<MealPlan> {
  const next = { ...m, updatedAt: nowISO() };
  await db.put("mealPlans", next);
  return next;
}

/* ================================ 购物清单 ================================ */

export async function listShopping(): Promise<ShoppingItem[]> {
  return db.getAll<ShoppingItem>("shopping");
}

export async function saveShoppingItem(i: ShoppingItem): Promise<ShoppingItem> {
  const next = { ...i, updatedAt: nowISO() };
  await db.put("shopping", next);
  return next;
}

export async function deleteShoppingItem(id: string): Promise<void> {
  await db.remove("shopping", id);
}

/* ================================= 恢复 ================================= */

export async function listRecovery(): Promise<RecoveryLog[]> {
  return db.getAll<RecoveryLog>("recovery");
}

export async function getRecovery(date: string): Promise<RecoveryLog | undefined> {
  const all = await db.getByIndex<RecoveryLog>("recovery", "byDate", date);
  return all[0];
}

export async function saveRecovery(r: RecoveryLog): Promise<RecoveryLog> {
  const next = { ...r, updatedAt: nowISO() };
  await db.put("recovery", next);
  return next;
}

/* ================================= 体重 ================================= */

export async function listBodyWeights(): Promise<BodyWeightLog[]> {
  const all = await db.getAll<BodyWeightLog>("bodyWeights");
  return all.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function saveBodyWeight(w: BodyWeightLog): Promise<BodyWeightLog> {
  const next = { ...w, updatedAt: nowISO() };
  await db.put("bodyWeights", next);
  return next;
}

/* ================================= 饮水 ================================= */

export async function listWater(): Promise<WaterLog[]> {
  return db.getAll<WaterLog>("water");
}

export async function addWater(date: string, ml: number): Promise<void> {
  const all = await db.getByIndex<WaterLog>("water", "byDate", date);
  if (all[0]) {
    await db.put("water", { ...all[0], ml: all[0].ml + ml, updatedAt: nowISO() });
  } else {
    await db.put("water", {
      id: uid("water"),
      date,
      ml,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });
  }
}

/* ============================ 导出 / 删除 / 演示 ============================ */

export async function exportUserData(): Promise<Record<string, unknown[]>> {
  const data = await db.exportAll();
  return {
    ...data,
    exportedAt: [new Date().toISOString()],
    note: ["本文件由 FitLoop 导出，包含你的个人档案、训练与饮食记录。"],
  } as Record<string, unknown[]>;
}

export async function wipeUserData(): Promise<void> {
  await db.wipeAll();
}

/** 清除所有演示数据（演示场馆 / 演示计划 / 演示记录） */
export async function clearDemoData(): Promise<void> {
  const [venues, plans, sessions, entries, recovery, weights, meals] =
    await Promise.all([
      db.getAll<Venue>("venues"),
      db.getAll<WorkoutPlan>("plans"),
      db.getAll<WorkoutSession>("sessions"),
      db.getAll<FoodEntry>("foodEntries"),
      db.getAll<RecoveryLog>("recovery"),
      db.getAll<BodyWeightLog>("bodyWeights"),
      db.getAll<MealPlan>("mealPlans"),
    ]);
  for (const v of venues) if (v.isDemo) await db.remove("venues", v.id);
  for (const p of plans) if (p.isDemo) await db.remove("plans", p.id);
  for (const s of sessions) if (s.isDemo) await db.remove("sessions", s.id);
  for (const e of entries) if (e.isDemo) await db.remove("foodEntries", e.id);
  for (const r of recovery) if (r.isDemo) await db.remove("recovery", r.id);
  for (const w of weights) if (w.isDemo) await db.remove("bodyWeights", w.id);
  for (const m of meals) if (m.isDemo) await db.remove("mealPlans", m.id);
  // 购物清单没有 isDemo 标记，无法区分演示项与用户自己添加的项。
  // 之前「清除演示数据」会删光整个清单（用户真实数据），因此这里不动它。
}

export function hasAnyDemo(
  venues: Venue[],
  sessions: WorkoutSession[],
  entries: FoodEntry[],
): boolean {
  return (
    venues.some((v) => v.isDemo) ||
    sessions.some((s) => s.isDemo) ||
    entries.some((e) => e.isDemo)
  );
}
