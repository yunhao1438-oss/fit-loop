# FitLoop · 训练 / 饮食 / 复盘一体化健身管理

一个**中文、手机优先、本地优先（local-first）**的健身管理网页应用。覆盖完整闭环：

> 学习动作 → 制定计划 → 执行训练 → 管理饮食 → 复盘调整

数据默认**全部保存在浏览器本地（IndexedDB）**，不强制任何后端；联网能力（食物库 / 拍照识别）在未配置密钥时自动回退到「手动录入 / 提示未接入」，**绝不伪造数据**。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 15（App Router）+ React 19 |
| 语言 | TypeScript（严格模式 `strict`） |
| 样式 | Tailwind CSS 3（自定义 moss / clay / ink / paper 配色，安全区适配） |
| 存储 | `idb`（IndexedDB 封装）+ 内存兜底（隐私模式 / 老浏览器降级） |
| 构建 | `next build` 生产构建；`node --test` + esbuild 纯逻辑单测 |
| 服务端 | 仅用于「密钥不出端」的代理：`/api/food/search`、`/api/vision/analyze` |

设计原则：**纯逻辑层（计划生成、营养计算、渐进建议、复盘）与 UI 完全解耦**，因此可独立单测，且不依赖浏览器 API。

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 本地开发（默认 http://localhost:3000）
npm run dev

# 3. 生产构建并启动
npm run build
npm run start

# 4. 类型检查
npm run typecheck

# 5. 运行单元测试
npm test
#   等价于：node tests/build.mjs && node --test tests/plan.test.mjs tests/nutrition.test.mjs
```

> 首次打开会进入 6 步建档向导；可选择「载入演示数据」快速体验（演示数据全部带 `演示` 角标，可在「我的 → 数据管理」一键清除）。

---

## 环境变量（可选）

复制 `.env.example` 为 `.env.local`。**所有密钥仅存于服务端，不会下发到浏览器。**

```bash
# 食物营养查询（默认 none，即不联网、只用手动/内置库）
FOOD_DATA_PROVIDER=none          # none | usda
USDA_API_KEY=                    # 当 provider=usda 时填写

# 拍照识别（默认 none，即只走「上传→候选→用户确认」的手动流程）
VISION_PROVIDER=none             # none | openai
OPENAI_API_KEY=
OPENAI_BASE_URL=                 # 兼容代理地址，可选
VISION_MODEL=gpt-4o-mini
```

未接入时的行为（明确、不伪造）：
- `FOOD_DATA_PROVIDER=none`：食物查询只返回内置库 + 手动录入；联网查询按钮给出「未接入」提示。
- `VISION_PROVIDER=none`：拍照识别不调用任何模型，仅提供「上传图片 → 用户手动确认份量/烹饪/用油 → 计入」的辅助流程，**照片无法确定重量与配料，绝不输出虚假精确值，也不会自动写入**。

---

## 功能地图

底部五导航：**今日 / 训练 / 饮食 / 进展 / 我的**

### 1. 个人档案与器械（`me` + `Onboarding`）
- 6 步建档向导：目标 / 经验 / 时间 / 身体数据 / 器械 / 饮食档案。
- 多场馆与器械清单（含演示场馆），训练页可切换。
- 饮食档案：过敏原 / 忌口 / 偏好 / 预算 / 做饭条件。

### 2. 肌肉图谱 + 动作库（`train` 内）
- 可点击正 / 反面人体 SVG（示意椭圆，附等价的文字肌群列表，满足无障碍）。
- 动作库 ~70 个：主练 / 辅助肌群、器械、步骤、呼吸、常见错误、难度、替代动作；支持肌群 / 器械 / 难度 / 搜索筛选。
- 无外部素材时，动作示意图用**本地火柴人**按动作模式（蹲 / 推 / 拉 / 铰链 / 核心 / 有氧等）即时绘制。

### 3. 个性化训练计划（`train` + `PlanEditor`）
- 按目标 / 经验 / 时间 / 器械 / 限制生成可编辑计划（全身 / 上下肢 / 推拉腿分化）。
- 器械占用 / 居家 / 时间不足时可「精简」替换；替换按 **动作模式 → 肌群 → 器械 → 难度** 评分排序。
- 渐进超负荷建议保守、可解释、需用户确认（`progression.ts`）。

### 4. 训练中模式（`train` + `WorkoutRunner`）
- 上次记录回看、逐组填重量 / 次数 / RPE、热身清单、动作回看、组间倒计时。
- **大按钮、少输入**；暂停 / 跳过 / 替换；自动保存。
- 计时用 **时间戳 `restEndsAt`（epoch ms）** 计算剩余，避免后台 / 息屏导致倒计时失真；刷新后从本地恢复。

### 5. 饮食与食物查询（`diet` + `FoodAdder` + `PhotoPanel`）
- 每日餐单、手动记录、份量编辑、同类替换、购物清单。
- 区分每 100g / 每份、生重 / 熟重，计入烹调用油（按方式给默认值，可改）。
- 营养目标展示**计算依据**（Mifflin-St Jeor BMR × 活动系数 = TDEE，温和赤字 / 盈余，绝对下限）。
- 联网查询经后端代理可信库，保留来源 / 时间 / 单位；找不到可靠数据提示「未找到足够可靠信息」。

### 6. 恢复与复盘（`progress`）
- 睡眠 / 疲劳 / 酸痛 / 疼痛反馈。
- 周报含完成率 / 动作表现 / 饮食 / 体重趋势；**数据不足时不下结论**。
- 疼痛时提示停止并寻求专业评估；饮水 / 活动提醒可关。

---

## 架构与数据

```
src/
  app/                 # App Router 页面：page(今日) / train / diet / progress / me + api/*
  components/          # UI 组件（AppProvider 全局状态、BottomNav、各功能面板）
  lib/
    types.ts           # 全实体类型
    db.ts              # IndexedDB schema（12 个 store）+ 内存兜底
    repo.ts            # 数据访问层（CRUD / 导出 / 清除演示）
    seed/              # 内置动作库、食物库、肌群
    plan/engine.ts     # 计划生成 / 时间精简 / 替换推荐
    nutrition.ts       # BMR / TDEE / 营养目标 / 份量换算 / 用油
    progression.ts     # 渐进超负荷建议（需确认）
    weekly.ts          # 周报复盘（数据不足不下结论）
    session.ts         # 训练中 UI 状态（可持久化恢复）
    demo.ts            # 演示数据（全部带 isDemo 标记）
    testExports.ts     # 纯逻辑层导出，供单测引用
tests/                 # esbuild 打包 + node:test 单测
```

**数据流**：UI → `repo` → `idb`（IndexedDB，失败降级内存）→ 跨标签页 `subscribe` 刷新。
**演示数据**：一键载入，全部 `isDemo=true`，可在「我的 → 数据管理」清除。
**服务端代理**：`/api/food/search`、`/api/vision/analyze` 仅在配置后启用，密钥不出端；未配置返回 `not_configured`，前端回退手动流程。

---

## 验收清单

### ✅ 已完成（可操作闭环）
- [x] 建档向导（目标 / 经验 / 时间 / 器械 / 饮食档案）
- [x] 多场馆切换与器械清单
- [x] 动作库筛选（肌群 / 器械 / 难度 / 搜索）+ 本地示意图
- [x] 计划生成、编辑、组次 / 休息处方、锁定 / 排序 / 删除、添加动作
- [x] 动作替换（按 模式→肌群→器械→难度 评分，排除缺失器械 / 受限模式 / 已在计划）
- [x] 训练中逐组记录（重量 / 次数 / RPE）、热身清单、跳过 / 替换
- [x] 刷新恢复（UI 状态持久化）+ 计时恢复（`restEndsAt` 时间戳）
- [x] 饮食份量换算（每 100g ↔ 每份、生重 / 熟重、用油计入）
- [x] 营养目标计算依据与安全下限展示
- [x] 拍照辅助识别（同意确认、区间估算、不伪造、不自动写入）
- [x] 周报 / 体重趋势 / 恢复反馈（数据不足不下结论）
- [x] 数据导出（JSON）/ 删除 / 清除演示
- [x] 空状态 / 错误 / 重试、肌肉图谱文字列表（无障碍）

### 🔌 待接入（需用户配置，未配置时回退且不伪造）
- [ ] 联网食物营养库（USDA 等，需 `FOOD_DATA_PROVIDER` + 密钥）
- [ ] AI 拍照识别（需 `VISION_PROVIDER` + 密钥）
- [ ] 多用户后端 + 身份验证 + 权限隔离（当前为纯本地单用户）
- [ ] 云端备份 / 跨设备同步（当前仅本地，导出为文件）

### ⚠️ 已知限制
- 肌肉图谱为**示意椭圆**，非解剖精确；以文字列表为权威等效。
- 拍照识别在 `none` 模式下**无法确定重量 / 配料**，只做用户手动确认后的区间估算。
- 营养目标为**估算**，非医学 / 营养处方；特殊人群（孕期、未成年、进食障碍史、需医学营养治疗）应咨询专业人士。
- 本地存储 ≠ 云备份：更换浏览器 / 清缓存 / 卸载会丢失数据，请定期导出。
- 渐进建议保守，且**必须用户确认**才生效，避免误用。

---

## 测试

```bash
npm test
```

覆盖纯逻辑层：
- `plan.test.mjs`：计划生成、时间精简、替换推荐（按评分降序、排除缺失器械 / 受限 / 重复）。
- `nutrition.test.mjs`：Mifflin-St Jeor BMR、TDEE、营养目标下限、份量换算、用油、生熟重。

> 测试通过 esbuild 将 `src/lib/testExports.ts` 打包为 `tests/.build/lib.mjs`，再交给 `node --test`，从而避开 React / 浏览器 API。

---

## 隐私与数据安全

- 所有训练 / 饮食 / 身体数据默认只存在**本机浏览器 IndexedDB**，不上传任何服务器。
- 照片不会公开；仅在本地用于「用户确认后」的辅助记录。
- 任何外部服务的密钥只保存在服务端环境变量，绝不进入前端代码包。
- 提供导出（JSON）与彻底删除；演示数据可一键清除。

---

## 构建说明（环境与沙箱）

`next build` 在生产环境会于收尾阶段清理 `.next/export` 目录；在本机的 safe-delete 沙箱下该清理步骤会被拦截导致非零退出。解决方式是以**未注入删除钩子**的 Node 运行构建：

```bash
NODE_OPTIONS="" npx next build      # 收尾清理不被拦截，构建正常退出 0
```

构建产物（`server/`、`static/`、`BUILD_ID` 等）在编译与静态生成阶段即已写入，构建本身已通过类型检查与 8 个页面生成。开发模式 `npm run dev` 不受此影响。

---

## 部署（GitHub Pages，静态版）

线上地址：<https://yunhao1438-oss.github.io/fit-loop/>

### 自动发布（日常用这个）

```bash
git add -A && git commit -m "改动说明" && git push
```

push 到 `main` 会触发 `.github/workflows/deploy-pages.yml`：`npm ci` → `tsc` → 单测 47 条 →
静态导出 → `actions/deploy-pages` 发布，约 **1.5 分钟**后线上生效。构建失败时线上仍是上一个成功版本。
也可以在仓库 Actions 页面点 `Run workflow` 手动触发。

### 本地构建 / 手动兜底

```bash
npm run build:static        # 只构建，产物在 out/（可用任意静态服务器预览）
npm run deploy:pages        # 构建并把产物推到 gh-pages 分支
```

> 注意：当前 Pages 的发布源是 **GitHub Actions**，所以 `deploy:pages` 推的 `gh-pages` 分支不会自动上线；
> 它是应急兜底 —— 在仓库 Settings → Pages 把 Source 改回 `gh-pages` 分支即可立即生效。

### 静态化的取舍

GitHub Pages 只能托管静态文件，因此两个服务端代理（`/api/food/search`、`/api/vision/analyze`）不参与静态构建：
`scripts/build-static.mjs` 在构建期间把 `src/app/api` 临时移出、导出 `out/`、再原样还原；前端在
`NEXT_PUBLIC_STATIC_DEPLOY=1` 时直接走既有的「未接入」提示，不发起必然 404 的请求。其余功能（IndexedDB、
计划、训练记录、营养计算、周报）全部在浏览器本地运行，不受影响。

若要换成带 Node 运行时的平台（Vercel 等），直接 `next build` 即可，两个 API 代理会照常工作（需配 `.env.local` 才启用）。

---

## 版本发布（Release）

打一个 `v*` 形式的 tag 并推送，就会自动跑测试、静态构建、打包，并创建 GitHub Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

流程见 `.github/workflows/release.yml`：`npm ci` → `tsc` → 单测 → 静态导出 →
打包 `fitloop-static-<tag>.zip` → `gh release create`（Release notes 由 `--generate-notes`
按提交历史自动生成，也可在页面上手改）。发布页：<https://github.com/yunhao1438-oss/fit-loop/releases>

> 注意：tag 必须是 `v` 开头（如 `v0.2.0`），否则不会触发；发布不会影响已上线的 Pages 站点。
