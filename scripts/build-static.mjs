/**
 * 静态导出构建（用于 GitHub Pages / 任意纯静态托管）
 * ---------------------------------------------------------------------------
 * GitHub Pages 只能托管静态文件，而本项目带两个 Node 路由代理
 * （/api/food/search、/api/vision/analyze）。`output: "export"` 不允许
 * dynamic 的 route handler，因此这里在构建期间把 `src/app/api` 临时移出
 * 源码树，构建完再原样还原 —— 不改动仓库内容，也不影响常规 `next build`。
 *
 * 用法：
 *   node scripts/build-static.mjs                 # 默认 basePath=/fit-loop
 *   node scripts/build-static.mjs --base=/        # 部署到用户主页根路径
 *   node scripts/build-static.mjs --base=/fit-loop
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const baseArg = process.argv.find((a) => a.startsWith("--base="));
let basePath = baseArg ? baseArg.slice("--base=".length) : "/fit-loop";
if (basePath === "/") basePath = "";
if (basePath && !basePath.startsWith("/")) basePath = "/" + basePath;
if (basePath.endsWith("/")) basePath = basePath.slice(0, -1);

const apiDir = join(root, "src", "app", "api");
// 必须与项目同盘（Windows 下跨盘 rename 会 EXDEV），所以放在项目根的点目录里。
const backupDir = join(root, ".static-api-backup");
const outDir = join(root, "out");

function log(msg) {
  console.log(`[static] ${msg}`);
}

let moved = false;
try {
  if (existsSync(apiDir)) {
    log(`把 ${apiDir} 临时移到 ${backupDir}`);
    if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true });
    try {
      renameSync(apiDir, backupDir);
    } catch (e) {
      // 极端情况（不同卷/被杀软占用）下退回复制+删除
      log(`rename 失败（${e.code ?? e.message}），改用复制方式`);
      cpSync(apiDir, backupDir, { recursive: true });
      rmSync(apiDir, { recursive: true, force: true });
    }
    moved = true;
  }

  if (existsSync(outDir)) {
    log("清理旧的 out/");
    rmSync(outDir, { recursive: true, force: true });
  }

  log(`开始 next build（basePath=${basePath || "/"}）`);
  const res = spawnSync(
    process.execPath,
    [join(root, "node_modules", "next", "dist", "bin", "next"), "build"],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_OPTIONS: "",
        NEXT_STATIC_EXPORT: "1",
        NEXT_PUBLIC_STATIC_DEPLOY: "1",
        NEXT_BASE_PATH: basePath,
      },
    },
  );

  if (res.status !== 0) {
    throw new Error(`next build 失败，退出码 ${res.status}`);
  }
} finally {
  if (moved) {
    log("还原 src/app/api");
    if (existsSync(apiDir)) rmSync(apiDir, { recursive: true, force: true });
    renameSync(backupDir, apiDir);
  }
}

if (!existsSync(outDir)) {
  console.error("[static] 构建结束但没有生成 out/ 目录");
  process.exit(1);
}

// GitHub Pages 默认走 Jekyll，会忽略 `_next` 这类下划线开头的目录 → 必须关掉。
writeFileSync(join(outDir, ".nojekyll"), "");
log("已写入 out/.nojekyll");

// GitHub Pages 对未知路径返回 404.html；Next 静态导出已生成，这里确认存在。
if (!existsSync(join(outDir, "404.html"))) {
  log("警告：没有生成 404.html（未知路径会落到 GitHub 默认 404）");
}

log("完成。产物目录：out/");
log(`部署后访问路径前缀：${basePath || "/"}`);
