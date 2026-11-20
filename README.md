# `dsh-howtolive`（人生补丁）

> 基于开源项目 [`eternity4719/HowToLiveBetter`](https://github.com/eternity4719/HowToLiveBetter)（《高性价比人生指南》），为 **DeepSeek Harness (`dsh`)** 打造的原生双端（Host + Web Client）组合包插件。

## 核心能力

1. **人生六维仪表盘（Life Patch Dashboard）**：将原书 34 章节 772 条循证建议聚合为「生命防线、财富护城河、法律防坑盾、职场与效率、家庭与关系、安全与韧性」六大维度，配备纯 SVG 六维雷达图、Lv.1 → Lv.10 补丁等级进度条与「今日高性价比一抽」。
2. **循证清单浏览器**：支持关键词实时检索，维度/章节/性价比分级（`S / A / B / C`）/证据等级（`A / B / C`）/零花钱/人群多维组合筛选；支持 `todo`、`planned`（行动清单）、`done`（已做到）、`skipped`（不适用，自动从完成率分母剔除）四种状态及本地私有笔记、交叉引用跳转。
3. **AI 人生体检官**：10 秒勾选本地个人画像（仅保存在本机 `$DSH_HOME/plugins/howtolive/state.json`），一键开启 DeepSeek 会话调用 `howtolive_*` 工具，输出当前最小代价最大收益 Top 5 补丁。
4. **遇事不慌 · 情景急救箱**：内置裁员赔偿、突发急救、租房买房、程序员合规、账号反诈、低谷重启 6 大情景快捷入口，一键拉起循证应对会话。
5. **聊天流内嵌补丁卡片**：注册 `conversation.chat.turnTail`，当 Agent 调用 `howtolive_search` / `howtolive_get_item` 后，直接在回复下方渲染可点亮「已做到」与「加入清单」的原生交互卡片。
6. **本地掌控与报告导出**：支持一键导出《我的人生补丁配置单（Markdown）》及一键同步上游最新内容。

---

## 安装与使用

### 方式 A：通过离线压缩包（`.tgz`）安装（推荐）

```bash
# 1. 构建并打包
pnpm install
pnpm run build
pnpm pack

# 2. 创建基于 web 模板的 profile 并安装插件（无需构建授权）
dsh --profile myweb --from-default-profile web --dump-config
dsh plugin --profile myweb add ./dsh-howtolive-0.1.0.tgz

# 3. 启动 Web UI
dsh --profile myweb
```

### 方式 B：本地源码链接调试

```bash
dsh --profile dev --from-default-profile web --dump-config
dsh plugin --profile dev add .
dsh --profile dev
```

> **Windows 提示**：若项目位于 `D:\` 而 `$DSH_HOME` 位于 `C:\`，`pnpm add .` 可能受跨盘符 Junction 路径影响；建议在 Windows 上使用 `pnpm pack` 产出的 `.tgz` 安装，或将 `DSH_HOME` 设在同盘符目录。

---

## 插件市场索引示例

```json
{
  "name": "dsh-howtolive",
  "title": "人生补丁 · 高性价比人生指南",
  "description": "《高性价比人生指南》循证决策仪表盘、AI 人生体检官与情景急救箱",
  "version": "0.1.0",
  "package": "dsh-howtolive",
  "capabilities": ["tools", "web-ui"],
  "engines": {
    "dsh": ">=0.2.0-rc.0 <0.3.0"
  }
}
```

---

## 本地开发与校验

```bash
# 同步最新上游知识库（可选 --local <repoPath> 离线解析）
pnpm run sync

# 类型检查、构建双端产物（lib/host, lib/shared, lib/client.js）
pnpm run typecheck
pnpm run build

# 运行单元测试与组件测试
pnpm test
```

## 许可与致谢

- 本插件代码采用 [MIT License](./LICENSE)。
- 内置知识库内容来源于 [`eternity4719/HowToLiveBetter`](https://github.com/eternity4719/HowToLiveBetter)（内容协议 **CC BY 4.0**，代码协议 **MIT**），详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
- **免责声明**：医疗、法律及重大财务决策请结合自身实际情况并咨询专业机构；突发急症或人身安全紧急情况请立即拨打 120 / 110。
