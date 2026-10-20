"use client";

import { useMemo, useState } from "react";
import { ExerciseFigure } from "./ExerciseFigure";
import { DIFFICULTY_LABEL, ExerciseLibrary } from "./ExerciseViews";
import { Chip, Modal, Sheet, Stepper, toast } from "./ui";
import { EQUIPMENT_LABEL, MOVEMENT_PATTERN_LABEL, equipmentOf, estimateDayMinutes, findSubstitutes, slimForTime } from "@/lib/plan/engine";
import { EXERCISE_MAP } from "@/lib/seed/exercises";
import { muscleName } from "@/lib/seed/muscles";
import type { EquipmentCategory, PlanDay, PlanExercise, Venue, WorkoutPlan } from "@/lib/types";
import { cx, uid } from "@/lib/utils";
import { useApp } from "./AppProvider";

export function PlanEditor({
  plan,
  venue,
  onSave,
  onRegenerate,
}: {
  plan: WorkoutPlan;
  venue?: Venue;
  onSave: (p: WorkoutPlan) => void;
  onRegenerate: () => void;
}) {
  const { profile } = useApp();
  const [dayIdx, setDayIdx] = useState(0);
  const [occupied, setOccupied] = useState<EquipmentCategory[]>([]);
  const [editing, setEditing] = useState<PlanExercise | null>(null);
  const [swapping, setSwapping] = useState<PlanExercise | null>(null);
  const [adding, setAdding] = useState(false);

  // 重新生成计划后训练日数量可能变少：把索引收敛到有效范围，
  // 否则会落到「没有训练日」分支，连训练日切换按钮都不再渲染。
  const activeDayIdx = plan.days.length ? Math.min(dayIdx, plan.days.length - 1) : 0;
  const day: PlanDay | undefined = plan.days[activeDayIdx];
  const available = useMemo(
    () => (venue?.equipment ?? []).map((e) => e.category),
    [venue],
  );

  function patchDay(mut: (d: PlanDay) => PlanDay) {
    if (!day) return;
    const next = mut(day);
    next.estimatedMinutes = estimateDayMinutes(next.items);
    onSave({
      ...plan,
      days: plan.days.map((d, i) => (i === activeDayIdx ? next : d)),
      updatedAt: new Date().toISOString(),
    });
  }

  if (!day) {
    return <div className="card text-[14px] text-ink-soft">这份计划还没有训练日。</div>;
  }

  return (
    <div className="space-y-3">
      {/* 训练日切换 */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {plan.days.map((d, i) => (
          <button
            key={d.id}
            onClick={() => setDayIdx(i)}
            className={cx(
              "shrink-0 rounded-xl border px-3 py-2 text-left",
              i === activeDayIdx ? "border-moss-600 bg-moss-600 text-white" : "border-paper-line bg-paper-card",
            )}
          >
            <div className="text-[13px] font-medium">{d.title}</div>
            <div className={cx("text-[11px]", i === activeDayIdx ? "text-white/80" : "text-ink-faint")}>
              {d.items.length} 个动作 · 约 {d.estimatedMinutes} 分钟
            </div>
          </button>
        ))}
      </div>

      {/* 器械占用 */}
      {available.length > 0 && (
        <div className="card-tight">
          <div className="section-title !mb-1.5">
            器械当前被占用？<span className="font-normal text-ink-faint">（替换时会避开）</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set(available)].map((c) => (
              <Chip
                key={c}
                active={occupied.includes(c)}
                onClick={() =>
                  setOccupied(occupied.includes(c) ? occupied.filter((x) => x !== c) : [...occupied, c])
                }
              >
                {EQUIPMENT_LABEL[c]}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* 时间不足 */}
      <div className="card-tight flex items-center justify-between gap-2">
        <div className="text-[13px] text-ink-soft">
          时间不够？
          <span className="ml-1 text-ink-faint">当前约 {day.estimatedMinutes} 分钟</span>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {[20, 30, 45].map((m) => (
            <button
              key={m}
              className="btn-secondary !px-2.5 !py-1 text-[12px]"
              onClick={() => {
                const slim = slimForTime(day, m);
                patchDay(() => slim);
                toast(`已精简到约 ${slim.estimatedMinutes} 分钟`, "ok");
              }}
            >
              {m} 分钟
            </button>
          ))}
        </div>
      </div>

      {/* 动作列表 */}
      <div className="space-y-2">
        {day.items.length === 0 && (
          <div className="rounded-xl2 border border-dashed border-paper-line py-8 text-center text-[13px] text-ink-faint">
            这一天还没有动作，点下方「添加动作」。
          </div>
        )}
        {day.items.map((item, i) => {
          const ex = EXERCISE_MAP[item.exerciseId];
          if (!ex) return null;
          const s0 = item.sets[0];
          const exEquipment = equipmentOf(ex);
          const blocked = exEquipment.some((e) => occupied.includes(e));
          return (
            <div key={item.id} className={cx("card-tight", blocked && "border-clay-500/50 bg-clay-50/40")}>
              <div className="flex items-start gap-3">
                <div className="h-14 w-12 shrink-0 rounded-lg bg-paper">
                  <ExerciseFigure pattern={ex.movementPattern} className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14.5px] font-medium">{ex.name}</span>
                    <span className="chip !py-0 text-[10px]">{DIFFICULTY_LABEL[ex.difficulty]}</span>
                    {blocked && <span className="chip border-clay-500/40 bg-clay-100 !py-0 text-[10px] text-clay-600">器械被占用</span>}
                    {item.locked && <span className="chip !py-0 text-[10px]">已锁定</span>}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink-faint">
                    {ex.primaryMuscles.map(muscleName).join("、")} ·{" "}
                    {exEquipment.length ? exEquipment.map((e) => EQUIPMENT_LABEL[e]).join("/") : "徒手"}
                  </div>
                  <div className="mt-1 text-[12.5px] text-ink-soft">
                    {item.sets.length} 组 ×{" "}
                    {s0?.durationSec ? `${s0.durationSec} 秒` : `${s0?.repsMin}-${s0?.repsMax} 次`}
                    {s0?.weightKg ? ` @ ${s0.weightKg}kg` : ""} · 休息 {s0?.restSec}s
                  </div>
                  <div className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">{item.rationale}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-dashed border-paper-line pt-2">
                <button className="btn-ghost !px-2 !py-1 text-[12px]" onClick={() => setEditing(item)}>
                  组次
                </button>
                <button className="btn-ghost !px-2 !py-1 text-[12px]" onClick={() => setSwapping(item)}>
                  替换
                </button>
                <button
                  className="btn-ghost !px-2 !py-1 text-[12px]"
                  onClick={() =>
                    patchDay((d) => ({
                      ...d,
                      items: d.items.map((x) => (x.id === item.id ? { ...x, locked: !x.locked } : x)),
                    }))
                  }
                >
                  {item.locked ? "解锁" : "锁定"}
                </button>
                <button
                  className="btn-ghost !px-2 !py-1 text-[12px]"
                  disabled={i === 0}
                  onClick={() =>
                    patchDay((d) => {
                      const arr = [...d.items];
                      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                      return { ...d, items: arr };
                    })
                  }
                >
                  上移
                </button>
                <button
                  className="btn-ghost !px-2 !py-1 text-[12px]"
                  disabled={i === day.items.length - 1}
                  onClick={() =>
                    patchDay((d) => {
                      const arr = [...d.items];
                      [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
                      return { ...d, items: arr };
                    })
                  }
                >
                  下移
                </button>
                <button
                  className="btn-ghost !px-2 !py-1 text-[12px] text-alert"
                  onClick={() =>
                    patchDay((d) => ({
                      ...d,
                      items: d.items.filter((x) => x.id !== item.id),
                    }))
                  }
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={() => setAdding(true)}>
          + 添加动作
        </button>
        <button className="btn-secondary flex-1" onClick={onRegenerate}>
          重新生成计划
        </button>
      </div>

      {/* 编辑组次 */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="编辑组次"
        footer={
          <button
            className="btn-primary w-full"
            onClick={() => {
              setEditing(null);
              toast("已更新", "ok");
            }}
          >
            完成
          </button>
        }
      >
        {editing && (
          <SetEditor
            item={editing}
            onChange={(next) => {
              setEditing(next);
              patchDay((d) => ({
                ...d,
                items: d.items.map((x) => (x.id === next.id ? next : x)),
              }));
            }}
          />
        )}
      </Modal>

      {/* 替换 */}
      <SwapPlanSheet
        open={!!swapping}
        onClose={() => setSwapping(null)}
        currentId={swapping?.exerciseId ?? ""}
        exclude={day.items.map((i) => i.exerciseId)}
        occupied={occupied}
        available={available}
        onPick={(id, fromId) => {
          if (!swapping) return;
          patchDay((d) => ({
            ...d,
            items: d.items.map((x) =>
              x.id === swapping.id ? { ...x, exerciseId: id, swappedFrom: fromId } : x,
            ),
          }));
          setSwapping(null);
          toast("已替换", "ok");
        }}
      />

      <ExerciseLibrary
        open={adding}
        onClose={() => setAdding(false)}
        availableEquipment={available}
        pickLabel="加入"
        onPick={(id) => {
          const ex = EXERCISE_MAP[id];
          if (!ex) return;
          const isCore = ex.movementPattern === "core";
          const item: PlanExercise = {
            id: uid("pe"),
            exerciseId: id,
            sets: Array.from({ length: 3 }, () => ({
              repsMin: isCore ? 0 : 10,
              repsMax: isCore ? 0 : 12,
              durationSec: isCore ? 30 : undefined,
              restSec: 75,
            })),
            rationale: "手动添加：已按默认 3 组 × 10-12 次安排，可自行调整。",
          };
          patchDay((d) => ({ ...d, items: [...d.items, item] }));
          setAdding(false);
          toast("已加入计划", "ok");
        }}
      />
    </div>
  );
}

function SetEditor({
  item,
  onChange,
}: {
  item: PlanExercise;
  onChange: (i: PlanExercise) => void;
}) {
  const s0 = item.sets[0] ?? { repsMin: 10, repsMax: 12, restSec: 75 };
  const timed = !!s0.durationSec;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[14px]">组数</span>
        <Stepper
          value={item.sets.length}
          min={1}
          max={10}
          onChange={(v) => {
            const sets = Array.from({ length: v }, (_, i) => item.sets[i] ?? { ...s0 });
            onChange({ ...item, sets });
          }}
        />
      </div>
      {timed ? (
        <div className="flex items-center justify-between">
          <span className="text-[14px]">每组时长（秒）</span>
          <Stepper
            value={s0.durationSec ?? 30}
            step={5}
            min={5}
            max={600}
            onChange={(v) => onChange({ ...item, sets: item.sets.map((s) => ({ ...s, durationSec: v })) })}
          />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[14px]">次数下限</span>
            <Stepper
              value={s0.repsMin}
              min={1}
              max={50}
              onChange={(v) =>
                onChange({
                  ...item,
                  sets: item.sets.map((s) => ({ ...s, repsMin: v, repsMax: Math.max(v, s.repsMax) })),
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[14px]">次数上限</span>
            <Stepper
              value={s0.repsMax}
              min={1}
              max={50}
              onChange={(v) =>
                onChange({
                  ...item,
                  sets: item.sets.map((s) => ({ ...s, repsMax: v, repsMin: Math.min(v, s.repsMin) })),
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[14px]">目标重量（kg，可留空）</span>
            <Stepper
              value={s0.weightKg ?? 0}
              step={2.5}
              min={0}
              max={300}
              onChange={(v) =>
                onChange({ ...item, sets: item.sets.map((s) => ({ ...s, weightKg: v || undefined })) })
              }
            />
          </div>
        </>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[14px]">组间休息（秒）</span>
        <Stepper
          value={s0.restSec}
          step={15}
          min={0}
          max={300}
          onChange={(v) => onChange({ ...item, sets: item.sets.map((s) => ({ ...s, restSec: v })) })}
        />
      </div>
    </div>
  );
}

function SwapPlanSheet({
  open,
  onClose,
  currentId,
  exclude,
  occupied,
  available,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  currentId: string;
  exclude: string[];
  occupied: EquipmentCategory[];
  available: EquipmentCategory[];
  onPick: (id: string, fromId: string) => void;
}) {
  const { profile } = useApp();
  const options = useMemo(
    () =>
      findSubstitutes(currentId, {
        available: available.length ? available.filter((a) => !occupied.includes(a)) : ["bodyweight"],
        avoidPatterns: profile.limitations.avoidPatterns,
        level: profile.experience,
        exclude,
        limit: 12,
      }),
    [currentId, available, occupied, profile, exclude],
  );
  return (
    <Sheet open={open} onClose={onClose} title="替换动作">
      <div className="mb-2 text-[12.5px] text-ink-faint">
        排序依据：动作模式一致 → 目标肌群重合 → 器械可用（已排除被占用）→ 难度贴近。
      </div>
      {options.length === 0 && (
        <div className="py-6 text-center text-[13px] text-ink-faint">没有合适的替代，试试取消「器械被占用」的勾选。</div>
      )}
      <div className="divide-y divide-paper-line">
        {options.map(({ exercise, reasons }) => (
          <button
            key={exercise.id}
            onClick={() => onPick(exercise.id, currentId)}
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
    </Sheet>
  );
}
