import type { Food, FoodCategory } from "../types";

const T0 = "2026-01-01T00:00:00.000Z";

/**
 * 内置食物库：数值来自公开的食物成分参考资料（以中国食物成分表 /
 * USDA FoodData Central 常见条目为参考量级），仅作估算用途。
 * 每份食物的「每 100 克」与「每份」在 UI 中分开显示，
 * 生重 / 熟重通过 basis 与 portions[].state 明确标注。
 */

const BUILTIN = (note: string) => ({ kind: "builtin" as const, note });

type Seed = Omit<Food, "createdAt" | "updatedAt">;

const RAW: Seed[] = [
  /* --------------------------------- 谷薯 --------------------------------- */
  {
    id: "rice_white_raw",
    name: "大米（生）",
    alias: ["白米", "米"],
    category: "grain",
    basis: "raw",
    per100g: { kcal: 346, proteinG: 7.4, carbG: 77.9, fatG: 0.8, fiberG: 0.7 },
    portions: [
      // 注意：不要把「1 碗熟饭」挂到这条「生米」数据上——每 100g 数值是生重基准，
      // 按 150g 熟饭直接乘会高估约 3 倍。熟饭请选 rice_white_cooked。
      { id: "p2", label: "生米 50g（约 1 拳）", grams: 50, state: "raw" },
      { id: "p3", label: "100g（生）", grams: 100, state: "raw", isDefault: true },
    ],
    cookingHints: ["煮米饭：生米吸水约 2.2-2.5 倍，50g 生米 ≈ 130g 熟饭", "炒饭需额外计入用油"],
    source: BUILTIN("内置参考值（生重基准），实际因品种与加水量有差异"),
  },
  {
    id: "rice_white_cooked",
    name: "米饭（熟）",
    alias: ["白米饭"],
    category: "grain",
    basis: "cooked",
    per100g: { kcal: 116, proteinG: 2.6, carbG: 25.9, fatG: 0.3 },
    portions: [
      { id: "p1", label: "1 碗（约 150g）", grams: 150, state: "cooked", isDefault: true },
      { id: "p2", label: "100g", grams: 100, state: "cooked" },
    ],
    cookingHints: ["若你称量的是生米，请选择「大米（生）」条目"],
    source: BUILTIN("内置参考值（熟重基准）"),
  },
  {
    id: "oats",
    name: "燕麦片（干）",
    alias: ["麦片", "燕麦"],
    category: "grain",
    basis: "raw",
    per100g: { kcal: 377, proteinG: 15.0, carbG: 61.0, fatG: 6.7, fiberG: 10.1 },
    portions: [
      { id: "p1", label: "1 份 40g（常见冲泡量）", grams: 40, state: "raw", isDefault: true },
      { id: "p2", label: "100g", grams: 100, state: "raw" },
    ],
    cookingHints: ["冲泡后重量会增加，但营养按干重计算"],
    source: BUILTIN("内置参考值（干重基准）"),
  },
  {
    id: "bread_whole",
    name: "全麦面包",
    category: "grain",
    basis: "na",
    per100g: { kcal: 247, proteinG: 9.0, carbG: 41.0, fatG: 3.4, fiberG: 6.0 },
    portions: [{ id: "p1", label: "1 片（约 35g）", grams: 35, state: "na", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "sweet_potato",
    name: "红薯（生）",
    alias: ["地瓜", "番薯"],
    category: "grain",
    basis: "raw",
    per100g: { kcal: 86, proteinG: 1.6, carbG: 20.1, fatG: 0.2, fiberG: 3.0 },
    portions: [
      { id: "p1", label: "1 个中等（约 150g，生）", grams: 150, state: "raw", isDefault: true },
      { id: "p2", label: "100g", grams: 100, state: "raw" },
    ],
    cookingHints: ["蒸熟后重量基本不变，烤制会失水略浓缩"],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "noodles_cooked",
    name: "面条（煮熟）",
    alias: ["挂面", "拉面"],
    category: "grain",
    basis: "cooked",
    per100g: { kcal: 138, proteinG: 4.5, carbG: 27.0, fatG: 0.6 },
    portions: [{ id: "p1", label: "1 碗（约 200g 熟）", grams: 200, state: "cooked", isDefault: true }],
    source: BUILTIN("内置参考值（熟重基准，不含汤与浇头油脂）"),
  },

  /* --------------------------------- 蛋白 --------------------------------- */
  {
    id: "chicken_breast_raw",
    name: "鸡胸肉（生）",
    alias: ["鸡胸"],
    category: "protein",
    basis: "raw",
    per100g: { kcal: 133, proteinG: 24.6, carbG: 2.5, fatG: 2.6 },
    portions: [
      { id: "p1", label: "1 块（约 150g，生）", grams: 150, state: "raw", isDefault: true },
      { id: "p2", label: "100g（生）", grams: 100, state: "raw" },
    ],
    cookingHints: ["水煮/煎制后失水约 20-25%，熟重 100g 约相当于生重 130g", "煎制需计入用油"],
    source: BUILTIN("内置参考值（生重基准）"),
  },
  {
    id: "chicken_breast_cooked",
    name: "鸡胸肉（熟）",
    category: "protein",
    basis: "cooked",
    per100g: { kcal: 165, proteinG: 31.0, carbG: 0, fatG: 3.6 },
    portions: [{ id: "p1", label: "100g（熟）", grams: 100, state: "cooked", isDefault: true }],
    source: BUILTIN("内置参考值（熟重基准）"),
  },
  {
    id: "beef_lean_raw",
    name: "牛瘦肉（生）",
    alias: ["牛肉"],
    category: "protein",
    basis: "raw",
    per100g: { kcal: 172, proteinG: 20.2, carbG: 1.2, fatG: 9.5 },
    portions: [{ id: "p1", label: "100g（生）", grams: 100, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "salmon_raw",
    name: "三文鱼（生）",
    category: "protein",
    basis: "raw",
    per100g: { kcal: 208, proteinG: 20.4, carbG: 0, fatG: 13.4 },
    portions: [{ id: "p1", label: "1 块（约 120g）", grams: 120, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "shrimp",
    name: "虾仁",
    category: "protein",
    basis: "raw",
    per100g: { kcal: 93, proteinG: 18.6, carbG: 2.8, fatG: 0.8 },
    portions: [{ id: "p1", label: "100g", grams: 100, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "egg",
    name: "鸡蛋",
    category: "protein",
    basis: "raw",
    per100g: { kcal: 144, proteinG: 13.3, carbG: 2.8, fatG: 8.8 },
    portions: [
      { id: "p1", label: "1 个（约 50g）", grams: 50, state: "raw", isDefault: true },
      { id: "p2", label: "2 个（约 100g）", grams: 100, state: "raw" },
    ],
    cookingHints: ["水煮蛋无需额外用油", "煎蛋一份约加 5g 油"],
    source: BUILTIN("内置参考值（带壳全蛋可食部分）"),
  },
  {
    id: "tofu_firm",
    name: "北豆腐",
    alias: ["豆腐"],
    category: "protein",
    basis: "raw",
    per100g: { kcal: 98, proteinG: 12.2, carbG: 1.5, fatG: 4.8 },
    portions: [{ id: "p1", label: "1 块（约 200g）", grams: 200, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "whey_protein",
    name: "乳清蛋白粉",
    alias: ["蛋白粉"],
    category: "protein",
    basis: "raw",
    per100g: { kcal: 390, proteinG: 80.0, carbG: 6.0, fatG: 5.0 },
    portions: [{ id: "p1", label: "1 勺（约 30g）", grams: 30, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值，不同品牌差异较大，请以包装营养标签为准"),
  },
  {
    id: "pork_lean_raw",
    name: "猪瘦肉（生）",
    category: "protein",
    basis: "raw",
    per100g: { kcal: 143, proteinG: 20.3, carbG: 1.0, fatG: 6.2 },
    portions: [{ id: "p1", label: "100g", grams: 100, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },

  /* -------------------------------- 奶制品 -------------------------------- */
  {
    id: "milk_whole",
    name: "全脂牛奶",
    alias: ["牛奶"],
    category: "dairy",
    basis: "na",
    per100g: { kcal: 65, proteinG: 3.3, carbG: 4.8, fatG: 3.6 },
    portions: [
      { id: "p1", label: "1 杯（250ml）", grams: 250, state: "na", isDefault: true },
      { id: "p2", label: "100ml", grams: 100, state: "na" },
    ],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "yogurt_plain",
    name: "无糖酸奶",
    alias: ["酸奶"],
    category: "dairy",
    basis: "na",
    per100g: { kcal: 61, proteinG: 3.5, carbG: 4.9, fatG: 3.2 },
    portions: [{ id: "p1", label: "1 杯（150g）", grams: 150, state: "na", isDefault: true }],
    source: BUILTIN("内置参考值（无糖型）"),
  },
  {
    id: "greek_yogurt",
    name: "希腊酸奶（无糖）",
    category: "dairy",
    basis: "na",
    per100g: { kcal: 59, proteinG: 10.0, carbG: 3.6, fatG: 0.4 },
    portions: [{ id: "p1", label: "1 杯（150g）", grams: 150, state: "na", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },

  /* --------------------------------- 蔬菜 --------------------------------- */
  {
    id: "broccoli",
    name: "西兰花",
    category: "vegetable",
    basis: "raw",
    per100g: { kcal: 34, proteinG: 2.8, carbG: 6.6, fatG: 0.4, fiberG: 2.6 },
    portions: [{ id: "p1", label: "100g（生）", grams: 100, state: "raw", isDefault: true }],
    cookingHints: ["水煮后重量变化不大", "清炒需计入用油"],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "spinach",
    name: "菠菜",
    category: "vegetable",
    basis: "raw",
    per100g: { kcal: 23, proteinG: 2.6, carbG: 2.8, fatG: 0.3, fiberG: 1.7 },
    portions: [{ id: "p1", label: "100g（生）", grams: 100, state: "raw", isDefault: true }],
    cookingHints: ["焯水后体积大幅缩小，建议按生重称量"],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "tomato",
    name: "番茄",
    alias: ["西红柿"],
    category: "vegetable",
    basis: "raw",
    per100g: { kcal: 18, proteinG: 0.9, carbG: 3.9, fatG: 0.2, fiberG: 1.0 },
    portions: [
      { id: "p1", label: "1 个中等（约 150g）", grams: 150, state: "raw", isDefault: true },
    ],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "cucumber",
    name: "黄瓜",
    category: "vegetable",
    basis: "raw",
    per100g: { kcal: 15, proteinG: 0.8, carbG: 2.9, fatG: 0.2 },
    portions: [{ id: "p1", label: "1 根（约 200g）", grams: 200, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "carrot",
    name: "胡萝卜",
    category: "vegetable",
    basis: "raw",
    per100g: { kcal: 41, proteinG: 0.9, carbG: 9.6, fatG: 0.2, fiberG: 2.8 },
    portions: [{ id: "p1", label: "1 根（约 100g）", grams: 100, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },

  /* --------------------------------- 水果 --------------------------------- */
  {
    id: "apple",
    name: "苹果",
    category: "fruit",
    basis: "raw",
    per100g: { kcal: 52, proteinG: 0.3, carbG: 13.8, fatG: 0.2, fiberG: 2.4 },
    portions: [{ id: "p1", label: "1 个中等（约 200g）", grams: 200, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "banana",
    name: "香蕉",
    category: "fruit",
    basis: "raw",
    per100g: { kcal: 89, proteinG: 1.1, carbG: 22.8, fatG: 0.3, fiberG: 2.6 },
    portions: [{ id: "p1", label: "1 根（约 120g 去皮）", grams: 120, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值（可食部分）"),
  },
  {
    id: "blueberry",
    name: "蓝莓",
    category: "fruit",
    basis: "raw",
    per100g: { kcal: 57, proteinG: 0.7, carbG: 14.5, fatG: 0.3, fiberG: 2.4 },
    portions: [{ id: "p1", label: "1 盒（约 125g）", grams: 125, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },

  /* ------------------------------ 油脂坚果 ------------------------------- */
  {
    id: "olive_oil",
    name: "橄榄油",
    alias: ["食用油"],
    category: "fat",
    basis: "na",
    per100g: { kcal: 884, proteinG: 0, carbG: 0, fatG: 100 },
    portions: [
      { id: "p1", label: "1 茶匙（约 5g）", grams: 5, state: "na", isDefault: true },
      { id: "p2", label: "1 汤匙（约 15g）", grams: 15, state: "na" },
    ],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "almond",
    name: "杏仁",
    category: "fat",
    basis: "raw",
    per100g: { kcal: 579, proteinG: 21.2, carbG: 21.6, fatG: 49.9, fiberG: 12.5 },
    portions: [{ id: "p1", label: "一小把（约 20g）", grams: 20, state: "raw", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "peanut_butter",
    name: "花生酱",
    category: "fat",
    basis: "na",
    per100g: { kcal: 588, proteinG: 25.1, carbG: 20.0, fatG: 50.4 },
    portions: [{ id: "p1", label: "1 勺（约 15g）", grams: 15, state: "na", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },

  /* --------------------------------- 饮品 --------------------------------- */
  {
    id: "water",
    name: "水",
    category: "drink",
    basis: "na",
    per100g: { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
    portions: [{ id: "p1", label: "1 杯（250ml）", grams: 250, state: "na", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "black_coffee",
    name: "黑咖啡（不加糖奶）",
    alias: ["美式"],
    category: "drink",
    basis: "na",
    per100g: { kcal: 2, proteinG: 0.1, carbG: 0.3, fatG: 0 },
    portions: [{ id: "p1", label: "1 杯（250ml）", grams: 250, state: "na", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },
  {
    id: "cola",
    name: "可乐",
    category: "drink",
    basis: "na",
    per100g: { kcal: 42, proteinG: 0, carbG: 10.6, fatG: 0 },
    portions: [{ id: "p1", label: "1 罐（330ml）", grams: 330, state: "na", isDefault: true }],
    source: BUILTIN("内置参考值"),
  },
];

export const FOODS: Food[] = RAW.map((f) => ({ ...f, createdAt: T0, updatedAt: T0 } as Food));

export const FOOD_MAP: Record<string, Food> = Object.fromEntries(FOODS.map((f) => [f.id, f]));

export const FOOD_CATEGORY_LABEL: Record<FoodCategory, string> = {
  grain: "谷薯",
  protein: "蛋白",
  vegetable: "蔬菜",
  fruit: "水果",
  dairy: "奶制品",
  fat: "油脂坚果",
  drink: "饮品",
  other: "其他",
};

/** 同类食材替换建议（用于饮食模块的「换一个」） */
export const FOOD_SUBSTITUTES: Record<string, string[]> = {
  chicken_breast_raw: ["chicken_breast_cooked", "tofu_firm", "shrimp", "pork_lean_raw"],
  chicken_breast_cooked: ["chicken_breast_raw", "shrimp", "tofu_firm"],
  beef_lean_raw: ["pork_lean_raw", "chicken_breast_raw", "salmon_raw"],
  pork_lean_raw: ["chicken_breast_raw", "beef_lean_raw", "tofu_firm"],
  salmon_raw: ["shrimp", "beef_lean_raw", "chicken_breast_raw"],
  shrimp: ["salmon_raw", "chicken_breast_raw", "tofu_firm"],
  tofu_firm: ["chicken_breast_raw", "shrimp", "egg"],
  egg: ["tofu_firm", "chicken_breast_raw", "greek_yogurt"],
  rice_white_raw: ["rice_white_cooked", "oats", "sweet_potato", "noodles_cooked"],
  rice_white_cooked: ["rice_white_raw", "sweet_potato", "noodles_cooked"],
  oats: ["bread_whole", "sweet_potato", "rice_white_raw"],
  bread_whole: ["oats", "sweet_potato"],
  sweet_potato: ["rice_white_raw", "oats", "bread_whole"],
  noodles_cooked: ["rice_white_cooked", "sweet_potato"],
  milk_whole: ["yogurt_plain", "greek_yogurt"],
  yogurt_plain: ["greek_yogurt", "milk_whole"],
  greek_yogurt: ["yogurt_plain", "milk_whole", "whey_protein"],
  whey_protein: ["greek_yogurt", "chicken_breast_raw", "egg"],
  broccoli: ["spinach", "cucumber", "carrot"],
  spinach: ["broccoli", "cucumber"],
  tomato: ["cucumber", "carrot"],
  cucumber: ["tomato", "broccoli"],
  carrot: ["broccoli", "tomato"],
  apple: ["banana", "blueberry"],
  banana: ["apple", "blueberry"],
  blueberry: ["apple", "banana"],
  olive_oil: ["peanut_butter", "almond"],
  almond: ["peanut_butter", "olive_oil"],
  peanut_butter: ["almond", "olive_oil"],
  water: ["black_coffee"],
  black_coffee: ["water"],
  cola: ["water", "black_coffee"],
};
