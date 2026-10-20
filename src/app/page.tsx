"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Onboarding } from "@/components/Onboarding";
import { WorkoutRunner } from "@/components/WorkoutRunner";
import { Bar, Chip, DemoBadge, Loading, toast } from "@/components/ui";
import { SLOT_LABEL, nutrientsFor, targetsFor } from "@/lib/nutrition";
import { newSession } from "@/lib/session";
import { EXERCISE_MAP } from "@/lib/seed/exercises";
import { FOOD_MAP } from "@/lib/seed/foods";
import { cx, isoDateOf, todayISO, weekdayCN, weekdayOf } from "@/lib/utils";

export default function TodayPage() {
  const router = useRouter();
  const {
    ready,
    profile,
    activePlan,
    activeVenue,
    sessions,
    entries,
    weights,
    water,
    foods,
    saveProfile,
    saveSession,
    saveWeight,
    addWater,
    seedDemo,
  } = useApp();
  const [running, setRunning] = useState<import("@/lib/types").WorkoutSession | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);

  const today = todayISO();
  const wd = weekdayOf(today);

  useEffect(() => {
    if (ready && !profile.onboarded) setShowOnboard(true);
  }, [ready, profile.onboarded]);

  const inProgress = useMemo(() => sessions.find((s) => s.status === "in_progress"), [sessions]);
  const todayDay = activePlan?.days.find((d) => d.weekday === wd);
  const todayEntries = useMemo(() => entries.filter((e) => e.date === today), [entries, today]);
  const targets = useMemo(() => targetsFor(profile), [profile]);

  const totals = useMemo(() => {
    return todayEntries.reduce(
      (acc, e) => {
        // 内置库走 FOOD_MAP，用户自建食物只存在 foods store 里；两者都要查，
        // 否则自建食物的热量会被静默按 0 计入。
        const food = e.foodId ? (FOOD_MAP[e.foodId] ?? foods.find((f) => f.id === e.foodId)) : undefined;
        const n = nutrientsFor(e, food?.per100g ?? { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 });
        return {
          kcal: acc.kcal + n.kcal,
          proteinG: acc.proteinG + n.proteinG,
          carbG: acc.carbG + n.carbG,
          fatG: acc.fatG + n.fatG,
        };
      },
      { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
    );
  }, [todayEntries, foods]);

  const todayWater = water.find((w) => w.date === today)?.ml ?? 0;
  const latestWeight = weights[weights.length - 1];
  const waterTarget = Math.round(profile.weightKg * 35);

  /* 饮水 / 活动提醒：仅在页面打开时于应用内提示，可完全关闭 */
  useEffect(() => {
    if (!ready || !profile.reminders.waterEnabled) return;
    const ms = Math.max(1, profile.reminders.waterIntervalMin) * 60_000;
    const t = setInterval(() => {
      toast("该喝点水了", "info");
    }, ms);
    return () => clearInterval(t);
  }, [ready, profile.reminders.waterEnabled, profile.reminders.waterIntervalMin]);

  useEffect(() => {
    if (!ready || !profile.reminders.moveEnabled) return;
    const ms = Math.max(1, profile.reminders.moveIntervalMin) * 60_000;
    const t = setInterval(() => {
      toast("起身活动一下吧", "info");
    }, ms);
    return () => clearInterval(t);
  }, [ready, profile.reminders.moveEnabled, profile.reminders.moveIntervalMin]);

  if (!ready) return <Loading />;

  async function startToday() {
    const day = todayDay ?? activePlan?.days[0];
    if (!day) {
      router.push("/train");
      return;
    }
    const s = newSession(day, activeVenue?.id);
    await saveSession(s);
    setRunning(s);
  }

  return (
    <div className="space-y-3 p-4">
      <div className="pt-1">
        <div className="text-[13px] text-ink-faint">
          {today} {weekdayCN(wd)}
        </div>
        <h1 className="text-[22px] font-semibold">
          {profile.onboarded ? `你好，${profile.displayName || "朋友"}` : "欢迎"}
        </h1>
      </div>

      {activeVenue && (
        <div className="flex items-center gap-1.5 text-[12.5px] text-ink-faint">
          当前场馆：
          <Chip>{activeVenue.name}</Chip>
        </div>
      )}

      {/* 进行中的训练 */}
      {inProgress && (
        <div className="card border-clay-500/40 bg-clay-50/50">
          <div className="text-[13px] font-medium text-clay-600">有一场未结束的训练</div>
          <div className="mt-0.5 text-[12.5px] text-ink-soft">
            {inProgress.title} · 开始于 {new Date(inProgress.startedAt).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <button className="btn-primary mt-2 w-full" onClick={() => setRunning(inProgress)}>
            继续训练
          </button>
        </div>
      )}

      {/* 今日训练 */}
      <div className="card">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[13px] text-ink-faint">今日训练</span>
          <button className="text-[12px] text-moss-600 underline" onClick={() => router.push("/train")}>
            查看计划
          </button>
        </div>
        {activePlan ? (
          todayDay ? (
            <>
              <div className="text-[16px] font-semibold">{todayDay.title}</div>
              <div className="mt-1 text-[12.5px] text-ink-soft">
                {todayDay.items.length} 个动作 · 约 {todayDay.estimatedMinutes} 分钟
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {todayDay.items.slice(0, 5).map((it) => (
                  <Chip key={it.id}>{EXERCISE_MAP[it.exerciseId]?.name ?? "动作"}</Chip>
                ))}
                {todayDay.items.length > 5 && <Chip>+{todayDay.items.length - 5}</Chip>}
              </div>
              <button className="btn-primary btn-lg mt-3" onClick={() => void startToday()}>
                开始训练
              </button>
            </>
          ) : (
            <div className="py-2">
              <div className="text-[15px] font-medium">今天是休息日</div>
              <div className="mt-1 text-[12.5px] text-ink-soft">
                恢复也是训练的一部分。可以散个步、拉伸，或者补记昨天的训练。
              </div>
              <button className="btn-secondary mt-3 w-full" onClick={() => router.push("/progress")}>
                记录今天的恢复情况
              </button>
            </div>
          )
        ) : (
          <div className="py-2">
            <div className="text-[14px]">还没有训练计划</div>
            <button className="btn-primary mt-2 w-full" onClick={() => router.push("/train")}>
              去生成计划
            </button>
          </div>
        )}
      </div>

      {/* 今日饮食 */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] text-ink-faint">今日饮食</span>
          <button className="text-[12px] text-moss-600 underline" onClick={() => router.push("/diet")}>
            去记录
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[12px] text-ink-faint">热量</span>
              <span className="text-[12px] tabular-nums text-ink-faint">
                {Math.round(totals.kcal)} / {targets.kcal}
              </span>
            </div>
            <Bar value={totals.kcal} max={targets.kcal} />
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[12px] text-ink-faint">蛋白质</span>
              <span className="text-[12px] tabular-nums text-ink-faint">
                {Math.round(totals.proteinG)} / {targets.proteinG}g
              </span>
            </div>
            <Bar value={totals.proteinG} max={targets.proteinG} tone="clay" />
          </div>
        </div>
        {todayEntries.length > 0 ? (
          <div className="mt-2 space-y-0.5">
            {(["breakfast", "lunch", "dinner", "snack"] as const).map((slot) => {
              const list = todayEntries.filter((e) => e.slot === slot);
              if (!list.length) return null;
              return (
                <div key={slot} className="flex justify-between text-[12.5px] text-ink-soft">
                  <span className="text-ink-faint">{SLOT_LABEL[slot]}</span>
                  <span className="truncate">
                    {list.map((e) => e.foodName).join("、")}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 text-[12.5px] text-ink-faint">今天还没有饮食记录。</div>
        )}
      </div>

      {/* 快速记录 */}
      <div className="card">
        <div className="mb-2 text-[13px] text-ink-faint">快速记录</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-paper-line px-3 py-2.5">
            <div className="text-[12px] text-ink-faint">饮水</div>
            <div className="text-[16px] font-semibold tabular-nums">
              {todayWater}
              <span className="text-[11px] font-normal text-ink-faint"> / {waterTarget} ml</span>
            </div>
            <div className="mt-1.5 flex gap-1">
              {[200, 300, 500].map((ml) => (
                <button
                  key={ml}
                  className="btn-secondary flex-1 !px-1 !py-1 text-[12px]"
                  onClick={() => void addWater(today, ml)}
                >
                  +{ml}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-paper-line px-3 py-2.5">
            <div className="text-[12px] text-ink-faint">体重</div>
            <div className="text-[16px] font-semibold tabular-nums">
              {latestWeight ? latestWeight.weightKg : "—"}
              <span className="text-[11px] font-normal text-ink-faint"> kg</span>
            </div>
            <button
              className="btn-secondary mt-1.5 w-full !py-1 text-[12px]"
              onClick={() => router.push("/progress?tab=body")}
            >
              记录体重
            </button>
          </div>
        </div>
      </div>

      {/* 最近训练 */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] text-ink-faint">最近训练</span>
          <button className="text-[12px] text-moss-600 underline" onClick={() => router.push("/progress?tab=history")}>
            全部记录
          </button>
        </div>
        {sessions.length === 0 ? (
          <div className="py-2 text-[12.5px] text-ink-faint">还没有训练记录。</div>
        ) : (
          <div className="space-y-1">
            {sessions.slice(0, 4).map((s) => {
              const done = s.logs.reduce((n, l) => n + l.sets.filter((x) => x.status === "done").length, 0);
              const total = s.logs.reduce((n, l) => n + l.sets.length, 0);
              return (
                <div key={s.id} className="flex items-center justify-between text-[13px]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cx("truncate", s.status === "in_progress" && "text-clay-600")}>
                      {s.title}
                    </span>
                    {s.isDemo && <DemoBadge />}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-ink-faint">
                    {isoDateOf(s.startedAt).slice(5)} · {done}/{total} 组
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <OnboardingFlow
        open={showOnboard}
        initial={profile}
        onDone={async (p, loadDemo) => {
          await saveProfile(p);
          if (loadDemo) await seedDemo();
          setShowOnboard(false);
          toast("档案已保存", "ok");
        }}
      />

      {running && <WorkoutRunner session={running} onExit={() => setRunning(null)} />}
    </div>
  );
}

function OnboardingFlow({
  open,
  initial,
  onDone,
}: {
  open: boolean;
  initial: import("@/lib/types").UserProfile;
  onDone: (p: import("@/lib/types").UserProfile, loadDemo: boolean) => void;
}) {
  if (!open) return null;
  return <Onboarding initial={initial} onDone={onDone} />;
}
