"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Chip, DemoBadge, Empty, Loading, Segmented, Sheet, Stepper, toast } from "@/components/ui";
import { targetsFor } from "@/lib/nutrition";
import { buildWeeklyReport } from "@/lib/weekly";
import { EXERCISE_MAP } from "@/lib/seed/exercises";
import { MUSCLES } from "@/lib/seed/muscles";
import type { RecoveryLog, SorenessLevel } from "@/lib/types";
import { cx, isoDateOf, todayISO, uid, weekdayCN, weekdayOf } from "@/lib/utils";

export default function ProgressPage() {
  const {
    ready,
    profile,
    activePlan,
    sessions,
    entries,
    foods,
    weights,
    recovery,
    saveRecovery,
    saveWeight,
  } = useApp();
  const [tab, setTab] = useState<"week" | "body" | "history">("week");
  const [recOpen, setRecOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);

  /**
   * 支持 /progress?tab=body|history 直达（今日页的「记录体重」「全部记录」按钮把 tab 参数传过来了）。
   * 这里不用 useSearchParams：那会让本页在静态预渲染时要求 Suspense 边界，而本页并未导出
   * dynamic，改用挂载后读取 location，避免构建期 CSB bailout。
   */
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "body" || t === "history" || t === "week") setTab(t);
  }, []);

  const today = todayISO();
  const report = useMemo(
    () =>
      buildWeeklyReport({
        today,
        plan: activePlan,
        sessions,
        entries,
        foods,
        weights,
        recovery,
        targets: targetsFor(profile),
      }),
    [today, activePlan, sessions, entries, foods, weights, recovery, profile],
  );

  if (!ready) return <Loading />;

  return (
    <div className="space-y-3 p-4">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "week", label: "本周复盘" },
          { value: "body", label: "体重与恢复" },
          { value: "history", label: "训练记录" },
        ]}
      />

      {tab === "week" && (
        <>
          <div className="card">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[14px] font-medium">本周复盘</span>
              <span className="text-[11.5px] text-ink-faint">
                {report.weekStart.slice(5)} – {report.weekEnd.slice(5)}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Stat
                label="训练完成"
                value={report.completionRate !== null ? `${Math.round(report.completionRate * 100)}%` : "—"}
                sub={report.completionNote}
              />
              <Stat label="完成组数" value={`${report.completedSessions.length} 次`} sub={`容量 ${report.totalVolumeKg} kg`} />
              <Stat
                label="饮食记录"
                value={`${report.nutrition.daysLogged} 天`}
                sub={report.nutrition.enough ? `蛋白达标 ${report.nutrition.proteinHitDays} 天` : "数据不足"}
              />
            </div>
          </div>

          {report.cautions.length > 0 && (
            <div className="rounded-xl2 border border-warn/30 bg-warn/5 p-3">
              <div className="text-[13px] font-medium text-warn">需要注意</div>
              <ul className="mt-1 space-y-1 text-[12.5px] leading-relaxed text-ink-soft">
                {report.cautions.map((c, i) => (
                  <li key={i}>· {c}</li>
                ))}
              </ul>
            </div>
          )}

          <SectionCard title="动作表现">
            {report.exercisePerformance.length === 0 ? (
              <EmptyText text="本周还没有完成的训练记录。" />
            ) : (
              <div className="space-y-1.5">
                {report.exercisePerformance.slice(0, 8).map((p) => (
                  <div key={p.exerciseId} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{p.exerciseName}</span>
                    {p.enough ? (
                      <>
                        <span className="tabular-nums text-ink-faint">
                          {p.prevBest} → {p.lastBest} {p.unit === "1RM" ? "kg(1RM)" : ""}
                        </span>
                        <span
                          className={cx(
                            "ml-2 w-14 shrink-0 text-right tabular-nums",
                            p.delta > 0 ? "text-moss-600" : p.delta < 0 ? "text-alert" : "text-ink-faint",
                          )}
                        >
                          {p.delta > 0 ? "+" : ""}
                          {p.delta}
                        </span>
                      </>
                    ) : (
                      <span className="text-[12px] text-ink-faint">记录不足 2 次，不比较</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="饮食">
            <div className="text-[13px] leading-relaxed text-ink-soft">{report.nutrition.note}</div>
            {report.nutrition.enough && (
              <div className="mt-1.5 text-[12.5px] text-ink-faint">
                平均 {report.nutrition.avgKcal} kcal / 目标 {report.nutrition.targetKcal} kcal · 平均蛋白{" "}
                {report.nutrition.avgProtein} g / 目标 {report.nutrition.targetProtein} g
              </div>
            )}
          </SectionCard>

          <SectionCard title="恢复">
            <div className="text-[13px] leading-relaxed text-ink-soft">{report.recovery.note}</div>
            {report.recovery.enough && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {report.recovery.avgSleepHours !== null && <Chip>平均睡眠 {report.recovery.avgSleepHours} h</Chip>}
                {report.recovery.avgFatigue !== null && <Chip>平均疲劳 {report.recovery.avgFatigue}/5</Chip>}
                <Chip>疼痛记录 {report.recovery.painDays} 天</Chip>
              </div>
            )}
          </SectionCard>

          <div className="card-tight">
            <div className="text-[12.5px] font-medium">今日状态</div>
            <div className="mt-1 text-[12.5px] text-ink-faint">
              记录睡眠、疲劳、酸痛与疼痛，周报会结合这些数据做保守判断（数据不足时不下结论）。
            </div>
            <button className="btn-secondary mt-2 w-full" onClick={() => setRecOpen(true)}>
              记录今天的恢复情况
            </button>
          </div>
        </>
      )}

      {tab === "body" && (
        <>
          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[14px] font-medium">体重趋势</span>
              <button className="text-[12px] text-moss-600 underline" onClick={() => setWeightOpen(true)}>
                记录体重
              </button>
            </div>
            {weights.length < 2 ? (
              <EmptyText text="至少需要 2 条记录才能画趋势线。" />
            ) : (
              <>
                <WeightChart points={weights.slice(-20).map((w) => ({ date: w.date, kg: w.weightKg }))} />
                <div className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{report.weight.note}</div>
              </>
            )}
          </div>

          <div className="card">
            <div className="section-title !mb-2">最近恢复记录</div>
            {recovery.length === 0 ? (
              <EmptyText text="还没有恢复记录。" />
            ) : (
              <div className="space-y-1.5">
                {[...recovery]
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .slice(0, 10)
                  .map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-[13px]">
                      <span className="text-ink-soft">{r.date}</span>
                      <span className="flex gap-1.5 text-[11.5px] text-ink-faint">
                        {r.sleepHours !== undefined && <span>睡 {r.sleepHours}h</span>}
                        {r.fatigue !== undefined && <span>疲劳 {r.fatigue}/5</span>}
                        {r.soreness !== undefined && <span>酸痛 {r.soreness}/5</span>}
                        {r.hasPain && <span className="text-alert">疼痛</span>}
                        {r.isDemo && <DemoBadge />}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            <button className="btn-secondary mt-2 w-full" onClick={() => setRecOpen(true)}>
              记录 / 更新今天的恢复情况
            </button>
          </div>
        </>
      )}

      {tab === "history" && (
        <div className="space-y-2">
          {sessions.length === 0 && <Empty icon="📝" title="还没有训练记录" hint="完成一次训练后会出现在这里。" />}
          {sessions.map((s) => {
            const done = s.logs.reduce((n, l) => n + l.sets.filter((x) => x.status === "done").length, 0);
            const total = s.logs.reduce((n, l) => n + l.sets.length, 0);
            return (
              <div key={s.id} className="card-tight">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium">{s.title}</span>
                      {s.isDemo && <DemoBadge />}
                      {s.status === "in_progress" && (
                        <span className="chip border-clay-500/40 bg-clay-100 !py-0 text-[10px] text-clay-600">
                          进行中
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-ink-faint">
                      {isoDateOf(s.startedAt)} {weekdayCN(weekdayOf(isoDateOf(s.startedAt)))} ·{" "}
                      {done}/{total} 组
                    </div>
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-faint">
                    {s.status === "completed" ? "已完成" : s.status === "abandoned" ? "已结束" : "进行中"}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.logs.slice(0, 6).map((l, i) => (
                    <Chip key={i}>{EXERCISE_MAP[l.exerciseId]?.name ?? l.exerciseId}</Chip>
                  ))}
                  {s.logs.length > 6 && <Chip>+{s.logs.length - 6}</Chip>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 只在打开时挂载：每次打开都从当前数据重新初始化，避免复用上次的旧值 */}
      {recOpen && (
        <RecoverySheet
          open
          onClose={() => setRecOpen(false)}
          date={today}
          initial={recovery.find((r) => r.date === today)}
          onSave={async (r) => {
            await saveRecovery(r);
            setRecOpen(false);
            toast("已记录", "ok");
          }}
        />
      )}
      {weightOpen && (
        <WeightSheet
          open
          onClose={() => setWeightOpen(false)}
          date={today}
          initialKg={weights.find((w) => w.date === today)?.weightKg ?? profile.weightKg}
          onSave={async (kg) => {
            // 同一天只保留一条体重记录：复用当天已有 id，避免重复条目把趋势/最新体重算乱
            const existing = weights.find((w) => w.date === today);
            await saveWeight({
              id: existing?.id ?? uid("bw"),
              date: today,
              weightKg: kg,
              createdAt: existing?.createdAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            setWeightOpen(false);
            toast("已记录体重", "ok");
          }}
        />
      )}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="section-title !mb-2">{title}</div>
      {children}
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="py-3 text-center text-[13px] text-ink-faint">{text}</div>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[18px] font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-ink-faint">{label}</div>
      {sub && <div className="mt-0.5 text-[10.5px] leading-tight text-ink-faint">{sub}</div>}
    </div>
  );
}

/* ------------------------------- 体重折线图 -------------------------------- */

function WeightChart({ points }: { points: { date: string; kg: number }[] }) {
  if (points.length < 2) return null;
  const w = 320;
  const h = 120;
  const pad = 10;
  const kgs = points.map((p) => p.kg);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const span = Math.max(0.6, max - min);
  const x = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="体重趋势折线图">
        <path d={d} fill="none" stroke="#4F8C7B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.kg)} r="2.6" fill="#4F8C7B" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-ink-faint">
        <span>{points[0].date.slice(5)}</span>
        <span>
          {min} – {max} kg
        </span>
        <span>{points[points.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}

/* -------------------------------- 恢复记录 -------------------------------- */

function RecoverySheet({
  open,
  onClose,
  date,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  initial?: RecoveryLog;
  onSave: (r: RecoveryLog) => void;
}) {
  const [sleepHours, setSleepHours] = useState(initial?.sleepHours ?? 7);
  const [sleepQuality, setSleepQuality] = useState(initial?.sleepQuality ?? 3);
  const [fatigue, setFatigue] = useState(initial?.fatigue ?? 3);
  const [soreness, setSoreness] = useState<SorenessLevel>(initial?.soreness ?? 1);
  const [hasPain, setHasPain] = useState(initial?.hasPain ?? false);
  const [painAreas, setPainAreas] = useState<string[]>(initial?.painAreas ?? []);
  const [painNote, setPainNote] = useState(initial?.painNote ?? "");

  const painOptions = ["膝", "肩", "下背", "腰", "颈", "髋", "踝", "手腕", "肘", "其他"];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="恢复情况"
      footer={
        <button
          className="btn-primary w-full"
          onClick={() =>
            onSave({
              id: initial?.id ?? uid("rec"),
              date,
              sleepHours,
              sleepQuality,
              fatigue,
              soreness,
              hasPain,
              painAreas: hasPain ? painAreas : [],
              painNote: hasPain ? painNote : undefined,
              createdAt: initial?.createdAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          }
        >
          保存
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px]">睡眠时长（小时）</span>
          <Stepper value={sleepHours} onChange={setSleepHours} step={0.5} min={0} max={14} unit="h" />
        </div>
        <ScaleRow label="睡眠质量" value={sleepQuality} onChange={setSleepQuality} labels={["很差", "差", "一般", "好", "很好"]} />
        <ScaleRow label="疲劳程度" value={fatigue} onChange={setFatigue} labels={["很轻松", "轻松", "一般", "疲劳", "很疲劳"]} />
        <ScaleRow
          label="肌肉酸痛"
          value={soreness}
          onChange={(v) => setSoreness(v as SorenessLevel)}
          max={5}
          labels={["无", "轻微", "轻", "中", "明显", "严重"]}
        />

        <div className="rounded-xl border border-paper-line bg-paper px-3 py-2.5">
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-moss-600"
              checked={hasPain}
              onChange={(e) => setHasPain(e.target.checked)}
            />
            出现了疼痛（不是普通的肌肉酸痛）
          </label>
          {hasPain && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {painOptions.map((p) => (
                  <Chip
                    key={p}
                    active={painAreas.includes(p)}
                    onClick={() =>
                      setPainAreas(painAreas.includes(p) ? painAreas.filter((x) => x !== p) : [...painAreas, p])
                    }
                  >
                    {p}
                  </Chip>
                ))}
              </div>
              <textarea
                className="input min-h-[60px]"
                placeholder="什么样的感觉？什么动作会加重？（选填）"
                value={painNote}
                onChange={(e) => setPainNote(e.target.value)}
              />
              <div className="rounded-lg border border-alert/30 bg-alert/5 px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-soft">
                <span className="font-medium text-alert">建议：</span>
                暂时停止引发疼痛的动作与其相似模式（如深蹲痛则先停深蹲与弓步）。若疼痛在 3-5 天内没有减轻、夜间痛、伴麻木无力或肿胀，请寻求医生或物理治疗师的面对面评估。
                <div className="mt-1 text-ink-faint">
                  本应用不做疾病诊断，也不提供康复处方，只在计划层面帮你规避相关动作模式。
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function ScaleRow({
  label,
  value,
  onChange,
  labels,
  max = 5,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  labels: string[];
  max?: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[14px]">{label}</span>
        <span className="text-[12px] text-ink-faint">{labels[value] ?? ""}</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => i + 1).map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={cx(
              "flex-1 rounded-lg border py-2 text-[13px]",
              value === v ? "border-moss-600 bg-moss-600 text-white" : "border-paper-line bg-paper-card text-ink-soft",
            )}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function WeightSheet({
  open,
  onClose,
  date,
  initialKg,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  initialKg: number;
  onSave: (kg: number) => void;
}) {
  const [kg, setKg] = useState(initialKg);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="记录体重"
      footer={
        <button className="btn-primary w-full" onClick={() => onSave(kg)}>
          保存
        </button>
      }
    >
      <div className="space-y-3">
        <div className="text-[12.5px] text-ink-faint">
          {date} · 建议固定在早晨空腹、如厕后称量，可比性最好。
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[14px]">体重（kg）</span>
          <Stepper value={kg} onChange={setKg} step={0.1} min={20} max={300} unit="kg" />
        </div>
      </div>
    </Sheet>
  );
}
