"use client";

import { useState } from "react";
import { Chip, Segmented, Stepper } from "./ui";
import { GOAL_LABEL, LEVEL_LABEL, MOVEMENT_PATTERN_LABEL } from "@/lib/plan/engine";
import type {
  ExperienceLevel,
  MovementPattern,
  Sex,
  TrainingGoal,
  UserProfile,
} from "@/lib/types";

const GOALS: TrainingGoal[] = ["fat_loss", "muscle_gain", "strength", "recomp", "health"];
const LEVELS: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];

const AREA_OPTIONS = ["膝", "肩", "下背", "腰", "颈", "髋", "踝", "手腕", "肘", "其他"];

/** 部位 → 建议规避的动作模式（只是建议，用户可改） */
const AREA_TO_PATTERNS: Record<string, MovementPattern[]> = {
  膝: ["squat", "lunge"],
  髋: ["squat", "lunge"],
  踝: ["squat", "lunge"],
  肩: ["vertical_push", "horizontal_push"],
  颈: ["vertical_push", "squat"],
  下背: ["hinge"],
  腰: ["hinge"],
  手腕: ["horizontal_push"],
  肘: ["horizontal_push", "horizontal_pull"],
  其他: [],
};

const PATTERNS: MovementPattern[] = [
  "squat",
  "hinge",
  "lunge",
  "horizontal_push",
  "horizontal_pull",
  "vertical_push",
  "vertical_pull",
  "carry",
  "rotation",
];

export function Onboarding({
  initial,
  onDone,
}: {
  initial: UserProfile;
  onDone: (p: UserProfile, loadDemo: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<UserProfile>(initial);
  const [areas, setAreas] = useState<string[]>(initial.limitations.areas ?? []);
  const [loadDemo, setLoadDemo] = useState(true);

  const total = 6;
  const set = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => setP({ ...p, [k]: v });

  function toggleArea(a: string) {
    const next = areas.includes(a) ? areas.filter((x) => x !== a) : [...areas, a];
    setAreas(next);
    const patterns = new Set(next.flatMap((x) => AREA_TO_PATTERNS[x] ?? []));
    setP({ ...p, limitations: { ...p.limitations, areas: next, avoidPatterns: [...patterns] } });
  }

  return (
    <div className="fade-in fixed inset-0 z-[80] overflow-y-auto bg-paper">
      <div className="mx-auto w-full max-w-[560px] px-5 pb-10 pt-8">
        <div className="mb-1 text-[12px] text-ink-faint">
          第 {step + 1} / {total} 步
        </div>
        <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-paper-line">
          <div className="h-full bg-moss-500 transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>

        {step === 0 && (
          <Step title="你想达成什么？" hint="决定计划的组次、休息与热量目标。">
            <div className="space-y-2">
              {GOALS.map((g) => (
                <button
                  key={g}
                  onClick={() => set("goal", g)}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    p.goal === g ? "border-moss-600 bg-moss-50" : "border-paper-line bg-paper-card"
                  }`}
                >
                  <div className="text-[15px] font-medium">{GOAL_LABEL[g]}</div>
                  <div className="text-[12px] text-ink-faint">{GOAL_HINT[g]}</div>
                </button>
              ))}
            </div>
          </Step>
        )}

        {step === 1 && (
          <Step title="训练经验" hint="影响动作难度与起始训练量。">
            <div className="space-y-2">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  onClick={() => set("experience", l)}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    p.experience === l ? "border-moss-600 bg-moss-50" : "border-paper-line bg-paper-card"
                  }`}
                >
                  <div className="text-[15px] font-medium">{LEVEL_LABEL[l]}</div>
                  <div className="text-[12px] text-ink-faint">{LEVEL_HINT[l]}</div>
                </button>
              ))}
            </div>
          </Step>
        )}

        {step === 2 && (
          <Step title="每周能练几次，一次多久？" hint="用于安排分化与每次的训练量，之后可以随时改。">
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-[13px] text-ink-soft">每周训练天数</div>
                <Segmented
                  value={String(p.daysPerWeek)}
                  onChange={(v) => set("daysPerWeek", Number(v))}
                  options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}` }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[14px]">单次时长（分钟）</span>
                <Stepper value={p.sessionMinutes} onChange={(v) => set("sessionMinutes", v)} step={5} min={15} max={120} unit="分" />
              </div>
            </div>
          </Step>
        )}

        {step === 3 && (
          <Step title="基础身体数据" hint="用于估算热量与蛋白质目标。性别可留空，不填也能用。">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[14px]">身高（cm）</span>
                <Stepper value={p.heightCm} onChange={(v) => set("heightCm", v)} step={1} min={120} max={220} unit="cm" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[14px]">体重（kg）</span>
                <Stepper value={p.weightKg} onChange={(v) => set("weightKg", v)} step={0.5} min={30} max={250} unit="kg" />
              </div>
              <div>
                <div className="mb-1.5 text-[13px] text-ink-soft">生理性别（用于热量公式，可留空）</div>
                <Segmented
                  value={p.sex}
                  onChange={(v) => set("sex", v as Sex)}
                  options={[
                    { value: "female", label: "女" },
                    { value: "male", label: "男" },
                    { value: "unspecified", label: "不提供" },
                  ]}
                />
              </div>
            </div>
          </Step>
        )}

        {step === 4 && (
          <Step
            title="有需要照顾的身体部位吗？"
            hint="这一项完全可以跳过。填写后，生成计划时会避开相关动作模式——你也可以之后再改。"
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {AREA_OPTIONS.map((a) => (
                  <Chip key={a} active={areas.includes(a)} onClick={() => toggleArea(a)}>
                    {a}
                  </Chip>
                ))}
              </div>
              {areas.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[13px] text-ink-soft">
                    将避开这些动作模式（可自行增减）
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PATTERNS.map((pt) => (
                      <Chip
                        key={pt}
                        active={p.limitations.avoidPatterns.includes(pt)}
                        onClick={() =>
                          setP({
                            ...p,
                            limitations: {
                              ...p.limitations,
                              avoidPatterns: p.limitations.avoidPatterns.includes(pt)
                                ? p.limitations.avoidPatterns.filter((x) => x !== pt)
                                : [...p.limitations.avoidPatterns, pt],
                            },
                          })
                        }
                      >
                        {MOVEMENT_PATTERN_LABEL[pt]}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              <button
                className="btn-ghost w-full !py-2 text-[13px] underline"
                onClick={() => {
                  setAreas([]);
                  setP({ ...p, limitations: { areas: [], avoidPatterns: [], skipped: true } });
                }}
              >
                我不提供这些信息（跳过）
              </button>
            </div>
          </Step>
        )}

        {step === 5 && (
          <Step title="准备好了" hint="最后一步：要不要载入一份演示数据？">
            <div className="space-y-3">
              <button
                onClick={() => setLoadDemo(true)}
                className={`w-full rounded-xl border px-4 py-3 text-left ${
                  loadDemo ? "border-moss-600 bg-moss-50" : "border-paper-line bg-paper-card"
                }`}
              >
                <div className="text-[15px] font-medium">载入演示数据</div>
                <div className="text-[12px] text-ink-faint">
                  包含示例场馆、示例计划与约 4 周的训练/饮食/体重记录，全部带「演示」标记，随时可一键清除。
                </div>
              </button>
              <button
                onClick={() => setLoadDemo(false)}
                className={`w-full rounded-xl border px-4 py-3 text-left ${
                  !loadDemo ? "border-moss-600 bg-moss-50" : "border-paper-line bg-paper-card"
                }`}
              >
                <div className="text-[15px] font-medium">从零开始</div>
                <div className="text-[12px] text-ink-faint">只保留你的档案与内置食物库，记录清清白白。</div>
              </button>
              <div className="rounded-xl border border-paper-line bg-paper px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-soft">
                <span className="font-medium text-ink">关于数据：</span>
                所有记录保存在这台设备的浏览器（IndexedDB）里，不会自动上传。
                IndexedDB 不等于云备份 —— 清理浏览器数据、换设备或换浏览器都会丢失，请定期用「我的 → 导出数据」备份。
              </div>
            </div>
          </Step>
        )}

        <div className="mt-6 flex gap-2">
          {step > 0 && (
            <button className="btn-secondary flex-1" onClick={() => setStep(step - 1)}>
              上一步
            </button>
          )}
          <button
            className="btn-primary flex-1"
            onClick={() => {
              if (step < total - 1) {
                setStep(step + 1);
              } else {
                onDone(
                  {
                    ...p,
                    onboarded: true,
                    limitations: { ...p.limitations, skipped: p.limitations.areas.length === 0 },
                  },
                  loadDemo,
                );
              }
            }}
          >
            {step < total - 1 ? "下一步" : "完成"}
          </button>
        </div>
      </div>
    </div>
  );
}

const GOAL_HINT: Record<TrainingGoal, string> = {
  fat_loss: "温和热量赤字，较高次数较短间歇，保留力量训练",
  muscle_gain: "小幅热量盈余，8-12 次为主的肌肥大区间",
  strength: "低次数长间歇，优先复合动作与神经适应",
  recomp: "小幅赤字 + 高蛋白，兼顾脂肪下降与肌肉维持",
  health: "均衡安排，重视动作质量与可持续性",
};

const LEVEL_HINT: Record<ExperienceLevel, string> = {
  beginner: "训练不足 6 个月，或刚开始系统训练",
  intermediate: "能稳定完成基础复合动作 6 个月以上",
  advanced: "训练 2 年以上，了解周期化与 RPE",
};

function Step({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="mb-1 text-[20px] font-semibold">{title}</h1>
      {hint && <p className="mb-4 text-[13px] leading-relaxed text-ink-faint">{hint}</p>}
      {children}
    </div>
  );
}
