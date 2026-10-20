import type { MuscleGroup, MuscleRegion } from "../types";

/**
 * 主要肌群（第一版覆盖主要肌群；children 为扩展位，可用于后续细化到子肌群）
 * side 用于正/反面 SVG 高亮。
 */
export const MUSCLES: MuscleGroup[] = [
  // 正面
  {
    id: "chest_upper",
    name: "上胸",
    latin: "Pectoralis major (clavicular)",
    region: "chest",
    side: "front",
    function: "肩关节水平内收与上举发力，上斜推类动作主要承担者。",
  },
  {
    id: "chest_mid",
    name: "胸大肌",
    latin: "Pectoralis major",
    region: "chest",
    side: "front",
    function: "肩关节水平内收（推、卧推、俯卧撑）。",
  },
  {
    id: "front_delts",
    name: "前束（肩）",
    latin: "Deltoid (anterior)",
    region: "shoulders",
    side: "front",
    function: "肩关节前屈与水平内收，推类动作协同。",
  },
  {
    id: "side_delts",
    name: "中束（肩）",
    latin: "Deltoid (lateral)",
    region: "shoulders",
    side: "both",
    function: "肩关节外展，决定肩部宽度视觉。",
  },
  {
    id: "biceps",
    name: "肱二头肌",
    latin: "Biceps brachii",
    region: "arms",
    side: "front",
    function: "肘屈与旋后，拉类动作协同。",
  },
  {
    id: "forearms",
    name: "前臂",
    latin: "Forearm flexors/extensors",
    region: "arms",
    side: "both",
    function: "握力与手腕稳定，硬拉、划船的限速环节。",
  },
  {
    id: "abs",
    name: "腹直肌",
    latin: "Rectus abdominis",
    region: "core",
    side: "front",
    function: "躯干屈曲与抗伸展。",
  },
  {
    id: "obliques",
    name: "腹斜肌",
    latin: "Obliques",
    region: "core",
    side: "both",
    function: "躯干旋转与抗侧屈。",
  },
  {
    id: "quads",
    name: "股四头肌",
    latin: "Quadriceps",
    region: "legs",
    side: "front",
    function: "伸膝，深蹲、弓步、 leg extension 主动肌。",
  },
  {
    id: "hip_flexors",
    name: "髋屈肌",
    latin: "Iliopsoas",
    region: "legs",
    side: "front",
    function: "屈髋，久坐人群常紧张。",
  },
  {
    id: "adductors",
    name: "大腿内侧",
    latin: "Adductors",
    region: "legs",
    side: "front",
    function: "髋关节内收，宽站距深蹲协同。",
  },
  {
    id: "tibialis",
    name: "胫骨前肌",
    latin: "Tibialis anterior",
    region: "legs",
    side: "front",
    function: "足背屈，走路与深蹲稳定。",
  },
  // 背面
  {
    id: "lats",
    name: "背阔肌",
    latin: "Latissimus dorsi",
    region: "back",
    side: "back",
    function: "肩关节内收与下拉，引体、划船主动肌。",
  },
  {
    id: "upper_back",
    name: "上背（斜方中下束）",
    latin: "Trapezius (middle/lower)",
    region: "back",
    side: "back",
    function: "肩胛后缩与下沉，体态与肩健康关键。",
  },
  {
    id: "traps",
    name: "斜方肌上束",
    latin: "Trapezius (upper)",
    region: "back",
    side: "back",
    function: "肩胛上提，耸肩类动作。",
  },
  {
    id: "rear_delts",
    name: "后束（肩）",
    latin: "Deltoid (posterior)",
    region: "shoulders",
    side: "back",
    function: "肩关节水平外展，平衡推类训练。",
  },
  {
    id: "triceps",
    name: "肱三头肌",
    latin: "Triceps brachii",
    region: "arms",
    side: "back",
    function: "伸肘，所有推类动作的协同肌。",
  },
  {
    id: "lower_back",
    name: "下背（竖脊肌）",
    latin: "Erector spinae",
    region: "back",
    side: "back",
    function: "脊柱抗屈曲，硬拉与负重行走的稳定肌。",
  },
  {
    id: "glutes",
    name: "臀大肌",
    latin: "Gluteus maximus",
    region: "glutes",
    side: "back",
    function: "伸髋主力，深蹲、硬拉、臀推的核心。",
  },
  {
    id: "glute_med",
    name: "臀中肌",
    latin: "Gluteus medius",
    region: "glutes",
    side: "back",
    function: "髋外展与骨盆稳定，单腿动作关键。",
  },
  {
    id: "hamstrings",
    name: "腘绳肌",
    latin: "Hamstrings",
    region: "legs",
    side: "back",
    function: "屈膝与伸髋，与股四头肌平衡。",
  },
  {
    id: "calves",
    name: "小腿三头肌",
    latin: "Triceps surae",
    region: "legs",
    side: "back",
    function: "踝跖屈，提踵与弹跳。",
  },
  // 心肺（非骨骼肌，用于有氧动作归类）
  {
    id: "cardio_system",
    name: "心肺系统",
    latin: "Cardiorespiratory system",
    region: "cardio",
    side: "both",
    function: "有氧耐力与心肺适能，属于能量系统而非单一肌肉。",
  },
];

export const MUSCLE_MAP: Record<string, MuscleGroup> = Object.fromEntries(
  MUSCLES.map((m) => [m.id, m]),
);

export const REGION_LABEL: Record<MuscleRegion, string> = {
  chest: "胸部",
  back: "背部",
  shoulders: "肩部",
  arms: "手臂",
  core: "核心",
  glutes: "臀部",
  legs: "腿部",
  cardio: "心肺",
};

export function muscleName(id: string): string {
  return MUSCLE_MAP[id]?.name ?? id;
}
