import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeTargets,
  calcBMR,
  calcTDEE,
  activityFactor,
  nutrientsFor,
  suggestOilG,
  sumNutrients,
  MIN_KCAL_BY_SEX,
  FOOD_MAP,
  FOODS,
} from "./.build/lib.mjs";

const profile = (over = {}) => ({
  id: "me",
  displayName: "测试",
  goal: "recomp",
  experience: "beginner",
  daysPerWeek: 3,
  sessionMinutes: 45,
  heightCm: 170,
  weightKg: 70,
  sex: "male",
  limitations: { areas: [], avoidPatterns: [], skipped: true },
  reminders: {
    waterEnabled: false,
    waterIntervalMin: 60,
    moveEnabled: false,
    moveIntervalMin: 60,
    trainingEnabled: false,
  },
  onboarded: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("基础代谢与总消耗", () => {
  it("Mifflin-St Jeor 公式：男性高于女性（同身高体重年龄）", () => {
    const male = calcBMR({ weightKg: 70, heightCm: 175, sex: "male", birthYear: 1990 });
    const female = calcBMR({ weightKg: 70, heightCm: 175, sex: "female", birthYear: 1990 });
    assert.ok(male > female, "同条件下男性 BMR 应更高");
    assert.ok(male > 1400 && male < 2000, `BMR 应在合理范围，实际 ${male}`);
  });

  it("训练频率越高，活动系数越大", () => {
    assert.ok(activityFactor(1) < activityFactor(3));
    assert.ok(activityFactor(3) < activityFactor(6));
  });

  it("TDEE = BMR × 活动系数", () => {
    const p = profile();
    assert.equal(calcTDEE(p), Math.round(calcBMR(p) * activityFactor(p.daysPerWeek)));
  });
});

describe("营养目标", () => {
  it("减脂也不低于安全下限，并给出说明", () => {
    // 久坐（每周 1 次）的轻体重女性，温和赤字后仍会触及 1200 安全下限
    const p = profile({ goal: "fat_loss", weightKg: 50, heightCm: 155, sex: "female", daysPerWeek: 1 });
    const t = computeTargets(p);
    assert.ok(t.kcal >= MIN_KCAL_BY_SEX.female, `不应低于女性下限，实际 ${t.kcal}`);
    assert.ok(t.caveats.some((c) => c.includes("安全下限")), "应在限制中说明触及下限");
  });

  it("热量目标随体重上升", () => {
    const a = computeTargets(profile({ weightKg: 60 }));
    const b = computeTargets(profile({ weightKg: 90 }));
    assert.ok(b.kcal > a.kcal);
    assert.ok(b.proteinG > a.proteinG, "蛋白质按体重计算，应随体重上升");
  });

  it("三大宏量折算热量与目标热量基本一致（±8%）", () => {
    const t = computeTargets(profile({ weightKg: 70 }));
    const kcalFromMacro = t.proteinG * 4 + t.carbG * 4 + t.fatG * 9;
    const diff = Math.abs(kcalFromMacro - t.kcal) / t.kcal;
    assert.ok(diff < 0.08, `宏量折算偏差过大：${Math.round(kcalFromMacro)} vs ${t.kcal}`);
  });

  it("碳水不会被压到极低（不做生酮/极端方案）", () => {
    const t = computeTargets(profile({ weightKg: 120, goal: "fat_loss", sex: "female" }));
    assert.ok(t.carbG >= 50, `碳水应保持最低保障，实际 ${t.carbG}`);
  });

  it("展示计算依据与适用限制", () => {
    const t = computeTargets(profile());
    assert.ok(t.basis.includes("Mifflin"), "依据应说明公式");
    assert.ok(t.basis.includes("TDEE"), "依据应说明 TDEE");
    assert.ok(t.caveats.length >= 2, "应列出适用限制");
  });
});

describe("食物份量换算", () => {
  it("每 100 克 → 每份的线性换算", () => {
    const rice = FOOD_MAP["rice_white_cooked"];
    const e = { grams: 150, oilG: 0 };
    const n = nutrientsFor(e, rice.per100g);
    assert.equal(n.kcal, Math.round((rice.per100g.kcal * 150) / 100));
    assert.equal(n.proteinG, Math.round(rice.per100g.proteinG * 1.5 * 10) / 10);
  });

  it("用油按 1g ≈ 8.84 kcal 计入脂肪与热量", () => {
    const chicken = FOOD_MAP["chicken_breast_raw"];
    const withoutOil = nutrientsFor({ grams: 100, oilG: 0 }, chicken.per100g);
    const withOil = nutrientsFor({ grams: 100, oilG: 10 }, chicken.per100g);
    assert.equal(withOil.fatG, Math.round((chicken.per100g.fatG + 10) * 10) / 10);
    assert.ok(withOil.kcal - withoutOil.kcal >= 85, "10g 油应带来约 88 kcal");
  });

  it("烹饪方式给出用油建议：水煮为 0，油炸高于小炒", () => {
    assert.equal(suggestOilG("boiled", 200), 0);
    assert.ok(suggestOilG("deep_fried", 200) > suggestOilG("stir_fried", 200));
    assert.equal(suggestOilG(undefined, 200), 0);
  });

  it("多条记录可以求和", () => {
    const rice = FOOD_MAP["rice_white_cooked"];
    const a = nutrientsFor({ grams: 100, oilG: 0 }, rice.per100g);
    const b = nutrientsFor({ grams: 100, oilG: 0 }, rice.per100g);
    const s = sumNutrients([a, b]);
    assert.equal(s.kcal, a.kcal + b.kcal);
  });

  it("内置食物区分生重与熟重基准", () => {
    assert.equal(FOOD_MAP["rice_white_raw"].basis, "raw");
    assert.equal(FOOD_MAP["rice_white_cooked"].basis, "cooked");
    assert.ok(
      FOOD_MAP["rice_white_raw"].per100g.kcal > FOOD_MAP["rice_white_cooked"].per100g.kcal,
      "生米每 100g 热量应高于熟饭（含水）",
    );
  });
});

describe("营养计算：公式对拍与边界（回归）", () => {
  const age30BirthYear = () => new Date().getFullYear() - 30;

  it("Mifflin-St Jeor 手算对拍（男 / 女 / 不提供）", () => {
    const male = calcBMR({
      weightKg: 80,
      heightCm: 180,
      sex: "male",
      birthYear: age30BirthYear(),
    });
    // 10×80 + 6.25×180 − 5×30 + 5 = 1780
    assert.equal(male, 1780);

    const female = calcBMR({
      weightKg: 60,
      heightCm: 165,
      sex: "female",
      birthYear: age30BirthYear(),
    });
    // 10×60 + 6.25×165 − 5×30 − 161 = 1320.25
    assert.equal(female, 1320.25);

    const unspecified = calcBMR({
      weightKg: 60,
      heightCm: 165,
      sex: "unspecified",
      birthYear: age30BirthYear(),
    });
    // 10×60 + 6.25×165 − 5×30 − 78 = 1403.25
    assert.equal(unspecified, 1403.25);
    const maleSameStats = calcBMR({
      weightKg: 60,
      heightCm: 165,
      sex: "male",
      birthYear: age30BirthYear(),
    });
    const femaleSameStats = calcBMR({
      weightKg: 60,
      heightCm: 165,
      sex: "female",
      birthYear: age30BirthYear(),
    });
    assert.equal(
      unspecified,
      (maleSameStats + femaleSameStats) / 2,
      "不提供性别时应取男女常数的中值",
    );
  });

  it("男性减脂同样受 1500 kcal 绝对下限保护", () => {
    const t = computeTargets(
      profile({
        goal: "fat_loss",
        sex: "male",
        weightKg: 30,
        heightCm: 120,
        daysPerWeek: 1,
      }),
    );
    assert.equal(t.kcal, MIN_KCAL_BY_SEX.male);
    assert.ok(t.caveats.some((c) => c.includes("安全下限")));
  });

  it("脂肪因碳水最低保障被回调时，basis 必须显示真实克数", () => {
    const t = computeTargets(
      profile({
        goal: "fat_loss",
        sex: "female",
        weightKg: 63,
        heightCm: 185,
        daysPerWeek: 1,
        birthYear: 1930, // 年龄被 clamp 到 90，使温和赤字后触及下限
      }),
    );
    assert.equal(t.kcal, MIN_KCAL_BY_SEX.female);
    assert.equal(t.fatG, 55, "应回调到 55 g 左右");
    assert.notEqual(t.fatG, Math.round(63 * 0.9), "回调后不应再声称 0.9 g/kg 的原值");
    assert.ok(t.basis.includes(`回调为 ${t.fatG} g`), `basis 应显示真实脂肪量：${t.basis}`);
    const kcalFromMacro = t.proteinG * 4 + t.carbG * 4 + t.fatG * 9;
    assert.ok(
      Math.abs(kcalFromMacro - t.kcal) / t.kcal < 0.02,
      `宏量折算应与目标基本一致：${kcalFromMacro} vs ${t.kcal}`,
    );
  });

  it("每个内置食物的份量生熟状态都与 per100g 基准一致", () => {
    const mismatches = FOODS.flatMap((food) =>
      food.portions
        .filter((p) => p.state !== "na" && food.basis !== "na" && p.state !== food.basis)
        .map((p) => `${food.id}/${p.id}（${food.basis} 数据挂了 ${p.state} 份量：${p.label}）`),
    );
    assert.deepEqual(mismatches, [], "生重/熟重份量不能挂错基准，否则换算会成倍偏差");
  });
});

