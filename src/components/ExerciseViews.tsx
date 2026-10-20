"use client";

import { useMemo, useState } from "react";
import { ExerciseFigure } from "./ExerciseFigure";
import { Chip, Empty, Modal, Sheet } from "./ui";
import { EQUIPMENT_LABEL, MOVEMENT_PATTERN_LABEL, equipmentAvailable, equipmentOf } from "@/lib/plan/engine";
import { MUSCLES, REGION_LABEL, muscleName } from "@/lib/seed/muscles";
import { EXERCISES, EXERCISE_MAP } from "@/lib/seed/exercises";
import type { Difficulty, EquipmentCategory, Exercise, MuscleRegion } from "@/lib/types";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  1: "入门",
  2: "初级",
  3: "中级",
  4: "进阶",
  5: "高难",
};

/* ------------------------------- 动作详情 ------------------------------- */

export function ExerciseDetail({
  exerciseId,
  open,
  onClose,
  footer,
}: {
  exerciseId: string | null;
  open: boolean;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const ex = exerciseId ? EXERCISE_MAP[exerciseId] : undefined;
  if (!ex) return null;
  const equipment = equipmentOf(ex);
  return (
    <Modal open={open} onClose={onClose} title={ex.name} footer={footer}>
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="h-28 w-24 shrink-0 rounded-xl border border-paper-line bg-paper">
            <ExerciseFigure pattern={ex.movementPattern} className="h-full w-full p-1" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap gap-1">
              <Chip>{MOVEMENT_PATTERN_LABEL[ex.movementPattern]}</Chip>
              <Chip>{DIFFICULTY_LABEL[ex.difficulty]}</Chip>
              {ex.unilateral && <Chip>单边</Chip>}
            </div>
            <div className="text-[12.5px] text-ink-soft">
              <span className="text-ink-faint">主练：</span>
              {ex.primaryMuscles.map(muscleName).join("、")}
            </div>
            {ex.secondaryMuscles.length > 0 && (
              <div className="text-[12.5px] text-ink-soft">
                <span className="text-ink-faint">辅助：</span>
                {ex.secondaryMuscles.map(muscleName).join("、")}
              </div>
            )}
            <div className="text-[12.5px] text-ink-soft">
              <span className="text-ink-faint">器械：</span>
              {equipment.length ? equipment.map((e) => EQUIPMENT_LABEL[e]).join("、") : "徒手 / 无器械"}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-paper-line bg-paper px-3 py-2 text-[12px] leading-relaxed text-ink-faint">
          图示为<span className="text-ink-soft">本地绘制的示意简图</span>，仅用于说明动作模式与关节位置，不是真人演示，也不代表专业审核。
          {ex.media.kind === "illustration" ? `（${ex.media.note}）` : ""}
        </div>

        <section>
          <div className="section-title">动作步骤</div>
          <ol className="space-y-1.5">
            {ex.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-ink-soft">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-moss-50 text-[11px] font-medium text-moss-700">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="card-tight bg-moss-50/60">
          <div className="mb-1 text-[13px] font-medium text-moss-700">呼吸</div>
          <div className="text-[13.5px] leading-relaxed text-ink-soft">{ex.breathing}</div>
        </section>

        {ex.cues && ex.cues.length > 0 && (
          <section>
            <div className="section-title">要点</div>
            <ul className="space-y-1 text-[13.5px] leading-relaxed text-ink-soft">
              {ex.cues.map((c, i) => (
                <li key={i}>· {c}</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="section-title">常见错误</div>
          <ul className="space-y-1 text-[13.5px] leading-relaxed text-ink-soft">
            {ex.commonMistakes.map((c, i) => (
              <li key={i}>· {c}</li>
            ))}
          </ul>
        </section>

        {ex.safetyNote && (
          <div className="rounded-xl border border-warn/25 bg-warn/5 px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
            <span className="font-medium text-warn">安全提示：</span>
            {ex.safetyNote}
          </div>
        )}

        {ex.substitutions && ex.substitutions.length > 0 && (
          <section>
            <div className="section-title">常用替代动作</div>
            <div className="flex flex-wrap gap-1.5">
              {ex.substitutions.map((id) => (
                <Chip key={id}>{EXERCISE_MAP[id]?.name ?? id}</Chip>
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------- 动作库浏览 ------------------------------ */

const REGIONS: MuscleRegion[] = ["chest", "back", "shoulders", "arms", "core", "glutes", "legs", "cardio"];
const EQUIPS: EquipmentCategory[] = ["bodyweight", "dumbbell", "barbell", "machine", "cable", "band", "kettlebell", "cardio"];
const DIFFS: Difficulty[] = [1, 2, 3, 4, 5];

export function ExerciseLibrary({
  open,
  onClose,
  onPick,
  pickLabel,
  availableEquipment,
  title = "动作库",
}: {
  open: boolean;
  onClose: () => void;
  onPick?: (id: string) => void;
  pickLabel?: string;
  availableEquipment?: EquipmentCategory[];
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [muscles, setMuscles] = useState<string[]>([]);
  const [equips, setEquips] = useState<EquipmentCategory[]>([]);
  const [diffs, setDiffs] = useState<Difficulty[]>([]);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return EXERCISES.filter((ex) => {
      if (kw && !`${ex.name} ${(ex.alias ?? []).join(" ")}`.toLowerCase().includes(kw)) return false;
      if (muscles.length && ![...ex.primaryMuscles, ...ex.secondaryMuscles].some((m) => muscles.includes(m)))
        return false;
      if (equips.length) {
        const eqs = equipmentOf(ex);
        const ok =
          (equips.includes("bodyweight") && eqs.length === 0) ||
          eqs.some((e) => equips.includes(e));
        if (!ok) return false;
      }
      if (diffs.length && !diffs.includes(ex.difficulty)) return false;
      if (onlyAvailable && availableEquipment) {
        if (!equipmentAvailable(ex, availableEquipment)) return false;
      }
      return true;
    });
  }, [q, muscles, equips, diffs, onlyAvailable, availableEquipment]);

  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <Sheet open={open} onClose={onClose} title={title} maxH="92vh">
      <div className="space-y-3">
        <input
          className="input"
          placeholder="搜索动作名称"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {availableEquipment && (
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="h-4 w-4 accent-moss-600"
            />
            只看当前场馆器械可用的动作
          </label>
        )}

        <div>
          <div className="section-title">
            肌群{" "}
            <button className="text-[12px] font-normal text-moss-600" onClick={() => setMuscles([])}>
              清除
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {REGIONS.map((r) => (
              <Chip
                key={r}
                active={muscles.some((m) => MUSCLES.find((x) => x.id === m)?.region === r)}
                onClick={() => {
                  const ids = MUSCLES.filter((m) => m.region === r).map((m) => m.id);
                  const allOn = ids.every((i) => muscles.includes(i));
                  setMuscles(allOn ? muscles.filter((m) => !ids.includes(m)) : [...muscles, ...ids]);
                }}
              >
                {REGION_LABEL[r]}
              </Chip>
            ))}
          </div>
          {muscles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {muscles.map((m) => (
                <Chip key={m} active onClick={() => setMuscles(muscles.filter((x) => x !== m))}>
                  {muscleName(m)} ✕
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="section-title">器械</div>
          <div className="flex flex-wrap gap-1.5">
            {EQUIPS.map((e) => (
              <Chip key={e} active={equips.includes(e)} onClick={() => toggle(equips, e, setEquips)}>
                {EQUIPMENT_LABEL[e]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="section-title">难度</div>
          <div className="flex flex-wrap gap-1.5">
            {DIFFS.map((d) => (
              <Chip key={d} active={diffs.includes(d)} onClick={() => toggle(diffs, d, setDiffs)}>
                {DIFFICULTY_LABEL[d]}
              </Chip>
            ))}
          </div>
        </div>

        <div className="divide-y divide-paper-line border-t border-paper-line">
          {list.length === 0 && (
            <div className="py-6">
              <Empty icon="🔍" title="没有匹配的动作" hint="试试放宽筛选条件，或在「我的」中提交需求。" />
            </div>
          )}
          {list.map((ex) => (
            <ExerciseRow
              key={ex.id}
              ex={ex}
              onOpen={() => setDetail(ex.id)}
              onPick={onPick ? () => onPick(ex.id) : undefined}
              pickLabel={pickLabel}
            />
          ))}
        </div>
        <div className="pt-2 text-center text-[12px] text-ink-faint">
          共 {list.length} 个动作 · 图示均为本地绘制示意图
        </div>
      </div>
      <ExerciseDetail exerciseId={detail} open={!!detail} onClose={() => setDetail(null)} />
    </Sheet>
  );
}

export function ExerciseRow({
  ex,
  onOpen,
  onPick,
  pickLabel,
  right,
}: {
  ex: Exercise;
  onOpen?: () => void;
  onPick?: () => void;
  pickLabel?: string;
  right?: React.ReactNode;
}) {
  const equipment = equipmentOf(ex);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="h-14 w-12 shrink-0 rounded-lg border border-paper-line bg-paper">
          <ExerciseFigure pattern={ex.movementPattern} className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14.5px] font-medium">{ex.name}</span>
            {ex.custom && <span className="chip !py-0 text-[10px]">自定义</span>}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-ink-faint">
            {ex.primaryMuscles.map(muscleName).join("、")} · {MOVEMENT_PATTERN_LABEL[ex.movementPattern]} ·{" "}
            {equipment.length ? equipment.map((e) => EQUIPMENT_LABEL[e]).join("/") : "徒手"}
          </div>
          <div className="mt-1 flex gap-1">
            <span className="chip !px-1.5 !py-0 text-[10px]">{DIFFICULTY_LABEL[ex.difficulty]}</span>
          </div>
        </div>
      </button>
      {right}
      {onPick && (
        <button className="btn-secondary shrink-0 !px-3 !py-1.5 text-[13px]" onClick={onPick}>
          {pickLabel ?? "选择"}
        </button>
      )}
    </div>
  );
}

/* ------------------------------ 肌群筛选说明 ----------------------------- */

export function MuscleFilterChips({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MUSCLES.map((m) => (
        <Chip
          key={m.id}
          active={value.includes(m.id)}
          onClick={() => onChange(value.includes(m.id) ? value.filter((x) => x !== m.id) : [...value, m.id])}
        >
          {m.name}
        </Chip>
      ))}
    </div>
  );
}
