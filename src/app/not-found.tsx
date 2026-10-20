import Link from "next/link";

/**
 * 404 页面（server component）。App Router 里访问不存在的路由会渲染这里，
 * 与五导航保持同一套外观；给用户明确的回首页入口，而不是框架默认的英文页。
 */
export default function NotFound() {
  return (
    <div className="p-4">
      <div className="rounded-xl2 border border-paper-line bg-paper-card p-6 text-center shadow-soft">
        <div className="text-[40px] font-semibold leading-tight tabular-nums text-ink-faint">404</div>
        <h1 className="mt-1 text-[18px] font-semibold">没找到这个页面</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          链接可能已经失效，或者地址输错了。FitLoop 的五个入口是：今日 / 训练 / 饮食 / 进展 / 我的。
        </p>
        <Link href="/" className="btn-primary mt-4">
          回到今日
        </Link>
      </div>
    </div>
  );
}
