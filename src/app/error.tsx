"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * 路由级错误边界（App Router 约定：必须是 client component，且接收 error / reset）。
 * ---------------------------------------------------------------------------
 * 只展示通用说明与错误编号：error.message / 堆栈可能包含内部路径、上游响应片段或
 * 用户数据，不直接渲染到界面上。数据都在本机 IndexedDB，渲染错误不会删除记录。
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 只记录错误类型与 digest 便于和服务端日志对齐；不打印 message/堆栈内容
    console.error("[app/error]", error.name, error.digest ?? "");
  }, [error]);

  return (
    <div className="p-4">
      <div className="rounded-xl2 border border-alert/25 bg-alert/5 p-5">
        <div className="text-[16px] font-semibold text-alert">页面出错了</div>
        <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          这通常是一次性的渲染或读取失败，重试一般就能恢复。你的训练、饮食与体重记录都保存在本机浏览器里，
          不会因为这次错误被删除。
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" onClick={() => reset()}>
            重试
          </button>
          <Link href="/" className="btn-secondary flex-1">
            回到今日
          </Link>
        </div>
        {error.digest && (
          <div className="mt-3 text-[11px] tabular-nums text-ink-faint">错误编号：{error.digest}</div>
        )}
      </div>
    </div>
  );
}
