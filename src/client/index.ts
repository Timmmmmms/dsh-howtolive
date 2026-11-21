import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { HowToLivePage, type HowToLivePageInjected } from './components/HowToLivePage.tsx'
import { PanelIcon } from './components/PanelIcon.tsx'
import { TurnPatchCard, type TurnPatchCardInjected } from './components/TurnPatchCard.tsx'
import { howtoliveTurnDefinition } from './howtolive-turn.ts'
import { en, NS, zh, type HowToLiveLocaleKey } from './locales.ts'
import { createHowToLiveController } from './store.ts'

const PANEL_ID = 'howtolive' as MainPanelId

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

  const launchPromptSession = async (prompt: string): Promise<void> => {
    const workspaceList = ctx.workspaces.list.getSnapshot().items
    const targetWorkspace = workspaceList[0]
    if (targetWorkspace) {
      try {
        const sessionId = await ctx.uiWorkspace.connectWorkspace(targetWorkspace.workspaceId)
        ctx.uiWorkspace.openSession(sessionId)
        const ref = ctx.sessions.retain(sessionId, { source: 'controllerOperation' })
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
    ctx.uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'replace' })
  }

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
