"use client";

import { useState } from "react";
import { MUSCLES } from "@/lib/seed/muscles";
import { cx } from "@/lib/utils";

/**
 * 可点击的人体肌肉图谱（正面 / 背面）。
 * - 形状为示意性示意，用于快速定位主要肌群，非解剖学精确插图。
 * - 同时提供等效的文字列表（无障碍与可读性）。
 */

interface Shape {
  id: string;
  side: "front" | "back";
  /** 每个形状是若干椭圆/圆：cx cy rx ry [rotate] */
  parts: [number, number, number, number, number?][];
}

const SHAPES: Shape[] = [
  // ---------------- 正面 ----------------
  {
    id: "chest_upper",
    side: "front",
    parts: [[86, 90, 14, 8, -8], [114, 90, 14, 8, 8]],
  },
  { id: "chest_mid", side: "front", parts: [[85, 106, 15, 11, -6], [115, 106, 15, 11, 6]] },
  { id: "front_delts", side: "front", parts: [[74, 74, 9, 8], [126, 74, 9, 8]] },
  { id: "side_delts", side: "front", parts: [[64, 80, 7, 9], [136, 80, 7, 9]] },
  { id: "biceps", side: "front", parts: [[63, 116, 7, 13], [137, 116, 7, 13]] },
  { id: "forearms", side: "front", parts: [[57, 166, 6.5, 14], [143, 166, 6.5, 14]] },
  { id: "abs", side: "front", parts: [[100, 146, 11, 20]] },
  { id: "obliques", side: "front", parts: [[82, 149, 6, 16], [118, 149, 6, 16]] },
  { id: "hip_flexors", side: "front", parts: [[90, 174, 8, 9], [110, 174, 8, 9]] },
  { id: "quads", side: "front", parts: [[84, 226, 14, 42], [116, 226, 14, 42]] },
  { id: "adductors", side: "front", parts: [[95, 252, 6, 26], [105, 252, 6, 26]] },
  { id: "tibialis", side: "front", parts: [[84, 322, 8, 30], [116, 322, 8, 30]] },
  // ---------------- 背面 ----------------
  { id: "traps", side: "back", parts: [[100, 82, 21, 14]] },
  { id: "rear_delts", side: "back", parts: [[70, 76, 8.5, 8.5], [130, 76, 8.5, 8.5]] },
  { id: "upper_back", side: "back", parts: [[100, 110, 26, 14]] },
  { id: "lats", side: "back", parts: [[74, 128, 15, 23], [126, 128, 15, 23]] },
  { id: "triceps", side: "back", parts: [[63, 118, 7, 13], [137, 118, 7, 13]] },
  { id: "forearms", side: "back", parts: [[57, 166, 6.5, 14], [143, 166, 6.5, 14]] },
  { id: "lower_back", side: "back", parts: [[100, 158, 14, 14]] },
  { id: "glute_med", side: "back", parts: [[70, 174, 10, 11], [130, 174, 10, 11]] },
  { id: "glutes", side: "back", parts: [[87, 188, 14, 16], [113, 188, 14, 16]] },
  { id: "hamstrings", side: "back", parts: [[84, 232, 13, 40], [116, 232, 13, 40]] },
  { id: "calves", side: "back", parts: [[84, 312, 10, 32], [116, 312, 10, 32]] },
];

function BodyOutline({ side }: { side: "front" | "back" }) {
  const c = "#E8E3DC";
  return (
    <g>
      <circle cx="100" cy="30" r="15" fill={c} />
      {/* 躯干 */}
      <path d="M78,56 L122,56 L130,96 L120,152 L114,182 L86,182 L80,152 L70,96 Z" fill={c} />
      {/* 手臂（粗描边模拟肢体） */}
      <path
        d="M76,64 L62,120 L55,170"
        fill="none"
        stroke={c}
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M124,64 L138,120 L145,170"
        fill="none"
        stroke={c}
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 腿 */}
      <path d="M90,180 L86,246 L84,318" fill="none" stroke={c} strokeWidth="27" strokeLinecap="round" />
      <path d="M110,180 L114,246 L116,318" fill="none" stroke={c} strokeWidth="27" strokeLinecap="round" />
      {/* 小腿 */}
      <path d="M84,318 L84,352" fill="none" stroke={c} strokeWidth="15" strokeLinecap="round" />
      <path d="M116,318 L116,352" fill="none" stroke={c} strokeWidth="15" strokeLinecap="round" />
      {/* 面部/后脑中线（区分正反） */}
      {side === "back" && <path d="M100,20 L100,44" stroke="#DAD4CB" strokeWidth="2" strokeLinecap="round" />}
    </g>
  );
}

export function MuscleMap({
  side,
  selected,
  heat,
  onToggle,
  className,
}: {
  side: "front" | "back";
  selected?: string[];
  /** 0-1，用于展示近期训练覆盖度 */
  heat?: Record<string, number>;
  onToggle?: (id: string) => void;
  className?: string;
}) {
  const sel = new Set(selected ?? []);
  const shapes = SHAPES.filter((s) => s.side === side);
  const [hover, setHover] = useState<string | null>(null);

  return (
    <svg viewBox="0 0 200 375" className={cx("w-full", className)} role="img" aria-label={`人体${side === "front" ? "正面" : "背面"}肌肉示意图`}>
      <BodyOutline side={side} />
      {shapes.map((s) => {
        const isSel = sel.has(s.id);
        const h = heat?.[s.id] ?? 0;
        const fill = isSel
          ? "#4F8C7B"
          : h > 0
            ? `rgba(224,129,85,${0.18 + h * 0.55})`
            : "rgba(148,148,158,0.22)";
        const stroke = isSel ? "#33604F" : "rgba(255,255,255,0.85)";
        return (
          <g
            key={`${s.side}-${s.id}-${s.parts[0][1]}`}
            onClick={() => onToggle?.(s.id)}
            onMouseEnter={() => setHover(s.id)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: onToggle ? "pointer" : "default" }}
          >
            {s.parts.map((p, i) => (
              <ellipse
                key={i}
                cx={p[0]}
                cy={p[1]}
                rx={p[2]}
                ry={p[3]}
                transform={p[4] ? `rotate(${p[4]} ${p[0]} ${p[1]})` : undefined}
                fill={fill}
                stroke={stroke}
                strokeWidth={hover === s.id ? 1.6 : 1}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** 文字版肌群列表（等效内容，便于无障碍与精确选择） */
export function MuscleList({
  selected,
  onToggle,
  regionFilter,
}: {
  selected?: string[];
  onToggle?: (id: string) => void;
  regionFilter?: string;
}) {
  const sel = new Set(selected ?? []);
  const list = MUSCLES.filter((m) => !regionFilter || m.region === regionFilter);
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onToggle?.(m.id)}
          className={cx("chip", sel.has(m.id) && "chip-active", !onToggle && "pointer-events-none")}
          title={m.function}
        >
          {m.name}
        </button>
      ))}
    </div>
  );
}
