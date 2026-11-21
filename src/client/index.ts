import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { ensureHowToLiveWorkspaceDir } from './api.ts'
import { HowToLivePage, type HowToLivePageInjected } from './components/HowToLivePage.tsx'
import { PanelIcon } from './components/PanelIcon.tsx'
import { TurnPatchCard, type TurnPatchCardInjected } from './components/TurnPatchCard.tsx'
import { howtoliveTurnDefinition } from './howtolive-turn.ts'
import { en, NS, zh, type HowToLiveLocaleKey } from './locales.ts'
import { createHowToLiveController } from './store.ts'

const PANEL_ID = 'howtolive' as MainPanelId
const DEFAULT_WORKSPACE_TITLE = '人生补丁'

/** 规范化本地路径用于跨平台比对（统一分隔符、去除尾部斜杠，Windows 盘符路径忽略大小写） */
function normalizeWorkspacePath(input: string): string {
  const unified = input.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-zA-Z]:\//.test(unified) ? unified.toLowerCase() : unified
}

export interface PromptSessionLauncherDeps {
  readonly workspaces: Pick<IWorkspaces, 'list' | 'create' | 'rename'>
  readonly uiWorkspace: Pick<UiWorkspace, 'connectWorkspace' | 'openSession' | 'startSession'>
  readonly sessions: ClientContext['sessions']
  readonly ensureWorkspaceDir?: () => Promise<{ path: string; defaultTitle: string }>
}

/**
 * 创建面向「人生补丁」专属工作区的会话启动器：
 * 1. 确保 $DSH_HOME/plugins/howtolive/workspace 目录存在并注册为独立工作区；
 * 2. 首次自动创建时自动重命名为「人生补丁」（冲突时静默忽略，不阻断聊天）；
 * 3. 若专属工作区已存在则直接复用，保留用户自定义名称；
 * 4. 专属工作区不可用时优雅回退到已有工作区或草稿填充。
 */
export function createPromptSessionLauncher(
  deps: PromptSessionLauncherDeps,
): (prompt: string) => Promise<void> {
  const ensureDir = deps.ensureWorkspaceDir ?? ensureHowToLiveWorkspaceDir
  let inflightResolve: Promise<WorkspaceId | undefined> | null = null

  const resolveDedicatedWorkspaceId = async (): Promise<WorkspaceId | undefined> => {
    try {
      const { path: targetPath, defaultTitle } = await ensureDir()
      const normalizedTarget = normalizeWorkspacePath(targetPath)
      const existing = deps.workspaces.list
        .getSnapshot()
        .items.find((ws) => normalizeWorkspacePath(ws.path) === normalizedTarget)
      if (existing) {
        return existing.workspaceId
      }

      const created = await deps.workspaces.create({ path: targetPath })
      const title = defaultTitle?.trim() || DEFAULT_WORKSPACE_TITLE
      if (created.title !== title) {
        try {
          await deps.workspaces.rename(created.workspaceId, title)
        } catch {
          // 重名冲突或权限受限时忽略重命名失败，避免影响会话启动
        }
      }
      return created.workspaceId
    } catch {
      return undefined
    }
  }

  const getOrCreateDedicatedWorkspaceId = (): Promise<WorkspaceId | undefined> => {
    if (!inflightResolve) {
      inflightResolve = resolveDedicatedWorkspaceId().finally(() => {
        inflightResolve = null
      })
    }
    return inflightResolve
  }

  return async (prompt: string): Promise<void> => {
    const dedicatedId = await getOrCreateDedicatedWorkspaceId()
    const targetWorkspaceId = dedicatedId ?? deps.workspaces.list.getSnapshot().items[0]?.workspaceId

    if (targetWorkspaceId) {
      try {
        const sessionId = await deps.uiWorkspace.connectWorkspace(targetWorkspaceId)
        deps.uiWorkspace.openSession(sessionId)
        const ref = deps.sessions.retain(sessionId, { source: 'controllerOperation' })
        try {
          const binding = await ref.ready
          const result = await binding.session.prompt([{ type: 'text', text: prompt }], 'queue')
          if (result.ok) return
        } finally {
          ref.release()
        }
      } catch {
        // 自动发送失败时回退到填充输入框，由用户确认发送
      }
    }

    deps.uiWorkspace.startSession(targetWorkspaceId, { prompt, whenDraftExists: 'replace' })
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 人生补丁插件多语言词典 */
    howtolive: HowToLiveLocaleKey
  }
}

export const inject = [
  'slots',
  'locale',
  'layout',
  'uiWorkspace',
  'uiConversation',
  'workspaces',
  'sessions',
]

/**
 * 浏览器端插件入口：
 * 1. 注册侧边栏「人生补丁」入口与 main 主面板。
 * 2. 注册 Turn 级事件定义与 conversation.chat.turnTail 聊天内嵌交互卡片。
 * 3. 提供一键开启 AI 体检 / 情景急救会话能力。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'howtolive: dictionaries')
  const t = ctx.locale.bind(NS)

  const controller = createHowToLiveController()

  ctx.uiConversation.events.register(howtoliveTurnDefinition)

  const launchPromptSession = createPromptSessionLauncher({
    workspaces: ctx.workspaces,
    uiWorkspace: ctx.uiWorkspace,
    sessions: ctx.sessions,
  })

  const openInPanel = (itemId?: string): void => {
    ctx.layout.selectPanel(PANEL_ID)
    void controller.ensureLoaded()
    if (itemId) {
      void controller.openItemDetail(itemId)
    }
  }

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 60,
            locale: NS,
            label: () => t('panel'),
          },
          PanelIcon,
        ),
      ),
    'howtolive: sidebar panel',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: (): HowToLivePageInjected => ({
              hooks: { howtolive: controller.store },
              ensureLoaded: controller.ensureLoaded,
              refresh: controller.refresh,
              refreshState: controller.refreshState,
              openItemDetail: controller.openItemDetail,
              goBackItemDetail: controller.goBackItemDetail,
              closeItemDetail: controller.closeItemDetail,
              setItemProgress: controller.setItemProgress,
              setItemsProgressBatch: controller.setItemsProgressBatch,
              saveProfile: controller.saveProfile,
              rerollDaily: controller.rerollDaily,
              exportMarkdown: controller.exportMarkdown,
              syncUpstream: controller.syncUpstream,
              launchPromptSession,
            }),
          },
          HowToLivePage,
        ),
      ),
    'howtolive: main panel',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('conversation.chat.turnTail', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.turnTail',
            id: 'howtolive-patches',
            order: 25,
            locale: NS,
            inject: (): TurnPatchCardInjected => ({
              hooks: { howtolive: controller.store },
              ensureLoaded: controller.ensureLoaded,
              refresh: controller.refresh,
              refreshState: controller.refreshState,
              setItemProgress: controller.setItemProgress,
              openInPanel,
            }),
          },
          TurnPatchCard,
        ),
      ),
    'howtolive: turn tail patch card',
  )
}
