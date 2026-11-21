# `dsh-howtolive`（人生补丁 · Life Patch）

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH Engine](https://img.shields.io/badge/DSH-%3E%3D0.2.0--rc.0%20%3C0.3.0-0f766e.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933.svg)](https://nodejs.org/)

> 基于开源项目 [`eternity4719/HowToLiveBetter`](https://github.com/eternity4719/HowToLiveBetter)（《高性价比人生指南》），为 **DeepSeek Harness (`dsh`)** 打造的原生双端（Host + Web Client）组合包插件。

将 34 章节、772 条循证人生建议变成可检索、可打卡、可扫描漏洞、可演练、可与 DeepSeek 深度联动的本地「人生操作系统补丁面板」。

---

## 核心特性

### 1. 仪表盘与三大浏览视图
- **人生六维防御雷达**：将 772 条循证建议聚合为「生命防线、财富护城河、法律防坑盾、职场与效率、家庭与关系、安全与韧性」六大维度，配备纯 SVG 雷达图、Lv.1 → Lv.10 经验等级进度条与「今日高性价比一抽」。
- **卡片清单视图**：支持关键词实时检索（`/` 快捷键聚焦）、六维/章节/性价比分级（`S / A / B / C`）/证据等级（`A / B / C`）/零花钱/人群多维组合筛选与多种排序；支持 `todo`、`planned`（行动清单）、`done`（已做到）、`skipped`（不适用，自动从完成率分母剔除）四种状态、私有笔记自动保存与交叉引用跳转历史栈。
- **人生漏洞扫描仪（`LIFE-CVE`）**：结合本地画像自动扫描未修复的高危低成本条目，生成 `LIFE-CVE` 漏洞编号与 `Exposed / Guarded / Hardened` 系统加固评级，支持一键修复、排期或标记误报。
- **补丁关系星图（Skill Tree）**：基于条目的交叉引用网络，采用确定性六维放射状纯 SVG 布局可视化展示补丁上下游关联，支持滚轮缩放、拖拽平移与高亮溯源。

### 2. DeepSeek 深度联动与实战演练
- **AI 人生体检官**：配置本地个人画像后，一键在专属会话工作目录中拉起 DeepSeek 体检会话，调用 `howtolive_*` 工具输出当前最小代价最大收益 Top 5 补丁。
- **遇事不慌 · 情景急救箱**：内置裁员赔偿、突发急救、租房买房、程序员合规、账号反诈、低谷重启 6 大情景快捷入口，一键发起循证应对会话。
- **随机压力测试 · 防坑演练场（AI 文字 RPG）**：从你尚未完成的 S/A 级高匹配条目中抽取“暗雷”，由 DeepSeek 扮演「墨菲定律考官」展开 3~4 轮突发危机互动演练，结束后核验原书条目并给出待打补丁。
- **行动清单 AI 周末排期**：当行动清单（`planned`）非空时，可一键让 DeepSeek 按耗时与成本编排本周末可执行时间表；在详情抽屉中也可随时点击「问 AI 怎么落地」。
- **聊天流内嵌补丁卡片**：注册 `conversation.chat.turnTail`，当 Agent 调用 `howtolive_search` / `howtolive_get_item` 后，直接在回复下方渲染可折叠、可一键点亮「已做到」与「加入清单」的原生交互卡片。

### 3. 游戏化留存、长期运维与分享
- **摸鱼 3 分钟速刷盲盒（Patch Sprint）**：支持「零花钱不靠毅力 / 薄弱维度突击 / 行动清单清仓」三种模式、键盘快捷键（`→` 已做到、`↑` 加入清单、`←` 不适用、`Space` 看详情、`Esc` 退出）与 Combo 连击结算。
- **成就徽章系统**：内置多枚基于本地进度实时计算的趣味徽章（如「零元购宗师」「清醒的断舍离」「六边形战士」等）。
- **可分享「人生 OS 架构师名片」**：纯 SVG 渲染极客风名片（版本号 + 六维流派称号 + 雷达图 + 安全评级 + 代表徽章），**严格脱敏**（绝不包含私有笔记与画像细节），支持导出 SVG 与 2x 高清 PNG。
- **补丁保质期 & 年度巡检（Decay）**：支持为周期性条目（体检、急救箱效期、账号恢复码等）设置 90 / 180 / 365 天复检周期，到期提醒复检且不扣除已获 XP。
- **画像智能筛查向导**：根据本地画像识别明显不适用条目，经预览确认后一键批量标记 `skipped`，让完成率更真实。
- **本地掌控与双语支持**：完整支持简体中文 / English 双语界面、一键导出《我的人生补丁配置单（Markdown）》、JSON 进度备份/恢复与一键同步上游知识库。

---

## 环境要求

- **Node.js**：`>= 22.0.0`
- **DeepSeek Harness (`@deepseek-ai/dsh`)**：`>= 0.2.0-rc.0 < 0.3.0`
- **包管理器**：`pnpm`（本地源码构建与开发时）

---

## 安装与使用

### 方式 A：直接从 GitHub 安装（推荐）

```bash
# 1. 创建基于 web 模板的 profile（若已有 web profile 可直接复用）
dsh --profile myweb --from-default-profile web --dump-config

# 2. 从 GitHub 安装插件（安装过程会自动触发 prepare 构建产物）
dsh plugin --profile myweb add github:Timmmmmms/dsh-howtolive

# 3. 启动 Web UI
dsh --profile myweb
```

### 方式 B：通过离线压缩包（`.tgz`）安装

```bash
# 1. 克隆仓库并构建打包
git clone https://github.com/Timmmmmms/dsh-howtolive.git
cd dsh-howtolive
pnpm install
pnpm run build
pnpm pack

# 2. 安装到本地 profile 并启动
dsh --profile myweb --from-default-profile web --dump-config
dsh plugin --profile myweb add ./dsh-howtolive-0.1.0.tgz
dsh --profile myweb
```

### 方式 C：本地源码调试

```bash
dsh --profile dev --from-default-profile web --dump-config
dsh plugin --profile dev add .
dsh --profile dev
```

> **Windows 提示**：若项目位于 `D:\` 而 `$DSH_HOME` 位于 `C:\`，`dsh plugin add .` 可能受跨盘符 Junction 路径影响；建议在 Windows 上优先使用 **方式 A（GitHub）** 或 **方式 B（`.tgz` 离线包）**，或将 `DSH_HOME` 设置在同盘符目录。

### 卸载插件

```bash
dsh plugin --profile myweb remove dsh-howtolive
```

---

## 内置 Agent 工具一览

启用插件后，DeepSeek Agent 将自动获得以下 5 个工具及配套系统提示词指引（禁止编造条目 ID、法规或医疗剂量，强制引用证据等级与出处）：

| 工具名 | 作用说明 |
| --- | --- |
| `howtolive_search` | 按关键词、六维分类、章节、性价比分级（`S/A/B/C`）、证据等级（`A/B/C`）、金钱成本上限与人群标签检索本地知识库 |
| `howtolive_get_item` | 按条目 ID（如 `01-10`）读取单条建议的完整循证详情、原始来源出处、交叉引用与用户本地笔记 |
| `howtolive_get_summary` | 读取用户本地个人画像、六维属性完成率、当前等级/XP、行动清单及薄弱维度缺口 |
| `howtolive_update_item` | 更新单条建议的本地执行状态（`todo` / `planned` / `done` / `skipped`）或个人私有笔记 |
| `howtolive_batch_update_items` | 单次原子批量更新多条建议状态或笔记（最多 20 条），减少对话往返与 Token 消耗 |

---

## 数据与隐私

- **完全本地存储**：个人画像、执行状态、复检周期与私有笔记仅保存在本机 `$DSH_HOME/plugins/howtolive/state.json`，不会上传至任何第三方服务器。
- **备份与迁移**：支持在面板中导出/导入 JSON 进度备份，或一键导出 Markdown 版《我的人生补丁配置单》。
- **脱敏分享**：生成「人生 OS 名片」SVG / PNG 海报时仅展示聚合统计、雷达图、流派称号与徽章，不包含任何私有笔记与画像细节。

---

## 插件市场索引示例

```json
{
  "name": "dsh-howtolive",
  "title": "人生补丁 · 高性价比人生指南",
  "description": "《高性价比人生指南》循证决策仪表盘、LIFE-CVE 漏洞扫描、AI 人生体检官与情景急救箱",
  "version": "0.1.0",
  "package": "dsh-howtolive",
  "repository": "https://github.com/Timmmmmms/dsh-howtolive",
  "capabilities": ["tools", "web-ui"],
  "engines": {
    "dsh": ">=0.2.0-rc.0 <0.3.0"
  }
}
```

---

## 本地开发与校验

```bash
# 安装依赖
pnpm install

# 同步最新上游知识库（可选 --local <repoPath> 离线解析）
pnpm run sync

# 类型检查
pnpm run typecheck

# 构建双端产物（lib/types, lib/host, lib/shared, lib/client.js）
pnpm run build

# 运行单元测试与组件测试
pnpm test
```

更多架构设计与演进规划请参见：
- [架构设计与实现方案](./docs/DESIGN_AND_PLAN.md)
- [V2 优化与创新功能路线图](./docs/ROADMAP_V2.md)

---

## 许可与致谢

- 本插件代码采用 [MIT License](./LICENSE)。
- 内置知识库内容来源于 [`eternity4719/HowToLiveBetter`](https://github.com/eternity4719/HowToLiveBetter)（内容协议 **CC BY 4.0**，代码协议 **MIT**），详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
- **免责声明**：医疗、法律及重大财务决策请结合自身实际情况并咨询专业机构；突发急症或人身安全紧急情况请立即拨打 **120 / 110**。
