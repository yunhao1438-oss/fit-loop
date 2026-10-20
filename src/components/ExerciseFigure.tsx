"use client";

import type { MovementPattern } from "@/lib/types";

/**
 * 动作示意图：本地绘制的火柴人，按动作模式区分姿势。
 * 这是「示意图」，不是真人演示，UI 上必须附带相应说明文字。
 */

type P = [number, number];

interface Pose {
  head: P;
  neck: P;
  hip: P;
  /** 腿：髋 → 膝 → 脚，可 1-2 条 */
  legs: [P, P, P][];
  /** 臂：肩 → 肘 → 手，可 1-2 条 */
  arms: [P, P, P][];
  /** 地面线 y */
  ground?: number;
  /** 额外道具：横杠 [x1,y1,x2,y2] */
  bar?: [number, number, number, number];
}

const POSES: Partial<Record<MovementPattern, Pose>> = {
  squat: {
    head: [60, 26],
    neck: [60, 36],
    hip: [56, 74],
    legs: [[[56, 74], [46, 94], [48, 116]]],
    arms: [[[58, 44], [74, 58], [80, 52]]],
    bar: [44, 34, 74, 28],
  },
  hinge: {
    head: [68, 30],
    neck: [64, 40],
    hip: [56, 72],
    legs: [[[56, 72], [60, 94], [58, 116]]],
    arms: [[[62, 46], [58, 70], [56, 92]]],
    bar: [46, 92, 66, 92],
  },
  horizontal_push: {
    head: [24, 54],
    neck: [32, 58],
    hip: [84, 66],
    legs: [[[84, 66], [100, 88], [110, 110]]],
    arms: [[[36, 62], [38, 86], [40, 110]]],
    ground: 110,
  },
  vertical_push: {
    head: [60, 24],
    neck: [60, 34],
    hip: [60, 72],
    legs: [
      [[58, 72], [56, 94], [56, 118]],
      [[62, 72], [64, 94], [64, 118]],
    ],
    arms: [
      [[52, 38], [46, 24], [48, 10]],
      [[68, 38], [74, 24], [72, 10]],
    ],
    bar: [44, 10, 76, 10],
  },
  vertical_pull: {
    head: [60, 28],
    neck: [60, 38],
    hip: [60, 78],
    legs: [[[60, 78], [64, 100], [60, 120]]],
    arms: [
      [[54, 42], [48, 22], [50, 6]],
      [[66, 42], [72, 22], [70, 6]],
    ],
    bar: [32, 5, 92, 5],
  },
  horizontal_pull: {
    head: [80, 30],
    neck: [74, 40],
    hip: [56, 72],
    legs: [[[56, 72], [60, 94], [58, 118]]],
    arms: [[[72, 44], [66, 66], [76, 76]]],
  },
  lunge: {
    head: [60, 22],
    neck: [60, 32],
    hip: [60, 72],
    legs: [
      [[60, 72], [46, 92], [44, 116]],
      [[60, 72], [82, 90], [92, 114]],
    ],
    arms: [
      [[56, 38], [54, 58], [54, 78]],
      [[64, 38], [66, 58], [66, 78]],
    ],
  },
  core: {
    head: [28, 86],
    neck: [38, 86],
    hip: [82, 88],
    legs: [[[82, 88], [100, 96], [112, 110]]],
    arms: [[[42, 88], [42, 106], [58, 110]]],
    ground: 110,
  },
  isolation_arm: {
    head: [60, 24],
    neck: [60, 34],
    hip: [60, 74],
    legs: [[[58, 74], [56, 96], [56, 118]]],
    arms: [[[54, 38], [54, 60], [68, 46]]],
  },
  isolation_shoulder: {
    head: [60, 24],
    neck: [60, 34],
    hip: [60, 74],
    legs: [
      [[58, 74], [56, 96], [56, 118]],
      [[62, 74], [64, 96], [64, 118]],
    ],
    arms: [
      [[52, 38], [40, 46], [30, 44]],
      [[68, 38], [80, 46], [90, 44]],
    ],
  },
  isolation_leg: {
    head: [56, 20],
    neck: [56, 30],
    hip: [52, 70],
    legs: [[[52, 70], [84, 70], [88, 104]]],
    arms: [[[54, 38], [62, 56], [72, 66]]],
    ground: 104,
  },
  carry: {
    head: [60, 22],
    neck: [60, 32],
    hip: [60, 72],
    legs: [
      [[58, 72], [56, 94], [56, 118]],
      [[62, 72], [64, 94], [64, 118]],
    ],
    arms: [
      [[54, 38], [52, 60], [52, 80]],
      [[66, 38], [68, 60], [68, 80]],
    ],
  },
  rotation: {
    head: [60, 24],
    neck: [60, 34],
    hip: [60, 74],
    legs: [[[58, 74], [56, 96], [56, 118]]],
    arms: [
      [[54, 38], [64, 52], [74, 44]],
      [[66, 38], [76, 52], [74, 46]],
    ],
  },
  cardio: {
    head: [62, 22],
    neck: [60, 32],
    hip: [58, 70],
    legs: [
      [[58, 70], [46, 84], [40, 104]],
      [[58, 70], [72, 88], [84, 102]],
    ],
    arms: [
      [[56, 38], [44, 48], [50, 40]],
      [[64, 38], [76, 48], [70, 40]],
    ],
  },
};

export function ExerciseFigure({
  pattern,
  color = "#5B5B63",
  className,
}: {
  pattern: MovementPattern;
  color?: string;
  className?: string;
}) {
  const pose = POSES[pattern] ?? POSES.squat!;
  const stroke = { stroke: color, strokeWidth: 3, strokeLinecap: "round" as const, fill: "none" };

  return (
    <svg viewBox="0 0 120 130" className={className} role="img" aria-label="动作示意简图">
      {pose.ground !== undefined && (
        <line x1="8" y1={pose.ground} x2="112" y2={pose.ground} stroke="#E2DCD3" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {/* 脊柱 */}
      <path d={`M${pose.neck[0]},${pose.neck[1]} L${pose.hip[0]},${pose.hip[1]}`} {...stroke} />
      {/* 腿 */}
      {pose.legs.map((l, i) => (
        <path key={`l${i}`} d={`M${l[0][0]},${l[0][1]} L${l[1][0]},${l[1][1]} L${l[2][0]},${l[2][1]}`} {...stroke} />
      ))}
      {/* 臂 */}
      {pose.arms.map((a, i) => (
        <path key={`a${i}`} d={`M${a[0][0]},${a[0][1]} L${a[1][0]},${a[1][1]} L${a[2][0]},${a[2][1]}`} {...stroke} />
      ))}
      {/* 头 */}
      <circle cx={pose.head[0]} cy={pose.head[1]} r="8" fill={color} />
      {pose.bar && (
        <>
          <rect
            x={Math.min(pose.bar[0], pose.bar[2])}
            y={pose.bar[1] - 2}
            width={Math.abs(pose.bar[2] - pose.bar[0])}
            height="4"
            rx="2"
            fill={color}
          />
          <circle cx={pose.bar[0]} cy={pose.bar[1]} r="3.6" fill={color} opacity="0.75" />
          <circle cx={pose.bar[2]} cy={pose.bar[3]} r="3.6" fill={color} opacity="0.75" />
        </>
      )}
    </svg>
  );
}
