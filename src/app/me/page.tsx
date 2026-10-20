"use client";

import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Chip, Confirm, Loading, Segmented, Sheet, Stepper, toast } from "@/components/ui";
import { GOAL_LABEL, LEVEL_LABEL, MOVEMENT_PATTERN_LABEL, EQUIPMENT_LABEL } from "@/lib/plan/engine";
import { targetsFor } from "@/lib/nutrition";
import type {
  DietProfile,
  EquipmentCategory,
  EquipmentItem,
  ExperienceLevel,
  MovementPattern,
  Sex,
  TrainingGoal,
  Venue,
} from "@/lib/types";
import { cx, uid } from "@/lib/utils";

const GOALS: TrainingGoal[] = ["fat_loss", "muscle_gain", "strength", "recomp", "health"];
const LEVELS: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];
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
const AREA_OPTIONS = ["膝", "肩", "下背", "腰", "颈", "髋", "踝", "手腕", "肘", "其他"];
const EQUIP_CATS: EquipmentCategory[] = [
  "bodyweight",
  "dumbbell",
  "barbell",
  "machine",
  "cable",
  "bench",
  "kettlebell",
  "band",
  "cardio",
  "other",
];

const DEFAULT_DIET: DietProfile = {
  allergens: [],
  dislikes: [],
  preferences: [],
  budgetPerDay: 0,
  cookingAbility: "simple",
  mealsPerDay: 3,
};

export default function MePage() {
  const {
    ready,
    profile,
    venues,
    persistence,
    hasDemo,
    saveProfile,
    saveVenue,
    deleteVenue,
    setDefaultVenue,
    seedDemo,
    clearDemo,
    exportJson,
    wipe,
  } = useApp();
  const [editProfile, setEditProfile] = useState(false);
  const [editVenue, setEditVenue] = useState<Venue | null>(null);
  const [pendingDeleteVenue, setPendingDeleteVenue] = useState<Venue | null>(null);
  const [editDiet, setEditDiet] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);

  if (!ready) return <Loading />;

  // 与其他页（今日/饮食）保持同一口径：有手动覆盖时展示覆盖值，而不是自动计算值
  const targets = targetsFor(profile);
  const diet: DietProfile = profile.dietProfile ?? DEFAULT_DIET;

  async function saveDiet(d: DietProfile) {
    await saveProfile({ ...profile, dietProfile: d });
  }

  return (
    <div className="space-y-3 p-4">
      <h1 className="pt-1 text-[20px] font-semibold">我的</h1>

      {/* 档案 */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[15px] font-medium">{profile.displayName || "我"}</span>
          <button className="text-[12px] text-moss-600 underline" onClick={() => setEditProfile(true)}>
            编辑档案
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip>{GOAL_LABEL[profile.goal]}</Chip>
          <Chip>{LEVEL_LABEL[profile.experience]}</Chip>
          <Chip>每周 {profile.daysPerWeek} 次</Chip>
          <Chip>每次 {profile.sessionMinutes} 分</Chip>
          <Chip>
            {profile.heightCm}cm / {profile.weightKg}kg
          </Chip>
        </div>
        <div className="mt-2 text-[12.5px] text-ink-faint">
          每日目标：{targets.kcal} kcal · 蛋白 {targets.proteinG}g · 碳水 {targets.carbG}g · 脂肪{" "}
          {targets.fatG}g
        </div>
        {/* 计算依据来自 lib/nutrition（BMR 用档案里的出生年份，未填时按 30 岁），不在页面写死年龄 */}
        <div className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">{targets.basis}</div>
        <div className="mt-2 rounded-lg bg-paper px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-faint">
          {profile.limitations.skipped || profile.limitations.areas.length === 0
            ? "未提供身体限制信息，计划未做针对性规避。"
            : `已规避：${profile.limitations.areas.join("、")}（避开 ${profile.limitations.avoidPatterns
                .map((p) => MOVEMENT_PATTERN_LABEL[p])
                .join("、") || "未指定模式"}）`}
        </div>
      </div>

      {/* 场馆 */}
      <div className="card" id="venues">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[15px] font-medium">场馆与器械</span>
          <button
            className="text-[12px] text-moss-600 underline"
            onClick={() =>
              setEditVenue({
                id: uid("venue"),
                name: "",
                kind: "gym",
                equipment: [],
                isDefault: venues.length === 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })
            }
          >
            + 新场馆
          </button>
        </div>
        {venues.length === 0 && (
          <div className="py-3 text-center text-[13px] text-ink-faint">还没有场馆，添加一个才能生成计划。</div>
        )}
        <div className="space-y-2">
          {venues.map((v) => (
            <div
              key={v.id}
              className={cx(
                "rounded-xl border px-3 py-2.5",
                v.isDefault ? "border-moss-300 bg-moss-50/60" : "border-paper-line",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium">{v.name}</span>
                    {v.isDemo && (
                      <span className="chip border-warn/30 bg-warn/10 !py-0 text-[10px] text-warn">演示</span>
                    )}
                    {v.isDefault && (
                      <span className="chip border-moss-300 bg-moss-50 !py-0 text-[10px] text-moss-700">当前</span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-ink-faint">
                    {KIND_LABEL[v.kind]}
                    {v.location ? ` · ${v.location}` : ""} · {v.equipment.length} 项器械
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!v.isDefault && (
                    <button className="btn-ghost !px-1.5 text-[12px]" onClick={() => void setDefaultVenue(v.id)}>
                      切换
                    </button>
                  )}
                  <button className="btn-ghost !px-1.5 text-[12px]" onClick={() => setEditVenue(v)}>
                    编辑
                  </button>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {v.equipment.slice(0, 6).map((e) => (
                  <Chip key={e.id}>
                    {e.name}
                    {e.maxWeightKg ? ` ≤${e.maxWeightKg}kg` : ""}
                  </Chip>
                ))}
                {v.equipment.length > 6 && <Chip>+{v.equipment.length - 6}</Chip>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 饮食档案 */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[15px] font-medium">饮食档案</span>
          <button className="text-[12px] text-moss-600 underline" onClick={() => setEditDiet(true)}>
            编辑
          </button>
        </div>
        <div className="space-y-1 text-[13px] text-ink-soft">
          <Row label="过敏原" value={diet.allergens.length ? diet.allergens.join("、") : "未填写"} />
          <Row label="忌口" value={diet.dislikes.length ? diet.dislikes.join("、") : "未填写"} />
          <Row label="偏好" value={diet.preferences.length ? diet.preferences.join("、") : "未填写"} />
          <Row label="每日预算" value={diet.budgetPerDay ? `¥${diet.budgetPerDay}` : "不限"} />
          <Row label="做饭条件" value={COOKING_ABILITY[diet.cookingAbility]} />
          <Row label="每日餐次" value={`${diet.mealsPerDay} 餐`} />
        </div>
      </div>

      {/* 提醒 */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[15px] font-medium">提醒</span>
          <button className="text-[12px] text-moss-600 underline" onClick={() => setRemindOpen(true)}>
            设置
          </button>
        </div>
        <div className="space-y-1 text-[13px] text-ink-soft">
          <Row label="饮水提醒" value={profile.reminders.waterEnabled ? `每 ${profile.reminders.waterIntervalMin} 分钟` : "已关闭"} />
          <Row label="活动提醒" value={profile.reminders.moveEnabled ? `每 ${profile.reminders.moveIntervalMin} 分钟` : "已关闭"} />
          <Row label="训练提醒" value={profile.reminders.trainingEnabled ? profile.reminders.trainingTime ?? "已开启" : "已关闭"} />
        </div>
        <div className="mt-1.5 text-[11.5px] text-ink-faint">
          提醒在浏览器内实现（本应用不发送系统级推送），可以完全关闭。
        </div>
      </div>

      {/* 数据 */}
      <div className="card">
        <div className="mb-2 text-[15px] font-medium">数据管理</div>
        <div className="mb-2 rounded-lg bg-paper px-2.5 py-2 text-[12px] leading-relaxed text-ink-soft">
          存储位置：
          {persistence === "indexeddb" ? "浏览器 IndexedDB（本机）" : "内存（当前环境不支持 IndexedDB，刷新即丢失）"}
          。
          <span className="text-alert"> IndexedDB 不等于云备份</span>
          —— 清理浏览器数据、卸载浏览器或换设备都会丢失，请定期导出。
        </div>
        <div className="space-y-2">
          <button className="btn-secondary w-full" onClick={() => void exportJson()}>
            导出我的数据（JSON）
          </button>
          <button
            className="btn-secondary w-full"
            onClick={async () => {
              await seedDemo();
              toast("已载入演示数据", "ok");
            }}
          >
            载入演示数据
          </button>
          {hasDemo && (
            <button className="btn-secondary w-full" onClick={() => setConfirmClearDemo(true)}>
              清除演示数据
            </button>
          )}
          <button className="btn-danger w-full" onClick={() => setConfirmWipe(true)}>
            删除全部个人数据
          </button>
        </div>
      </div>

      <div className="rounded-xl2 border border-paper-line bg-paper-card p-4 text-[12px] leading-relaxed text-ink-faint">
        <div className="mb-1 font-medium text-ink-soft">免责声明</div>
        FitLoop 是记录与规划工具，不是医疗服务。所有热量与营养数值均为估算，训练建议不构成诊断或康复处方。
        出现疼痛、头晕、胸闷等不适请立即停止训练并寻求专业人员的面对面评估。
        涉及疾病、孕期、未成年人或有基础疾病的人群，开始新的训练或饮食计划前请先咨询医生。
      </div>

      {/* 档案编辑 */}
      <ProfileSheet
        open={editProfile}
        onClose={() => setEditProfile(false)}
        profile={profile}
        onSave={async (p) => {
          await saveProfile(p);
          setEditProfile(false);
          toast("档案已更新", "ok");
        }}
      />

      {/* 场馆编辑 */}
      {editVenue && (
        <VenueSheet
          venue={editVenue}
          isNew={!venues.some((v) => v.id === editVenue.id)}
          onClose={() => setEditVenue(null)}
          onSave={async (v) => {
            await saveVenue(v);
            setEditVenue(null);
            toast("场馆已保存", "ok");
          }}
          onDelete={(id) => {
            // 删除场馆不可撤销（器械清单会一起没了），先弹二次确认，不立即写库
            const target = venues.find((v) => v.id === id) ?? (editVenue?.id === id ? editVenue : null);
            if (target) setPendingDeleteVenue(target);
          }}
        />
      )}

      {/* 删除场馆二次确认：删掉默认场馆时，把剩下第一个设为当前场馆 */}
      <Confirm
        open={!!pendingDeleteVenue}
        title="删除这个场馆？"
        desc={
          pendingDeleteVenue
            ? `「${pendingDeleteVenue.name}」及其 ${pendingDeleteVenue.equipment.length} 项器械会被删除，已有的训练记录不受影响。${
                venues.length <= 1
                  ? "这是最后一个场馆；删除后场馆列表会恢复为示例场馆，需要按你的器械重新编辑或添加。"
                  : pendingDeleteVenue.isDefault
                    ? "删除后会把剩下的第一个场馆设为当前场馆。"
                    : ""
              }`
            : undefined
        }
        confirmText="删除场馆"
        danger
        onCancel={() => setPendingDeleteVenue(null)}
        onConfirm={async () => {
          const target = pendingDeleteVenue;
          if (!target) return;
          const remaining = venues.filter((v) => v.id !== target.id);
          await deleteVenue(target.id);
          if (target.isDefault && remaining.length > 0) {
            await setDefaultVenue(remaining[0].id);
          }
          setPendingDeleteVenue(null);
          setEditVenue(null);
          toast(
            remaining.length ? "已删除场馆" : "已删除最后一个场馆",
            remaining.length ? "ok" : "warn",
          );
        }}
      />

      {/* 饮食档案 */}
      <DietSheet open={editDiet} onClose={() => setEditDiet(false)} diet={diet} onSave={(d) => void saveDiet(d)} />

      {/* 提醒 */}
      <RemindSheet
        open={remindOpen}
        onClose={() => setRemindOpen(false)}
        value={profile.reminders}
        onSave={async (r) => {
          await saveProfile({ ...profile, reminders: r });
          setRemindOpen(false);
          toast("提醒设置已保存", "ok");
        }}
      />

      <Confirm
        open={confirmClearDemo}
        title="清除演示数据？"
        desc="会删除所有带「演示」标记的场馆、计划、训练记录、饮食记录、体重与恢复记录。你自己录入的数据不受影响。"
        confirmText="清除"
        onCancel={() => setConfirmClearDemo(false)}
        onConfirm={async () => {
          await clearDemo();
          setConfirmClearDemo(false);
          toast("演示数据已清除", "ok");
        }}
      />
      <Confirm
        open={confirmWipe}
        title="删除全部个人数据？"
        desc="档案、场馆、计划、训练与饮食记录都会被永久删除，无法恢复。建议先导出备份。"
        confirmText="我确认，全部删除"
        danger
        onCancel={() => setConfirmWipe(false)}
        onConfirm={async () => {
          await wipe();
          setConfirmWipe(false);
          toast("已删除全部个人数据", "ok");
        }}
      />
    </div>
  );
}

const KIND_LABEL: Record<Venue["kind"], string> = {
  home: "居家",
  gym: "健身房",
  office: "办公室",
  outdoor: "户外",
  other: "其他",
};

const COOKING_ABILITY: Record<DietProfile["cookingAbility"], string> = {
  none: "几乎不做饭（外食/速食）",
  simple: "简单处理（煮、微波、简单炒）",
  full: "可以正常做饭",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-faint">{label}</span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}

/* ------------------------------- 档案编辑 -------------------------------- */

function ProfileSheet({
  open,
  onClose,
  profile,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  profile: import("@/lib/types").UserProfile;
  onSave: (p: import("@/lib/types").UserProfile) => void;
}) {
  const [p, setP] = useState(profile);
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP({ ...p, [k]: v });

  /**
   * 出生年份：BMR 用 Mifflin-St Jeor 的 -5×age 项，缺省 age=30。
   * 这里提供一个可选输入（留空 = 沿用 30 岁），使营养目标的计算依据能反映真实年龄。
   * 用独立的字符串草稿态，避免数字输入在输入「19」这种中间值时被受控逻辑吞掉。
   */
  const maxBirthYear = new Date().getFullYear() - 14;
  const [birthYear, setBirthYear] = useState(profile.birthYear ? String(profile.birthYear) : "");
  const birthYearValid =
    birthYear === "" ||
    (Number.isInteger(Number(birthYear)) &&
      Number(birthYear) >= 1930 &&
      Number(birthYear) <= maxBirthYear);

  function onBirthYearChange(raw: string) {
    setBirthYear(raw);
    const year = Number(raw);
    if (raw !== "" && Number.isInteger(year) && year >= 1930 && year <= maxBirthYear) {
      setP((prev) => ({ ...prev, birthYear: year }));
      return;
    }
    // 留空或非法值：不写入 birthYear（回到 lib 里的默认 30 岁估算），避免存下一个半成品年份
    setP((prev) => {
      const next = { ...prev };
      delete next.birthYear;
      return next;
    });
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="编辑档案"
      footer={
        <button className="btn-primary w-full" onClick={() => onSave(p)}>
          保存
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">称呼</label>
          <input className="input" value={p.displayName} onChange={(e) => set("displayName", e.target.value)} />
        </div>
        <div>
          <div className="label">训练目标</div>
          <div className="flex flex-wrap gap-1.5">
            {GOALS.map((g) => (
              <Chip key={g} active={p.goal === g} onClick={() => set("goal", g)}>
                {GOAL_LABEL[g]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="label">经验</div>
          <Segmented
            value={p.experience}
            onChange={(v) => set("experience", v)}
            options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[14px]">每周训练天数</span>
          <Stepper value={p.daysPerWeek} onChange={(v) => set("daysPerWeek", v)} min={1} max={7} unit="天" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[14px]">单次时长（分钟）</span>
          <Stepper value={p.sessionMinutes} onChange={(v) => set("sessionMinutes", v)} step={5} min={15} max={120} unit="分" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[14px]">身高（cm）</span>
          <Stepper value={p.heightCm} onChange={(v) => set("heightCm", v)} min={120} max={220} unit="cm" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[14px]">体重（kg）</span>
          <Stepper value={p.weightKg} onChange={(v) => set("weightKg", v)} step={0.5} min={30} max={250} unit="kg" />
        </div>
        <div>
          <div className="label">生理性别</div>
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
        <div>
          <label className="label">出生年份</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1930}
            max={maxBirthYear}
            placeholder="如 1995（选填）"
            value={birthYear}
            onChange={(e) => onBirthYearChange(e.target.value.trim())}
          />
          <div className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
            用于估算基础代谢（Mifflin-St Jeor）。留空时按 30 岁估算，填了会让热量目标更贴近你的实际年龄。
          </div>
          {!birthYearValid && (
            <div className="mt-1 text-[11.5px] leading-relaxed text-warn">
              请填写 1930–{maxBirthYear} 之间的出生年份；留空表示按 30 岁估算。
            </div>
          )}
        </div>
        <div>
          <div className="label">
            身体受限部位
            <span className="ml-1 font-normal text-ink-faint">（可留空，随时可改）</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AREA_OPTIONS.map((a) => (
              <Chip
                key={a}
                active={p.limitations.areas.includes(a)}
                onClick={() =>
                  setP({
                    ...p,
                    limitations: {
                      ...p.limitations,
                      areas: p.limitations.areas.includes(a)
                        ? p.limitations.areas.filter((x) => x !== a)
                        : [...p.limitations.areas, a],
                      skipped: false,
                    },
                  })
                }
              >
                {a}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="label">避开这些动作模式</div>
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
        <div className="text-[11.5px] text-ink-faint">
          修改目标/经验/频次后，记得去「训练 → 重新生成计划」让计划跟上新档案。
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------- 场馆编辑 -------------------------------- */

function VenueSheet({
  venue,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  venue: Venue;
  isNew: boolean;
  onClose: () => void;
  onSave: (v: Venue) => void;
  onDelete: (id: string) => void;
}) {
  const [v, setV] = useState<Venue>(venue);
  const [newCat, setNewCat] = useState<EquipmentCategory>("dumbbell");
  const [newName, setNewName] = useState("");
  const [newMax, setNewMax] = useState<number>(20);

  function addEquip() {
    if (!newName.trim()) return;
    const item: EquipmentItem = {
      id: uid("eq"),
      category: newCat,
      name: newName.trim(),
      maxWeightKg: ["dumbbell", "barbell", "kettlebell", "machine", "cable"].includes(newCat)
        ? newMax
        : undefined,
      adjustable: newCat === "dumbbell" || newCat === "cable",
      note: "",
    };
    setV({ ...v, equipment: [...v.equipment, item] });
    setNewName("");
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? "新场馆" : "编辑场馆"}
      footer={
        <div className="flex gap-2">
          {!isNew && (
            <button className="btn-danger" onClick={() => onDelete(v.id)}>
              删除
            </button>
          )}
          <button className="btn-primary flex-1" disabled={!v.name.trim()} onClick={() => onSave(v)}>
            保存
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">名称</label>
          <input
            className="input"
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            placeholder="如：公司健身房"
          />
        </div>
        <div>
          <div className="label">类型</div>
          <Segmented
            value={v.kind}
            onChange={(k) => setV({ ...v, kind: k as Venue["kind"] })}
            options={[
              { value: "home", label: "居家" },
              { value: "gym", label: "健身房" },
              { value: "office", label: "办公室" },
              { value: "outdoor", label: "户外" },
              { value: "other", label: "其他" },
            ]}
          />
        </div>
        <div>
          <label className="label">训练地点（选填）</label>
          <input className="input" value={v.location ?? ""} onChange={(e) => setV({ ...v, location: e.target.value })} />
        </div>

        <div className="border-t border-dashed border-paper-line pt-3">
          <div className="section-title">器械清单</div>
          {v.equipment.length === 0 && (
            <div className="py-2 text-center text-[12.5px] text-ink-faint">
              空器械清单 = 只能安排徒手动作。
            </div>
          )}
          <div className="space-y-1.5">
            {v.equipment.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-lg border border-paper-line px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px]">{e.name}</div>
                  <div className="text-[11px] text-ink-faint">
                    {EQUIPMENT_LABEL[e.category]}
                    {e.maxWeightKg ? ` · 最大 ${e.maxWeightKg}kg` : ""}
                    {e.adjustable ? " · 可调" : ""}
                  </div>
                </div>
                <button
                  className="btn-ghost !px-1 text-[12px] text-alert"
                  onClick={() => setV({ ...v, equipment: v.equipment.filter((x) => x.id !== e.id) })}
                >
                  移除
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 space-y-2 rounded-xl bg-paper p-2.5">
            <div className="text-[12.5px] font-medium">添加器械</div>
            <input
              className="input"
              placeholder="名称，如：可调哑铃"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {EQUIP_CATS.map((c) => (
                <Chip key={c} active={newCat === c} onClick={() => setNewCat(c)}>
                  {EQUIPMENT_LABEL[c]}
                </Chip>
              ))}
            </div>
            {["dumbbell", "barbell", "kettlebell", "machine", "cable"].includes(newCat) && (
              <div className="flex items-center justify-between">
                <span className="text-[13px]">可用最大重量</span>
                <Stepper value={newMax} onChange={setNewMax} step={2.5} min={1} max={500} unit="kg" />
              </div>
            )}
            <button className="btn-secondary w-full" onClick={addEquip} disabled={!newName.trim()}>
              加入清单
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------- 饮食档案 -------------------------------- */

function DietSheet({
  open,
  onClose,
  diet,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  diet: DietProfile;
  onSave: (d: DietProfile) => void;
}) {
  const [d, setD] = useState(diet);
  const [allergen, setAllergen] = useState("");
  const [dislike, setDislike] = useState("");
  const [pref, setPref] = useState("");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="饮食档案"
      footer={
        <button
          className="btn-primary w-full"
          onClick={() => {
            onSave(d);
            onClose();
          }}
        >
          保存
        </button>
      }
    >
      <div className="space-y-4">
        <TagField label="过敏原" tags={d.allergens} value={allergen} setValue={setAllergen} onChange={(t) => setD({ ...d, allergens: t })} placeholder="如：花生、海鲜" />
        <TagField label="忌口" tags={d.dislikes} value={dislike} setValue={setDislike} onChange={(t) => setD({ ...d, dislikes: t })} placeholder="如：香菜、内脏" />
        <TagField label="偏好" tags={d.preferences} value={pref} setValue={setPref} onChange={(t) => setD({ ...d, preferences: t })} placeholder="如：高蛋白、清淡" />
        <div className="flex items-center justify-between">
          <span className="text-[14px]">每日预算（元，0 = 不限）</span>
          <Stepper value={d.budgetPerDay} onChange={(v) => setD({ ...d, budgetPerDay: v })} step={10} min={0} max={1000} />
        </div>
        <div>
          <div className="label">做饭条件</div>
          <Segmented
            value={d.cookingAbility}
            onChange={(v) => setD({ ...d, cookingAbility: v })}
            options={[
              { value: "none", label: "几乎不做" },
              { value: "simple", label: "简单处理" },
              { value: "full", label: "可做饭" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[14px]">每日餐次</span>
          <Stepper value={d.mealsPerDay} onChange={(v) => setD({ ...d, mealsPerDay: v })} min={2} max={6} unit="餐" />
        </div>
      </div>
    </Sheet>
  );
}

function TagField({
  label,
  tags,
  value,
  setValue,
  onChange,
  placeholder,
}: {
  label: string;
  tags: string[];
  value: string;
  setValue: (v: string) => void;
  onChange: (t: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <Chip key={t} active onClick={() => onChange(tags.filter((x) => x !== t))}>
            {t} ✕
          </Chip>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        <input
          className="input flex-1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
        />
        <button
          className="btn-secondary shrink-0"
          onClick={() => {
            if (!value.trim()) return;
            onChange([...tags, value.trim()]);
            setValue("");
          }}
        >
          添加
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- 提醒 ---------------------------------- */

function RemindSheet({
  open,
  onClose,
  value,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  value: import("@/lib/types").ReminderSettings;
  onSave: (v: import("@/lib/types").ReminderSettings) => void;
}) {
  const [r, setR] = useState(value);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="提醒设置"
      footer={
        <button className="btn-primary w-full" onClick={() => onSave(r)}>
          保存
        </button>
      }
    >
      <div className="space-y-4">
        <ToggleRow
          label="饮水提醒"
          on={r.waterEnabled}
          onToggle={() => setR({ ...r, waterEnabled: !r.waterEnabled })}
        >
          {r.waterEnabled && (
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[13px]">间隔</span>
              <Stepper value={r.waterIntervalMin} onChange={(v) => setR({ ...r, waterIntervalMin: v })} step={15} min={15} max={240} unit="分" />
            </div>
          )}
        </ToggleRow>
        <ToggleRow label="活动提醒（起身动一动）" on={r.moveEnabled} onToggle={() => setR({ ...r, moveEnabled: !r.moveEnabled })}>
          {r.moveEnabled && (
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[13px]">间隔</span>
              <Stepper value={r.moveIntervalMin} onChange={(v) => setR({ ...r, moveIntervalMin: v })} step={15} min={15} max={240} unit="分" />
            </div>
          )}
        </ToggleRow>
        <ToggleRow label="训练提醒" on={r.trainingEnabled} onToggle={() => setR({ ...r, trainingEnabled: !r.trainingEnabled })}>
          {r.trainingEnabled && (
            <div className="mt-2">
              <input
                type="time"
                className="input"
                value={r.trainingTime ?? "19:00"}
                onChange={(e) => setR({ ...r, trainingTime: e.target.value })}
              />
            </div>
          )}
        </ToggleRow>
        <div className="text-[11.5px] leading-relaxed text-ink-faint">
          提醒在应用打开时生效；本应用不发送系统推送通知，也不会在后台持续运行。全部关闭即可完全静音。
        </div>
      </div>
    </Sheet>
  );
}

function ToggleRow({
  label,
  on,
  onToggle,
  children,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-paper-line px-3 py-2.5">
      <label className="flex items-center justify-between">
        <span className="text-[14px]">{label}</span>
        <input type="checkbox" className="h-4 w-4 accent-moss-600" checked={on} onChange={onToggle} />
      </label>
      {children}
    </div>
  );
}
