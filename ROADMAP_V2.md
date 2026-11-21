# `dsh-howtolive` V2 优化与创新功能研发计划（ROADMAP_V2）

> 本文档面向多 Agent 协作与迭代开发，整合了 V1 代码审计发现的交互/UI/性能改进项与 V2 创新玩法设计，采用 **「Phase 0 串行打地基 + Phase 1~3 模块化并行」** 的架构策略，最大限度避免合并冲突与视觉过载。

---

## 一、全局信息架构与开发约束（所有 Agent 必须遵守）

1. **首页保持克制，杜绝视觉堆砌**
   - 首页（`HowToLivePage`）维持现有杂志风节奏：顶部栏 → 仪表盘（六维雷达 + 今日一抽）→ 情景急救箱 → 筛选与视图区。
   - **列表态扩展**通过筛选栏右侧的视图切换 Tab 承载：`[卡片清单 | 漏洞扫描 | 关系星图]`。
   - **沉浸式/低频扩展**通过独立 Modal 承载：「3 分钟速刷盲盒」「人生 OS 名片海报」「成就徽章墙」。
2. **零新增重型前端依赖**
   - 雷达图、漏洞报告、OS 名片海报、关系星图均使用纯 SVG + Canvas API 实现，禁止引入 ECharts / D3 / AntV 等大体积图表库。
3. **样式与无障碍原生融合**
   - 严格使用 DSH 主题变量（`--dsw-alias-*`、`--dsw-radius-*`、`--dsw-font-family`），同时适配深浅主题与 `prefers-reduced-motion: reduce`。
   - 所有自定义 `<button>` 均需提供明确的 `:focus-visible` 焦点轮廓。
4. **本地状态向后兼容**
   - `HowToLiveState` 保持 `version: 1`，新增字段一律设为可选，确保老版本 `$DSH_HOME/plugins/howtolive/state.json` 无需迁移即可平滑加载。
5. **双语与验证门禁**
   - 所有新增用户可见文案必须同步写入 `src/client/locales.ts`（`zh` 与 `en` 完整对齐），严禁硬编码中文。
   - 每个 Task 完成后必须通过以下检查并补充对应 Vitest 单元测试：
     ```bash
     pnpm run typecheck
     pnpm test
     pnpm run build
     ```

---

## 二、Phase 0：底层契约、基础修补与性能地基（必须最先串行完成）

> **目标**：修复 V1 体验痛点与已知 Bug，一次性冻结共享类型与核心 API 契约，避免后续多 Agent 并行开发时反复冲突。

### 0.1 共享类型契约扩展（`src/shared/types.ts`）
- `ItemProgress` 增加可选复检字段：
  ```ts
  reviewIntervalDays?: number
  lastReviewedAt?: string
  ```
- 新增视图与排序类型：
  ```ts
  export type SortMode = 'chapter' | 'roi' | 'zeroCost' | 'xp' | 'noted'
  export type ViewMode = 'cards' | 'cve' | 'graph'
  ```
- 新增 V2 公共领域类型：`BadgeId`、`BadgeInfo`、`VulnerabilitySeverity`（`'CRITICAL' | 'HIGH'`）、`LifeVulnerability`、`LifeOsProfile`。

### 0.2 已知 Bug 与 UI/A11y 修复
- **i18n 修复**：
  - 修复 `src/client/components/FilterBar.tsx` 第 146 行 `t('filter.tierS').includes('S') ? '筛选' : 'Filter'` 在英文模式下恒为中文的 Bug，替换为正式词条 key。
  - 将 `src/client/components/ProfileModal.tsx` 中所有硬编码选项（年龄段、职业、居住、家庭、关注目标）与 `src/shared/scenarios.ts` 情景展示文本接入双语词典。
- **焦点与样式修复**：
  - 移除 `src/client/components/ProfileModal.tsx` 底部 `textarea` 上的 `data-modal-autofocus`，避免弹窗打开直接滚动到底部。
  - `src/client/components/LifeRadarCard.tsx` 中的 SVG `<radialGradient id="howtoliveRadarFill">` 改用 React `useId()` 生成唯一 ID。
  - `src/client/components/FilterBar.module.css` 中 `.segmented` 在窄屏下支持横向平滑滚动（`overflow-x: auto; max-width: 100%`），避免挤压搜索框。
  - 为 `ItemCard`、`FilterBar`、`ScenarioBar`、`LifeRadarCard` 的自定义交互按钮补齐 `:focus-visible` 样式。

### 0.3 核心交互闭环升级
- **详情抽屉增强（`src/client/components/ItemDetailDrawer.tsx`）**：
  - 底部操作栏新增「**问 AI 怎么落地**」按钮，调用 `launchPromptSession` 自动携带条目 ID、原文摘要与本地画像发起定制落地会话。
  - 维护交叉引用跳转历史栈 `history: string[]`，存在上级条目时在头部提供「← 返回上一条」按钮。
  - 私有笔记改为支持失焦自动保存（或未保存切换/关闭前提示），防止编辑内容静默丢失。
- **列表浏览与排序（`src/client/components/FilterBar.tsx`、`HowToLivePage.tsx`）**：
  - 增加排序选择器：`原书章节序` / `性价比优先 (S→C)` / `零成本优先` / `XP 优先` / `有个人笔记优先`。
  - 搜索框增加一键清空按钮与 `/` 快捷键聚焦；列表区滚动较深时提供轻量「回到顶部」按钮。
  - 点击雷达图维度胶囊时，平滑滚动定位到筛选/列表区。
- **全局 Toast、乐观更新与撤销（`src/client/store.ts`、`HowToLivePage.tsx`）**：
  - `setItemProgress` 改为**乐观更新 + 失败自动回滚 + 错误提示 Toast**。
  - 替换 `HowToLivePage.tsx` 中的裸 `setTimeout` 提示逻辑，实现带定时器清理的统一 Toast：
    - 打卡 `done` 时展示 `+XP` 及升级提示（如 `Lv.2 → Lv.3`）。
    - 标记 `skipped` 时展示 4 秒内可点击的「**撤销**」按钮，防止误触后条目消失难找回。
- **今日一抽与首次体检引导（`DailyPickCard.tsx`、`HowToLivePage.tsx`）**：
  - `DailyPickCard` 标记 `done` 后，主按钮切换为「再抽一张」提升连贯性。
  - 未配置个人画像时点击「AI 人生体检」，优先弹出 `ProfileModal` 并提供「跳过画像直接体检」入口。
- **聊天内嵌卡片瘦身（`src/client/components/TurnPatchCard.tsx`）**：
  - 默认展示前 3 条，超出时折叠并提供「展开其余 N 条」按钮；支持轻量 `+XP` 状态反馈。

### 0.4 Host API、导出与 AI 工具优化
- **`src/host/routes.ts` & `src/client/api.ts`**：
  - 新增 `GET /api/plugins/howtolive/state`（仅返回 `state` + `summary` + `dailyPickItem`），将 `HowToLivePage` 的 `window.focus` 刷新改为调用此轻量接口并增加 15 秒节流，避免频繁拉取全部 772 条摘要。
  - 新增 `GET /api/plugins/howtolive/state/export` 与 `POST /api/plugins/howtolive/state/import`，支持本地进度与私有笔记的 JSON 备份/恢复。
  - `/progress` 路由支持可选参数 `reviewIntervalDays` 与 `lastReviewedAt`。
- **`src/host/tools.ts`**：
  - 扩展 `howtolive_update_item`（或新增 `howtolive_batch_update_items`），支持一次工具调用批量更新多条建议状态，减少对话延迟与 Token 消耗。
- **`src/host/export.ts`**：
  - 完善 Markdown 导出报告，输出已统计但未使用的 `doneOtherCountByDim`（A/B/C 级完成汇总）以及所有含个人笔记的条目。

---

## 三、Phase 1：高频交互与爽感功能（以下 3 个 Task 可并行）

### Task 1A：人生混沌工程 · 沉浸式「防坑演练场」（AI 文字 RPG）
- **主要涉及文件**：
  - `src/shared/scenarios.ts`
  - `src/client/components/ScenarioBar.tsx` + `.module.css`
  - `src/client/locales.ts`
- **实现要点**：
  - 新增 `buildChaosDrillPrompt(profile, summary, candidateItems)`：从用户未完成的 S/A 级高匹配条目中挑选 3~5 条作为“暗雷”，指示 DeepSeek 扮演「墨菲定律考官」发起 3~4 轮沉浸式突发危机文字 RPG（每轮仅给当下情境 + 选项/开放作答，严禁剧透答案）。
  - 演练结束时强制调用 `howtolive_get_item` 核验原书条目，输出「生存评分 + 踩坑复盘 + 本次暴露的待打补丁」，自然在对话底部触发 `TurnPatchCard` 一键加入行动清单。
  - 在 `ScenarioBar` 头部放置「**随机压力测试（AI 演练）**」醒目入口按钮。
- **验收标准**：点击按钮能一键拉起带画像与未完成 S 级条目上下文的演练会话；新增 Prompt 构造函数的单元测试。

### Task 1B：「人生漏洞扫描仪」（`LIFE-CVE` 安全审计视图）
- **主要涉及文件**：
  - 新增 `src/shared/cve.ts`
  - 新增 `src/client/components/CveScannerView.tsx` + `.module.css`
  - 接入 `src/client/components/HowToLivePage.tsx`（视图切换 Tab：`cards` / `cve`）
- **实现要点**：
  - 纯函数 `scanLifeVulnerabilities(items, progress, profile)`：
    - 筛选未完成（`todo` / `planned`）的高价值条目，结合画像加权分为 `CRITICAL`（零/低成本 S 级）与 `HIGH`（其余 S 级 / 高画像匹配 A 级）。
    - 生成极客风漏洞编号（如 `LIFE-CVE-14-02`）与整体安全状态评级：`Exposed` / `Guarded` / `Hardened`。
  - 视图顶部展示安全状态仪表条（高危漏洞数、中危数、系统加固度）；每张漏洞卡支持「一键修复（done）」「排期修复（planned）」「误报/不适用（skipped）」与「查看修复指南（打开详情抽屉）」。
- **验收标准**：扫描算法具备确定性单元测试；修复条目后安全状态实时响应；不破坏默认卡片视图。

### Task 1C：「摸鱼 3 分钟速刷盲盒」（Patch Sprint）
- **主要涉及文件**：
  - 新增 `src/client/components/PatchSprintModal.tsx` + `.module.css`
  - 接入 `src/client/components/DailyPickCard.tsx` 或 `HowToLivePage.tsx` 入口
- **实现要点**：
  - 提供 3 个速刷模式：`零花钱不靠毅力` / `薄弱维度突击` / `行动清单清仓`，每次抽取 5~10 条未完成条目进入单卡沉浸流。
  - 支持键盘快捷操作：`→` 已做到、`↑` 加入清单、`←` 不适用、`Space` 打开详情、`Esc` 退出。
  - 维护当次会话的 **Combo 连击计数**（连续标记 done/planned 递增）与进度条；刷完后展示结算卡（处理条数、获得 XP、最高连击、快捷再刷一轮）。
- **验收标准**：键盘与点击操作均触发乐观更新与状态同步；空池状态有友好兜底；补充组件交互测试。

---

## 四、Phase 2：社交传播与长期运维留存（以下 3 个 Task 可并行）

> 注：Task 2B 若在海报上展示代表徽章，需先约定或复用 Task 2A 的 `src/shared/badges.ts` 接口。

### Task 2A：成就徽章系统
- **主要涉及文件**：
  - 新增 `src/shared/badges.ts`
  - 新增 `src/client/components/BadgesModal.tsx` + `.module.css`
  - 接入 `src/client/components/LifeRadarCard.tsx`（展示已解锁徽章数入口）
- **实现要点**：
  - 定义 8~10 枚基于 `items` + `progress` 纯函数实时计算的趣味徽章（无需额外持久化）：
    - 如：`零元购宗师`（20 条 `money === '0'` 且 `willpower === '否'`）、`清醒的断舍离`（主动标记 15 条 `skipped`）、`赛博金刚不坏`（第 14 章完成 ≥ 80%）、`黄金四分钟`（急救核心条目完成）、`劳动法活字典`（第 19 章完成 ≥ 80%）、`六边形战士`（六维完成率均 ≥ 20%）。
  - 弹窗分「已解锁 / 探索中」展示自定义线性 SVG 徽章图标、进度条与解锁条件。
- **验收标准**：`computeBadges` 拥有完整边界单测；徽章状态随打卡实时点亮。

### Task 2B：可分享「人生 OS 架构师名片」（SVG/PNG 海报）
- **主要涉及文件**：
  - 新增 `src/shared/life-os.ts`
  - 新增 `src/client/components/ShareCardModal.tsx` + `.module.css`
  - 接入 `src/client/components/HowToLivePage.tsx` 顶部工具栏
- **实现要点**：
  - 纯函数 `computeLifeOsProfile(summary, items, progress)`：
    - 生成极客版本号（如 `LifeOS v4.2.0-lts`）与基于六维偏科特征的趣味流派称号（如「长命百岁月光族」「赛博法外防火墙」「低耗能复利大师」）。
  - 纯 SVG 渲染高颜值杂志/暗黑风名片，**严格脱敏**（仅展示雷达图、版本号、称号、总体覆盖率、等级 XP、安全评级与代表徽章，绝不包含私有笔记与个人画像详情）。
  - 支持「下载 SVG」与「导出高清 PNG（通过离屏 Canvas 2x 渲染）」两个动作。
- **验收标准**：`computeLifeOsProfile` 单测通过；SVG 自包含内联样式，导出后在外部图片查看器中无样式丢失。

### Task 2C：「补丁保质期 & 年度巡检」（Decay）
- **主要涉及文件**：
  - `src/shared/scoring.ts`（新增 `isItemDueForReview` 与 `dueReviewCount` 计算）
  - `src/client/components/ItemDetailDrawer.tsx`
  - `src/client/components/FilterBar.tsx`、`LifeRadarCard.tsx`
- **实现要点**：
  - 内置常见周期性条目推荐复检周期映射表（体检、急救箱/灭火器效期、重要账号恢复码、保单核对等），详情抽屉对已 `done` 条目提供复检周期选择器：`不重复` / `90 天` / `180 天` / `365 天`。
  - 到期条目标记为 `needsReview`（**不扣除已获 XP**），在仪表盘或筛选栏展示「有 N 个补丁待复检」提醒，支持一键筛选并点击「完成复检」刷新 `lastReviewedAt`。
- **验收标准**：到期计算边界单测（含时区/闰年/未设置周期）；旧 `state.json` 完全兼容。

---

## 五、Phase 3：进阶可视化与深度智能化（可并行）

### Task 3A：「补丁关系星图 / 技能树」（Skill Tree 视图）
- **主要涉及文件**：
  - 新增 `src/shared/graph.ts`（确定性六维放射坐标与边计算）
  - 新增 `src/client/components/PatchGraphView.tsx` + `.module.css`
  - 接入 `src/client/components/HowToLivePage.tsx`（第 3 个视图 Tab：`graph`）
- **实现要点**：
  - 利用知识库已有的 `crossRefs` 构建关联网络；为避免 772 节点拥挤卡顿，默认仅展示包含 `crossRefs` 的核心骨架图，或按当前筛选维度展开对应星区。
  - 采用确定性六维放射状布局（纯 SVG，无物理引擎抖动），已点亮节点高亮发光，关联未完成节点以微光虚线连接。
  - 支持滚轮缩放、拖拽平移、hover 高亮上下游连线、点击节点直接打开 `ItemDetailDrawer`。
- **验收标准**：大数据集渲染流畅无卡顿；支持缩放重置按钮与键盘无障碍焦点。

### Task 3B：画像智能筛查不适用 & 行动清单 AI 排期
- **主要涉及文件**：
  - 新增 `src/client/components/ProfileSkipWizardModal.tsx` + `.module.css`
  - `src/shared/scenarios.ts`（新增 `buildWeekendPlanPrompt`）
  - `src/client/components/ProfileModal.tsx`、`FilterBar.tsx`
- **实现要点**：
  - **画像智能筛查**：根据用户本地画像（例如未勾选 `pregnant`/`infant`/`child`，或非租房/非程序员）识别明显不适用条目，弹出预览列表供用户勾选确认后一键批量标记 `skipped`，让完成率分母更真实。
  - **行动清单 AI 排期**：当筛选栏处于 `planned`（行动清单）且列表非空时，展示「**让 AI 排一份本周末执行计划**」按钮，将当前待办清单连同成本/耗时信息发送给 DeepSeek 生成可执行时间表。
- **验收标准**：批量跳过前必须经过用户明确预览确认，不可静默修改用户进度；补充对应单测。

---

## 六、多 Agent 协作分工建议

| 阶段 | 执行方式 | 推荐 Agent 分配 | 合并依赖 |
|---|---|---|---|
| **Phase 0** | 串行 | 1 个 Agent 独立完成 | 无（作为后续所有分支基线） |
| **Phase 1** | 并行 | Agent A (`1A`) / Agent B (`1B`) / Agent C (`1C`) | 均基于 Phase 0，文件近乎零冲突 |
| **Phase 2** | 并行 | Agent A (`2A`) / Agent B (`2B`) / Agent C (`2C`) | `2B` 复用 `2A` 的 `badges.ts` 类型 |
| **Phase 3** | 并行 | Agent A (`3A`) / Agent B (`3B`) | 基于 Phase 0~2 稳定接口 |
