# `dsh-howtolive`（人生补丁）— 构思、技术方案与开发计划

> 基于开源项目 [`eternity4719/HowToLiveBetter`](https://github.com/eternity4719/HowToLiveBetter)（《高性价比人生指南》），为 **DeepSeek Harness (`dsh`)** 打造的原生双端（Host + Web Client）插件。
>
> **文档定位**：本文档可直接作为开发交接蓝图（Design & Execution Spec）交给后续开发 Agent 按阶段落地实现。

---

## 1. 产品构思：为什么比静态网站更好玩、更好用？

`howtolivebetter.net` 等衍生网页解决了“把 Markdown 变成可打勾清单”的问题，但仍是静态工具。做成 **dsh 原生插件** 后，可以结合 **本地隐私持久化 + 原生高颜值 UI + DeepSeek Agent 主动决策**，实现三个层面的升级：

### 1.1 视觉与气质定位：**精致效率 × 克制趣味**
- **精致效率（80%）**：视觉严格融入 dsh 原生设计语言（极简、发丝描边、自适应明暗主题、高信息密度但不拥挤），像 Linear / Notion 一样百看不厌。
- **克制趣味（20%）**：借用“**给人生打补丁（Life Patch）**”的概念，把枯燥的数百条建议转化为「六维属性雷达 + 经验值等级 + 每日高性价比一抽」，每次完成一件零成本高收益的小事，都能获得即时的正反馈。

### 1.2 五大核心功能模块

1. **人生六维仪表盘（Life Patch Dashboard）**
   - 将原书 34 个章节聚合为 **6 大核心人生维度**：
     - `survival` **生命防线**（不要早死、不要慢慢死、紧急情况、慢性病、看病、外形安全、残疾应对、常备药）
     - `wealth` **财富护城河**（不要浪费钱、没钱怎么活、创业做生意、租房买房）
     - `legal` **法律防坑盾**（反面清单、别把自己搭进去、普通人法律红线、程序员/技术人红线、做网站/平台合规）
     - `career` **职场与效率**（不要浪费精力、不要浪费时间、在职离职工伤、学什么技能划算、18岁后的路、出国留学）
     - `family` **家庭与关系**（恋爱结婚、家里有老人、养孩子、新生儿、身后事、怀孕生产、上学以后）
     - `resilience` **安全与韧性**（账号与信息安全、出国与境外安全、怎么放松、遭遇重大打击之后）
   - 顶部紧凑呈现：**六维雷达图（轻量纯 SVG，无重型图表库）** + **人生补丁等级（Lv.1 → Lv.10）与进度条** + **「今日高性价比一抽」卡片**（每天从用户未完成的低成本 S/A 级条目中抽取一条，支持“已做到 +XP”或“换一张”）。

2. **循证清单浏览器（核心效率区）**
   - **精准多维筛选**：按维度、章节、性价比分级（`S / A / B / C`）、证据等级（`A / B / C`）、成本胶囊（`零花钱`、`省时间`、`不靠毅力`）、人群标签（如 `程序员`、`孩子`、`老人`、`租房` 等）、完成状态组合筛选，支持全文实时搜索。
   - **四种条目状态**（比普通清单更贴心）：
     - `todo`（未做，默认）
     - `planned`（已加入行动清单）
     - `done`（已做到，计入 XP 与完成度）
     - `skipped`（**不适用**，例如无娃用户屏蔽育儿条目，**从完成率分母中剔除**，避免强迫症焦虑）
   - **渐进式详情抽屉**：卡片默认展示标题 + 性价比/证据/成本胶囊 + 「说人话」摘要；展开/点击后显示完整成本、收益数据、原始论文/法规出处链接、备注、**可点击跳转的交叉引用**（如 `第 34 节第 12 条`），以及个人私有笔记输入框。

3. **AI 人生体检官（核心杀手锏：Agent 深度联动）**
   - **本地个人画像**（10 秒勾选，仅存本地 Host，绝不上传第三方）：年龄段、职业特征（如程序员/自由职业/上班族）、居住情况（租房/买房）、家庭情况（单身/伴侣/有娃/有老人）、当前关注目标。
   - 点击 **「让 AI 帮我做人生体检」**，自动开启 dsh 会话并注入上下文，DeepSeek Agent 调用插件注册的专属工具，结合用户画像 + 未完成条目，输出**「你现在花最少代价、收益最大的 Top 5 补丁」**。
   - **聊天流内嵌交互卡片**：通过 dsh 的 `conversation.chat.turnTail` Slot，当 Agent 在该轮调用过 `howtolive` 检索工具后，在回复正文下方渲染精致的**可操作补丁卡片**（可直接点“标记已做到”、“加入行动清单”或“在面板中打开”）。

4. **遇事不慌 · 情景急救箱**
   - 顶部/侧栏提供 6 个高频救命情景快捷入口：
     1. 💼 **裁员 / N+1 / 劳资纠纷**（关联第 19、9、8 节）
     2. 🏥 **突发急救 / 看病防坑**（关联第 13、24、34 节）
     3. 🏠 **租房 / 买房避坑**（关联第 15、5、9 节）
     4. 💻 **程序员合规 / 独立开发红线**（关联第 11、26、12、14 节）
     5. 🛡️ **账号安全 / 遭遇诈骗或胁迫**（关联第 14、8、9 节）
     6. 🌧️ **低谷 / 失业 / 重大打击**（关联第 7、29、22 节）
   - 点击后一键创建带专属引导的会话，让 Agent 立刻基于原书循证条目和法规原文陪用户算账、列取证清单、一步步脱险。

5. **本地数据掌控与导出**
   - 支持一键触发同步脚本刷新上游 `HowToLiveBetter` 最新内容（内置预构建 JSON，离线秒开）。
   - 支持一键导出 **「我的人生补丁报告（Markdown）」**，汇总当前六维得分、已完成 S 级补丁、近期行动清单。

---

## 2. 数据管道（已就绪）

仓库中已编写零依赖 Node.js 解析脚本：[`scripts/sync-howtolive.mjs`](./scripts/sync-howtolive.mjs)。

### 2.1 脚本能力
- 支持在线从 GitHub 拉取（`node scripts/sync-howtolive.mjs`）或从本地 clone 离线秒跑（`node scripts/sync-howtolive.mjs --local <path>`）。
- 精准解析原书 `book/01-*.md` ~ `book/34-*.md` 中的：
  - 章节导言与主题分组（如 `**路上**：系安全带（第 1 条）...`）
  - 条目编号、标题
  - HTML 注释中的结构化成本标签（`<!-- 成本标签: 钱=0 时间=少 毅力=否 收益=大 口径=死亡率 人群=... -->`）
  - 标准字段：`成本`、`说人话`、`收益/代价/风险`、`证据等级`、`来源/依据`、`备注/怎么做`
  - 交叉引用自动提取（如 `第 34 节第 12 条` → `34-12`）
  - 自动计算 `roiScore`（10-100）、`roiTier`（`S/A/B/C`）与游戏化 `xp`（40/25/15/10）。
- 输出文件：
  - `data/knowledge.json`（完整结构化知识库，打包随插件分发）
  - `data/meta.json`（统计摘要与维度索引）

---

## 3. 技术架构设计（严格对齐 `dsh` 规范）

> 参考本地 dsh 源码仓库：`D:\deepseekProject\deepseek-harness-pure\deepseek-harness`

### 3.1 包形态与目录结构

做成标准的树外 **dsh 组合包（`dsh.bundle`）**，包含 Host 插件、Client 插件与共享类型，可通过 `dsh plugin --profile <name> add .` 直接链接调试，也可 `pnpm pack` / 发布到 npm / 接入插件索引。

```text
dsh-howtolive/
├── package.json                  # 声明 dsh.bundle、exports（./host, ./client, ./shared）、prepare 构建脚本
├── cordis.patch.yml              # 挂载 host 插件与 client 模块的配置层
├── tsconfig.json
├── tsdown.config.ts              # 独立转译 host / client 产物到 lib/（不依赖 monorepo）
├── DESIGN_AND_PLAN.md            # 本文档
├── scripts/
│   └── sync-howtolive.mjs        # 上游知识库同步与解析脚本（已就绪）
├── data/
│   ├── knowledge.json            # 预构建的结构化知识库（随包发布，离线可用）
│   └── meta.json                 # 维度与统计元信息
└── src/
    ├── shared/
    │   ├── types.ts              # KnowledgeItem, Chapter, Dimension, UserProfile, ItemProgress, StateSnapshot
    │   ├── scenarios.ts          # 6 大“情景急救箱”预设定义与 Prompt 模板
    │   └── scoring.ts            # 六维得分、总 XP、等级头衔计算纯函数（Host/Client 共用）
    ├── host/
    │   ├── index.ts              # Cordis Host 插件入口（注册 Service、Tools、HTTP/API 路由）
    │   ├── knowledge-store.ts    # 加载 data/knowledge.json + 内存索引 + 多维检索与随机抽卡逻辑
    │   ├── state-store.ts        # 本地 JSON 持久化（$DSH_HOME/plugins/howtolive/state.json，原子写入）
    │   ├── tools.ts              # 注册 4 个面向 DeepSeek 模型的工具（defineTool / ctx.tools.register）
    │   └── routes.ts             # 暴露给 Client 的 REST/JSON API（或 Remote service）
    └── client/
        ├── index.ts              # Cordis Client 插件入口（注册 sidebar.panellist、main、turnTail、locale）
        ├── api.ts                # 封装对 Host 接口的请求与状态订阅（Store）
        ├── locales.ts            # 中英文文案（zh / en）
        ├── components/
        │   ├── PanelIcon.tsx     # 左侧栏 16px SVG 图标
        │   ├── HowToLivePage.tsx # 主视图外壳（顶栏 + 仪表盘 + 筛选 + 卡片流）
        │   ├── LifeRadarCard.tsx # 纯 SVG 六维雷达图 + 等级进度条
        │   ├── DailyPickCard.tsx # “今日高性价比一抽”微交互卡片
        │   ├── ScenarioBar.tsx   # “遇事不慌”6 大情景急救快捷条
        │   ├── FilterBar.tsx     # 维度/性价比/证据/成本/人群/搜索组合筛选栏
        │   ├── ItemCard.tsx      # 循证建议卡片（胶囊标签 + 状态切换 + 展开详情）
        │   ├── ItemDetailDrawer.tsx # 条目完整详情、来源链接、交叉引用跳转、个人笔记
        │   ├── ProfileModal.tsx  # 10 秒本地个人画像设置弹窗
        │   └── TurnPatchCard.tsx # 挂载在 conversation.chat.turnTail 的聊天内嵌补丁卡片
        └── styles/
            └── *.module.css      # 严格使用 --dsw-alias-* 语义 token 的 CSS Modules
```

### 3.2 Host 端设计要点

1. **Cordis 插件声明**
   - 遵循 `docs/user/develop/basic/publish.zh.md`：与宿主共享实例的 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-*` 声明在 `peerDependencies` + `devDependencies`。
   - 数据持久化路径优先读取 `process.env.DSH_HOME`（回退 `~/.dsh`），写入 `<DSH_HOME>/plugins/howtolive/state.json`，采用「写临时文件 + rename」保证原子性。

2. **面向模型的 4 个工具（`ctx.tools.register`）**
   - `howtolive_search`：输入 `{ query?, dimension?, chapterNumber?, roiTiers?, evidenceGrades?, maxMoney?, audience?, excludeDone?: true, limit?: 8 }`，返回精简结构化条目数组（含 `id`, `title`, `roiTier`, `evidenceGrade`, `tags`, `plain`, `cost`, `userStatus`），避免撑爆上下文窗口。
   - `howtolive_get_item`：输入 `{ id: "01-10" }`，返回完整循证内容、来源 URL、备注、交叉引用条目摘要与用户当前状态/笔记。
   - `howtolive_get_summary`：无参，返回用户本地画像、六维完成率、当前等级/XP、已加入 `planned` 的行动清单、以及各维度得分最低的缺口提示。
   - `howtolive_update_item`：输入 `{ id, status?: "todo"|"planned"|"done"|"skipped", note? }`，更新本地进度并返回最新的维度得分变化（例如 `生命防线 42% -> 46% (+40 XP)`）。

3. **Host ↔ Client 通信接口**
   - 开发 Agent 需先检查 `D:\deepseekProject\deepseek-harness-pure\deepseek-harness\packages\web\` 与 `packages/client/connection/` 的自定义路由/Fetch 注册规范，为树外插件注册轻量 JSON 端点（前缀建议 `/api/plugins/howtolive/*`）：
     - `GET /bootstrap`：一次性返回 `meta`、`chapters`、精简 `items` 索引与当前用户 `state`。
     - `GET /item/:id`：获取单条完整详情（含完整 `sources`、`notes`、`rawMarkdown`）。
     - `PATCH /progress/:id`：更新单条状态或个人笔记，返回最新 `state` 与 `scoreDelta`。
     - `PUT /profile`：保存本地个人画像。
     - `POST /daily-pick/reroll`：换一张今日推荐卡片。
     - `GET /export/markdown`：生成并返回用户的《人生补丁配置单》Markdown。

### 3.3 Client 端设计要点（UI 颜值与规范红线）

开发 Agent **必须** 完整阅读以下 dsh 本地文档后再写 UI：
- `D:\deepseekProject\deepseek-harness-pure\deepseek-harness\docs\web-styling.zh.md`
- `D:\deepseekProject\deepseek-harness-pure\deepseek-harness\docs\ui-radius.zh.md`
- `D:\deepseekProject\deepseek-harness-pure\deepseek-harness\docs\subsystems\slots.zh.md`
- `D:\deepseekProject\deepseek-harness-pure\deepseek-harness\packages\client\ui-schedule\src\client\index.ts`（最佳实践参考）

**必须遵守的样式与交互纪律**：
- **严禁引入 Tailwind 或外部 UI 组件库**；使用 CSS Modules + `clsx`。
- **严禁硬编码颜色字面量**（hex/rgb/white/black）；全部使用 `ui-theme` 提供的 `--dsw-alias-*` 语义 token，确保浅色/深色主题无缝切换。
- **边框与圆角**：中性分割线与卡片边框统一 `0.5px`；正圆与胶囊圆角必须配对 `corner-shape: round`；浮层/卡片阴影使用 `--dsw-elevation-*` 且不与边框叠加形成双描边。
- **悬停与无障碍**：所有 `:hover` 包裹在 `@media (hover: hover)` 内；尊重 `prefers-reduced-motion: reduce`（减弱动效时关闭 XP 飘字与雷达图过渡动画）。
- **Slot 注册清单**：
  1. `sidebar.panellist`：注册左侧栏入口（`id: 'howtolive'`，`order: 60`）。
  2. `main`（keyed slot，`key: 'howtolive'`）：渲染 `HowToLivePage`。
  3. `conversation.chat.turnTail`（Phase 3）：监听该轮工具调用，若包含 `howtolive_search` / `howtolive_get_item`，渲染交互式 `TurnPatchCard`。

---

## 4. 分阶段开发计划（Milestones）

建议按以下 4 个阶段推进，每个阶段都有可独立验证的产出：

### Phase 1：工程骨架 + Host 服务与 AI 工具闭环（预计 1-2 天）
- [ ] 初始化 `package.json`（含 `dsh.bundle`、`exports`、`peerDependencies`、`prepare` 构建脚本）、`tsconfig.json`、`tsdown.config.ts`、`cordis.patch.yml`。
- [ ] 实现 `src/shared/` 全部类型、6 大情景定义、六维评分与等级纯函数（附 Vitest 单测）。
- [ ] 实现 `src/host/knowledge-store.ts` 与 `src/host/state-store.ts`（原子落盘、默认状态初始化、多维检索与每日一抽算法）。
- [ ] 实现 `src/host/tools.ts`，注册 4 个 Agent 工具并编写单元测试。
- [ ] **阶段验收**：在本地 dsh 中执行 `dsh plugin --profile dev add d:\deepseekProject\dsh-howtolive`，启动会话并测试对话：“帮我从高性价比人生指南里挑 3 个不花钱、A级证据的保命建议”，验证模型能正确调用工具并返回精准结果。

### Phase 2：Client 高颜值仪表盘 MVP（预计 2-3 天）
- [ ] 实现 `src/host/routes.ts` 与 `src/client/api.ts`，跑通前后端数据同步。
- [ ] 注册 `sidebar.panellist` 图标与 `main` 主视图 `HowToLivePage`。
- [ ] 实现顶部仪表盘：纯 SVG `LifeRadarCard`（六维雷达图 + 等级进度）+ `DailyPickCard`（今日一抽 + 换一张 + 一键已做到 +XP 微反馈）。
- [ ] 实现 `FilterBar` + 虚拟/分页 `ItemCard` 列表（支持 `todo / planned / done / skipped` 状态切换）+ `ItemDetailDrawer`（展示出处链接、可跳转交叉引用、个人笔记）。
- [ ] **阶段验收**：在 dsh Web/Desktop 端打开侧栏「人生补丁」，切换明/暗主题无视觉破绽；筛选、搜索、打勾、标记“不适用”、刷新页面后进度完整保留。

### Phase 3：AI 深度联动 + 情景急救箱 + 聊天内嵌卡片（预计 2 天）
- [ ] 实现 `ProfileModal`（10 秒本地画像表单）与顶部「AI 人生体检」按钮：点击后创建/切入会话并自动发送带画像上下文的体检 Prompt。
- [ ] 实现 `ScenarioBar`（6 大「遇事不慌」情景急救卡片），点击一键拉起专属循证应对会话。
- [ ] 实现 `TurnPatchCard` 并注册到 `conversation.chat.turnTail`：Agent 推荐条目后，聊天流下方直接呈现可打勾、可加入行动清单的原生卡片。
- [ ] **阶段验收**：完成端到端链路“填画像 → 点 AI 体检 → Agent 调工具推荐 Top 5 → 在聊天流卡片直接点‘已做到’ → 切回仪表盘看到雷达图和 XP 已同步增长”。

### Phase 4：收尾打磨、合规与分发（预计 1 天）
- [ ] 实现「导出我的人生补丁配置单（Markdown）」功能。
- [ ] 核对上游 `eternity4719/HowToLiveBetter` 的 `LICENSE` / `LICENSE-CODE`，在插件「关于 / 数据来源」页脚完整展示原作者署名、仓库链接与数据同步时间/Commit SHA。
- [ ] 补充 `README.md`（安装方式、本地开发、插件市场索引示例），运行 `pnpm pack` 验证离线 `.tgz` 安装包可在干净 profile 中一键安装运行。

---

## 5. 给后续开发 Agent 的关键避坑指南（Handoff Notes）

1. **先查清外部插件的 Client Module 声明方式**：动手写 `cordis.patch.yml` 前，请先阅读 `D:\deepseekProject\deepseek-harness-pure\deepseek-harness\docs\subsystems\client-modules.zh.md` 和 `packages/bundle/web-app/cordis.patch.yml`，确认外部 bundle 如何向 Web Client 暴露浏览器侧入口与 CSS 资产。
2. **不要直接导入其他功能插件的运行时值**：跨插件协作只走 `ctx.slots` 和注入的 Cordis service，不要运行时 `import` 其他业务插件。
3. **条目数量较多，注意渲染性能**：原书包含数百条结构化条目，前端列表渲染应做分页或按章节折叠/增量加载，切勿一次性渲染全部 DOM 节点。
4. **“不适用（skipped）”的计分逻辑**：维度完成率公式为 `done / (total - skipped)`；当用户把某类不相关条目（如育儿/留学/创业）标为 `skipped` 时，界面应有温和提示，避免拉低成就感。
5. **免责与循证边界**：医疗、法律、财务类条目涉及重大决策，AI 体检与情景急救 Prompt 中需明确要求模型“优先引用原书证据等级与来源原文，不编造法条或医疗剂量，紧急情况提示立即拨打 120/110 或咨询专业人士”。
