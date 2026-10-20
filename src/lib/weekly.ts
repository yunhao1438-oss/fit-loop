import { nutrientsFor } from "./nutrition";
import { EXERCISE_MAP } from "./seed/exercises";
import { FOODS, FOOD_MAP } from "./seed/foods";
import type {
  Food,
  FoodEntry,
  RecoveryLog,
  WorkoutPlan,
  WorkoutSession,
  BodyWeightLog,
  NutritionTargets,
} from "./types";
import { addDays, isoDateOf, startOfWeekISO, toISODate } from "./utils";
import { best1RM, bestSetVolume, historyFor } from "./progression";

/**
 * 周报
 * ---------------------------------------------------------------------------
 * 原则：数据不足时明确标注 insufficient，绝不给出确定性结论。
 */

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  plannedDays: number;
  completedSessions: WorkoutSession[];
  completionRate: number | null;
  completionNote: string;
  totalVolumeKg: number;
  exercisePerformance: {
    exerciseId: string;
    exerciseName: string;
    lastBest: number;
    prevBest: number;
    delta: number;
    unit: "1RM" | "容量";
    enough: boolean;
  }[];
  nutrition: {
    daysLogged: number;
    avgKcal: number | null;
    avgProtein: number | null;
    proteinHitDays: number;
    targetProtein: number;
    targetKcal: number;
    enough: boolean;
    note: string;
  };
  weight: {
    points: { date: string; kg: number }[];
    changeKg: number | null;
    trend: "down" | "up" | "flat" | "unknown";
    enough: boolean;
    note: string;
  };
  recovery: {
    avgSleepHours: number | null;
    avgFatigue: number | null;
    painDays: number;
    enough: boolean;
    note: string;
  };
  /** 本周仍需谨慎的地方（非医疗建议） */
  cautions: string[];
}

export function buildWeeklyReport(args: {
  today: string;
  plan?: WorkoutPlan;
  sessions: WorkoutSession[];
  entries: FoodEntry[];
  weights: BodyWeightLog[];
  recovery: RecoveryLog[];
  targets: NutritionTargets;
  /**
   * 用户自建食物（可选）。内置库 FOOD_MAP 查不到时用它兜底，
   * 否则自建食物会被按 0 kcal 计入周报。保持可选以向后兼容旧调用方。
   */
  foods?: Food[];
}): WeeklyReport {
  const { today, plan, sessions, entries, weights, recovery, targets } = args;
  const weekStart = startOfWeekISO(today);
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (d: string) => d >= weekStart && d <= weekEnd;

  const plannedDays = plan ? plan.days.filter((d) => !d.restDay).length : 0;
  const sessionDate = (s: WorkoutSession) => isoDateOf(s.startedAt);
  const completedSessions = sessions.filter(
    (s) => s.status === "completed" && inWeek(sessionDate(s)),
  );
  const allSessionsInWeek = sessions.filter((s) => inWeek(sessionDate(s)));
  // 完成率只统计「已完成」的会话：进行中 / 中途放弃不应计入完成。
  // 同时 clamp 到 100%，额外的自由训练不应让完成率超过 100%（次数仍在文字里体现）。
  const completionRate =
    plannedDays > 0 ? Math.min(1, completedSessions.length / plannedDays) : null;
  const completionNote =
    plannedDays === 0
      ? "还没有训练计划，无法计算完成率。"
      : `本周计划 ${plannedDays} 次，已记录 ${allSessionsInWeek.length} 次（完成 ${completedSessions.length} 次）。`;

  let totalVolumeKg = 0;
  for (const s of completedSessions) {
    for (const l of s.logs) {
      for (const set of l.sets) {
        if (set.status === "done") totalVolumeKg += (set.weightKg ?? 0) * (set.reps ?? 0);
      }
    }
  }

  /* ------------------------------ 动作表现 ------------------------------ */
  const exerciseIds = new Set<string>();
  completedSessions.forEach((s) => s.logs.forEach((l) => exerciseIds.add(l.exerciseId)));
  const exercisePerformance = [...exerciseIds].map((id) => {
    const h = historyFor(completedSessions.length ? sessions : [], id);
    const last = h[h.length - 1];
    const prev = h[h.length - 2];
    const weighted = last && last.sets.some((s) => s.weightKg);
    const unit: "1RM" | "容量" = weighted ? "1RM" : "容量";
    const lastBest = last ? (weighted ? best1RM(last) : bestSetVolume(last)) : 0;
    const prevBest = prev ? (weighted ? best1RM(prev) : bestSetVolume(prev)) : 0;
    return {
      exerciseId: id,
      exerciseName: EXERCISE_MAP[id]?.name ?? id,
      lastBest,
      prevBest,
      delta: Math.round((lastBest - prevBest) * 10) / 10,
      unit,
      enough: h.length >= 2,
    };
  });
  exercisePerformance.sort((a, b) => b.delta - a.delta);

  /* ------------------------------- 营养 -------------------------------- */
  const weekEntries = entries.filter((e) => inWeek(e.date));
  const days = new Set(weekEntries.map((e) => e.date));
  const dayTotals = new Map<string, { kcal: number; protein: number }>();
  for (const e of weekEntries) {
    const food = e.foodId
      ? (FOOD_MAP[e.foodId] ?? args.foods?.find((f) => f.id === e.foodId))
      : undefined;
    // 手动 / 拍照录入没有 foodId、也没有对应 Food 对象时，按食物名（或别名）
    // 回落到内置库，否则这些记录会被当成 0 kcal 静默少算。仍找不到时才按 0 计，
    // 绝不伪造数值。
    const matched =
      food ??
      FOODS.find(
        (f) => f.name === e.foodName || (f.alias ?? []).includes(e.foodName),
      );
    const per100 =
      matched?.per100g ??
      { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };
    const n = nutrientsFor(e, per100);
    const cur = dayTotals.get(e.date) ?? { kcal: 0, protein: 0 };
    dayTotals.set(e.date, { kcal: cur.kcal + n.kcal, protein: cur.protein + n.proteinG });
  }
  const totals = [...dayTotals.values()];
  const avgKcal = totals.length ? Math.round(totals.reduce((a, b) => a + b.kcal, 0) / totals.length) : null;
  const avgProtein = totals.length
    ? Math.round(totals.reduce((a, b) => a + b.protein, 0) / totals.length)
    : null;
  const proteinHitDays = totals.filter((t) => t.protein >= targets.proteinG * 0.9).length;
  const nutritionEnough = totals.length >= 3;

  /* ------------------------------- 体重 -------------------------------- */
  const wpoints = weights
    .filter((w) => inWeek(w.date))
    .map((w) => ({ date: w.date, kg: w.weightKg }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const recent = weights.slice(-14);
  let changeKg: number | null = null;
  let trend: WeeklyReport["weight"]["trend"] = "unknown";
  if (wpoints.length >= 2) {
    changeKg = Math.round((wpoints[wpoints.length - 1].kg - wpoints[0].kg) * 10) / 10;
    trend = changeKg < -0.3 ? "down" : changeKg > 0.3 ? "up" : "flat";
  }
  const weightEnough = recent.length >= 4 && wpoints.length >= 2;

  /* ------------------------------- 恢复 -------------------------------- */
  const weekRecovery = recovery.filter((r) => inWeek(r.date));
  const sleeps = weekRecovery.map((r) => r.sleepHours).filter((x): x is number => typeof x === "number");
  const fatigues = weekRecovery.map((r) => r.fatigue).filter((x): x is number => typeof x === "number");
  const recoveryEnough = weekRecovery.length >= 3;

  const cautions: string[] = [];
  if (weekRecovery.some((r) => r.hasPain)) {
    cautions.push(
      "本周有记录疼痛反馈：建议暂停引发不适的动作，若持续超过 3-5 天或加重，请寻求医生/物理治疗师的面对面评估。本应用不做诊断，也不提供康复处方。",
    );
  }
  if (recoveryEnough && sleeps.length && sleeps.reduce((a, b) => a + b, 0) / sleeps.length < 6) {
    cautions.push("本周平均睡眠低于 6 小时，恢复可能不足，训练表现下滑属常见现象。");
  }
  if (avgKcal !== null && nutritionEnough && avgKcal < targets.kcal * 0.7) {
    cautions.push("平均摄入明显低于目标（<70%），长期如此可能影响训练恢复，建议复查记录是否完整或适当上调。");
  }
  if (!weightEnough) {
    cautions.push("体重数据不足（至少需要 4 条记录），本周不做体重趋势结论。");
  }

  return {
    weekStart,
    weekEnd,
    plannedDays,
    completedSessions,
    completionRate,
    completionNote,
    totalVolumeKg: Math.round(totalVolumeKg),
    exercisePerformance,
    nutrition: {
      daysLogged: totals.length,
      avgKcal,
      avgProtein,
      proteinHitDays,
      targetProtein: targets.proteinG,
      targetKcal: targets.kcal,
      enough: nutritionEnough,
      note: nutritionEnough
        ? `本周有 ${totals.length} 天饮食记录，其中 ${proteinHitDays} 天蛋白质达到目标的 90%。`
        : "饮食记录不足 3 天，暂不评价摄入是否达标。",
    },
    weight: {
      points: wpoints,
      changeKg,
      trend,
      enough: weightEnough,
      note: weightEnough
        ? changeKg !== null
          ? `本周体重变化 ${changeKg > 0 ? "+" : ""}${changeKg} kg（趋势：${
              { down: "下降", up: "上升", flat: "基本持平", unknown: "未知" }[trend]
            }）。单日波动受水分与饮食影响很大，请结合 2-4 周趋势判断。`
          : "体重数据不足以判断趋势。"
        : "体重记录不足，需至少 4 条记录才会给出趋势。",
    },
    recovery: {
      avgSleepHours: sleeps.length
        ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 10) / 10
        : null,
      avgFatigue: fatigues.length
        ? Math.round((fatigues.reduce((a, b) => a + b, 0) / fatigues.length) * 10) / 10
        : null,
      painDays: weekRecovery.filter((r) => r.hasPain).length,
      enough: recoveryEnough,
      note: recoveryEnough
        ? `本周有 ${weekRecovery.length} 天恢复记录。`
        : "恢复记录不足 3 天，暂不做结论。",
    },
    cautions,
  };
}

export function dateRangeOfWeek(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function todayISODate(): string {
  return toISODate(new Date());
}
