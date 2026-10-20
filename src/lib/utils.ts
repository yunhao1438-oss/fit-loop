export function uid(prefix = "id"): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * 从 ISO 时间戳取「本地日历日期」。
 *
 * 实体里的 `date` 字段（饮食 / 体重 / 恢复）都是本地日期（todayISO），
 * 而 `startedAt` 等是 UTC ISO 字符串。直接用 `iso.slice(0, 10)` 会得到 UTC 日期，
 * 在 UTC+8 等时区会把凌晨的训练算到前一天，跨周的周一清晨训练甚至会掉出本周。
 * 因此所有「按天归组」的地方都必须先转成本地日期。
 */
export function isoDateOf(isoDateTime: string): string {
  return toISODate(new Date(isoDateTime));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** 计算两个 ISO 日期相差天数（b - a） */
export function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(`${aISO}T00:00:00`).getTime();
  const b = new Date(`${bISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 0=周一 ... 6=周日 */
export function weekdayOf(iso: string): number {
  const d = new Date(`${iso}T00:00:00`).getDay(); // 0=周日
  return (d + 6) % 7;
}

export function startOfWeekISO(iso: string): string {
  return addDays(iso, -weekdayOf(iso));
}

export function formatDateCN(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function weekdayCN(weekday: number): string {
  return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][weekday] ?? "";
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${`${s}`.padStart(2, "0")}`;
}

export function formatHM(iso: string): string {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** 稳定的伪随机（同一 seed 产生同一序列），用于演示数据可复现 */
export function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
