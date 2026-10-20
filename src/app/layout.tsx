import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/components/AppProvider";
import { BottomNav } from "@/components/BottomNav";
import { ToastHost } from "@/components/ui";

export const metadata: Metadata = {
  title: "FitLoop · 训练与饮食记录",
  description:
    "学习动作、制定计划、执行训练、管理饮食、复盘调整的移动端优先健身管理应用（本地优先，数据保存在你的浏览器）。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  // 允许缩放（WCAG 1.4.4）；输入类字号在 globals.css 里保持 ≥16px，避免 iOS 聚焦自动放大
  // 必须显式 viewport-fit=cover，iOS Safari 的 env(safe-area-inset-*) 才会返回真实值；
  // 否则 BottomNav/Sheet footer 用的 --safe-bottom 恒为 0，底部会被 Home Indicator 压住。
  viewportFit: "cover",
  themeColor: "#FBF9F6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AppProvider>
          <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col bg-paper">
            <main className="flex-1 pb-24">{children}</main>
            <BottomNav />
          </div>
          <ToastHost />
        </AppProvider>
      </body>
    </html>
  );
}
