/** @type {import('next').NextConfig} */
const isStatic = process.env.NEXT_STATIC_EXPORT === "1";
const basePath = process.env.NEXT_BASE_PATH ?? "";

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
  /**
   * 静态导出（GitHub Pages / 任意纯静态托管）：
   * 由 scripts/build-static.mjs 带环境变量调用，产出 out/ 目录。
   * 平时 `next build` / `next dev` 完全不受影响，仍保留两个服务端代理路由。
   */
  ...(isStatic
    ? {
        output: "export",
        trailingSlash: true,
        ...(basePath ? { basePath, assetPrefix: basePath } : {}),
      }
    : {}),
};

export default nextConfig;
