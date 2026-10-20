import * as db from "./db";
import { EXERCISE_MAP } from "./seed/exercises";
import type { PlanDay, WorkoutSession } from "./types";
import { isoDateOf, uid } from "./utils";

/**
 * 训练中 UI 状态：持久化到 meta，刷新后可恢复。
 * 计时一律存「结束时间戳」（epoch ms），页面用 Date.now() 计算剩余，
 * 因此手机切后台、息屏、刷新都不会导致倒计时失真。
 */
export interface SessionUiState {
  sessionId: string;
  exerciseIndex: number;
  setIndex: number;
  /** 组间休息结束时间戳（epoch ms） */
  restEndsAt?: number;
  restTotalSec?: number;
  /** 暂停时保存的剩余毫秒 */
  pausedRemainingMs?: number;
  updatedAt: number;
}

const KEY = "sessionUi";

export async function loadSessionUi(): Promise<SessionUiState | undefined> {
  return db.getOne<SessionUiState>("meta", KEY);
}

export async function saveSessionUi(s: SessionUiState): Promise<void> {
  await db.put("meta", { ...s, updatedAt: Date.now() }, KEY);
}

export async function clearSessionUi(): Promise<void> {
  await db.remove("meta", KEY);
}

/* -------------------------------- 热身清单 -------------------------------- */

export function buildWarmups(day: PlanDay | undefined, generic = false): { id: string; label: string; done: boolean }[] {
  const list: { id: string; label: string; done: boolean }[] = [
    { id: "w1", label: "5 分钟低强度有氧（快走/慢骑/开合跳）", done: false },
    { id: "w2", label: "动态关节活动：肩绕环 ×10、髋绕环 ×10、踝腕各 ×10", done: false },
    { id: "w3", label: "空杆/轻重量热身 1-2 组", done: false },
  ];
  if (!day) return list;
  const patterns = new Set(
    day.items
      .map((i) => EXERCISE_MAP[i.exerciseId]?.movementPattern)
      .filter(Boolean) as string[],
  );
  if (patterns.has("squat") || patterns.has("lunge"))
    list.push({ id: "w4", label: "髋膝踝激活：徒手深蹲 ×10、弓步走 ×6/侧", done: false });
  if (patterns.has("horizontal_push") || patterns.has("vertical_push"))
    list.push({ id: "w5", label: "肩胸激活：俯卧撑 ×8、肩胛俯卧撑 ×10", done: false });
  if (patterns.has("horizontal_pull") || patterns.has("vertical_pull"))
    list.push({ id: "w6", label: "背部激活：弹力带拉开 ×15、肩胛后缩 ×12", done: false });
  if (patterns.has("hinge"))
    list.push({ id: "w7", label: "髋铰链激活：臀桥 ×12、徒手屈髋 ×10", done: false });
  void generic;
  return list;
}

/* ------------------------------ 上一次记录检索 ------------------------------ */

export interface LastPerformance {
  date: string;
  sets: { weightKg?: number; reps?: number; durationSec?: number; rpe?: number }[];
  summary: string;
}

export function lastPerformanceOf(
  sessions: WorkoutSession[],
  exerciseId: string,
): LastPerformance | undefined {
  const done = sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  for (const s of done) {
    const log = s.logs.find((l) => l.exerciseId === exerciseId);
    if (!log) continue;
    const sets = log.sets.filter((x) => x.status === "done");
    if (!sets.length) continue;
    const w = sets.find((x) => x.weightKg)?.weightKg;
    const reps = sets.map((x) => x.reps ?? 0);
    const dur = sets.find((x) => x.durationSec)?.durationSec;
    return {
      date: isoDateOf(s.startedAt),
      sets: sets.map((x) => ({
        weightKg: x.weightKg,
        reps: x.reps,
        durationSec: x.durationSec,
        rpe: x.rpe,
      })),
      summary: dur
        ? `${sets.length}×${dur}s`
        : `${sets.length}×${Math.max(...reps)}${w ? ` @${w}kg` : ""}`,
    };
  }
  return undefined;
}

export function newSession(day: PlanDay | undefined, venueId?: string): WorkoutSession {
  const now = new Date().toISOString();
  return {
    id: uid("sess"),
    planDayId: day?.id,
    venueId,
    title: day?.title ?? "自由训练",
    startedAt: now,
    status: "in_progress",
    logs: (day?.items ?? []).map((it) => ({
      exerciseId: it.exerciseId,
      planItemId: it.id,
      sets: it.sets.map((_, i) => ({ index: i, status: "planned" as const })),
    })),
    warmups: buildWarmups(day),
    createdAt: now,
    updatedAt: now,
  };
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
