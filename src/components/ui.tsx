"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/utils";

/* --------------------------------- Toast --------------------------------- */

type ToastItem = { id: number; text: string; kind: "info" | "ok" | "warn" | "err" };
let toastSeq = 0;
const listeners = new Set<(t: ToastItem) => void>();

export function toast(text: string, kind: ToastItem["kind"] = "info") {
  const t = { id: ++toastSeq, text, kind };
  listeners.forEach((l) => l(t));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const fn = (t: ToastItem) => {
      setItems((prev) => [...prev, t]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 2600);
      timers.add(timer);
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            "fade-in max-w-[92vw] rounded-xl px-3.5 py-2 text-[13px] shadow-lift",
            t.kind === "ok" && "bg-moss-600 text-white",
            t.kind === "err" && "bg-alert text-white",
            t.kind === "warn" && "bg-warn text-white",
            t.kind === "info" && "bg-ink/90 text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ 对话框焦点管理 ----------------------------- */

/**
 * 打开中的 Modal 数量。Sheet 内可能再叠一个 Modal（如动作库 → 动作详情），
 * 此时按 Esc 只应关闭最上层，而不是把 Sheet 和 Modal 一起关掉。
 */
let openModalCount = 0;

/** 把 Tab 焦点限制在对话框内（焦点在面板内时按键才会冒泡到这里） */
function trapTab(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "Tab") return;
  const root = e.currentTarget;
  const focusables = Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (!active || active === root) {
    e.preventDefault();
    first.focus();
    return;
  }
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/* --------------------------------- Card ---------------------------------- */

export function Card({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div className={cx("card", onClick && "cursor-pointer active:scale-[.995]", className)} onClick={onClick}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="section-title">
      <span>{children}</span>
      {right}
    </div>
  );
}

/* --------------------------------- Chip ---------------------------------- */

export function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("chip", active && "chip-active", !onClick && "pointer-events-none", className)}
    >
      {children}
    </button>
  );
}

/* --------------------------------- Sheet --------------------------------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  maxH = "85vh",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxH?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** 用 ref 保存 onClose，避免父组件每次渲染传入新函数时反复重建监听 / 抢焦点 */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const h = (e: KeyboardEvent) => {
      // 上层还有 Modal 时，Esc 交给 Modal 自己处理，避免两层一起关闭
      if (e.key === "Escape" && openModalCount === 0) onCloseRef.current();
    };
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const root = panelRef.current;
      // 面板里已有 autoFocus 的输入框时不抢焦点（否则移动端会立刻收起键盘）
      if (!root || root.contains(document.activeElement)) return;
      root.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
      clearTimeout(t);
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="fade-in absolute inset-0 bg-ink/25" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "面板"}
        onKeyDown={trapTab}
        className="sheet-enter relative flex w-full max-w-[560px] flex-col rounded-t-2xl bg-paper shadow-lift outline-none"
        style={{ maxHeight: maxH }}
      >
        <div className="flex items-center justify-between border-b border-paper-line px-4 py-3">
          <div className="text-[15px] font-semibold">{title}</div>
          <button onClick={onClose} className="btn-ghost -mr-2 px-2 py-1 text-sm">
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && (
          <div
            className="border-t border-paper-line px-4 py-3"
            style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    openModalCount += 1;
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const root = panelRef.current;
      // 面板里已有 autoFocus 的输入框时不抢焦点（否则移动端会立刻收起键盘）
      if (!root || root.contains(document.activeElement)) return;
      root.focus();
    }, 30);
    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      document.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
      clearTimeout(t);
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="fade-in absolute inset-0 bg-ink/30" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "对话框"}
        onKeyDown={trapTab}
        className="sheet-enter relative max-h-[88vh] w-full max-w-[520px] overflow-hidden rounded-t-2xl bg-paper-card shadow-lift outline-none sm:rounded-2xl"
      >
        {title && (
          <div className="flex items-center justify-between border-b border-paper-line px-4 py-3">
            <div className="text-[15px] font-semibold">{title}</div>
            <button onClick={onClose} className="btn-ghost -mr-2 px-2 py-1 text-sm">
              关闭
            </button>
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">{children}</div>
        {footer && (
          <div className="border-t border-paper-line px-4 py-3" style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Stepper -------------------------------- */

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="h-9 w-9 rounded-lg border border-paper-line bg-paper-card text-lg leading-none text-ink-soft active:scale-95"
        onClick={() => onChange(Math.max(min, Math.round((value - step) * 10) / 10))}
        aria-label="减少"
      >
        −
      </button>
      <div className="min-w-[64px] rounded-lg border border-paper-line bg-paper px-2 py-1.5 text-center">
        <span className="text-[15px] font-semibold tabular-nums">{value}</span>
        {unit && <span className="ml-0.5 text-[11px] text-ink-faint">{unit}</span>}
      </div>
      <button
        type="button"
        className="h-9 w-9 rounded-lg border border-paper-line bg-paper-card text-lg leading-none text-ink-soft active:scale-95"
        onClick={() => onChange(Math.min(max, Math.round((value + step) * 10) / 10))}
        aria-label="增加"
      >
        +
      </button>
    </div>
  );
}

/* -------------------------------- Segmented ------------------------------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("flex gap-1 rounded-xl bg-paper p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cx(
            "flex-1 rounded-lg px-2 py-1.5 text-[13px] transition",
            value === o.value ? "bg-paper-card font-medium text-ink shadow-soft" : "text-ink-faint",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ 空/加载/错误 ------------------------------ */

export function Empty({ icon, title, hint, action }: { icon?: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-paper-line bg-paper-card/60 px-6 py-10 text-center">
      {icon && <div className="mb-2 text-2xl opacity-60">{icon}</div>}
      <div className="text-[15px] font-medium text-ink">{title}</div>
      {hint && <div className="mt-1 text-[13px] leading-relaxed text-ink-faint">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ text = "加载中…" }: { text?: string }) {
  return (
    <div className="space-y-3 p-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl2 bg-paper-card" />
      ))}
      <div className="pt-2 text-center text-[13px] text-ink-faint">{text}</div>
    </div>
  );
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl2 border border-alert/25 bg-alert/5 p-4">
      <div className="text-[14px] font-medium text-alert">出错了</div>
      <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">{text}</div>
      {onRetry && (
        <button className="btn-secondary mt-3" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

/* ------------------------------- 数据读取异常 ------------------------------ */

/**
 * 全局的本地数据读取异常提示（非阻塞）。
 * 只在 AppProvider 的 error 非空时显示，外观沿用 alert 语义色，
 * 固定定位，不参与首屏布局、不影响底部安全区。
 */
export function DataErrorBanner({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] px-3"
      style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-[560px] items-start gap-2 rounded-xl2 border border-alert/30 bg-paper-card px-3 py-2.5 shadow-lift">
        <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed">
          <div className="font-medium text-alert">本地数据读取异常</div>
          <div className="text-ink-soft">部分记录可能未显示。可以重试，或检查浏览器存储权限 / 剩余空间。</div>
          <div className="mt-0.5 truncate text-[11px] text-ink-faint" title={message}>
            {message}
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 !px-2.5 !py-1 text-[12px]"
          onClick={onRetry}
        >
          重试
        </button>
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 py-1 text-[12px] text-ink-faint"
          onClick={onDismiss}
          aria-label="关闭数据异常提示"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* ------------------------------- 演示角标 -------------------------------- */

export function DemoBadge() {
  return (
    <span className="rounded-md border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-warn">
      演示
    </span>
  );
}

/* ------------------------------- 未接入提示 ------------------------------- */

export function NotConfigured({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-paper-line bg-paper px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-soft">
      <span className="font-medium text-ink">未接入{what}。</span>{" "}
      后端尚未配置对应服务，为避免给出不可靠结果，这里不会模拟返回。你可以先手动记录；配置方法见 README 的「环境变量」一节。
    </div>
  );
}

/* ---------------------------------- 进度条 -------------------------------- */

export function Bar({ value, max, tone = "moss" }: { value: number; max: number; tone?: "moss" | "clay" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-line">
      <div
        className={cx("h-full rounded-full transition-all", tone === "moss" ? "bg-moss-500" : "bg-clay-500")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* --------------------------------- 确认框 -------------------------------- */

export function Confirm({
  open,
  title,
  desc,
  confirmText = "确认",
  danger,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  desc?: string;
  confirmText?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={onCancel}>
            取消
          </button>
          <button className={cx("flex-1", danger ? "btn-danger" : "btn-primary")} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      }
    >
      {desc && <div className="text-[14px] leading-relaxed text-ink-soft">{desc}</div>}
    </Modal>
  );
}
