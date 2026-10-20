import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generatePlan,
  findSubstitutes,
  slimForTime,
  estimateDayMinutes,
  splitFor,
  WEEKDAY_MAP,
  EXERCISE_MAP,
  equipmentAvailable,
  pickExercise,
  suggestForExercise,
  historyFor,
  buildWeeklyReport,
  buildDemoSessions,
  lastPerformanceOf,
  addDays,
  startOfWeekISO,
  todayISO,
} from "./.build/lib.mjs";

/** 在指定时区下执行断言，结束后恢复（Node 支持运行时切换 TZ）。 */
function withTimeZone(tz, fn) {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

const planFixture = (plannedDays = 2) => ({
  id: "plan_test",
  name: "测试计划",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  rationale: "",
  generatedFrom: {},
  days: Array.from({ length: plannedDays }, (_, i) => ({
    id: `day_${i}`,
    weekday: i,
    title: `训练日 ${i + 1}`,
    focusMuscles: [],
    items: [],
    estimatedMinutes: 45,
  })),
});

const targetsFixture = () => ({
  kcal: 2000,
  proteinG: 120,
  carbG: 200,
  fatG: 60,
  basis: "",
  caveats: [],
});

/** startedAt 用「本地时间」构造，避免测试自身踩到 UTC 跨日问题。 */
const sessionFixture = ({ id = "s1", status = "completed", date, hour = 10, logs = [] } = {}) => {
  const day = date ?? todayISO();
  return {
    id,
    title: "测试训练",
    status,
    startedAt: new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`).toISOString(),
    createdAt: "",
    updatedAt: "",
    logs,
    warmups: [],
  };
};

const foodEntryFixture = (over = {}) => ({
  id: "entry_1",
  date: todayISO(),
  slot: "breakfast",
  foodId: "oats",
  foodName: "燕麦片（干）",
  grams: 100,
  basis: "raw",
  source: { kind: "builtin", note: "" },
  createdAt: "",
  updatedAt: "",
  ...over,
});

const base = (over = {}) => ({
  goal: "recomp",
  experience: "beginner",
  daysPerWeek: 3,
  sessionMinutes: 45,
  availableEquipment: ["barbell", "dumbbell", "machine", "cable", "bench", "bodyweight"],
  limitationAreas: [],
  avoidPatterns: [],
  ...over,
});

describe("训练计划生成", () => {
  it("按每周天数生成对应数量的训练日，且动作不为空", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const plan = generatePlan(base({ daysPerWeek: n }));
      assert.equal(plan.days.length, n, `每周 ${n} 次应生成 ${n} 个训练日`);
      for (const d of plan.days) {
        assert.ok(d.items.length > 0, `${d.title} 不应为空`);
      }
    }
  });

  it("训练日落在 WEEKDAY_MAP 指定的周内分布上", () => {
    const plan = generatePlan(base({ daysPerWeek: 3 }));
    assert.deepEqual(plan.days.map((d) => d.weekday), WEEKDAY_MAP[3]);
    assert.equal(splitFor(3).days.length, 3);
  });

  it("只使用当前场馆具备的器械（徒手场景）", () => {
    const plan = generatePlan(
      base({ availableEquipment: ["bodyweight"], experience: "beginner", daysPerWeek: 3 }),
    );
    for (const d of plan.days) {
      for (const item of d.items) {
        const ex = EXERCISE_MAP[item.exerciseId];
        assert.ok(ex, `未知动作 ${item.exerciseId}`);
        // 「任一即可」的器械也会让动作不可用，因此用统一的可用性判定校验。
        assert.ok(
          equipmentAvailable(ex, ["bodyweight"]),
          `${ex.name} 需要现场没有的器械（equipment=${ex.equipment.join("/")}，alternatives=${
            (ex.equipmentAlternatives ?? []).join("/") || "—"
          }）`,
        );
        assert.deepEqual(ex.equipment, [], `${ex.name} 徒手场景不应有必需器械`);
      }
    }
  });

  it("居家轻量器械（哑铃+弹力带）不会出现杠铃/器械区动作", () => {
    const plan = generatePlan(
      base({ availableEquipment: ["dumbbell", "band", "bodyweight"], daysPerWeek: 3 }),
    );
    const available = ["dumbbell", "band", "bodyweight"];
    for (const d of plan.days) {
      for (const item of d.items) {
        const ex = EXERCISE_MAP[item.exerciseId];
        assert.ok(
          equipmentAvailable(ex, available),
          `${ex.name} 用了现场没有的器械：equipment=${ex.equipment.join("/")}，alternatives=${
            (ex.equipmentAlternatives ?? []).join("/") || "—"
          }`,
        );
      }
    }
  });

  it("身体限制：避开指定动作模式", () => {
    const plan = generatePlan(
      base({ avoidPatterns: ["squat", "hinge"], limitationAreas: ["膝"] }),
    );
    for (const d of plan.days) {
      for (const item of d.items) {
        const ex = EXERCISE_MAP[item.exerciseId];
        assert.ok(
          ex.movementPattern !== "squat" && ex.movementPattern !== "hinge",
          `不应出现 ${ex.movementPattern} 模式：${ex.name}`,
        );
      }
    }
    assert.ok(plan.rationale.includes("膝"), "理由中应说明已考虑的受限部位");
  });

  it("每个动作都带有安排理由", () => {
    const plan = generatePlan(base());
    for (const d of plan.days) {
      for (const item of d.items) {
        assert.ok(item.rationale && item.rationale.length > 4, `${item.exerciseId} 缺少理由`);
      }
    }
  });

  it("新手动作用品难度较低，资深可覆盖更高难度", () => {
    const beginner = generatePlan(base({ experience: "beginner" }));
    const diffs = beginner.days.flatMap((d) => d.items.map((i) => EXERCISE_MAP[i.exerciseId].difficulty));
    assert.ok(Math.max(...diffs) <= 3, `新手计划不应出现难度 4+ 的动作，实际 ${Math.max(...diffs)}`);
  });
});

describe("时间预算与精简", () => {
  it("时间不足时精简：动作数减少或组数减少，且估算时长下降", () => {
    const plan = generatePlan(base({ sessionMinutes: 60, daysPerWeek: 3 }));
    const day = plan.days[0];
    const before = estimateDayMinutes(day.items);
    const slim = slimForTime(day, 30);
    const after = estimateDayMinutes(slim.items);
    assert.ok(after < before, `精简后应更短：${before} -> ${after}`);
    assert.ok(slim.items.length >= 2, "至少保留 2 个动作");
  });
});

describe("动作替换推荐", () => {
  const ctx = (over = {}) => ({
    available: ["barbell", "dumbbell", "machine", "cable", "bench", "bodyweight"],
    avoidPatterns: [],
    level: "intermediate",
    exclude: [],
    ...over,
  });

  it("优先同动作模式 + 目标肌群，而不是随机选择", () => {
    const opts = findSubstitutes("barbell_back_squat", ctx({ limit: 5 }));
    assert.ok(opts.length > 0);
    const top = opts[0];
    assert.equal(top.exercise.movementPattern, "squat", "首选应同为深蹲模式");
    const sharesMuscle = top.exercise.primaryMuscles.some((m) =>
      EXERCISE_MAP["barbell_back_squat"].primaryMuscles.includes(m),
    );
    assert.ok(sharesMuscle, "首选应与原动作共享主练肌群");
    // 得分应单调不增
    for (let i = 1; i < opts.length; i++) {
      assert.ok(opts[i].score <= opts[i - 1].score, "结果应按得分降序");
    }
  });

  it("排除没有的器械：哑铃场景下不会推荐杠铃深蹲", () => {
    const available = ["dumbbell", "bodyweight"];
    const opts = findSubstitutes("barbell_back_squat", ctx({ available }));
    assert.ok(opts.length > 0);
    for (const o of opts) {
      assert.ok(
        equipmentAvailable(o.exercise, available),
        `${o.exercise.name} 需要缺失器械（equipment=${o.exercise.equipment.join("/")}，alternatives=${
          (o.exercise.equipmentAlternatives ?? []).join("/") || "—"
        }）`,
      );
    }
  });

  it("排除已在计划中的动作与自身", () => {
    const opts = findSubstitutes("push_up", ctx({ exclude: ["push_up", "dumbbell_bench_press"] }));
    assert.ok(!opts.some((o) => o.exercise.id === "push_up"), "不应包含自身");
    assert.ok(!opts.some((o) => o.exercise.id === "dumbbell_bench_press"), "不应包含被排除项");
  });

  it("避开受限动作模式", () => {
    const opts = findSubstitutes("barbell_back_squat", ctx({ avoidPatterns: ["squat"] }));
    assert.ok(!opts.some((o) => o.exercise.movementPattern === "squat"), "不应推荐受限模式");
  });

  it("每条推荐都给出理由", () => {
    const opts = findSubstitutes("barbell_back_squat", ctx({ limit: 3 }));
    for (const o of opts) {
      assert.ok(o.reasons.length > 0, `${o.exercise.name} 缺少理由`);
    }
  });
});

describe("器械「任一即可 / 同时需要」语义（回归）", () => {
  it("纯哑铃场馆可以选中高脚杯深蹲（哑铃或壶铃）", () => {
    assert.ok(equipmentAvailable(EXERCISE_MAP.goblet_squat, ["dumbbell"]));
    assert.ok(equipmentAvailable(EXERCISE_MAP.goblet_squat, ["kettlebell"]));
    assert.ok(!equipmentAvailable(EXERCISE_MAP.goblet_squat, ["bodyweight"]));

    const plan = generatePlan(
      base({ availableEquipment: ["dumbbell"], experience: "beginner", daysPerWeek: 3 }),
    );
    const ids = plan.days.flatMap((d) => d.items.map((i) => i.exerciseId));
    assert.ok(
      ids.includes("goblet_squat"),
      `纯哑铃计划应能排到高脚杯深蹲，实际：${ids.join(",")}`,
    );
    const squat = ids
      .map((id) => EXERCISE_MAP[id])
      .filter((ex) => ex?.movementPattern === "squat");
    assert.ok(squat.length > 0, "纯哑铃场馆至少应能排到深蹲模式动作");
  });

  it("纯弹力带场馆可以找到 Pallof 类抗旋转动作", () => {
    assert.ok(equipmentAvailable(EXERCISE_MAP.pallof_press, ["band"]));
    assert.ok(!equipmentAvailable(EXERCISE_MAP.pallof_press, ["bodyweight"]));

    const options = findSubstitutes("russian_twist", {
      available: ["band"],
      avoidPatterns: [],
      level: "beginner",
      exclude: [],
    });
    assert.ok(
      options.some((o) => o.exercise.id === "pallof_press"),
      "纯弹力带场馆替换列表应包含 Pallof 推举",
    );
    // rotation 目前不在任何分化模板里，自动计划不会主动排；但手动添加/替换路径必须可用。
    const picked = pickExercise("rotation", {
      available: ["band"],
      avoidPatterns: [],
      level: "beginner",
      usedIds: new Set(),
    });
    assert.ok(picked, "纯弹力带场馆应至少能选到一个抗旋转动作");
    assert.ok(equipmentAvailable(picked, ["band"]));
  });

  it("哑铃卧推仍同时需要哑铃和凳子（不能把 AND 误改成 OR）", () => {
    assert.ok(!equipmentAvailable(EXERCISE_MAP.dumbbell_bench_press, ["dumbbell"]));
    assert.ok(
      equipmentAvailable(EXERCISE_MAP.dumbbell_bench_press, ["dumbbell", "bench"]),
    );

    const plan = generatePlan(
      base({ availableEquipment: ["dumbbell"], experience: "beginner", daysPerWeek: 3 }),
    );
    const ids = plan.days.flatMap((d) => d.items.map((i) => i.exerciseId));
    assert.ok(
      !ids.includes("dumbbell_bench_press"),
      "没有凳子时不应安排哑铃卧推，实际：" + ids.join(","),
    );
  });

  it("罗马尼亚硬拉 / 农夫行走是「任一即可」，杠铃卧推仍需全部器械", () => {
    for (const available of [["barbell"], ["dumbbell"]]) {
      assert.ok(
        equipmentAvailable(EXERCISE_MAP.romanian_deadlift, available),
        `RDL 应在 ${available.join("+")} 场馆可用`,
      );
    }
    assert.ok(!equipmentAvailable(EXERCISE_MAP.romanian_deadlift, ["bodyweight"]));

    for (const available of [["dumbbell"], ["kettlebell"]]) {
      assert.ok(
        equipmentAvailable(EXERCISE_MAP.farmer_carry, available),
        `农夫行走应在 ${available.join("+")} 场馆可用`,
      );
    }
    assert.ok(!equipmentAvailable(EXERCISE_MAP.farmer_carry, ["bodyweight"]));

    // 同时需要：杠铃卧推只给杠铃没有凳子时仍不可用。
    assert.ok(!equipmentAvailable(EXERCISE_MAP.barbell_bench_press, ["barbell"]));
    assert.ok(
      equipmentAvailable(EXERCISE_MAP.barbell_bench_press, ["barbell", "bench"]),
    );
  });
});

describe("训练计划：去重 / 受限补位 / 时间预算（回归）", () => {
  it("同一训练日内不出现重复动作（各器械组合 × 各分化）", () => {
    const equipmentSets = [
      ["bodyweight"],
      ["dumbbell", "band", "bodyweight"],
      ["barbell", "dumbbell", "machine", "cable", "bench", "bodyweight"],
    ];
    for (const equipment of equipmentSets) {
      for (const daysPerWeek of [1, 2, 3, 4, 5, 6]) {
        const plan = generatePlan(
          base({
            daysPerWeek,
            sessionMinutes: 40,
            availableEquipment: equipment,
          }),
        );
        for (const day of plan.days) {
          const ids = day.items.map((i) => i.exerciseId);
          assert.equal(
            new Set(ids).size,
            ids.length,
            `${equipment.join("+")} / 每周 ${daysPerWeek} 次 / ${day.title} 出现重复动作：${ids.join(",")}`,
          );
        }
      }
    }
  });

  it("膝限制 + 居家器械：下肢日会补位，不会只剩 2 个动作", () => {
    const plan = generatePlan({
      goal: "recomp",
      experience: "intermediate",
      daysPerWeek: 4,
      sessionMinutes: 55,
      availableEquipment: ["bodyweight", "dumbbell", "band", "other"],
      limitationAreas: ["膝"],
      avoidPatterns: ["squat", "lunge"],
    });
    const lowerDays = plan.days.filter((d) => d.title.includes("下肢"));
    assert.ok(lowerDays.length > 0, "应生成下肢日");
    for (const day of lowerDays) {
      assert.ok(day.items.length >= 4, `${day.title} 只有 ${day.items.length} 个动作`);
      for (const item of day.items) {
        const ex = EXERCISE_MAP[item.exerciseId];
        assert.ok(
          ex.movementPattern !== "squat" && ex.movementPattern !== "lunge",
          `不应引入受限模式：${ex.name}`,
        );
        assert.ok(
          ["hinge", "isolation_leg", "core"].includes(ex.movementPattern),
          `下肢日受限时应只用髋主导/腿孤立/核心补位，实际 ${ex.movementPattern}：${ex.name}`,
        );
      }
    }
    assert.ok(plan.rationale.includes("补位"), "计划理由应说明做过补位");
  });

  it("单次 15 分钟：组数降到 2，估算时长贴近预算（不再出现 25 分钟）", () => {
    const plan = generatePlan(
      base({
        goal: "muscle_gain",
        experience: "intermediate",
        daysPerWeek: 3,
        sessionMinutes: 15,
      }),
    );
    for (const day of plan.days) {
      assert.ok(day.items.length >= 2, "至少保留 2 个动作");
      for (const item of day.items) {
        assert.ok(item.sets.length >= 2, `组数不应被降到 1：${item.exerciseId}`);
      }
      assert.ok(
        day.estimatedMinutes <= 17,
        `${day.title} 估算 ${day.estimatedMinutes} 分钟，未贴近 15 分钟预算`,
      );
    }
  });

  it("所有动作模式都被限制时：计划为空但给出明确说明，且不虚报时长", () => {
    const plan = generatePlan({
      goal: "recomp",
      experience: "beginner",
      daysPerWeek: 3,
      sessionMinutes: 45,
      availableEquipment: [],
      limitationAreas: ["全身"],
      avoidPatterns: [
        "squat",
        "hinge",
        "horizontal_push",
        "horizontal_pull",
        "vertical_push",
        "vertical_pull",
        "lunge",
        "core",
      ],
    });
    for (const day of plan.days) {
      assert.equal(day.items.length, 0);
      assert.equal(day.estimatedMinutes, 0, "空训练日不应显示热身时长");
    }
    assert.ok(plan.rationale.includes("计划为空"), "应明确告知用户计划为空");
  });
});

describe("渐进超负荷建议（回归）", () => {
  const weightPlan = () => ({
    id: "pe_lateral",
    exerciseId: "lateral_raise",
    sets: [0, 1, 2].map(() => ({ repsMin: 8, repsMax: 12, restSec: 90 })),
    rationale: "",
  });

  const weightSession = (id, startedAt, weightKg) => ({
    id,
    title: "",
    status: "completed",
    startedAt,
    createdAt: "",
    updatedAt: "",
    warmups: [],
    logs: [
      {
        exerciseId: "lateral_raise",
        sets: [0, 1, 2].map(() => ({ status: "done", weightKg, reps: 12, rpe: 7 })),
      },
    ],
  });

  it("加重建议必须严格大于原重量（含 2/4/5/6/8/20kg 等常见档位）", () => {
    for (const weightKg of [2, 2.5, 4, 5, 6, 8, 10, 20, 60, 100]) {
      const suggestion = suggestForExercise("lateral_raise", weightPlan(), [
        weightSession("a", "2026-10-01T10:00:00.000Z", weightKg),
        weightSession("b", "2026-10-03T10:00:00.000Z", weightKg),
      ]);
      assert.equal(suggestion.kind, "add_weight", `${weightKg}kg 应给出加重建议`);
      const matched = /@ ([\d.]+)kg/.exec(suggestion.to);
      assert.ok(matched, `加重建议里应包含目标重量：${suggestion.to}`);
      // UI 侧「应用这条调整」直接读结构化字段（生成的计划组不带 weightKg），必须与文案一致。
      assert.equal(
        suggestion.targetWeightKg,
        Number(matched[1]),
        "add_weight 必须给出 targetWeightKg，且与展示文案一致",
      );
      assert.ok(
        Number(matched[1]) > weightKg,
        `${weightKg}kg 的加重建议不能原地踏步，实际 ${matched[1]}kg`,
      );
    }
  });

  it("计时动作未达到目标时长时，不给出延长建议", () => {
    const plankPlan = {
      id: "pe_plank",
      exerciseId: "plank",
      sets: [0, 1, 2].map(() => ({ repsMin: 0, repsMax: 0, durationSec: 30, restSec: 45 })),
      rationale: "",
    };
    const shortPlankSession = (id, startedAt) => ({
      id,
      title: "",
      status: "completed",
      startedAt,
      createdAt: "",
      updatedAt: "",
      warmups: [],
      logs: [
        {
          exerciseId: "plank",
          sets: [0, 1, 2].map(() => ({ status: "done", durationSec: 5 })),
        },
      ],
    });
    const notReady = suggestForExercise("plank", plankPlan, [
      shortPlankSession("a", "2026-10-01T10:00:00.000Z"),
      shortPlankSession("b", "2026-10-03T10:00:00.000Z"),
    ]);
    assert.notEqual(notReady.kind, "add_rep", "只坚持 5 秒不应建议加到 40 秒");

    const doneSession = (id, startedAt) => {
      const s = shortPlankSession(id, startedAt);
      s.logs[0].sets = [0, 1, 2].map(() => ({ status: "done" }));
      return s;
    };
    const ready = suggestForExercise("plank", plankPlan, [
      doneSession("a", "2026-10-01T10:00:00.000Z"),
      doneSession("b", "2026-10-03T10:00:00.000Z"),
    ]);
    assert.equal(ready.kind, "add_rep");
    assert.ok(ready.to.includes("40 秒"), ready.to);
  });

  it("同一天的多次训练按真实开始时间排序，最近两次取对", () => {
    const session = (id, startedAt, reps) => ({
      id,
      title: "",
      status: "completed",
      startedAt,
      createdAt: "",
      updatedAt: "",
      warmups: [],
      logs: [{ exerciseId: "push_up", sets: [{ status: "done", reps, rpe: 8 }] }],
    });
    const late = session("late", "2026-10-20T18:00:00.000Z", 20);
    const early = session("early", "2026-10-20T08:00:00.000Z", 10);
    const points = historyFor([late, early], "push_up");
    assert.deepEqual(
      points.map((p) => p.sets[0].reps),
      [10, 20],
      "historyFor 应按 startedAt 升序，而不是保留输入顺序",
    );
  });
});

describe("周报（回归）", () => {
  it("完成率只统计已完成训练，并 clamp 到 100%", () => {
    const today = todayISO();
    const weekStart = startOfWeekISO(today);
    const date = (offset) => addDays(weekStart, offset);

    const mixed = buildWeeklyReport({
      today,
      plan: planFixture(2),
      sessions: [
        sessionFixture({ id: "done", status: "completed", date: date(0) }),
        sessionFixture({ id: "running", status: "in_progress", date: date(1) }),
        sessionFixture({ id: "abandoned", status: "abandoned", date: date(2) }),
      ],
      entries: [],
      weights: [],
      recovery: [],
      targets: targetsFixture(),
    });
    assert.equal(mixed.completedSessions.length, 1);
    assert.equal(mixed.completionRate, 0.5, "进行中/已放弃的会话不应算作完成");
    assert.ok(mixed.completionNote.includes("完成 1 次"));

    const extra = buildWeeklyReport({
      today,
      plan: planFixture(1),
      sessions: [0, 1, 2].map((i) =>
        sessionFixture({ id: `done_${i}`, status: "completed", date: date(i) }),
      ),
      entries: [],
      weights: [],
      recovery: [],
      targets: targetsFixture(),
    });
    assert.equal(extra.completionRate, 1, "额外的自由训练不应让完成率超过 100%");
  });

  it("自建食物（传给 foods）会计入周报营养，而不是按 0 计算", () => {
    const customFood = {
      id: "custom_salad",
      name: "自制鸡胸沙拉",
      category: "other",
      basis: "na",
      per100g: { kcal: 150, proteinG: 20, carbG: 5, fatG: 4 },
      portions: [],
      source: { kind: "custom" },
      createdAt: "",
      updatedAt: "",
    };
    const report = buildWeeklyReport({
      today: todayISO(),
      sessions: [],
      entries: [
        foodEntryFixture({
          id: "entry_custom",
          foodId: "custom_salad",
          foodName: "自制鸡胸沙拉",
          grams: 200,
          basis: "na",
          source: { kind: "custom" },
        }),
      ],
      weights: [],
      recovery: [],
      targets: targetsFixture(),
      foods: [customFood],
    });
    assert.equal(report.nutrition.avgKcal, 300);
    assert.equal(report.nutrition.avgProtein, 40);
  });

  it("只有 1 天饮食记录时，不给出「平均摄入过低」的结论", () => {
    const report = buildWeeklyReport({
      today: todayISO(),
      sessions: [],
      entries: [foodEntryFixture()],
      weights: [],
      recovery: [],
      targets: targetsFixture(),
    });
    assert.equal(report.nutrition.daysLogged, 1);
    assert.equal(report.nutrition.enough, false);
    assert.ok(
      !report.cautions.some((c) => c.includes("平均摄入")),
      "数据不足（<3 天）时不应下摄入结论",
    );
  });

  it("凌晨训练按本地日期归入本周（UTC 跨日边界）", () => {
    withTimeZone("Asia/Shanghai", () => {
      const localMondayEarly = new Date(2026, 10, 2, 0, 30); // 本地周一 00:30
      assert.equal(
        localMondayEarly.toISOString().slice(0, 10),
        "2026-11-01",
        "构造的用例应该跨 UTC 日界",
      );
      const session = sessionFixture({ id: "early", status: "completed", date: "2026-11-02" });
      session.startedAt = localMondayEarly.toISOString();
      const report = buildWeeklyReport({
        today: "2026-11-02",
        plan: planFixture(1),
        sessions: [session],
        entries: [],
        weights: [],
        recovery: [],
        targets: targetsFixture(),
      });
      assert.equal(report.weekStart, "2026-11-02");
      assert.equal(report.completedSessions.length, 1, "周一凌晨的训练不应掉出本周");
      assert.equal(report.completionRate, 1);
    });
  });

  it("演示训练按本地日期落在周一/三/五的 19:10", () => {
    withTimeZone("Asia/Shanghai", () => {
      const sessions = buildDemoSessions(21);
      assert.ok(sessions.length > 0);
      for (const session of sessions) {
        const local = new Date(session.startedAt);
        assert.ok(
          [1, 3, 5].includes(local.getDay()),
          `${session.startedAt} 本地星期 ${local.getDay()}，应为周一/三/五`,
        );
        assert.equal(local.getHours(), 19);
      }
    });
  });

  it("上次训练记录的日期按本地日期显示", () => {
    withTimeZone("Asia/Shanghai", () => {
      const localMondayEarly = new Date(2026, 10, 2, 0, 30);
      const session = sessionFixture({ id: "last", status: "completed", date: "2026-11-02" });
      session.startedAt = localMondayEarly.toISOString();
      session.logs = [
        { exerciseId: "push_up", sets: [{ index: 0, status: "done", reps: 10 }] },
      ];
      const last = lastPerformanceOf([session], "push_up");
      assert.ok(last);
      assert.equal(last.date, "2026-11-02");
    });
  });
});

