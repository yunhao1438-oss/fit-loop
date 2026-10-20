"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExerciseFigure } from "./ExerciseFigure";
import { Confirm, Modal, Stepper, toast } from "./ui";
import { DIFFICULTY_LABEL } from "./ExerciseViews";
import { useApp } from "./AppProvider";
import { EQUIPMENT_LABEL, MOVEMENT_PATTERN_LABEL, equipmentOf, findSubstitutes } from "@/lib/plan/engine";
import { EXERCISE_MAP } from "@/lib/seed/exercises";
import { muscleName } from "@/lib/seed/muscles";
import { lastPerformanceOf, loadSessionUi, saveSessionUi, clearSessionUi, isOnline } from "@/lib/session";
import type { PlannedSet, SetLog, WorkoutSession } from "@/lib/types";
import { cx, formatDuration } from "@/lib/utils";

type SaveState = "saved" | "saving" | "error";

export function WorkoutRunner({
  session: initial,
  onExit,
}: {
  session: WorkoutSession;
  onExit: () => void;
}) {
  const { sessions, saveSession, activePlan } = useApp();
  const [session, setSession] = useState<WorkoutSession>(initial);
  /** 始终指向最新 session，避免在事件回调里读到渲染前的旧 session */
  const sessionRef = useRef<WorkoutSession>(initial);
  /** 当前动作 / 组的位置，persist 时读取它，保证「完成一组后立即刷新」也能恢复到正确位置 */
  const posRef = useRef({ exIdx: 0, setIdx: 0 });
  /** 休息计时状态（时间戳 / 总时长 / 暂停剩余毫秒），persist 时读取它 */
  const restRef = useRef<{ endsAt: number | null; total: number; paused: number | null }>({
    endsAt: null,
    total: 0,
    paused: null,
  });
  const [exIdx, setExIdx] = useState(0);
  const [setIdx, setSetIdx] = useState(0);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [pausedMs, setPausedMs] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [save, setSave] = useState<SaveState>("saved");
  const [showRef, setShowRef] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [restored, setRestored] = useState(false);
  const [online, setOnline] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 所有组都已有结论（done / skipped）：刷新后应回到总结页，而不是停在最后一组 */
  const allSetsSettled =
    initial.logs.length > 0 &&
    initial.logs.every((l) => l.sets.length > 0 && l.sets.every((x) => x.status !== "planned"));
  const [stage, setStage] = useState<"warmup" | "workout" | "summary">(
    allSetsSettled
      ? "summary"
      : initial.warmups.some((w) => !w.done)
        ? "warmup"
        : "workout",
  );

  /* ----------------------------- 恢复上次进度 ----------------------------- */
  useEffect(() => {
    let alive = true;
    let hide: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const ui = await loadSessionUi();
      if (!alive) return;
      if (ui && ui.sessionId === initial.id) {
        const ex = ui.exerciseIndex ?? 0;
        const st = ui.setIndex ?? 0;
        setExIdx(ex);
        setSetIdx(st);
        posRef.current = { exIdx: ex, setIdx: st };
        if (ui.restEndsAt && ui.restEndsAt > Date.now()) {
          restRef.current = { endsAt: ui.restEndsAt, total: ui.restTotalSec ?? 0, paused: null };
          setRestEndsAt(ui.restEndsAt);
          setRestTotal(ui.restTotalSec ?? 0);
        }
        if (ui.pausedRemainingMs != null) {
          restRef.current = { endsAt: null, total: ui.restTotalSec ?? 0, paused: ui.pausedRemainingMs };
          setPausedMs(ui.pausedRemainingMs);
        }
        setRestored(true);
        hide = setTimeout(() => setRestored(false), 2600);
      }
    })();
    return () => {
      alive = false;
      if (hide) clearTimeout(hide);
    };
  }, [initial.id]);

  /* ------------------------------- 计时器 -------------------------------- */
  useEffect(() => {
    if (restEndsAt == null) return;
    const t = setInterval(() => {
      const nowMs = Date.now();
      setNow(nowMs);
      // 计时结束后停止 250ms 轮询，避免后台长期空转（休息结束时不需要继续 tick）
      if (nowMs >= restEndsAt) {
        restRef.current = { ...restRef.current, endsAt: null };
        setRestEndsAt(null);
      }
    }, 250);
    return () => clearInterval(t);
  }, [restEndsAt]);

  /* ------------------------------ 在线状态 ------------------------------- */
  useEffect(() => {
    setOnline(isOnline());
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const restRemainingSec = useMemo(() => {
    if (pausedMs != null) return Math.ceil(pausedMs / 1000);
    if (restEndsAt == null) return 0;
    return Math.max(0, Math.ceil((restEndsAt - now) / 1000));
  }, [pausedMs, restEndsAt, now]);

  /* ------------------------------ 自动保存 ------------------------------- */
  const persist = useCallback(
    (next: WorkoutSession) => {
      setSave("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try {
          // session 内容由调用方给出（已是最新），位置 / 休息状态一律从 ref 读取，
          // 避免在 350ms 防抖窗口内读到旧闭包，把刚完成的组或新位置写回旧值。
          await saveSession(next);
          await saveSessionUi({
            sessionId: next.id,
            exerciseIndex: posRef.current.exIdx,
            setIndex: posRef.current.setIdx,
            restEndsAt: restRef.current.endsAt ?? undefined,
            restTotalSec: restRef.current.total,
            pausedRemainingMs: restRef.current.paused ?? undefined,
            updatedAt: Date.now(),
          });
          setSave("saved");
        } catch {
          setSave("error");
        }
      }, 350);
    },
    [saveSession],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const update = useCallback(
    (mut: (s: WorkoutSession) => WorkoutSession) => {
      const next = mut(sessionRef.current);
      sessionRef.current = next;
      setSession(next);
      persist(next);
    },
    [persist],
  );

  /* ------------------------------ 当前动作 ------------------------------- */
  const log = session.logs[exIdx];
  const ex = log ? EXERCISE_MAP[log.exerciseId] : undefined;
  /** 计划中对应的动作项（用于取目标次数 / 休息时长；缺失时给出保守默认值） */
  const plannedItem = useMemo(() => {
    if (!log?.planItemId) return undefined;
    for (const d of activePlan?.days ?? []) {
      const it = d.items.find((i) => i.id === log.planItemId);
      if (it) return it;
    }
    return undefined;
  }, [activePlan, log]);
  const plannedSet: PlannedSet | undefined =
    plannedItem?.sets[setIdx] ??
    plannedItem?.sets[0] ??
    (log ? { repsMin: 8, repsMax: 12, restSec: 90 } : undefined);
  const lastPerf = useMemo(
    () => (log ? lastPerformanceOf(sessions, log.exerciseId) : undefined),
    [sessions, log],
  );
  /** 传给替换面板的稳定引用：避免倒计时每 250ms 重算一次替换推荐 */
  const logExerciseIds = useMemo(() => session.logs.map((l) => l.exerciseId), [session.logs]);

  const doneSets = session.logs.reduce((n, l) => n + l.sets.filter((s) => s.status === "done").length, 0);
  const totalSets = session.logs.reduce((n, l) => n + l.sets.length, 0);

  function patchSet(patch: Partial<SetLog>) {
    if (!log) return;
    // 只更新当前组的输入值，不在这里把组标记为 done：
    // 调整重量 / 次数 / RPE 只是「填写」，用户点「完成本组」才算完成。
    update((s) => ({
      ...s,
      logs: s.logs.map((l, i) =>
        i === exIdx
          ? { ...l, sets: l.sets.map((x, j) => (j === setIdx ? { ...x, ...patch } : x)) }
          : l,
      ),
    }));
  }

  function completeSet(startRest: boolean) {
    if (!log || !plannedSet) return;
    const timed = !!plannedSet.durationSec;
    // 界面会回退显示「上次重量 / 计划重量」，完成时要把界面上看到的数值记为实际记录
    const fallbackWeight =
      !timed && (ex ? equipmentOf(ex).length : 0) > 0
        ? lastPerf?.sets[0]?.weightKg ?? plannedSet.weightKg
        : undefined;
    update((s) => ({
      ...s,
      logs: s.logs.map((l, i) =>
        i === exIdx
          ? {
              ...l,
              sets: l.sets.map((x, j) =>
                j === setIdx
                  ? {
                      ...x,
                      status: "done" as const,
                      completedAt: new Date().toISOString(),
                      weightKg: timed ? x.weightKg : x.weightKg ?? fallbackWeight,
                      reps: x.reps ?? (timed ? undefined : plannedSet.repsMax),
                      durationSec: timed ? x.durationSec ?? plannedSet.durationSec : undefined,
                    }
                  : x,
              ),
            }
          : l,
      ),
    }));
    if (startRest) startRestTimer(plannedSet.restSec);
    advance();
  }

  function startRestTimer(sec: number) {
    const endsAt = Date.now() + sec * 1000;
    restRef.current = { endsAt, total: sec, paused: null };
    setRestTotal(sec);
    setRestEndsAt(endsAt);
    setPausedMs(null);
    persist(sessionRef.current);
  }

  function advance() {
    if (!log) return;
    if (setIdx + 1 < log.sets.length) {
      const next = setIdx + 1;
      posRef.current = { exIdx, setIdx: next };
      setSetIdx(next);
      persist(sessionRef.current);
    } else if (exIdx + 1 < session.logs.length) {
      const ne = exIdx + 1;
      posRef.current = { exIdx: ne, setIdx: 0 };
      setExIdx(ne);
      setSetIdx(0);
      persist(sessionRef.current);
      toast("进入下一个动作", "ok");
    } else {
      setStage("summary");
      persist(sessionRef.current);
    }
  }

  function skipSet() {
    if (!log) return;
    update((s) => ({
      ...s,
      logs: s.logs.map((l, i) =>
        i === exIdx ? { ...l, sets: l.sets.map((x, j) => (j === setIdx ? { ...x, status: "skipped" as const } : x)) } : l,
      ),
    }));
    advance();
  }

  function skipExercise() {
    if (!log) return;
    update((s) => ({
      ...s,
      logs: s.logs.map((l, i) =>
        i === exIdx ? { ...l, sets: l.sets.map((x) => (x.status === "done" ? x : { ...x, status: "skipped" as const })) } : l,
      ),
    }));
    if (exIdx + 1 < session.logs.length) {
      const ne = exIdx + 1;
      posRef.current = { exIdx: ne, setIdx: 0 };
      setExIdx(ne);
      setSetIdx(0);
      persist(sessionRef.current);
    } else {
      setStage("summary");
      persist(sessionRef.current);
    }
  }

  async function finish(status: "completed" | "abandoned") {
    if (timer.current) clearTimeout(timer.current);
    // 「提前结束训练」也是进总结页，而总结页固定调 finish("completed")。
    // 只要还有 planned 组，就按「未完成」记，否则周报的完成率会被抬高，
    // 也让「放弃/提前结束」与顶部「结束」两条路径的语义不一致。
    const settled =
      sessionRef.current.logs.length > 0 &&
      sessionRef.current.logs.every((l) => l.sets.every((x) => x.status !== "planned"));
    const finalStatus = status === "completed" && !settled ? "abandoned" : status;
    await saveSession({
      ...sessionRef.current,
      status: finalStatus,
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await clearSessionUi();
    toast(
      finalStatus === "completed"
        ? "训练已保存"
        : "已结束本次训练（未完成的组不计入完成）",
      "ok",
    );
    onExit();
  }

  if (stage === "warmup") {
    const doneCount = session.warmups.filter((w) => w.done).length;
    return (
      <RunnerShell
        title="热身"
        subtitle={`${doneCount}/${session.warmups.length} 项完成 · ${session.title}`}
        save={save}
        online={online}
        onClose={() => setConfirmEnd(true)}
      >
        <div className="space-y-2">
          {session.warmups.map((w, i) => (
            <button
              key={w.id}
              onClick={() =>
                update((s) => ({
                  ...s,
                  warmups: s.warmups.map((x, k) => (k === i ? { ...x, done: !x.done } : x)),
                }))
              }
              className={cx(
                "flex w-full items-center gap-3 rounded-xl2 border px-4 py-3.5 text-left",
                w.done ? "border-moss-300 bg-moss-50/70" : "border-paper-line bg-paper-card",
              )}
            >
              <span
                className={cx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px]",
                  w.done ? "border-moss-600 bg-moss-600 text-white" : "border-paper-line text-transparent",
                )}
              >
                ✓
              </span>
              <span className={cx("text-[14.5px]", w.done && "text-ink-faint line-through")}>{w.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => setStage("workout")}>
            跳过热身
          </button>
          <button className="btn-primary flex-1" onClick={() => setStage("workout")}>
            开始训练
          </button>
        </div>
        <Confirm
          open={confirmEnd}
          title="结束本次训练？"
          desc="已记录的内容会保留，未完成的组会标记为未完成。"
          confirmText="结束"
          danger
          onCancel={() => setConfirmEnd(false)}
          onConfirm={() => void finish("abandoned")}
        />
      </RunnerShell>
    );
  }

  if (stage === "summary" || !log || !ex) {
    // 「提前结束训练」也会到这里：还有组没做时不要写「本次训练完成」，
    // 否则文案与保存下来的 abandoned 状态自相矛盾。
    const settledNow =
      session.logs.length > 0 &&
      session.logs.every((l) => l.sets.every((x) => x.status !== "planned"));
    return (
      <RunnerShell
        title={settledNow ? "本次训练完成" : "本次训练（未全部完成）"}
        subtitle={session.title}
        save={save}
        online={online}
        onClose={() => void finish("completed")}
      >
        <div className="space-y-3">
          <div className="card-tight text-center">
            <div className="text-[13px] text-ink-faint">完成组数</div>
            <div className="text-3xl font-semibold tabular-nums text-moss-600">
              {doneSets}
              <span className="text-lg text-ink-faint">/{totalSets}</span>
            </div>
          </div>
          <div className="section-title">整体感觉</div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => update((s) => ({ ...s, overallFeel: v }))}
                className={cx(
                  "flex-1 rounded-xl border py-2.5 text-[14px]",
                  session.overallFeel === v ? "border-moss-600 bg-moss-600 text-white" : "border-paper-line bg-paper-card",
                )}
              >
                {["很吃力", "吃力", "适中", "轻松", "很轻松"][v - 1]}
              </button>
            ))}
          </div>
          <textarea
            className="input min-h-[80px]"
            placeholder="训练笔记（可选）"
            value={session.note ?? ""}
            onChange={(e) => update((s) => ({ ...s, note: e.target.value }))}
          />
          <button className="btn-primary btn-lg" onClick={() => void finish("completed")}>
            保存并结束
          </button>
        </div>
      </RunnerShell>
    );
  }

  /* ------------------------------- 训练主界面 ------------------------------ */
  const curSet = log.sets[setIdx];
  const restSec = plannedSet?.restSec ?? 90;
  const isTimed = !!plannedSet?.durationSec;
  /** 必需器械 + 「任一即可」器械；只读 ex.equipment 会漏掉高脚杯深蹲等动作的负重输入 */
  const exEquipment = equipmentOf(ex);
  const historyHint = lastPerf
    ? `上次 ${lastPerf.date.slice(5)}：${lastPerf.summary}`
    : "暂无上次记录";

  return (
    <RunnerShell
      title={ex.name}
      subtitle={`第 ${exIdx + 1}/${session.logs.length} 个动作 · 第 ${setIdx + 1}/${log.sets.length} 组`}
      save={save}
      online={online}
      onClose={() => setConfirmEnd(true)}
      restored={restored}
    >
      {/* 休息倒计时 */}
      {(restEndsAt != null || pausedMs != null) && restRemainingSec > 0 && (
        <div className="mb-3 rounded-xl2 border border-moss-300 bg-moss-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12.5px] text-moss-700">组间休息</div>
              <div className="text-2xl font-semibold tabular-nums text-moss-700">
                {formatDuration(restRemainingSec)}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-secondary !px-3 !py-1.5 text-[13px]"
                onClick={() => {
                  if (pausedMs != null) {
                    const endsAt = Date.now() + pausedMs;
                    restRef.current = { ...restRef.current, endsAt, paused: null };
                    setRestEndsAt(endsAt);
                    setPausedMs(null);
                  } else {
                    const remaining = Math.max(0, (restEndsAt ?? 0) - Date.now());
                    restRef.current = { ...restRef.current, endsAt: null, paused: remaining };
                    setPausedMs(remaining);
                    setRestEndsAt(null);
                  }
                  persist(sessionRef.current);
                }}
              >
                {pausedMs != null ? "继续" : "暂停"}
              </button>
              <button
                className="btn-ghost !px-3 !py-1.5 text-[13px]"
                onClick={() => {
                  restRef.current = { ...restRef.current, endsAt: null, paused: null };
                  setRestEndsAt(null);
                  setPausedMs(null);
                  persist(sessionRef.current);
                }}
              >
                结束休息
              </button>
            </div>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-moss-100">
            <div
              className="h-full bg-moss-500 transition-all"
              style={{ width: `${restTotal ? (restRemainingSec / restTotal) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* 动作概览 */}
      <div className="card-tight mb-3 flex gap-3">
        <button className="h-20 w-16 shrink-0 rounded-lg bg-paper" onClick={() => setShowRef(true)}>
          <ExerciseFigure pattern={ex.movementPattern} className="h-full w-full" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold">{ex.name}</span>
            <span className="chip !py-0 text-[10px]">{DIFFICULTY_LABEL[ex.difficulty]}</span>
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-faint">
            {ex.primaryMuscles.map(muscleName).join("、")} ·{" "}
            {exEquipment.length ? exEquipment.map((e) => EQUIPMENT_LABEL[e]).join("/") : "徒手"}
          </div>
          <div className="mt-1 text-[12.5px] text-moss-700">{historyHint}</div>
          <button className="mt-1 text-[12.5px] text-ink-faint underline" onClick={() => setShowRef(true)}>
            动作快速回看
          </button>
        </div>
      </div>

      {/* 目标 */}
      <div className="mb-3 rounded-xl border border-paper-line bg-paper px-3 py-2 text-[13px] text-ink-soft">
        目标：
        {isTimed
          ? `${plannedSet?.durationSec} 秒 × ${log.sets.length} 组`
          : `${plannedSet?.repsMin}-${plannedSet?.repsMax} 次 × ${log.sets.length} 组`}
        {plannedSet?.weightKg ? ` @ ${plannedSet.weightKg}kg` : ""} · 组间休息 {restSec}s
      </div>

      {/* 本组记录 */}
      <div className="card mb-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-soft">第 {setIdx + 1} 组</span>
          <div className="flex gap-1">
            {log.sets.map((s, i) => (
              <span
                key={i}
                className={cx(
                  "h-2 w-6 rounded-full",
                  s.status === "done" ? "bg-moss-500" : s.status === "skipped" ? "bg-paper-line" : i === setIdx ? "bg-clay-500" : "bg-paper-line",
                )}
              />
            ))}
          </div>
        </div>

        {isTimed ? (
          <div className="mb-3 flex items-center justify-between">
            <span className="label !mb-0">持续时长（秒）</span>
            <Stepper value={curSet?.durationSec ?? plannedSet?.durationSec ?? 30} onChange={(v) => patchSet({ durationSec: v })} step={5} min={5} max={600} unit="s" />
          </div>
        ) : (
          <div className="space-y-3">
            {exEquipment.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="label !mb-0">重量（kg）</span>
                <div className="flex items-center gap-1.5">
                  <Stepper
                    value={curSet?.weightKg ?? lastPerf?.sets[0]?.weightKg ?? plannedSet?.weightKg ?? 0}
                    onChange={(v) => patchSet({ weightKg: v })}
                    step={2.5}
                    min={0}
                    max={500}
                    unit="kg"
                  />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="label !mb-0">次数</span>
              <Stepper
                value={curSet?.reps ?? lastPerf?.sets[0]?.reps ?? plannedSet?.repsMax ?? 10}
                onChange={(v) => patchSet({ reps: v })}
                step={1}
                min={0}
                max={200}
                unit="次"
              />
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="label">主观难度 RPE（1-10）</div>
          <div className="grid grid-cols-10 gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
              <button
                key={v}
                onClick={() => patchSet({ rpe: v })}
                className={cx(
                  "rounded-lg border py-1.5 text-[12px] tabular-nums",
                  (curSet?.rpe ?? 0) === v
                    ? "border-moss-600 bg-moss-600 text-white"
                    : "border-paper-line bg-paper-card text-ink-soft",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="mt-1 text-[11.5px] text-ink-faint">参考：7 = 还能多做 3 次；9 = 还能多做 1 次；10 = 力竭</div>
        </div>

        <button className="btn-primary btn-lg mt-4" onClick={() => completeSet(true)}>
          完成本组
        </button>
        <div className="mt-2 flex gap-2">
          <button
            className="btn-secondary flex-1"
            onClick={() => {
              startRestTimer(restSec);
            }}
          >
            休息 {restSec}s
          </button>
          <button className="btn-secondary flex-1" onClick={skipSet}>
            跳过本组
          </button>
          <button className="btn-secondary flex-1" onClick={() => setShowSwap(true)}>
            替换
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[13px] text-ink-faint">
        <button onClick={skipExercise} className="underline">
          跳过整个动作
        </button>
        <button onClick={() => setStage("summary")} className="underline">
          提前结束训练
        </button>
      </div>

      {/* 动作回看 */}
      <Modal open={showRef} onClose={() => setShowRef(false)} title={ex.name}>
        <div className="space-y-3">
          <ol className="space-y-1.5">
            {ex.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-ink-soft">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-moss-50 text-[11px] text-moss-700">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-xl bg-moss-50/60 px-3 py-2 text-[13px] text-ink-soft">
            <span className="font-medium text-moss-700">呼吸：</span>
            {ex.breathing}
          </div>
          <div className="text-[13px] text-ink-soft">
            <span className="font-medium">常见错误：</span>
            {ex.commonMistakes.join("；")}
          </div>
          {ex.safetyNote && (
            <div className="rounded-xl border border-warn/25 bg-warn/5 px-3 py-2 text-[13px] text-ink-soft">
              {ex.safetyNote}
            </div>
          )}
        </div>
      </Modal>

      {/* 替换动作 */}
      <SwapSheet
        open={showSwap}
        onClose={() => setShowSwap(false)}
        currentId={log.exerciseId}
        exclude={logExerciseIds}
        onPick={(id) => {
          update((s) => ({
            ...s,
            logs: s.logs.map((l, i) =>
              i === exIdx
                ? {
                    exerciseId: id,
                    planItemId: l.planItemId,
                    swappedFrom: log.exerciseId,
                    sets: l.sets.map((x) => ({ ...x })),
                  }
                : l,
            ),
          }));
          setShowSwap(false);
          toast("已替换动作", "ok");
        }}
      />

      <Confirm
        open={confirmEnd}
        title="结束本次训练？"
        desc="已填写的组会保存，未完成的组标记为未完成，之后可以在记录里继续补。"
        confirmText="结束"
        danger
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() => void finish("abandoned")}
      />
    </RunnerShell>
  );
}

/* --------------------------------- 外壳 ---------------------------------- */

function RunnerShell({
  title,
  subtitle,
  save,
  online,
  onClose,
  restored,
  children,
}: {
  title: string;
  subtitle: string;
  save: SaveState;
  online: boolean;
  onClose: () => void;
  restored?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fade-in fixed inset-0 z-[70] overflow-y-auto bg-paper">
      <div className="mx-auto w-full max-w-[560px] px-4 pb-10 pt-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold">{title}</div>
            <div className="truncate text-[12.5px] text-ink-faint">{subtitle}</div>
          </div>
          <button className="btn-ghost shrink-0 !px-2 text-[13px]" onClick={onClose}>
            结束
          </button>
        </div>
        <div className="mb-3 flex items-center gap-2 text-[11.5px]">
          {restored && <span className="chip border-moss-300 bg-moss-50 text-moss-700">已恢复上次进度</span>}
          <span
            className={cx(
              "chip",
              save === "saved" && "border-moss-300 bg-moss-50 text-moss-700",
              save === "saving" && "text-ink-faint",
              save === "error" && "border-alert/30 bg-alert/5 text-alert",
            )}
          >
            {save === "saved" ? "已保存到本机" : save === "saving" ? "保存中…" : "保存失败，请重试"}
          </span>
          {!online && <span className="chip border-warn/30 bg-warn/10 text-warn">离线 · 记录仍存本机</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------- 替换面板 -------------------------------- */

function SwapSheet({
  open,
  onClose,
  currentId,
  exclude,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  currentId: string;
  exclude: string[];
  onPick: (id: string) => void;
}) {
  const { profile, activeVenue } = useApp();
  const options = useMemo(() => {
    const available = (activeVenue?.equipment ?? []).map((e) => e.category);
    return findSubstitutes(currentId, {
      available: available.length ? available : ["bodyweight"],
      avoidPatterns: profile.limitations.avoidPatterns,
      level: profile.experience,
      exclude: [...exclude, currentId],
      limit: 12,
    });
  }, [currentId, activeVenue, profile, exclude]);

  return (
    <Modal open={open} onClose={onClose} title="替换动作">
      <div className="mb-2 text-[12.5px] text-ink-faint">
        按「动作模式 → 目标肌群 → 器械可用 → 难度」排序，已排除当前场馆没有的器械与你标注的受限模式。
      </div>
      {options.length === 0 && (
        <div className="py-6 text-center text-[13px] text-ink-faint">
          没有找到合适的替代动作，可尝试切换场馆或调整身体限制设置。
        </div>
      )}
      <div className="divide-y divide-paper-line">
        {options.map(({ exercise, reasons }) => (
          <button
            key={exercise.id}
            onClick={() => onPick(exercise.id)}
            className="flex w-full items-center gap-3 py-2.5 text-left"
          >
            <div className="h-14 w-12 shrink-0 rounded-lg border border-paper-line bg-paper">
              <ExerciseFigure pattern={exercise.movementPattern} className="h-full w-full" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-medium">{exercise.name}</div>
              <div className="truncate text-[12px] text-ink-faint">
                {MOVEMENT_PATTERN_LABEL[exercise.movementPattern]} ·{" "}
                {exercise.primaryMuscles.map(muscleName).join("、")}
              </div>
              <div className="truncate text-[11.5px] text-moss-700">{reasons.slice(0, 2).join("；")}</div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
