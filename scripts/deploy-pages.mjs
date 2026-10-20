/**
 * 一键发布到 GitHub Pages
 * ---------------------------------------------------------------------------
 * 1) 先跑静态导出（scripts/build-static.mjs）
 * 2) 把 out/ 的内容强制推到 GitHub 的 `gh-pages` 分支
 * 3) GitHub Pages 会自动重建，约 30-60 秒后 https://<用户>.github.io/fit-loop/ 更新
 *
 * 用法：
 *   node scripts/deploy-pages.mjs            # 默认 /fit-loop 前缀
 *   node scripts/deploy-pages.mjs --base=/   # 用户主页根路径
 *
 * 前置：本机已 `gh auth login`（git 凭据已配置），且 origin 指向 GitHub 仓库。
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const stage = join(root, ".pages-deploy");
const baseArg = process.argv.find((a) => a.startsWith("--base=")) ?? "--base=/fit-loop";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? root, stdio: "inherit", shell: false, env: { ...process.env, NODE_OPTIONS: "" } });
  if (r.status !== 0) throw new Error(`命令失败：${cmd} ${args.join(" ")}（退出码 ${r.status}）`);
}
function capture(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`命令失败：${cmd} ${args.join(" ")}`);
  return (r.stdout ?? "").trim();
}

console.log("[deploy] 1/3 静态构建");
run(process.execPath, [join(root, "scripts", "build-static.mjs"), baseArg]);

const outDir = join(root, "out");
if (!existsSync(outDir)) throw new Error("没有找到 out/，构建可能失败");

let origin;
try {
  origin = capture("git", ["remote", "get-url", "origin"]);
} catch {
  throw new Error("当前目录没有 git origin，请先绑定 GitHub 仓库");
}
console.log(`[deploy] 2/3 暂存产物（origin: ${origin}）`);

if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(outDir, stage, { recursive: true });

const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
run("git", ["init", "-q", "-b", "gh-pages"], { cwd: stage });
const name = capture("git", ["config", "user.name"], root) || "pages-bot";
const email = capture("git", ["config", "user.email"], root) || "pages-bot@users.noreply.github.com";
run("git", ["config", "user.name", name], { cwd: stage });
run("git", ["config", "user.email", email], { cwd: stage });
run("git", ["add", "-A"], { cwd: stage });
run("git", ["commit", "-q", "-m", `deploy: ${stamp}`], { cwd: stage });
run("git", ["push", "-f", origin, "gh-pages"], { cwd: stage });

rmSync(stage, { recursive: true, force: true });
console.log("[deploy] 3/3 已推送到 gh-pages，GitHub Pages 约 30-60 秒后生效");
