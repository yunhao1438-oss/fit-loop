import type {
  FoodEntry,
  NutrientsPer100g,
  NutritionTargets,
  Sex,
  TrainingGoal,
  UserProfile,
} from "./types";
import { clamp, round } from "./utils";

/**
 * 营养目标计算
 * ---------------------------------------------------------------------------
 * 说明：
 * 1. 采用 Mifflin-St Jeor 估算基础代谢（BMR），再乘以活动系数得到 TDEE。
 * 2. 减脂只做温和赤字（10-20%），并设绝对下限，绝不生成极端减脂建议。
 * 3. 所有计算依据都会写入 basis 字段，UI 必须展示，且允许用户覆盖。
 * 4. 这是「估算」，不是医学/营养处方；有基础疾病、孕期、进食障碍史等情况
 *    应咨询医生或注册营养师。
 */

export const MIN_KCAL_BY_SEX: Record<Sex, number> = {
  female: 1200,
  male: 1500,
  unspecified: 1300,
};

export function calcBMR(p: {
  weightKg: number;
  heightCm: number;
  sex: Sex;
  birthYear?: number;
}): number {
  const age = p.birthYear ? clamp(new Date().getFullYear() - p.birthYear, 14, 90) : 30;
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * age;
  if (p.sex === "male") return base + 5;
  if (p.sex === "female") return base - 161;
  return base - 78; // unspecified：取男女常数中值
}

/** 活动系数：只把「训练」作为额外活动，其余按久坐/轻活动估计 */
export function activityFactor(daysPerWeek: number): number {
  if (daysPerWeek <= 1) return 1.2;
  if (daysPerWeek <= 2) return 1.34;
  if (daysPerWeek <= 3) return 1.42;
  if (daysPerWeek <= 4) return 1.5;
  if (daysPerWeek <= 5) return 1.56;
  return 1.62;
}

export function calcTDEE(p: UserProfile): number {
  return Math.round(calcBMR(p) * activityFactor(p.daysPerWeek));
}

/** 目标对应的热量调整系数 */
export function goalKcalAdjust(goal: TrainingGoal): number {
  switch (goal) {
    case "fat_loss":
      return 0.85; // 温和赤字 15%
    case "muscle_gain":
      return 1.1; // 温和盈余 10%
    case "recomp":
      return 0.95; // 小幅赤字
    case "strength":
      return 1.03;
    case "health":
    default:
      return 1.0;
  }
}

export function proteinPerKg(goal: TrainingGoal): number {
  switch (goal) {
    case "fat_loss":
      return 2.0;
    case "muscle_gain":
      return 1.8;
    case "recomp":
      return 1.9;
    case "strength":
      return 1.7;
    default:
      return 1.5;
  }
}

export function fatPerKg(): number {
  return 0.9;
}

export function computeTargets(p: UserProfile): NutritionTargets {
  const tdee = calcTDEE(p);
  const adjusted = tdee * goalKcalAdjust(p.goal);
  const floor = MIN_KCAL_BY_SEX[p.sex];
  const clamped = Math.max(Math.round(adjusted), floor);
  const hitFloor = clamped > Math.round(adjusted);

  const proteinG = Math.round(p.weightKg * proteinPerKg(p.goal));
  const fatG = Math.round(p.weightKg * fatPerKg());
  // 碳水 = 剩余热量；若为负则说明蛋白/脂肪已超，需按比例回调脂肪
  const kcalFromPF = proteinG * 4 + fatG * 9;
  let carbG = Math.round((clamped - kcalFromPF) / 4);
  let finalFatG = fatG;
  if (carbG < 50) {
    // 保证最低碳水，避免生酮式极端方案（本应用不做此类建议）
    finalFatG = Math.max(Math.round((clamped - proteinG * 4 - 50 * 4) / 9), 30);
    carbG = Math.max(50, Math.round((clamped - proteinG * 4 - finalFatG * 9) / 4));
  }

  const caveats: string[] = [
    "估算值，误差常见在 ±10-15%，请结合体重与体感在 2-4 周内微调。",
    "不适用于孕期、哺乳期、未成年人、进食障碍史及需医学营养治疗的情况，请咨询医生或注册营养师。",
  ];
  if (hitFloor) {
    caveats.unshift(
      `目标热量已触及 ${floor} kcal 安全下限，未继续下调；如需进一步减脂，请通过增加日常活动量而非继续削减热量。`,
    );
  }
  if (p.goal === "fat_loss") {
    caveats.unshift("采用温和赤字（约 15%），不建议低于下限；每周体重下降 0.3-0.8% 属常见范围。");
  }
  // 脂肪在「碳水最低保障」分支里会被回调，basis 必须显示真实值，避免用户
  // 按 0.9 g/kg 自行核对时发现对不上。
  const fatBasis =
    finalFatG === fatG
      ? `脂肪按 ${fatPerKg()} g/kg = ${finalFatG} g`
      : `脂肪按 ${fatPerKg()} g/kg 为 ${fatG} g，因碳水最低保障回调为 ${finalFatG} g`;

  return {
    kcal: clamped,
    proteinG,
    carbG,
    fatG: finalFatG,
    basis: `Mifflin-St Jeor 估算 BMR ≈ ${Math.round(calcBMR(p))} kcal × 活动系数 ${activityFactor(
      p.daysPerWeek,
    )}（每周 ${p.daysPerWeek} 次训练）≈ TDEE ${tdee} kcal；按「${
      { fat_loss: "减脂", muscle_gain: "增肌", recomp: "塑形", strength: "力量", health: "健康维持" }[
        p.goal
      ]
    }」目标 ×${goalKcalAdjust(p.goal)} ≈ ${Math.round(adjusted)} kcal${
      hitFloor ? `，受 ${floor} kcal 安全下限约束` : ""
    }。蛋白质按 ${proteinPerKg(p.goal)} g/kg 体重（${p.weightKg} kg）= ${proteinG} g，${fatBasis}，碳水为剩余热量。`,
    caveats,
  };
}

export function targetsFor(p: UserProfile): NutritionTargets {
  return p.nutritionOverride ?? computeTargets(p);
}

/* --------------------------------- 食物计算 -------------------------------- */

export function nutrientsFor(entry: FoodEntry, per100g: NutrientsPer100g): NutrientsPer100g {
  const k = entry.grams / 100;
  const oil = entry.oilG ?? 0;
  return {
    kcal: round(per100g.kcal * k + oil * 8.84, 0),
    proteinG: round(per100g.proteinG * k, 1),
    carbG: round(per100g.carbG * k, 1),
    fatG: round(per100g.fatG * k + oil, 1),
  };
}

export const ZERO: NutrientsPer100g = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };

export function sumNutrients(list: NutrientsPer100g[]): NutrientsPer100g {
  return list.reduce<NutrientsPer100g>(
    (acc, n) => ({
      kcal: acc.kcal + n.kcal,
      proteinG: acc.proteinG + n.proteinG,
      carbG: acc.carbG + n.carbG,
      fatG: acc.fatG + n.fatG,
    }),
    { ...ZERO },
  );
}

/** 常见烹饪方式的建议用油量（克 / 每 100g 食材），仅作默认值，用户可改 */
export const OIL_BY_METHOD: Record<string, { oilPer100g: number; note: string }> = {
  raw: { oilPer100g: 0, note: "生食/免烹饪，无烹调用油" },
  steamed: { oilPer100g: 0, note: "蒸制，通常无额外用油" },
  boiled: { oilPer100g: 0, note: "水煮，通常无额外用油" },
  stir_fried: { oilPer100g: 5, note: "家常小炒约 5g 油 / 100g 食材" },
  pan_fried: { oilPer100g: 7, note: "煎制约 7g 油 / 100g 食材" },
  deep_fried: { oilPer100g: 12, note: "油炸吸油量高，估算误差大" },
  braised: { oilPer100g: 5, note: "红烧通常先煎后烧，约 5g 油" },
  roasted: { oilPer100g: 3, note: "烤制约 3g 油 / 100g 食材" },
  air_fryer: { oilPer100g: 1, note: "空气炸锅约 1g 油" },
  other: { oilPer100g: 3, note: "未知方式按 3g 油保守估算，请尽量手动修正" },
};

export function suggestOilG(method: string | undefined, grams: number): number {
  if (!method) return 0;
  const conf = OIL_BY_METHOD[method];
  if (!conf) return 0;
  return Math.round((conf.oilPer100g * grams) / 100);
}

export const COOKING_LABEL: Record<string, string> = {
  raw: "生食/不加热",
  steamed: "蒸",
  boiled: "水煮",
  stir_fried: "小炒",
  pan_fried: "煎",
  deep_fried: "油炸",
  braised: "红烧/炖",
  roasted: "烤",
  air_fryer: "空气炸锅",
  other: "其他",
};

export const SLOT_LABEL: Record<string, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
};
