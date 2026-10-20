"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { PlanEditor } from "@/components/PlanEditor";
import { ExerciseDetail, ExerciseLibrary, ExerciseRow } from "@/components/ExerciseViews";
import { MuscleList, MuscleMap } from "@/components/MuscleMap";
import { WorkoutRunner } from "@/components/WorkoutRunner";
import { Chip, Confirm, Empty, Loading, Modal, Segmented, Sheet, toast } from "@/components/ui";
import { GOAL_LABEL, LEVEL_LABEL, generatePlan } from "@/lib/plan/engine";
import { suggestForExercise } from "@/lib/progression";
import { clearSessionUi, newSession } from "@/lib/session";
import { EXERCISES, EXERCISE_MAP } from "@/lib/seed/exercises";
import { MUSCLE_MAP, muscleName } from "@/lib/seed/muscles";
import type {
  PlanDay,
  PlanExercise,
  PlanGenerationInput,
  ProgressionSuggestion,
  WorkoutSession,
} from "@/lib/types";
import { cx, todayISO, uid, weekdayCN, weekdayOf } from "@/lib/utils";

export default function TrainPage() {
  const router = useRouter();
  const {
    ready,
    profile,
    venues,
    activeVenue,
    activePlan,
    sessions,
    savePlan,
    saveSession,
    setDefaultVenue,
  } = useApp();
  const [tab, setTab] = useState<"plan" | "library" | "map">("plan");
  const [side, setSide] = useState<"front" | "back">("front");
  const [selMuscle, setSelMuscle] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  /** 动作详情（沿用 ExerciseViews 已导出的详情弹层，不重复造 UI） */
  const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);
  const [running, setRunning] = useState<WorkoutSession | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  /** 已有未结束的训练、且与要开始的训练日不同：先让用户决定继续 / 放弃 */
  const [sessionConflict, setSessionConflict] = useState<{ day: PlanDay; existing: WorkoutSession } | null>(null);
  const startingRef = useRef(false);

  const today = todayISO();
  const wd = weekdayOf(today);
  const todayDay = activePlan?.days.find((d) => d.weekday === wd);
  const inProgress = useMemo(() => sessions.find((s) => s.status === "in_progress"), [sessions]);
  const nextDay = useMemo(() => {
    if (!activePlan?.days.length) return undefined;
    const sorted = [...activePlan.days].sort((a, b) => a.weekday - b.weekday);
    return sorted.find((d) => d.weekday > wd) ?? sorted[0];
  }, [activePlan, wd]);

  const suggestions = useMemo(() => {
    if (!activePlan) return [];
    const items = activePlan.days.flatMap((d) => d.items);
    const seen = new Set<string>();
    const out: ProgressionSuggestion[] = [];
    for (const it of items) {
      if (seen.has(it.exerciseId)) continue;
      seen.add(it.exerciseId);
      const s = suggestForExercise(it.exerciseId, it, sessions);
      if (s.kind !== "hold") out.push(s);
    }
    return out;
  }, [activePlan, sessions]);

  /** 训练日按钮将要开始的那一天（与 startSession 的兜底顺序一致） */
  const primaryDay = todayDay ?? nextDay;
  /** 该训练日正好有一场未结束的训练 → 按钮改为「继续训练」 */
  const primaryIsResume = !!inProgress && !!primaryDay && inProgress.planDayId === primaryDay.id;

  if (!ready) return <Loading />;

  if (!profile.onboarded) {
    return (
      <div className="p-4">
        <Empty
          icon="📋"
          title="先完成个人档案"
          hint="档案里的目标、经验、时间、器械和身体限制，决定了计划怎么排。"
          action={
            // 建档向导挂在「今日」页（未 onboarded 时自动弹出），/me?setup=1 是无人消费的死参数
            <button className="btn-primary" onClick={() => router.push("/")}>
              去建档
            </button>
          }
        />
      </div>
    );
  }

  /**
   * 开始 / 恢复训练。
   * 关键约束：绝不静默新建第二场 in_progress 会话（否则会留下永不结束的孤儿记录，
   * 还会污染完成率统计）。
   * - 已有进行中会话且是同一训练日 → 直接恢复它；
   * - 已有进行中会话但训练日不同 → 弹窗让用户选择「继续旧的」或「放弃旧的、开始新的」。
   */
  async function startSession(dayId?: string) {
    if (!activePlan || startingRef.current) return;
    const day = activePlan.days.find((d) => d.id === dayId) ?? todayDay ?? nextDay ?? activePlan.days[0];
    if (!day) return;

    if (inProgress) {
      if (inProgress.planDayId === day.id) {
        setRunning(inProgress);
        toast("继续未结束的训练", "info");
        return;
      }
      setSessionConflict({ day, existing: inProgress });
      return;
    }

    await createAndRun(day);
  }

  /** 真正创建并在记录器里打开一场训练；startingRef 保持到本次训练退出，避免连点/返回再点重复建会话 */
  async function createAndRun(day: PlanDay) {
    startingRef.current = true;
    try {
      const s = newSession(day, activeVenue?.id);
      await saveSession(s);
      setRunning(s);
    } catch {
      startingRef.current = false;
      toast("开始训练失败，请重试", "err");
    }
  }

  /** 用户选择放弃旧的未结束会话，再开始新的训练日 */
  async function abandonAndStartNew() {
    const conflicted = sessionConflict;
    if (!conflicted) return;
    setSessionConflict(null);
    // 与 WorkoutRunner 的「结束本次训练」保持同一语义：标记 abandoned + endedAt，保留已记录内容
    await saveSession({
      ...conflicted.existing,
      status: "abandoned",
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await clearSessionUi();
    await createAndRun(conflicted.day);
  }

  async function regenerate() {
    const input: PlanGenerationInput = {
      goal: profile.goal,
      experience: profile.experience,
      daysPerWeek: profile.daysPerWeek,
      sessionMinutes: profile.sessionMinutes,
      availableEquipment: (activeVenue?.equipment ?? []).map((e) => e.category),
      limitationAreas: profile.limitations.areas,
      avoidPatterns: profile.limitations.avoidPatterns,
    };
    const plan = generatePlan(input);
    plan.venueId = activeVenue?.id;
    await savePlan(plan);
    setConfirmRegen(false);
    toast("已按当前场馆与档案重新生成计划", "ok");
  }

  function applySuggestion(s: ProgressionSuggestion) {
    if (!activePlan) return;
    let applied = false;
    const days = activePlan.days.map((d) => ({
      ...d,
      items: d.items.map((it) => {
        if (it.exerciseId !== s.exerciseId || applied) return it;
        applied = true;
        return applyTo(it, s);
      }),
    }));
    savePlan({ ...activePlan, days, updatedAt: new Date().toISOString() });
    toast("已应用调整", "ok");
  }

  return (
    <div className="space-y-3 p-4">
      {/* 场馆 */}
      <div>
        <div className="section-title">
          当前场馆
          <button className="text-[12px] font-normal text-moss-600" onClick={() => router.push("/me#venues")}>
            管理
          </button>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {venues.map((v) => (
            <Chip key={v.id} active={v.id === activeVenue?.id} onClick={() => void setDefaultVenue(v.id)}>
              {v.name}
            </Chip>
          ))}
          {venues.length === 0 && (
            <Chip onClick={() => router.push("/me#venues")}>还没有场馆，去添加</Chip>
          )}
        </div>
      </div>

      {/* 今日训练 */}
      {activePlan && (
        <div className="card">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12.5px] text-ink-faint">
                {weekdayCN(wd)} · 今天
              </div>
              <div className="truncate text-[16px] font-semibold">
                {todayDay ? todayDay.title : "休息日"}
              </div>
              <div className="mt-0.5 text-[12.5px] text-ink-soft">
                {todayDay
                  ? `${todayDay.items.length} 个动作 · 约 ${todayDay.estimatedMinutes} 分钟`
                  : nextDay
                    ? `下一次：${weekdayCN(nextDay.weekday)} ${nextDay.title}`
                    : "计划里还没有训练日"}
              </div>
            </div>
            <button
              className="btn-primary shrink-0"
              onClick={() => void startSession(todayDay?.id ?? nextDay?.id)}
              disabled={!todayDay && !nextDay}
            >
              {primaryIsResume ? "继续训练" : todayDay ? "开始训练" : "练下一次"}
            </button>
          </div>
          {inProgress && (
            <div className="mt-2 rounded-lg border border-clay-500/40 bg-clay-50/50 px-2.5 py-2 text-[12px] leading-relaxed text-clay-600">
              有一节未结束的训练：{inProgress.title} · 开始于{" "}
              {new Date(inProgress.startedAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              。同一训练日会直接恢复它；选择其他训练日时会先问你是否放弃。
            </div>
          )}
          {!todayDay && nextDay && (
            <button
              className="mt-2 w-full rounded-lg border border-paper-line py-2 text-[13px] text-ink-soft"
              onClick={() => void startSession(nextDay.id)}
            >
              今天也想动一动：开始「{nextDay.title}」
            </button>
          )}
        </div>
      )}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "plan", label: "训练计划" },
          { value: "library", label: "动作库" },
          { value: "map", label: "肌肉图谱" },
        ]}
      />

      {tab === "plan" &&
        (activePlan ? (
          <>
            <div className="card-tight">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-medium">{activePlan.name}</span>
                {activePlan.isDemo && <span className="chip border-warn/30 bg-warn/10 !py-0 text-[10px] text-warn">演示</span>}
              </div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-ink-faint">{activePlan.rationale}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip>{GOAL_LABEL[profile.goal]}</Chip>
                <Chip>{LEVEL_LABEL[profile.experience]}</Chip>
                <Chip>每周 {profile.daysPerWeek} 次</Chip>
                <Chip>每次 {profile.sessionMinutes} 分钟</Chip>
              </div>
            </div>

            <PlanEditor plan={activePlan} venue={activeVenue} onSave={(p) => void savePlan(p)} onRegenerate={() => setConfirmRegen(true)} />

            {suggestions.length > 0 && (
              <div className="card-tight">
                <div className="section-title !mb-2">渐进调整建议</div>
                <div className="space-y-2">
                  {suggestions.map((s) => (
                    <div key={s.exerciseId} className="rounded-xl border border-paper-line bg-paper p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[14px] font-medium">{s.exerciseName}</span>
                        <span
                          className={cx(
                            "chip !py-0 text-[10px]",
                            s.kind === "reduce_load"
                              ? "border-warn/30 bg-warn/10 text-warn"
                              : "border-moss-300 bg-moss-50 text-moss-700",
                          )}
                        >
                          {s.kind === "add_weight"
                            ? "建议加重"
                            : s.kind === "add_rep"
                              ? "建议加次/加时"
                              : "建议减量"}
                        </span>
                      </div>
                      <div className="mt-1 text-[12.5px] text-ink-faint">
                        {s.from} <span className="mx-1">→</span> {s.to}
                      </div>
                      <div className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{s.reason}</div>
                      <button
                        className="btn-secondary mt-2 !py-1.5 text-[13px]"
                        onClick={() => applySuggestion(s)}
                      >
                        应用这条调整
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[11.5px] text-ink-faint">
                  所有增加重量或训练量的调整都需要你手动确认，不会自动写入计划。
                </div>
              </div>
            )}
          </>
        ) : (
          <Empty
            icon="🗓"
            title="还没有训练计划"
            hint="根据档案与当前场馆的器械，生成一份可编辑的计划。"
            action={
              <button className="btn-primary" onClick={() => void regenerate()}>
                生成计划
              </button>
            }
          />
        ))}

      {tab === "library" && (
        <>
          <button className="btn-secondary w-full" onClick={() => setLibraryOpen(true)}>
            打开动作库（筛选 / 搜索）
          </button>
          <div className="mt-2 space-y-1">
            <div className="section-title">全部动作 {EXERCISES.length} 个</div>
            <div className="divide-y divide-paper-line border-y border-paper-line">
              {EXERCISES.map((ex) => (
                <ExerciseRow key={ex.id} ex={ex} onOpen={() => setDetailExerciseId(ex.id)} />
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "map" && (
        <div className="space-y-3">
          <Segmented
            value={side}
            onChange={setSide}
            options={[
              { value: "front", label: "正面" },
              { value: "back", label: "背面" },
            ]}
          />
          <div className="card-tight">
            <MuscleMap
              side={side}
              selected={selMuscle ? [selMuscle] : []}
              onToggle={(id) => setSelMuscle(id === selMuscle ? null : id)}
            />
            <div className="mt-1 text-center text-[11.5px] text-ink-faint">
              示意图形状用于快速定位，非解剖学精确插图；点击肌群查看相关动作
            </div>
          </div>
          <div>
            <div className="section-title">按文字选择（与上图等效）</div>
            <MuscleList selected={selMuscle ? [selMuscle] : []} onToggle={(id) => setSelMuscle(id === selMuscle ? null : id)} />
          </div>
          {selMuscle && (
            <div>
              <div className="section-title">
                {muscleName(selMuscle)} · {MUSCLE_MAP[selMuscle]?.function}
              </div>
              <div className="divide-y divide-paper-line border-y border-paper-line">
                {EXERCISES.filter(
                  (e) =>
                    e.primaryMuscles.includes(selMuscle) || e.secondaryMuscles.includes(selMuscle),
                ).map((ex) => (
                  <ExerciseRow key={ex.id} ex={ex} onOpen={() => setDetailExerciseId(ex.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ExerciseLibrary open={libraryOpen} onClose={() => setLibraryOpen(false)} />

      {/* 动作详情：接上「全部动作」与肌群列表里原本空实现的 onOpen */}
      <ExerciseDetail
        exerciseId={detailExerciseId}
        open={!!detailExerciseId}
        onClose={() => setDetailExerciseId(null)}
      />

      <Confirm
        open={confirmRegen}
        title="重新生成计划？"
        desc="当前计划（含你的手动调整）会被覆盖，动作与组次将按档案和当前场馆重新计算。"
        confirmText="重新生成"
        onCancel={() => setConfirmRegen(false)}
        onConfirm={() => void regenerate()}
      />

      {/* 已有未结束的训练、但用户要开始另一个训练日：不静默覆盖，也不静默新建 */}
      <Modal
        open={!!sessionConflict}
        onClose={() => setSessionConflict(null)}
        title="还有一节未结束的训练"
        footer={
          <div className="space-y-2">
            <button
              className="btn-primary w-full"
              onClick={() => {
                const existing = sessionConflict?.existing;
                if (!existing) return;
                setSessionConflict(null);
                setRunning(existing);
              }}
            >
              继续「{sessionConflict?.existing.title}」
            </button>
            <button className="btn-secondary w-full" onClick={() => void abandonAndStartNew()}>
              放弃它，开始「{sessionConflict?.day.title}」
            </button>
            <button className="btn-ghost w-full" onClick={() => setSessionConflict(null)}>
              取消
            </button>
          </div>
        }
      >
        <div className="text-[14px] leading-relaxed text-ink-soft">
          「{sessionConflict?.existing.title}」还没有结束
          {sessionConflict
            ? `（开始于 ${new Date(sessionConflict.existing.startedAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}）`
            : ""}
          。继续它会保留已记录的内容；放弃会按「结束本次训练」处理（保留记录，未完成的组不算完成），
          然后开始「{sessionConflict?.day.title}」。
        </div>
      </Modal>

      {running && (
        <WorkoutRunner
          session={running}
          onExit={() => {
            startingRef.current = false;
            setRunning(null);
          }}
        />
      )}
    </div>
  );
}

/** 把建议落到计划的某个动作上 */
function applyTo(it: PlanExercise, s: ProgressionSuggestion): PlanExercise {
  const s0 = it.sets[0];
  if (s.kind === "reduce_load") {
    const sets = it.sets.length > 2 ? it.sets.slice(0, -1) : it.sets;
    return { ...it, sets: sets.map((x) => ({ ...x, weightKg: x.weightKg ? Math.round(x.weightKg * 0.95 * 2) / 2 : x.weightKg })) };
  }
  if (s.kind === "add_rep") {
    if (s0?.durationSec) {
      return { ...it, sets: it.sets.map((x) => ({ ...x, durationSec: (x.durationSec ?? 30) + 10 })) };
    }
    return { ...it, sets: it.sets.map((x) => ({ ...x, repsMax: (x.repsMax ?? 10) + 1 })) };
  }
  if (s.kind === "add_weight") {
    // 生成的计划组不带 weightKg，优先用建议里给出的结构化目标重量；
    // 旧数据/旧建议没有该字段时才回退到按 2.5% 现算。
    const next =
      s.targetWeightKg ??
      (s0?.weightKg
        ? s0.weightKg < 20
          ? Math.round(s0.weightKg * 1.025 * 2) / 2
          : Math.round((s0.weightKg * 1.025) / 2.5) * 2.5
        : undefined);
    if (next !== undefined) {
      return { ...it, sets: it.sets.map((x) => ({ ...x, weightKg: next })) };
    }
  }
  return it;
}
