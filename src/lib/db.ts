import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  BodyWeightLog,
  Food,
  FoodEntry,
  MealPlan,
  PlanDay,
  RecoveryLog,
  ShoppingItem,
  UserProfile,
  Venue,
  WaterLog,
  WorkoutPlan,
  WorkoutSession,
} from "./types";

export const DB_NAME = "fitloop";
export const DB_VERSION = 1;

interface FitLoopDB extends DBSchema {
  profile: { key: string; value: UserProfile };
  venues: { key: string; value: Venue };
  plans: { key: string; value: WorkoutPlan };
  sessions: { key: string; value: WorkoutSession };
  foods: { key: string; value: Food; indexes: { byName: string } };
  foodEntries: { key: string; value: FoodEntry; indexes: { byDate: string } };
  mealPlans: { key: string; value: MealPlan; indexes: { byDate: string } };
  shopping: { key: string; value: ShoppingItem };
  recovery: { key: string; value: RecoveryLog; indexes: { byDate: string } };
  bodyWeights: { key: string; value: BodyWeightLog; indexes: { byDate: string } };
  water: { key: string; value: WaterLog; indexes: { byDate: string } };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<FitLoopDB>> | null = null;

/** IndexedDB 是否可用（隐私模式 / 老浏览器可能不可用） */
export function isPersistenceAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function getDB(): Promise<IDBPDatabase<FitLoopDB>> {
  if (!isPersistenceAvailable()) {
    return Promise.reject(new Error("当前浏览器不支持 IndexedDB，数据仅保存在内存中"));
  }
  if (!dbPromise) {
    dbPromise = openDB<FitLoopDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("profile")) {
          db.createObjectStore("profile", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("venues")) {
          db.createObjectStore("venues", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("plans")) {
          db.createObjectStore("plans", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("foods")) {
          const s = db.createObjectStore("foods", { keyPath: "id" });
          s.createIndex("byName", "name");
        }
        if (!db.objectStoreNames.contains("foodEntries")) {
          const s = db.createObjectStore("foodEntries", { keyPath: "id" });
          s.createIndex("byDate", "date");
        }
        if (!db.objectStoreNames.contains("mealPlans")) {
          const s = db.createObjectStore("mealPlans", { keyPath: "id" });
          s.createIndex("byDate", "date");
        }
        if (!db.objectStoreNames.contains("shopping")) {
          db.createObjectStore("shopping", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("recovery")) {
          const s = db.createObjectStore("recovery", { keyPath: "id" });
          s.createIndex("byDate", "date");
        }
        if (!db.objectStoreNames.contains("bodyWeights")) {
          const s = db.createObjectStore("bodyWeights", { keyPath: "id" });
          s.createIndex("byDate", "date");
        }
        if (!db.objectStoreNames.contains("water")) {
          const s = db.createObjectStore("water", { keyPath: "id" });
          s.createIndex("byDate", "date");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
      },
    });
  }
  return dbPromise;
}

/* ------------------------- 内存兜底（IndexedDB 不可用时） ------------------------- */

type StoreName = Extract<keyof FitLoopDB, string>;
const memoryFallback = new Map<string, Map<string, any>>();
let usingFallback = false;

export function isUsingFallback(): boolean {
  return usingFallback;
}

function memStore(name: StoreName) {
  if (!memoryFallback.has(name)) memoryFallback.set(name, new Map());
  return memoryFallback.get(name)!;
}

/**
 * 把「写失败时落入内存」的数据合并进 IndexedDB 的读取结果。
 *
 * 之前的兜底只在「整库不可用」时生效；若某一次写入失败（如配额超限），
 * 值只进了内存 Map，而随后的读取成功走 IndexedDB，于是刚写入的数据
 * 在界面上「凭空消失」，用户以为保存成功。这里做读穿透，至少保证
 * 当前会话能读到自己刚写的数据（刷新后仍会丢，UI 会提示内存模式）。
 */
function mergeMemory<T>(store: StoreName, dbValues: T[]): T[] {
  const mem = memStore(store);
  if (!mem.size) return dbValues;
  const out = [...dbValues];
  for (const value of mem.values()) {
    const id = (value as { id?: string } | null)?.id;
    if (typeof id === "string") {
      const i = out.findIndex((v) => (v as { id?: string } | null)?.id === id);
      if (i >= 0) out[i] = value as T;
      else out.push(value as T);
    } else if (!out.includes(value as T)) {
      out.push(value as T);
    }
  }
  return out;
}

/** getOne 支持显式 key（meta store 无 keyPath） */
export async function getMeta<T>(key: string): Promise<T | undefined> {
  return getOne<T>("meta", key);
}

/* --------------------------------- 通用 CRUD -------------------------------- */

export async function getAll<T>(store: StoreName): Promise<T[]> {
  try {
    const db = await getDB();
    const rows = (await db.getAll(store as any)) as T[];
    return mergeMemory(store, rows);
  } catch {
    usingFallback = true;
    return Array.from(memStore(store).values()) as T[];
  }
}

export async function getOne<T>(store: StoreName, key: string): Promise<T | undefined> {
  // 写失败时落入内存的数据优先返回，避免「刚保存却读不到」。
  const mem = memStore(store).get(key);
  if (mem !== undefined) return mem as T;
  try {
    const db = await getDB();
    return (await db.get(store as any, key)) as T | undefined;
  } catch {
    usingFallback = true;
    return mem as T | undefined;
  }
}

/** key 仅对无 keyPath 的 store（如 meta）必需 */
export async function put<T>(store: StoreName, value: T, key?: string): Promise<void> {
  const k = key ?? (value as { id?: string } | null)?.id;
  try {
    const db = await getDB();
    await db.put(store as any, value as any, key as any);
    // 成功落库后清掉同 key 的内存兜底，避免旧值覆盖新值。
    if (k !== undefined) memStore(store).delete(k);
  } catch {
    usingFallback = true;
    memStore(store).set(k ?? "default", value);
  }
  notify();
}

export async function putMany<T>(store: StoreName, values: T[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(store as any, "readwrite");
    await Promise.all([...values.map((v) => tx.store.put(v as any)), tx.done]);
    for (const v of values) {
      const id = (v as { id?: string } | null)?.id;
      if (id !== undefined) memStore(store).delete(id);
    }
  } catch {
    usingFallback = true;
    for (const v of values) memStore(store).set((v as any)?.id ?? "default", v);
  }
  notify();
}

export async function remove(store: StoreName, key: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(store as any, key);
    memStore(store).delete(key);
  } catch {
    usingFallback = true;
    memStore(store).delete(key);
  }
  notify();
}

export async function getByIndex<T>(
  store: StoreName,
  index: string,
  value: IDBValidKey,
): Promise<T[]> {
  try {
    const db = await getDB();
    const d = db as unknown as {
      getAllFromIndex: (s: string, i: string, v: IDBValidKey) => Promise<unknown[]>;
    };
    const rows = (await d.getAllFromIndex(store, index, value)) as T[];
    return mergeMemory(store, rows);
  } catch {
    usingFallback = true;
    const field = index.replace(/^by/, "").toLowerCase();
    return (Array.from(memStore(store).values()) as any[]).filter(
      (v) => v[field] === value,
    ) as T[];
  }
}

export async function clearStore(store: StoreName): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(store as any);
    memStore(store).clear();
  } catch {
    usingFallback = true;
    memStore(store).clear();
  }
  notify();
}

/** 导出全部个人数据（用于「导出我的数据」） */
export async function exportAll(): Promise<Record<string, unknown[]>> {
  const names: StoreName[] = [
    "profile",
    "venues",
    "plans",
    "sessions",
    "foods",
    "foodEntries",
    "mealPlans",
    "shopping",
    "recovery",
    "bodyWeights",
    "water",
    "meta",
  ];
  const out: Record<string, unknown[]> = {};
  for (const n of names) out[n] = await getAll(n);
  return out;
}

/** 删除全部个人数据 */
export async function wipeAll(): Promise<void> {
  const names: StoreName[] = [
    "profile",
    "venues",
    "plans",
    "sessions",
    "foods",
    "foodEntries",
    "mealPlans",
    "shopping",
    "recovery",
    "bodyWeights",
    "water",
    "meta",
  ];
  for (const n of names) await clearStore(n);
}

/* --------------------------------- 变更通知 -------------------------------- */

const listeners = new Set<() => void>();

/**
 * 跨标签页同步：IndexedDB 的写入不会触发其他标签页的订阅，
 * README 里承诺的「跨标签页 subscribe 刷新」需要额外的广播通道。
 * 这里用 BroadcastChannel（浏览器支持度已足够），只在存在订阅者时惰性创建，
 * 服务端渲染（typeof window === "undefined"）下不创建。
 */
let channel: BroadcastChannel | null = null;
let channelReady = false;

function ensureChannel(): void {
  if (channelReady) return;
  channelReady = true;
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    channel = new BroadcastChannel("fitloop-db");
    channel.onmessage = () => notify(false);
  } catch {
    channel = null;
  }
}

export function subscribe(fn: () => void): () => void {
  ensureChannel();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(broadcastToOtherTabs = true): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
  if (broadcastToOtherTabs && listeners.size) {
    ensureChannel();
    try {
      channel?.postMessage({ at: Date.now() });
    } catch {
      /* ignore */
    }
  }
}

export type { WorkoutPlan, PlanDay, Venue, Food };
