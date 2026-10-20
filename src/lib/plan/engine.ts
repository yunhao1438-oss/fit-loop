import { EXERCISES, EXERCISE_MAP } from "../seed/exercises";
import { MUSCLE_MAP, muscleName } from "../seed/muscles";
import type {
  Difficulty,
  EquipmentCategory,
  Exercise,
  ExperienceLevel,
  MovementPattern,
  PlanDay,
  PlanExercise,
  PlannedSet,
  PlanGenerationInput,
  TrainingGoal,
  WorkoutPlan,
} from "../types";
import { uid } from "../utils";

/* ------------------------------ 动作可用性判定 ------------------------------ */

export function equipmentAvailable(
  ex: Exercise,
  available: EquipmentCategory[],
  unavailable: EquipmentCategory[] = [],
): boolean {
  const availableSet = new Set(available);
  const unavailableSet = new Set(unavailable);
  // 同时需要的器械：任何一个被明确排除或场馆没有，都不可用。
  if (ex.equipment.some((e) => unavailableSet.has(e))) return false;
  if (!ex.equipment.every((e) => availableSet.has(e))) return false;
  // 任一即可的器械：至少有一种在场且未被排除；未声明则无额外限制。
  if (!ex.equipmentAlternatives?.length) return true;
  return ex.equipmentAlternatives.some(
    (e) => availableSet.has(e) && !unavailableSet.has(e),
  );
}

export function patternAllowed(p: MovementPattern, avoid: MovementPattern[]): boolean {
  return !avoid.includes(p);
}

/**
 * 动作涉及的器械（必需 + 「任一即可」，去重），供 UI 展示、筛选与「是否需要重量输入」判定。
 * UI 不要只读 `ex.equipment`：高脚杯深蹲/RDL/农夫行走/Pallof 等把器械放在
 * `equipmentAlternatives` 里，只读 `equipment` 会显示成「无器械」并丢掉重量输入。
 */
export function equipmentOf(ex: Exercise): EquipmentCategory[] {
  return [...new Set([...ex.equipment, ...(ex.equipmentAlternatives ?? [])])];
}

/** 难度是否适合该经验水平 */
export function difficultyFit(d: Difficulty, level: ExperienceLevel): boolean {
  if (level === "beginner") return d <= 2;
  if (level === "intermediate") return d >= 2 && d <= 4;
  return d >= 3;
}

/* -------------------------------- 分化模板 -------------------------------- */

interface DayTemplate {
  title: string;
  /** 依序挑选的动作模式；每个模式取 1 个动作 */
  patterns: MovementPattern[];
  focus: string[];
  /**
   * 补位模式：当受限模式被排除、或场馆缺少对应器械，导致动作数明显不足时，
   * 按顺序循环用这些模式补足训练量。只补充同一训练日主题内的安全模式，
   * 不引入受限模式（squat/lunge 等仍由 avoidPatterns 过滤）。
   */
  supplement?: MovementPattern[];
}

type SplitName = string;

const PATTERN_LABEL: Record<MovementPattern, string> = {
  squat: "深蹲",
  hinge: "髋铰链",
  horizontal_push: "水平推",
  horizontal_pull: "水平拉",
  vertical_push: "垂直推",
  vertical_pull: "垂直拉",
  lunge: "弓步/单腿",
  carry: "负重行走",
  rotation: "旋转/抗旋转",
  isolation_arm: "手臂孤立",
  isolation_shoulder: "肩部孤立",
  isolation_leg: "腿部孤立",
  core: "核心",
  cardio: "有氧",
};

export const MOVEMENT_PATTERN_LABEL = PATTERN_LABEL;

function fullBodyA(): DayTemplate {
  return {
    title: "全身 A · 下肢为主",
    patterns: ["squat", "hinge", "horizontal_push", "horizontal_pull", "core"],
    focus: ["quads", "glutes", "chest_mid", "upper_back"],
    supplement: ["lunge", "isolation_leg", "isolation_arm"],
  };
}
function fullBodyB(): DayTemplate {
  return {
    title: "全身 B · 上肢为主",
    patterns: ["vertical_push", "vertical_pull", "lunge", "horizontal_push", "core"],
    focus: ["front_delts", "lats", "quads", "chest_mid"],
    supplement: ["horizontal_push", "isolation_arm", "isolation_shoulder"],
  };
}
function fullBodyC(): DayTemplate {
  return {
    title: "全身 C · 髋与肩",
    patterns: ["hinge", "vertical_pull", "horizontal_push", "isolation_shoulder", "core"],
    focus: ["glutes", "lats", "side_delts", "abs"],
    supplement: ["hinge", "horizontal_pull", "isolation_arm"],
  };
}
function upperDay(): DayTemplate {
  return {
    title: "上肢日 · 推拉平衡",
    patterns: [
      "horizontal_push",
      "horizontal_pull",
      "vertical_push",
      "vertical_pull",
      "isolation_arm",
      "isolation_shoulder",
    ],
    focus: ["chest_mid", "upper_back", "lats", "side_delts"],
    supplement: ["isolation_arm", "isolation_shoulder", "horizontal_push", "horizontal_pull"],
  };
}
function lowerDay(): DayTemplate {
  return {
    title: "下肢日 · 髋膝均衡",
    patterns: ["squat", "hinge", "lunge", "isolation_leg", "core"],
    focus: ["quads", "glutes", "hamstrings"],
    supplement: ["hinge", "isolation_leg"],
  };
}
function pushDay(): DayTemplate {
  return {
    title: "推日 · 胸肩三头",
    patterns: ["horizontal_push", "vertical_push", "isolation_shoulder", "isolation_arm"],
    focus: ["chest_mid", "front_delts", "side_delts", "triceps"],
    supplement: ["isolation_shoulder", "isolation_arm", "horizontal_push"],
  };
}
function pullDay(): DayTemplate {
  return {
    title: "拉日 · 背二头",
    patterns: ["vertical_pull", "horizontal_pull", "horizontal_pull", "isolation_arm", "core"],
    focus: ["lats", "upper_back", "biceps", "rear_delts"],
    supplement: ["isolation_arm", "horizontal_pull", "vertical_pull"],
  };
}
function legDay(): DayTemplate {
  return {
    title: "腿日 · 全面下肢",
    patterns: ["squat", "hinge", "lunge", "isolation_leg", "isolation_leg", "core"],
    focus: ["quads", "glutes", "hamstrings", "calves"],
    supplement: ["hinge", "isolation_leg"],
  };
}

/** 每周 N 次训练对应的周内分布（0=周一 … 6=周日） */
export const WEEKDAY_MAP: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

export function splitFor(days: number): { name: SplitName; days: DayTemplate[] } {
  if (days <= 1) return { name: "全身 1 分化", days: [fullBodyA()] };
  if (days === 2) return { name: "全身 2 分化", days: [fullBodyA(), fullBodyB()] };
  if (days === 3) return { name: "全身 3 分化", days: [fullBodyA(), fullBodyB(), fullBodyC()] };
  if (days === 4)
    return { name: "上下肢 4 分化", days: [upperDay(), lowerDay(), upperDay(), lowerDay()] };
  if (days === 5)
    return {
      name: "推拉腿 + 上下肢 5 分化",
      days: [pushDay(), pullDay(), legDay(), upperDay(), lowerDay()],
    };
  return {
    name: "推拉腿 6 分化",
    days: [pushDay(), pullDay(), legDay(), pushDay(), pullDay(), legDay()],
  };
}

/* ------------------------------ 组数/次数/休息 ------------------------------ */

export interface Prescription {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
}

export function prescribe(goal: TrainingGoal, level: ExperienceLevel, isCore: boolean): Prescription {
  if (isCore) return { sets: 3, repsMin: 0, repsMax: 0, restSec: 45 }; // 按时长
  let base: Prescription;
  switch (goal) {
    case "strength":
      base = { sets: 4, repsMin: 4, repsMax: 6, restSec: 150 };
      break;
    case "muscle_gain":
      base = { sets: 4, repsMin: 8, repsMax: 12, restSec: 90 };
      break;
    case "fat_loss":
      base = { sets: 3, repsMin: 12, repsMax: 15, restSec: 60 };
      break;
    case "recomp":
      base = { sets: 3, repsMin: 8, repsMax: 12, restSec: 90 };
      break;
    default:
      base = { sets: 3, repsMin: 10, repsMax: 12, restSec: 75 };
  }
  if (level === "beginner") base = { ...base, sets: Math.max(2, base.sets - 1), restSec: base.restSec };
  if (level === "advanced" && goal !== "fat_loss")
    base = { ...base, sets: Math.min(5, base.sets + 1) };
  return base;
}

export function coreDurationSec(level: ExperienceLevel): number {
  return level === "beginner" ? 20 : level === "intermediate" ? 30 : 40;
}

/** 单个动作的预计耗时（秒）：工作 45s + 组间休息 */
export function estimateExerciseSec(item: PlanExercise, avgRest: number): number {
  const sets = item.sets.length || 1;
  return sets * (45 + avgRest) + 45; // +45s 换器械/记录
}

export function estimateDayMinutes(items: PlanExercise[]): number {
  const total = items.reduce((s, it) => {
    const rest = it.sets[0]?.restSec ?? 75;
    return s + estimateExerciseSec(it, rest);
  }, 0);
  return Math.round((total + 330) / 60); // 热身 5 分钟 + 收尾 30 秒缓冲
}

/* -------------------------------- 动作挑选 -------------------------------- */

export interface PickContext {
  available: EquipmentCategory[];
  unavailable?: EquipmentCategory[];
  avoidPatterns: MovementPattern[];
  level: ExperienceLevel;
  usedIds: Set<string>;
  /**
   * 严格排除的动作 id（如本训练日已经选过的动作）。
   * 与 usedIds 的「扣分但仍可复用」不同：跨训练日允许复用同一个动作，
   * 同一训练日重复则没有意义。
   */
  excludeIds?: Set<string>;
}

function candidateScore(ex: Exercise, pattern: MovementPattern, ctx: PickContext): number {
  let score = 0;
  if (ex.movementPattern === pattern) score += 60;
  if (!difficultyFit(ex.difficulty, ctx.level)) score -= 25;
  score -= Math.abs(ex.difficulty - (ctx.level === "beginner" ? 2 : 3)) * 4;
  if (ctx.usedIds.has(ex.id)) score -= 1000;
  // 复合动作优先排在前面（由调用方保证顺序）
  return score;
}

export function pickExercise(pattern: MovementPattern, ctx: PickContext): Exercise | null {
  const pool = EXERCISES.filter(
    (ex) =>
      ex.movementPattern === pattern &&
      equipmentAvailable(ex, ctx.available, ctx.unavailable) &&
      !ctx.excludeIds?.has(ex.id) &&
      patternAllowed(pattern, ctx.avoidPatterns),
  );
  if (!pool.length) return null;
  // 先按难度适配过滤；若过滤后为空则放宽
  const fitted = pool.filter((ex) => difficultyFit(ex.difficulty, ctx.level));
  const list = fitted.length ? fitted : pool;
  const sorted = [...list].sort((a, b) => candidateScore(b, pattern, ctx) - candidateScore(a, pattern, ctx));
  return sorted[0] ?? null;
}

/* ------------------------------ 替换动作推荐 ------------------------------ */

export interface SubstituteContext {
  available: EquipmentCategory[];
  unavailable?: EquipmentCategory[];
  avoidPatterns: MovementPattern[];
  level: ExperienceLevel;
  /** 已在计划中的动作，避免重复 */
  exclude?: string[];
  /** 最多返回多少条推荐（用于列表截断） */
  limit?: number;
}

export interface SubstituteOption {
  exercise: Exercise;
  score: number;
  reasons: string[];
}

/**
 * 推荐替代动作。
 * 排序依据优先级：动作模式一致 > 目标肌群重合 > 器械可用 > 难度贴近。
 * 绝不随机选择。
 */
export function findSubstitutes(
  exerciseId: string,
  ctx: SubstituteContext,
): SubstituteOption[] {
  const target = EXERCISE_MAP[exerciseId];
  if (!target) return [];
  const exclude = new Set(ctx.exclude ?? []);
  const targetMuscles = new Set([...target.primaryMuscles, ...target.secondaryMuscles]);

  const options: SubstituteOption[] = [];
  for (const ex of EXERCISES) {
    if (ex.id === exerciseId) continue;
    if (exclude.has(ex.id)) continue;
    if (!equipmentAvailable(ex, ctx.available, ctx.unavailable)) continue;
    if (!patternAllowed(ex.movementPattern, ctx.avoidPatterns)) continue;

    const reasons: string[] = [];
    let score = 0;

    const manual = target.substitutions?.includes(ex.id);
    if (manual) {
      score += 18;
      reasons.push("动作库标注的常用替代");
    }

    if (ex.movementPattern === target.movementPattern) {
      score += 45;
      reasons.push(`同为${PATTERN_LABEL[ex.movementPattern]}动作模式`);
    }

    const primaryOverlap = ex.primaryMuscles.filter((m) =>
      target.primaryMuscles.includes(m),
    ).length;
    const secondaryOverlap = ex.primaryMuscles.filter((m) =>
      target.secondaryMuscles.includes(m),
    ).length;
    const muscleScore =
      primaryOverlap * 22 + secondaryOverlap * 8 +
      (targetMuscles.has(ex.primaryMuscles[0]) ? 4 : 0);
    if (muscleScore > 0) {
      score += muscleScore;
      reasons.push(
        primaryOverlap
          ? `主练肌群重合：${ex.primaryMuscles
              .filter((m) => target.primaryMuscles.includes(m))
              .map(muscleName)
              .join("、")}`
          : `覆盖辅助肌群：${ex.primaryMuscles.map(muscleName).join("、")}`,
      );
    }

    if (difficultyFit(ex.difficulty, ctx.level)) {
      score += 10;
      reasons.push("难度符合当前经验");
    } else {
      score -= 10;
    }
    score -= Math.abs(ex.difficulty - target.difficulty) * 5;

    if (ex.unilateral === target.unilateral) score += 5;

    if (score <= 0) continue;
    options.push({ exercise: ex, score, reasons });
  }

  options.sort((a, b) => b.score - a.score || a.exercise.difficulty - b.exercise.difficulty);
  return ctx.limit ? options.slice(0, ctx.limit) : options;
}

/* -------------------------------- 计划生成 -------------------------------- */

/** 一次训练至少安排多少个动作（受单次时长约束，短时长不强求） */
function minimumItemCount(minutes: number): number {
  if (minutes >= 50) return 5;
  if (minutes >= 35) return 4;
  return 3;
}

export function generatePlan(input: PlanGenerationInput, name?: string): WorkoutPlan {
  const split = splitFor(input.daysPerWeek);
  /** 跨训练日使用，用来优先挑没在前几天出现过的动作（不强制） */
  const used = new Set<string>();
  const days: PlanDay[] = [];
  let supplementUsed = false;

  split.days.forEach((tpl, idx) => {
    const items: PlanExercise[] = [];
    /** 仅本训练日：同一天里绝不重复同一个动作 */
    const dayUsed = new Set<string>();

    const pickAndAdd = (pattern: MovementPattern, supplemental = false): boolean => {
      const ex = pickExercise(pattern, {
        available: input.availableEquipment,
        avoidPatterns: input.avoidPatterns,
        level: input.experience,
        usedIds: new Set([...used, ...dayUsed]),
        excludeIds: dayUsed,
      });
      // 同一天重复同一个动作没有额外训练价值；候选不足时宁可不加，也不硬塞重复项。
      if (!ex || dayUsed.has(ex.id)) return false;
      dayUsed.add(ex.id);
      const isCore = ex.movementPattern === "core";
      const p = prescribe(input.goal, input.experience, isCore);
      const sets: PlannedSet[] = Array.from({ length: p.sets }, (_, i) => ({
        repsMin: p.repsMin,
        repsMax: p.repsMax,
        durationSec: isCore ? coreDurationSec(input.experience) : undefined,
        restSec: p.restSec,
        ...(i === 0 ? { rpeTarget: [7, 9] as [number, number] } : {}),
      }));
      const item: PlanExercise = {
        id: uid("pe"),
        exerciseId: ex.id,
        sets,
        rationale: buildRationale(ex, pattern, input, supplemental),
      };
      // 补位动作插在核心动作之前，保持「核心安排在末尾」。
      const last = items[items.length - 1];
      const lastEx = last ? EXERCISE_MAP[last.exerciseId] : undefined;
      if (supplemental && lastEx?.movementPattern === "core") {
        items.splice(items.length - 1, 0, item);
      } else {
        items.push(item);
      }
      return true;
    };

    for (const pattern of tpl.patterns) pickAndAdd(pattern);

    // 受限模式 / 器械缺失会把模板动作掏空（例如膝限制 + 居家器械时的下肢日）。
    // 用同一训练日主题内的安全模式补足到最低动作数，保持可解释、不引入受限模式。
    if (tpl.supplement?.length) {
      const targetCount = minimumItemCount(input.sessionMinutes);
      const budget = tpl.supplement.length * 2;
      for (let i = 0; items.length < targetCount && i < budget; i++) {
        if (pickAndAdd(tpl.supplement[i % tpl.supplement.length], true)) supplementUsed = true;
      }
    }

    // 时间预算：超出则精简（先删末尾孤立动作，再减组数，最后才删动作）
    const trimmed = trimToMinutes(items, input.sessionMinutes);
    days.push({
      id: uid("pd"),
      weekday: (WEEKDAY_MAP[input.daysPerWeek] ?? WEEKDAY_MAP[3])[idx] ?? idx,
      title: tpl.title,
      focusMuscles: tpl.focus,
      items: trimmed,
      estimatedMinutes: trimmed.length ? estimateDayMinutes(trimmed) : 0,
    });
    trimmed.forEach((it) => used.add(it.exerciseId));
  });

  const rationaleParts = [
    `目标「${GOAL_LABEL[input.goal]}」+ 经验「${LEVEL_LABEL[input.experience]}」，采用${split.name}。`,
    `每次训练控制在约 ${input.sessionMinutes} 分钟内：先复合动作、后孤立动作，核心安排在末尾。`,
    `可用器械：${input.availableEquipment.length ? input.availableEquipment.join("、") : "仅徒手"}，所有动作均按可用器械筛选。`,
    input.limitationAreas.length
      ? `已避开与「${input.limitationAreas.join("、")}」相关的动作模式：${input.avoidPatterns
          .map((p) => PATTERN_LABEL[p])
          .join("、")}。`
      : "未提供身体限制信息，计划未做针对性规避；如有关节不适请在档案中补充。",
  ];
  if (supplementUsed) {
    rationaleParts.push(
      "部分训练日因受限模式或器械不足，已用同一主题内的安全动作补位（见对应动作理由）。",
    );
  }
  const thinDays = days.filter((d) => d.items.length < 3);
  if (thinDays.length) {
    rationaleParts.push(
      `注意：${thinDays
        .map((d) => `「${d.title}」只有 ${d.items.length} 个可用动作`)
        .join("、")}，训练量可能不足；可增加场馆器械、放宽身体限制或延长单次时长后重新生成。`,
    );
  }
  if (!days.some((d) => d.items.length > 0)) {
    rationaleParts.push(
      "当前身体限制与器械组合下没有可用动作，计划为空；请调整限制或补充器械后重新生成。",
    );
  }

  return {
    id: uid("plan"),
    name: name ?? `${LEVEL_LABEL[input.experience]} · ${split.name}`,
    venueId: undefined,
    days,
    generatedFrom: input,
    rationale: rationaleParts.join(" "),
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function trimToMinutes(items: PlanExercise[], minutes: number): PlanExercise[] {
  // 复制一份，避免 slimForTime / 调用方持有的对象被就地修改。
  const list = items.map((it) => ({ ...it, sets: [...it.sets] }));
  const ISOLATION: MovementPattern[] = [
    "isolation_arm",
    "isolation_shoulder",
    "isolation_leg",
    "core",
    "rotation",
    "carry",
  ];
  let guard = 0;
  while (estimateDayMinutes(list) > minutes && guard++ < 30) {
    // 1) 动作数还够时，先删末尾的孤立动作
    if (list.length > 2) {
      let idx = -1;
      for (let i = list.length - 1; i >= 0; i--) {
        const ex = EXERCISE_MAP[list[i].exerciseId];
        if (ex && ISOLATION.includes(ex.movementPattern)) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) {
        list.splice(idx, 1);
        continue;
      }
    }
    // 2) 再从末尾开始减组数（每动作最低保留 2 组）
    let reduced = false;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].sets.length > 2) {
        list[i] = { ...list[i], sets: list[i].sets.slice(0, -1) };
        reduced = true;
        break;
      }
    }
    if (reduced) continue;
    // 3) 组数已到下限，才继续删动作；至少保留 2 个动作
    if (list.length > 2) {
      list.splice(list.length - 1, 1);
      continue;
    }
    break;
  }
  return list;
}

/** 时间不足时的精简：保留复合动作，减少组数 */
export function slimForTime(day: PlanDay, minutes: number): PlanDay {
  const items = day.items.map((it) => ({ ...it, sets: [...it.sets] }));
  const trimmed = trimToMinutes(items as PlanExercise[], minutes);
  return {
    ...day,
    items: trimmed,
    estimatedMinutes: trimmed.length ? estimateDayMinutes(trimmed) : 0,
  };
}

function buildRationale(
  ex: Exercise,
  pattern: MovementPattern,
  input: PlanGenerationInput,
  supplemental = false,
): string {
  const parts: string[] = [];
  parts.push(`${PATTERN_LABEL[pattern]}模式，主练${ex.primaryMuscles.map(muscleName).join("、")}`);
  if (ex.secondaryMuscles.length)
    parts.push(`辅助${ex.secondaryMuscles.map(muscleName).join("、")}`);
  if (input.goal === "fat_loss") parts.push("采用较高次数较短间歇，兼顾热量消耗与动作学习");
  if (input.goal === "muscle_gain") parts.push("8-12 次区间有利于肌肥大");
  if (input.goal === "strength") parts.push("低次数长间歇，优先神经适应与力量增长");
  if (input.experience === "beginner") parts.push("难度较低，便于掌握动作模式");
  if (supplemental) parts.push("用于补足受限/器械不足当天的训练量，仍属于同一动作模式主题");
  if (ex.custom) parts.push("自定义动作");
  return parts.join("；") + "。";
}

export const GOAL_LABEL: Record<TrainingGoal, string> = {
  fat_loss: "减脂",
  muscle_gain: "增肌",
  strength: "提升力量",
  health: "健康维持",
  recomp: "塑形",
};

export const LEVEL_LABEL: Record<ExperienceLevel, string> = {
  beginner: "新手",
  intermediate: "进阶",
  advanced: "资深",
};

export const EQUIPMENT_LABEL: Record<EquipmentCategory, string> = {
  barbell: "杠铃",
  dumbbell: "哑铃",
  machine: "固定器械",
  cable: "绳索/龙门架",
  bodyweight: "徒手",
  band: "弹力带",
  kettlebell: "壶铃",
  cardio: "有氧器械",
  bench: "训练凳",
  other: "其他",
};

export function muscleIdsOfDay(day: PlanDay): string[] {
  const set = new Set<string>();
  day.items.forEach((it) => {
    const ex = EXERCISE_MAP[it.exerciseId];
    if (!ex) return;
    ex.primaryMuscles.forEach((m) => set.add(m));
    ex.secondaryMuscles.forEach((m) => set.add(m));
  });
  return [...set];
}
