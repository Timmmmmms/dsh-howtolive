// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, icon, ...rest }: Record<string, unknown>) => (
    <button type="button" {...(rest as object)}>
      {icon as never}
      {children as never}
    </button>
  ),
  Pill: ({ children, active: _active, ...rest }: Record<string, unknown>) => (
    <button type="button" {...(rest as object)}>{children as never}</button>
  ),
  Tag: ({ children }: Record<string, unknown>) => <span>{children as never}</span>,
  Input: ({ icon: _icon, ...rest }: Record<string, unknown>) => <input {...(rest as object)} />,
  Modal: ({ open, title, children, footer }: Record<string, unknown>) =>
    open ? (
      <div role="dialog" aria-label={String(title)}>
        <h2>{String(title)}</h2>
        <div>{children as never}</div>
        <div>{footer as never}</div>
      </div>
    ) : null,
  IconCheckOutlineRegular: () => <span aria-hidden="true">✓</span>,
  IconSearchOutlineRegular: () => <span aria-hidden="true">🔍</span>,
}))

import { LifeRadarCard } from '../src/client/components/LifeRadarCard.tsx'
import { DailyPickCard } from '../src/client/components/DailyPickCard.tsx'
import { ScenarioBar } from '../src/client/components/ScenarioBar.tsx'
import { ProfileModal } from '../src/client/components/ProfileModal.tsx'
import { TurnPatchCard } from '../src/client/components/TurnPatchCard.tsx'
import { howtoliveTurnDefinition, selectHowToLivePatches } from '../src/client/howtolive-turn.ts'
import { zh, type HowToLiveLocaleKey } from '../src/client/locales.ts'
import { computeScoreSummary, DEFAULT_DIMENSIONS } from '../src/shared/scoring.ts'
import type { KnowledgeItemSummary } from '../src/shared/types.ts'

afterEach(() => {
  cleanup()
})

const t: TranslateNS<'howtolive'> = ((key: HowToLiveLocaleKey, params?: Record<string, unknown>) => {
  let text: string = zh[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
  }
  return text
}) as TranslateNS<'howtolive'>

const SAMPLE_ITEM: KnowledgeItemSummary = {
  id: '01-01',
  chapterNumber: 1,
  chapterTitle: '不要早死',
  number: 1,
  title: '上车无论前后排都系安全带',
  topic: '路上',
  dimension: 'survival',
  tags: { money: '0', time: '0', willpower: '否', benefit: '大', metric: '死亡率', audience: [], raw: '' },
  roiScore: 100,
  roiTier: 'S',
  xp: 40,
  plain: '后排不系安全带同样致命，且会撞击前排乘客。',
  cost: '0 元，2 秒',
  evidenceGrade: 'A',
  crossRefs: [],
}

describe('Client components & Turn projection', () => {
  it('LifeRadarCard 渲染六维 SVG 雷达并支持点击维度筛选', () => {
    const summary = computeScoreSummary(
      [SAMPLE_ITEM],
      { '01-01': { status: 'done', updatedAt: '2026-11-20T00:00:00Z' } },
      DEFAULT_DIMENSIONS,
    )
    const onSelectDimension = vi.fn()
    render(
      <LifeRadarCard
        summary={summary}
        activeDimension="all"
        onSelectDimension={onSelectDimension}
        t={t}
      />,
    )

    expect(screen.getByText('人生六维防御雷达')).toBeTruthy()
    expect(screen.getByText(/Lv\.1/)).toBeTruthy()

    const survivalButtons = screen.getAllByRole('button', { name: /生命防线/ })
    fireEvent.click(survivalButtons[0]!)
    expect(onSelectDimension).toHaveBeenCalledWith('survival')
  })

  it('DailyPickCard 支持已做到打卡、加入行动清单与换一张', async () => {
    const onMarkStatus = vi.fn(async () => {})
    const onReroll = vi.fn(async () => {})
    const onOpenDetail = vi.fn()

    render(
      <DailyPickCard
        item={SAMPLE_ITEM}
        itemStatus="todo"
        xpFeedback={null}
        onMarkStatus={onMarkStatus}
        onReroll={onReroll}
        onOpenDetail={onOpenDetail}
        t={t}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /已做到 \+40 XP/ }))
    await waitFor(() => expect(onMarkStatus).toHaveBeenCalledWith('01-01', 'done'))

    const rerollBtn = screen.getByRole('button', { name: '换一张' })
    await waitFor(() => expect((rerollBtn as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(rerollBtn)
    await waitFor(() => expect(onReroll).toHaveBeenCalled())
  })

  it('ScenarioBar 展示 6 个情景急救卡片并触发回调', () => {
    const onSelectScenario = vi.fn()
    render(<ScenarioBar onSelectScenario={onSelectScenario} t={t} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(6)
    fireEvent.click(buttons[0]!)
    expect(onSelectScenario).toHaveBeenCalledTimes(1)
    expect(onSelectScenario.mock.calls[0]![0].id).toBe('layoff')
  })

  it('howtoliveTurnDefinition 能从 tool/call + tool/result 中提取 Turn 补丁列表', () => {
    const startState = howtoliveTurnDefinition.start(
      { previous: undefined } as never,
      { event: { type: 'turn/start', seq: 1, time: 1000, data: { turn: 1 } } } as never,
    )

    const afterCall = howtoliveTurnDefinition.update(
      { state: startState } as never,
      {
        event: {
          type: 'tool/call',
          seq: 2,
          time: 1001,
          data: { turn: 1, callId: 'c1', name: 'howtolive_search', arguments: '{}' },
        },
      } as never,
    )

    const afterResult = howtoliveTurnDefinition.update(
      { state: afterCall } as never,
      {
        event: {
          type: 'tool/result',
          seq: 3,
          time: 1002,
          data: {
            turn: 1,
            message: {
              role: 'tool',
              isError: false,
              source: { callId: 'c1', toolName: 'howtolive_search' },
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    total: 1,
                    items: [
                      {
                        id: '01-01',
                        title: '上车无论前后排都系安全带',
                        roiTier: 'S',
                        evidenceGrade: 'A',
                        xp: 40,
                        plain: '后排不系安全带同样致命',
                        cost: '0元',
                        userStatus: 'todo',
                      },
                    ],
                  }),
                },
              ],
            },
          },
        },
      } as never,
    )

    const locData = howtoliveTurnDefinition.buildLocationData!(
      { state: afterResult } as never,
      'turn',
      undefined,
    ) as { kind: 'turn'; turn: number; key: 'howtolive-patches'; value: { items: unknown[]; hasUpdate: boolean } }

    expect(locData.kind).toBe('turn')
    expect(locData.value.items.length).toBe(1)

    const turnLocation = {
      turn: 1,
      end: { seq: 5 },
      data: new Map([['howtolive-patches', locData.value]]),
    } as unknown as TurnLocation

    const selected = selectHowToLivePatches({
      turn: turnLocation,
      seq: 5,
      openFile: () => {},
    })
    expect(selected?.items[0]?.id).toBe('01-01')

    const setItemProgress = vi.fn(async () => ({}))
    const openInPanel = vi.fn()
    const useHowtolive = ((selector: (s: { state: null }) => unknown) => selector({ state: null })) as never

    render(
      <TurnPatchCard
        turn={turnLocation}
        seq={5}
        openFile={() => {}}
        useHowtolive={useHowtolive}
        ensureLoaded={async () => {}}
        refresh={async () => {}}
        setItemProgress={setItemProgress}
        openInPanel={openInPanel}
        t={t}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /已做到 \+40/ }))
    expect(setItemProgress).toHaveBeenCalledWith('01-01', { status: 'done' })

    fireEvent.click(screen.getByRole('button', { name: '在面板中浏览全部' }))
    expect(openInPanel).toHaveBeenCalled()
  })

  it('ProfileModal 支持勾选画像并触发保存并体检回调', () => {
    const onSave = vi.fn(async () => {})
    const onSaveAndCheckup = vi.fn(async () => {})
    const onClose = vi.fn()

    render(
      <ProfileModal
        open={true}
        profile={{}}
        onClose={onClose}
        onSave={onSave}
        onSaveAndCheckup={onSaveAndCheckup}
        t={t}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '程序员 / 技术' }))
    fireEvent.click(screen.getByRole('button', { name: '租房' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并开始 AI 体检' }))

    expect(onSaveAndCheckup).toHaveBeenCalledWith(
      expect.objectContaining({ occupation: 'programmer', housing: 'renting' }),
    )
  })
})
