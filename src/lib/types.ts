/**
 * FitLoop 数据模型
 * ---------------------------------------------------------------------------
 * 全部实体都带 id（本地 uuid）、createdAt / updatedAt（ISO 字符串），
 * 便于未来平移到后端时保持一致；deleted 采用物理删除（导出/删除个人数据用）。
 */

export type ID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // ISO 8601

/* ---------------------------------- 通用 --------------------------------- */

export interface BaseEntity {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** 演示数据统一打标，UI 上必须显式展示「演示」角标，禁止冒充真实记录 */
export interface DemoMarkable {
  isDemo?: boolean;
}

/* -------------------------------- 个人档案 -------------------------------- */

export type TrainingGoal =
  | "fat_loss" // 减脂
  | "muscle_gain" // 增肌
  | "strength" // 提升力量
  | "health" // 健康维持
  | "recomp"; // 塑形 / 身体成分改善

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type Sex = "female" | "male" | "unspecified";

/** 身体限制：用户「愿意提供」才填，可整段跳过 */
export interface BodyLimitations {
  /** 受累关节/部位，如 ["膝", "下背"] */
  areas: string[];
  /** 需要规避的动作模式 */
  avoidPatterns: MovementPattern[];
  /** 自由文本补充 */
  notes?: string;
  /** 用户明确选择「不提供」时为 true */
  skipped: boolean;
}

export interface UserProfile extends BaseEntity {
  displayName: string;
  goal: TrainingGoal;
  experience: ExperienceLevel;
  /** 每周训练天数 1-7 */
  daysPerWeek: number;
  /** 单次训练时长（分钟） */
  sessionMinutes: number;
  heightCm: number;
  weightKg: number;
  sex: Sex;
  birthYear?: number;
  limitations: BodyLimitations;
  /** 饮食档案（过敏原 / 忌口 / 偏好 / 预算 / 做饭条件） */
  dietProfile?: DietProfile;
  /** 营养目标的用户自定义覆盖（不覆盖时用计算值） */
  nutritionOverride?: NutritionTargets;
  /** 提醒设置 */
  reminders: ReminderSettings;
  /** 档案是否已完成首次引导 */
  onboarded: boolean;
}

export interface ReminderSettings {
  waterEnabled: boolean;
  waterIntervalMin: number;
  moveEnabled: boolean;
  moveIntervalMin: number;
  trainingEnabled: boolean;
  trainingTime?: string; // HH:mm
}

/* --------------------------------- 场馆/器械 ------------------------------- */

export type EquipmentCategory =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "band"
  | "kettlebell"
  | "cardio"
  | "bench"
  | "other";

export interface EquipmentItem {
  id: ID;
  category: EquipmentCategory;
  name: string;
  /** 可用最大重量（kg）；徒手/弹力带等为 undefined */
  maxWeightKg?: number;
  /** 重量档位（可选，用于可调节哑铃） */
  incrementsKg?: number[];
  /** 是否可调节（如可调哑铃、深蹲架） */
  adjustable?: boolean;
  /** 数量或备注，如 "2 副" / "深蹲架 1 台" */
  note?: string;
}

export interface Venue extends BaseEntity {
  name: string;
  /** home / gym / office / outdoor / other */
  kind: "home" | "gym" | "office" | "outdoor" | "other";
  /** 训练地点描述 */
  location?: string;
  equipment: EquipmentItem[];
  isDefault: boolean;
  isDemo?: boolean;
}

/* ---------------------------------- 肌群 ---------------------------------- */

export type MuscleRegion =
  | "chest"
  | "back"
  | "shoulders"
  | "arms"
  | "core"
  | "glutes"
  | "legs"
  | "cardio";

export interface MuscleGroup {
  id: ID;
  /** 中文名 */
  name: string;
  /** 拉丁/英文名，作为次要说明 */
  latin?: string;
  region: MuscleRegion;
  /** 所属面：正面 / 背面 / 双面；用于 SVG 高亮 */
  side: "front" | "back" | "both";
  /** 功能说明（无障碍文字列表也会用到） */
  function: string;
  /** 扩展位：子肌群 id，预留 */
  children?: string[];
}

/* ---------------------------------- 动作 ---------------------------------- */

export type MovementPattern =
  | "squat"
  | "hinge"
  | "horizontal_push"
  | "horizontal_pull"
  | "vertical_push"
  | "vertical_pull"
  | "lunge"
  | "carry"
  | "rotation"
  | "isolation_arm"
  | "isolation_shoulder"
  | "isolation_leg"
  | "core"
  | "cardio";

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type MediaSource =
  /** 有合法授权来源的真实视频/图片 */
  | { kind: "video" | "image"; url: string; provider: string; license?: string }
  /** 无素材时使用的示意图（必须是本地绘制，明确标注） */
  | { kind: "illustration"; note: string };

export interface Exercise extends BaseEntity, DemoMarkable {
  name: string;
  alias?: string[];
  /** 主练肌群 id */
  primaryMuscles: ID[];
  /** 辅助肌群 id */
  secondaryMuscles: ID[];
  /** 所需器械类别；徒手为空数组 */
  equipment: EquipmentCategory[];
  /**
   * 与 equipment 并列的「任一即可」器械：若提供，则必须有其中至少一种。
   * 用于「哑铃或壶铃」「绳索或弹力带」这类动作；同时需要的器械仍放 equipment。
   */
  equipmentAlternatives?: EquipmentCategory[];
  movementPattern: MovementPattern;
  difficulty: Difficulty;
  /** 单边训练（如保加利亚分腿蹲） */
  unilateral?: boolean;
  /** 是否需要器械被占用检测（器械类动作为 true） */
  /** 步骤 */
  steps: string[];
  /** 呼吸提示 */
  breathing: string;
  /** 常见错误 */
  commonMistakes: string[];
  /** 训练要点 */
  cues?: string[];
  /** 替代动作 id（人工标注，优先于算法推荐） */
  substitutions?: ID[];
  /** 存在身体限制时应规避的动作模式（用于过滤） */
  /** 素材：无合法来源时必须是 illustration，禁止编造外链 */
  media: MediaSource;
  /** 安全提示 */
  safetyNote?: string;
  /** 是否为用户自定义动作 */
  custom?: boolean;
}

/* -------------------------------- 训练计划 -------------------------------- */

export interface PlannedSet {
  /** 目标次数下限 */
  repsMin: number;
  /** 目标次数上限；0 表示按时长 */
  repsMax: number;
  /** 按秒计的持续时长（如平板支撑），与 reps 二选一 */
  durationSec?: number;
  /** 计划重量（kg），未定为 undefined */
  weightKg?: number;
  /** 组间休息（秒） */
  restSec: number;
  /** RPE 目标区间 */
  rpeTarget?: [number, number];
}

export interface PlanExercise {
  id: ID;
  exerciseId: ID;
  sets: PlannedSet[];
  /** 安排理由（为什么选它、放在这个位置） */
  rationale: string;
  /** 是否为用户手动替换过 */
  swappedFrom?: ID;
  /** 用户锁定的动作：自动调整时不替换 */
  locked?: boolean;
}

export interface PlanDay {
  id: ID;
  /** 周内序号 0=周一 ... 6=周日 */
  weekday: number;
  /** 训练日名称，如「A · 下肢推」 */
  title: string;
  /** 主要目标肌群 id */
  focusMuscles: ID[];
  items: PlanExercise[];
  /** 预计时长（分钟） */
  estimatedMinutes: number;
  /** 是否休息日 */
  restDay?: boolean;
}

export interface WorkoutPlan extends BaseEntity {
  name: string;
  /** 生成时使用的场馆 id；切换场馆后可重新生成 */
  venueId?: ID;
  days: PlanDay[];
  /** 生成依据快照，便于解释与复盘 */
  generatedFrom: PlanGenerationInput;
  /** 生成理由（顶层说明） */
  rationale: string;
  active: boolean;
  isDemo?: boolean;
}

export interface PlanGenerationInput {
  goal: TrainingGoal;
  experience: ExperienceLevel;
  daysPerWeek: number;
  sessionMinutes: number;
  availableEquipment: EquipmentCategory[];
  limitationAreas: string[];
  avoidPatterns: MovementPattern[];
}

/* -------------------------------- 训练记录 -------------------------------- */

export type SetStatus = "planned" | "done" | "skipped";

export interface SetLog {
  index: number;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  /** 主观难度 RPE 1-10 */
  rpe?: number;
  status: SetStatus;
  /** 完成时间戳（用于真实计时） */
  completedAt?: ISODateTime;
}

export interface ExerciseLog {
  exerciseId: ID;
  /** 计划项 id（若有） */
  planItemId?: ID;
  sets: SetLog[];
  note?: string;
  /** 是否由替换产生 */
  swappedFrom?: ID;
}

export type SessionStatus = "in_progress" | "completed" | "abandoned";

export interface WorkoutSession extends BaseEntity {
  planId?: ID;
  planDayId?: ID;
  venueId?: ID;
  title: string;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  status: SessionStatus;
  logs: ExerciseLog[];
  /** 热身清单完成情况 */
  warmups: { id: string; label: string; done: boolean }[];
  /** 主观整体感受 1-5 */
  overallFeel?: number;
  note?: string;
  isDemo?: boolean;
}

/* ---------------------------------- 食物 ---------------------------------- */

export type PortionUnit = "g" | "ml" | "piece" | "bowl" | "cup" | "slice";

/** 每份描述：把「份」映射成克，解决生重/熟重 */
export interface Portion {
  id: ID;
  label: string; // 如 "1 个（中）"、"1 碗（150g）"
  grams: number;
  /** 生重 / 熟重 */
  state: "raw" | "cooked" | "na";
  isDefault?: boolean;
}

export type NutrientSource =
  | { kind: "builtin"; note: string }
  | {
      kind: "remote";
      provider: string;
      /** 原始条目 id，便于回溯 */
      externalId: string;
      url: string;
      queriedAt: ISODateTime;
    }
  | { kind: "user"; note: string }
  | { kind: "custom" };

/** 每 100g 的营养值 */
export interface NutrientsPer100g {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  /** 膳食纤维，可选 */
  fiberG?: number;
}

export interface Food extends BaseEntity {
  name: string;
  /** 别名，用于搜索 */
  alias?: string[];
  /** 大类：谷薯 / 蛋白 / 蔬菜 / 水果 / 奶制品 / 油脂坚果 / 饮品 / 其他 */
  category: FoodCategory;
  per100g: NutrientsPer100g;
  /** 参考基准：通常是 per100g，但也要标明是生重还是熟重 */
  basis: "raw" | "cooked" | "na";
  portions: Portion[];
  source: NutrientSource;
  /** 常见烹饪方式及用油提示 */
  cookingHints?: string[];
  isDemo?: boolean;
  /** 是否为用户自建 */
  custom?: boolean;
}

export type FoodCategory =
  | "grain"
  | "protein"
  | "vegetable"
  | "fruit"
  | "dairy"
  | "fat"
  | "drink"
  | "other";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

/** 烹饪方式：影响用油估算 */
export type CookingMethod =
  | "raw"
  | "steamed"
  | "boiled"
  | "stir_fried"
  | "pan_fried"
  | "deep_fried"
  | "braised"
  | "roasted"
  | "air_fryer"
  | "other";

export interface FoodEntry extends BaseEntity {
  /** ISODate，用于按天聚合 */
  date: ISODate;
  slot: MealSlot;
  foodId?: ID;
  /** 食物名快照（食物被删也保留） */
  foodName: string;
  /** 份量（克） */
  grams: number;
  /** 生重/熟重 */
  basis: "raw" | "cooked" | "na";
  cookingMethod?: CookingMethod;
  /** 用油（克），由烹饪方式建议、用户可改 */
  oilG?: number;
  source: NutrientSource;
  /** 拍照识别产生时保留候选信息 */
  fromPhoto?: boolean;
  /** 热量估算范围（拍照识别时使用） */
  estimateRange?: [number, number];
  isDemo?: boolean;
}

/* --------------------------- 饮食档案 / 餐单 / 购物 -------------------------- */

export interface DietProfile {
  /** 过敏原 */
  allergens: string[];
  /** 忌口 */
  dislikes: string[];
  /** 偏好 */
  preferences: string[];
  /** 每日预算（元），0 表示不限 */
  budgetPerDay: number;
  /** 做饭条件 */
  cookingAbility: "none" | "simple" | "full";
  /** 每日餐次 */
  mealsPerDay: number;
}

export interface MealPlanItem {
  foodId?: ID;
  foodName: string;
  grams: number;
  slot: MealSlot;
  note?: string;
}

export interface MealPlan extends BaseEntity {
  date: ISODate;
  items: MealPlanItem[];
  isDemo?: boolean;
}

export interface ShoppingItem extends BaseEntity {
  name: string;
  amount: string;
  checked: boolean;
  /** 关联日期/餐单 */
  sourceDate?: ISODate;
}

/* -------------------------------- 恢复/复盘 -------------------------------- */

export type SorenessLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface RecoveryLog extends BaseEntity {
  date: ISODate;
  /** 睡眠小时 */
  sleepHours?: number;
  /** 睡眠质量 1-5 */
  sleepQuality?: number;
  /** 疲劳 1-5 */
  fatigue?: number;
  /** 整体酸痛 0-5 */
  soreness?: SorenessLevel;
  /** 分部位酸痛 */
  sorenessByMuscle?: Record<ID, SorenessLevel>;
  /** 是否出现疼痛（非酸痛） */
  hasPain: boolean;
  painAreas?: string[];
  painNote?: string;
  /** 系统给出的建议（非医疗建议） */
  adviceShown?: string[];
  isDemo?: boolean;
}

export interface BodyWeightLog extends BaseEntity {
  date: ISODate;
  weightKg: number;
  isDemo?: boolean;
}

export interface WaterLog extends BaseEntity {
  date: ISODate;
  ml: number;
}

/* -------------------------------- 营养目标 -------------------------------- */

export interface NutritionTargets {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  /** 计算依据（必须展示） */
  basis: string;
  /** 适用限制/说明 */
  caveats: string[];
}

/* ------------------------------ 联网服务结果 ------------------------------- */

export type RemoteStatus =
  | "ok"
  | "not_configured"
  | "not_found"
  | "error"
  | "conflict";

export interface RemoteFoodResult {
  status: RemoteStatus;
  /** status=not_found 时用：未找到足够可靠信息 */
  message?: string;
  items?: RemoteFoodItem[];
  /** 来源冲突时的差异说明 */
  conflicts?: string[];
  provider?: string;
  queriedAt?: ISODateTime;
  sourceUrl?: string;
  /** 计量单位说明 */
  unitNote?: string;
}

export interface RemoteFoodItem {
  name: string;
  externalId: string;
  per100g: NutrientsPer100g;
  basis: "raw" | "cooked" | "na";
  url: string;
  provider: string;
}

/* ------------------------------ 拍照识别结果 ------------------------------- */

export interface VisionCandidate {
  name: string;
  /** 置信度 0-1，仅作参考，不作为精确结论 */
  confidence?: number;
  /** 建议烹饪方式 */
  suggestedCooking?: CookingMethod;
}

export interface VisionResult {
  status: RemoteStatus;
  message?: string;
  candidates?: VisionCandidate[];
  /** 必须展示的限制说明 */
  limitations: string[];
  provider?: string;
  queriedAt?: ISODateTime;
}

/* --------------------------------- 建议 ---------------------------------- */

export type ProgressionKind =
  | "add_weight"
  | "add_rep"
  | "add_set"
  | "reduce_load"
  | "hold";

export interface ProgressionSuggestion {
  exerciseId: ID;
  exerciseName: string;
  kind: ProgressionKind;
  from: string;
  to: string;
  reason: string;
  /** 需要用户确认才能写入计划 */
  requiresConfirm: boolean;
  /**
   * `kind === "add_weight"` 时的结构化目标重量（kg）。
   * 生成的计划组本身不带 weightKg，UI 若只从 `to` 文案里解析会落空，
   * 导致「应用调整」静默无效；这里给出可直接写入的数值。
   */
  targetWeightKg?: number;
}
