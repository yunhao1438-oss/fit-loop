"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";

const ITEMS = [
  {
    href: "/",
    label: "今日",
    icon: (
      <path d="M4 11.5 12 5l8 6.5M6 10v9h12v-9" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    href: "/train",
    label: "训练",
    icon: (
      <>
        <path d="M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/diet",
    label: "饮食",
    icon: (
      <>
        <path d="M6 4v7a3 3 0 0 0 3 3v6M11 4v7M16 4c1.6 1 2.4 2.6 2.4 4.4 0 1.9-.9 3.2-2.4 3.6V20" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/progress",
    label: "进展",
    icon: (
      <>
        <path d="M4 19h16M6 19V9M11 19V5M16 19v-6" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/me",
    label: "我的",
    icon: (
      <>
        <circle cx="12" cy="8.5" r="3.4" strokeWidth="1.6" />
        <path d="M5 20c1.2-3.4 3.9-5 7-5s5.8 1.6 7 5" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-paper-line bg-paper-card/95 backdrop-blur"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-[560px]">
        {ITEMS.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition",
                active ? "text-moss-600" : "text-ink-faint",
              )}
            >
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor">
                {it.icon}
              </svg>
              <span className={cx(active && "font-medium")}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
