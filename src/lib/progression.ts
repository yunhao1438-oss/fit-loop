import { EXERCISE_MAP } from "./seed/exercises";
import type { PlanExercise, ProgressionSuggestion, WorkoutSession } from "./types";
import { isoDateOf } from "./utils";

/**
 * 渐进超负荷建议
 * ---------------------------------------------------------------------------
 * 规则（保守、可解释）：
 * - 同一动作近 2 次训练中，所有组都完成了目标次数上限，且平均 RPE ≤ 8
 *   → 建议加重量（+2.5%）或加次数（上限 +1）
 * - 平均 RPE ≥ 9.5，或最近一次有未完成/跳过组 → 建议维持或减载
 * - 其余 → 维持
 * 所有建议 requiresConfirm = true：写入计划前必须用户确认。
 */

export interface ExerciseHistoryPoint {
  date: string;
  sets: { weightKg?: number; reps?: number; durationSec?: number; rpe?: number; status: string }[];
}

export function historyFor(
  sessions: WorkoutSession[],
  exerciseId: string,
): ExerciseHistoryPoint[] {
  return sessions
    .filter((s) => s.status === "completed")
    // 先按真实开始时间排序：同一天可能练两次，只按日期排序会丢失先后顺序，
    // 导致「最近两次」取错。ISO 字符串可直接按字典序比较。
    .slice()
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
    .map((s) => {
      const log = s.logs.find((l) => l.exerciseId === exerciseId);
      if (!log) return null;
      return {
        date: isoDateOf(s.startedAt),
        sets: log.sets.map((x) => ({
          weightKg: x.weightKg,
          reps: x.reps,
          durationSec: x.durationSec,
          rpe: x.rpe,
          status: x.status,
        })),
      } as ExerciseHistoryPoint;
    })
    .filter((x): x is ExerciseHistoryPoint => x !== null);
}

export function estimate1RM(weightKg: number, reps: number): number {
  if (!weightKg || !reps) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export function bestSetVolume(h: ExerciseHistoryPoint): number {
  return h.sets
    .filter((s) => s.status === "done")
    .reduce((m, s) => Math.max(m, (s.weightKg ?? 0) * (s.reps ?? 0)), 0);
}

export function best1RM(h: ExerciseHistoryPoint): number {
  return h.sets
    .filter((s) => s.status === "done" && s.weightKg && s.reps)
    .reduce((m, s) => Math.max(m, estimate1RM(s.weightKg!, s.reps!)), 0);
}

export function avgRpe(h: ExerciseHistoryPoint): number | undefined {
  const rpes = h.sets.filter((s) => s.status === "done" && typeof s.rpe === "number").map((s) => s.rpe!);
  if (!rpes.length) return undefined;
  return Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10;
}

const WEIGHT_STEP_PCT = 0.025;

export function suggestForExercise(
  exerciseId: string,
  planned: PlanExercise | undefined,
  sessions: WorkoutSession[],
): ProgressionSuggestion {
  const ex = EXERCISE_MAP[exerciseId];
  const name = ex?.name ?? exerciseId;
  const history = historyFor(sessions, exerciseId);

  if (!planned) {
    return {
      exerciseId,
      exerciseName: name,
      kind: "hold",
      from: "—",
      to: "—",
      reason: "该动作不在当前计划中，无基線可比对。",
      requiresConfirm: true,
    };
  }

  const target = planned.sets[0];
  const fromDesc = target?.durationSec
    ? `${planned.sets.length} 组 × ${target.durationSec} 秒`
    : `${planned.sets.length} 组 × ${target?.repsMin ?? 0}-${target?.repsMax ?? 0} 次${
        target?.weightKg ? ` @ ${target.weightKg}kg` : ""
      }`;

  if (history.length < 2) {
    return {
      exerciseId,
      exerciseName: name,
      kind: "hold",
      from: fromDesc,
      to: fromDesc,
      reason:
        history.length === 0
          ? "暂无历史记录，先完成 2 次训练再谈调整。"
          : "只有 1 次记录，样本不足，先维持当前安排。",
      requiresConfirm: true,
    };
  }

  const last2 = history.slice(-2);
  const allHitTop = last2.every(
    (h) =>
      h.sets.length > 0 &&
      h.sets.every((s) => {
        if (s.status !== "done") return false;
        if (target?.durationSec) {
          // 未记录实际时长时，视为完成了计划时长（用户直接点了「完成本组」）；
          // 一旦用户手动改过时长，就必须真的达到目标才建议加时长。
          return (s.durationSec ?? target.durationSec) >= target.durationSec;
        }
        return (s.reps ?? 0) >= (target?.repsMax ?? 0);
      }),
  );
  const rpes = last2.map(avgRpe).filter((r): r is number => typeof r === "number");
  const meanRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : undefined;
  const hasIncomplete = last2.some((h) => h.sets.some((s) => s.status !== "done"));

  if (hasIncomplete || (meanRpe !== undefined && meanRpe >= 9.5)) {
    const nextSets = Math.max(1, planned.sets.length - 1);
    const toTargets = target?.durationSec
      ? `${nextSets} 组 × ${target.durationSec} 秒`
      : `${nextSets} 组 × ${target?.repsMin ?? 0}-${target?.repsMax ?? 0} 次`;
    return {
      exerciseId,
      exerciseName: name,
      kind: "reduce_load",
      from: fromDesc,
      to: `${toTargets}（重量不变或少 5%）`,
      reason: hasIncomplete
        ? "最近训练有未完成/跳过的组，说明当前负荷偏大，先减量并巩固动作质量。"
        : `近两次平均 RPE ${meanRpe?.toFixed(1)}，接近力竭，建议降低一组或减轻 5% 以恢复。`,
      requiresConfirm: true,
    };
  }

  if (allHitTop && (meanRpe === undefined || meanRpe <= 8)) {
    if (target?.durationSec) {
      return {
        exerciseId,
        exerciseName: name,
        kind: "add_rep",
        from: fromDesc,
        to: `${planned.sets.length} 组 × ${target.durationSec + 10} 秒`,
        reason: "近两次都能完成目标时长且难度不高，建议每组延长 10 秒。",
        requiresConfirm: true,
      };
    }
    const lastWeight = last2[last2.length - 1].sets.find((s) => s.weightKg)?.weightKg;
    if (lastWeight && lastWeight > 0) {
      const next = roundToIncrement(lastWeight);
      const pct = Math.round(((next - lastWeight) / lastWeight) * 1000) / 10;
      return {
        exerciseId,
        exerciseName: name,
        kind: "add_weight",
        from: fromDesc,
        to: `${planned.sets.length} 组 × ${target?.repsMin ?? 0}-${target?.repsMax ?? 0} 次 @ ${next}kg`,
        // 结构化目标值：计划组通常不带 weightKg，UI 必须靠这个字段才能真的把重量写进去。
        targetWeightKg: next,
        reason: `近两次均完成目标次数上限${meanRpe !== undefined ? `，平均 RPE ${meanRpe.toFixed(1)}` : ""}，可尝试加重 ${lastWeight} → ${next}kg（约 ${pct}%${
          pct > 5 ? "，受最小配重档位限制" : ""
        }）。若加重后掉次数较多可退回。`,
        requiresConfirm: true,
      };
    }
    if (target?.repsMax) {
      return {
        exerciseId,
        exerciseName: name,
        kind: "add_rep",
        from: fromDesc,
        to: `${planned.sets.length} 组 × ${target.repsMin}-${target.repsMax + 1} 次`,
        reason: "徒手/无重量动作：近两次均达标，建议每次多 1 次。",
        requiresConfirm: true,
      };
    }
  }

  return {
    exerciseId,
    exerciseName: name,
    kind: "hold",
    from: fromDesc,
    to: fromDesc,
    reason: `近两次记录未满足加重条件（需每组都达到次数上限且平均 RPE ≤ 8${
      meanRpe !== undefined ? `，当前 ${meanRpe.toFixed(1)}` : ""
    }），维持当前安排。`,
    requiresConfirm: true,
  };
}

function roundToIncrement(kgBase: number): number {
  // 常见最小加重 2.5kg；小于 20kg 时用 0.5kg 档位。
  // 注意：四舍五入后可能落回原重量（如 2kg × 1.025 ≈ 2.05 → 2kg），
  // 那会生成「加重 2 → 2kg」的无效建议，因此必须保证严格大于原重量。
  const step = kgBase < 20 ? 0.5 : 2.5;
  const raw = kgBase * (1 + WEIGHT_STEP_PCT);
  let next = Math.round(raw / step) * step;
  if (next <= kgBase) next = kgBase + step;
  return Math.round(next * 100) / 100;
}

export function suggestAll(
  planItems: { item: PlanExercise }[],
  sessions: WorkoutSession[],
): ProgressionSuggestion[] {
  return planItems.map(({ item }) => suggestForExercise(item.exerciseId, item, sessions));
}
