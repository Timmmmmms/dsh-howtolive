import { Service, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { KnowledgeStore } from './knowledge-store.ts'
import { createHowToLiveRoutes } from './routes.ts'
import { StateStore } from './state-store.ts'
import { registerHowToLiveTools } from './tools.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    howtolive: HowToLiveService
  }
}

/**
 * Host 端人生补丁核心服务：持有知识库索引与本地进度状态。
 */
export class HowToLiveService extends Service {
  readonly knowledge: KnowledgeStore
  readonly state: StateStore

  constructor(ctx: Context, knowledge: KnowledgeStore, state: StateStore) {
    super(ctx, 'howtolive')
    this.knowledge = knowledge
    this.state = state
  }
}

export const name = 'howtolive'

/** 最小必需依赖仅限 tools 与 systemPrompt，保证在 TUI / Headless / Web 下均可加载 */
export const inject = ['tools', 'systemPrompt']

/**
 * dsh-howtolive Host 插件入口：
 * 1. 加载本地预构建知识库 data/knowledge.json 与 $DSH_HOME/plugins/howtolive/state.json。
 * 2. 提供 ctx.howtolive 服务并注册 4 个模型工具。
 * 3. 当 Web/Desktop Connection 服务可用时，挂载前端所需 JSON API 路由（Phase 2 扩展）。
 */
export function apply(ctx: Context): void {
  const knowledge = new KnowledgeStore().loadSync()
  const stateStore = new StateStore()
  stateStore.loadSync()

  new HowToLiveService(ctx, knowledge, stateStore)

  ctx.effect(() => registerHowToLiveTools(ctx, knowledge, stateStore), 'howtolive: tools')

  // 当运行在 Web / Desktop 环境且 connection 服务存在时，注册精确 Fetch 路由
  ctx.inject(['connection'], (connCtx) => {
    const routes = createHowToLiveRoutes(knowledge, stateStore)
    for (const route of routes) {
      connCtx.connection.fetch.register(route)
    }
  })
}

export { KnowledgeStore, resolvePackageRoot, toItemSummary } from './knowledge-store.ts'
export { StateStore, resolveStateFilePath, resolveWorkspaceDirPath } from './state-store.ts'
export { registerHowToLiveTools } from './tools.ts'
export { createHowToLiveRoutes, API_PREFIX } from './routes.ts'
export { buildPatchReportMarkdown } from './export.ts'
