// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

vi.mock('@deepseek-ai/dsh-client-store', () => ({
  createSnapshotStore: <T extends object>(initial: T) => {
    let snapshot: T = structuredClone(initial)
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => snapshot,
      update: (updater: (draft: T) => void) => {
        const draft = structuredClone(snapshot)
        updater(draft)
        snapshot = draft
        for (const l of listeners) l()
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
  },
}))

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

import { CveScannerView } from '../src/client/components/CveScannerView.tsx'
import { LifeRadarCard } from '../src/client/components/LifeRadarCard.tsx'
import { DailyPickCard } from '../src/client/components/DailyPickCard.tsx'
import { DEFAULT_FILTERS, FilterBar } from '../src/client/components/FilterBar.tsx'
import { ItemDetailDrawer } from '../src/client/components/ItemDetailDrawer.tsx'
import { PatchSprintModal } from '../src/client/components/PatchSprintModal.tsx'
import { ScenarioBar } from '../src/client/components/ScenarioBar.tsx'
import { ProfileModal } from '../src/client/components/ProfileModal.tsx'
import { TurnPatchCard } from '../src/client/components/TurnPatchCard.tsx'
import { howtoliveTurnDefinition, selectHowToLivePatches } from '../src/client/howtolive-turn.ts'
import { en, zh, type HowToLiveLocaleKey } from '../src/client/locales.ts'
import { createHowToLiveController } from '../src/client/store.ts'
import { scanLifeVulnerabilities } from '../src/shared/cve.ts'
import { computeScoreSummary, DEFAULT_DIMENSIONS } from '../src/shared/scoring.ts'
import type { KnowledgeItem, KnowledgeItemSummary } from '../src/shared/types.ts'

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

const tEn: TranslateNS<'howtolive'> = ((key: HowToLiveLocaleKey, params?: Record<string, unknown>) => {
  let text: string = en[key] ?? key
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

  it('FilterBar 英文模式正确显示 Filters，支持排序、一键清空与 / 快捷键聚焦', () => {
    const onChange = vi.fn()
    render(
      <FilterBar
        filters={{ ...DEFAULT_FILTERS, query: '安全带' }}
        dimensions={DEFAULT_DIMENSIONS}
        chapters={[]}
        audiences={[]}
        shownCount={1}
        totalCount={10}
        skippedCount={0}
        onChange={onChange}
        t={tEn}
      />,
    )

    // 英文模式不再硬编码显示中文「筛选」
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()

    // 一键清空搜索按钮
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ query: '' }))

    // 排序选择器
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'roi' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sort: 'roi' }))

    // `/` 快捷键聚焦搜索框
    const input = screen.getByLabelText(en['filter.searchPlaceholder'])
    fireEvent.keyDown(window, { key: '/' })
    expect(document.activeElement).toBe(input)
  })

  it('ProfileModal 英文模式本地化且移除 autofocus，并支持跳过画像直接体检', () => {
    const onSkipToCheckup = vi.fn()
    render(
      <ProfileModal
        open={true}
        profile={{}}
        onClose={() => {}}
        onSave={async () => {}}
        onSaveAndCheckup={async () => {}}
        onSkipToCheckup={onSkipToCheckup}
        t={tEn}
      />,
    )

    expect(screen.getByRole('button', { name: 'Developer / Tech' })).toBeTruthy()
    const textarea = screen.getByPlaceholderText(en['profile.customNotePlaceholder'])
    expect(textarea.hasAttribute('data-modal-autofocus')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Skip & Run Checkup' }))
    expect(onSkipToCheckup).toHaveBeenCalledTimes(1)
  })

  it('DailyPickCard 在 done 状态下主按钮切换为「再抽一张」', async () => {
    const onReroll = vi.fn(async () => {})
    render(
      <DailyPickCard
        item={SAMPLE_ITEM}
        itemStatus="done"
        xpFeedback={null}
        onMarkStatus={async () => {}}
        onReroll={onReroll}
        onOpenDetail={() => {}}
        t={t}
      />,
    )

    const drawNextBtn = screen.getByRole('button', { name: '再抽一张' })
    expect((drawNextBtn as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(drawNextBtn)
    await waitFor(() => expect(onReroll).toHaveBeenCalledTimes(1))
  })

  it('ItemDetailDrawer 支持问 AI 怎么落地、返回上一条与失焦自动保存笔记', async () => {
    const onGoBack = vi.fn()
    const onAskAi = vi.fn()
    const onUpdateProgress = vi.fn(async () => {})
    const fullItem: KnowledgeItem = {
      ...SAMPLE_ITEM,
      benefit: '大幅降低致死率',
      sources: 'WHO 指南',
      notes: '后排务必提醒乘客系好安全带',
      rawMarkdown: '',
    }

    render(
      <ItemDetailDrawer
        open={true}
        loading={false}
        summaryItem={SAMPLE_ITEM}
        detail={{ item: fullItem, crossRefs: [] }}
        progress={{ status: 'todo', updatedAt: '2026-11-21T00:00:00Z' }}
        canGoBack={true}
        onGoBack={onGoBack}
        onClose={() => {}}
        onJumpToItem={() => {}}
        onAskAi={onAskAi}
        onUpdateProgress={onUpdateProgress}
        t={t}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '返回上一条' }))
    expect(onGoBack).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '问 AI 怎么落地' }))
    expect(onAskAi).toHaveBeenCalledWith(fullItem)

    const textarea = screen.getByPlaceholderText(zh['drawer.notePlaceholder'])
    fireEvent.change(textarea, { target: { value: '已在后排贴提醒贴纸' } })
    fireEvent.blur(textarea)
    await waitFor(() =>
      expect(onUpdateProgress).toHaveBeenCalledWith('01-01', { note: '已在后排贴提醒贴纸' }),
    )
  })

  it('TurnPatchCard 超过 3 条时默认折叠并提供展开其余按钮', () => {
    const items = Array.from({ length: 5 }, (_, idx) => ({
      id: `01-0${idx + 1}`,
      title: `测试条目 ${idx + 1}`,
      roiTier: 'S' as const,
      evidenceGrade: 'A',
      xp: 40,
      plain: '摘要',
      cost: '0元',
      userStatus: 'todo' as const,
      seq: 2,
    }))
    const turnLocation = {
      turn: 1,
      end: { seq: 5 },
      data: new Map([['howtolive-patches', { items, hasUpdate: false }]]),
    } as unknown as TurnLocation

    const useHowtolive = ((selector: (s: { state: null }) => unknown) => selector({ state: null })) as never
    render(
      <TurnPatchCard
        turn={turnLocation}
        seq={5}
        openFile={() => {}}
        useHowtolive={useHowtolive}
        ensureLoaded={async () => {}}
        refresh={async () => {}}
        setItemProgress={async () => ({})}
        openInPanel={() => {}}
        t={t}
      />,
    )

    expect(screen.getByText('测试条目 1')).toBeTruthy()
    expect(screen.getByText('测试条目 3')).toBeTruthy()
    expect(screen.queryByText('测试条目 4')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '展开其余 2 条' }))
    expect(screen.getByText('测试条目 4')).toBeTruthy()
    expect(screen.getByText('测试条目 5')).toBeTruthy()
  })

  it('Store controller 支持乐观更新与失败自动回滚', async () => {
    const controller = createHowToLiveController()
    const summary = computeScoreSummary([SAMPLE_ITEM], {}, DEFAULT_DIMENSIONS)
    controller.store.update((draft) => {
      draft.status = 'ready'
      draft.meta = {
        schemaVersion: 1,
        generatedAt: '2026-11-21T00:00:00Z',
        upstream: { repo: 'test', url: 'https://example.com', commitSha: null, sourceType: 'local' },
        stats: { chapterCount: 1, itemCount: 1, taggedItemCount: 1, tierCounts: { S: 1, A: 0, B: 0, C: 0 }, topAudiences: [] },
        dimensions: [...DEFAULT_DIMENSIONS],
      }
      draft.items = [SAMPLE_ITEM]
      draft.state = { version: 1, profile: {}, progress: {}, updatedAt: '2026-11-21T00:00:00Z' }
      draft.summary = summary
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => Promise.resolve(new Response(JSON.stringify({ error: 'disk full' }), { status: 500 })),
    )

    try {
      const promise = controller.setItemProgress('01-01', { status: 'done' })
      // 请求未完成前已乐观更新
      expect(controller.store.getSnapshot().state?.progress['01-01']?.status).toBe('done')
      expect(controller.store.getSnapshot().summary?.totalXp).toBe(40)

      await expect(promise).rejects.toThrow('disk full')
      // 失败后自动回滚
      expect(controller.store.getSnapshot().state?.progress['01-01']).toBeUndefined()
      expect(controller.store.getSnapshot().summary?.totalXp).toBe(0)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('Task 1A：ScenarioBar 支持展示「随机压力测试（AI 演练）」入口并触发回调', () => {
    const onSelectScenario = vi.fn()
    const onStartChaosDrill = vi.fn()
    render(
      <ScenarioBar
        onSelectScenario={onSelectScenario}
        onStartChaosDrill={onStartChaosDrill}
        t={t}
      />,
    )

    const drillBtn = screen.getByRole('button', { name: '随机压力测试（AI 演练）' })
    fireEvent.click(drillBtn)
    expect(onStartChaosDrill).toHaveBeenCalledTimes(1)
  })

  it('Task 1B：FilterBar 视图切换 Tab 与 CveScannerView 漏洞修复交互', () => {
    const onViewModeChange = vi.fn()
    render(
      <FilterBar
        filters={DEFAULT_FILTERS}
        dimensions={DEFAULT_DIMENSIONS}
        chapters={[]}
        audiences={[]}
        shownCount={2}
        totalCount={10}
        skippedCount={0}
        viewMode="cards"
        onViewModeChange={onViewModeChange}
        cveCriticalCount={3}
        onChange={() => {}}
        t={t}
      />,
    )

    const cveTab = screen.getByRole('tab', { name: /漏洞扫描/ })
    fireEvent.click(cveTab)
    expect(onViewModeChange).toHaveBeenCalledWith('cve')

    cleanup()

    const report = scanLifeVulnerabilities([SAMPLE_ITEM], {}, {})
    const onSetStatus = vi.fn()
    const onOpenDetail = vi.fn()

    render(
      <CveScannerView
        report={report}
        busyId={null}
        onSetStatus={onSetStatus}
        onOpenDetail={onOpenDetail}
        t={t}
      />,
    )

    expect(screen.getByText('LIFE-CVE-01-01')).toBeTruthy()
    expect(screen.getByText('暴露中 (Exposed)')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '一键修复' }))
    expect(onSetStatus).toHaveBeenCalledWith('01-01', 'done')

    fireEvent.click(screen.getByRole('button', { name: '排期修复' }))
    expect(onSetStatus).toHaveBeenCalledWith('01-01', 'planned')

    fireEvent.click(screen.getByRole('button', { name: '误报/不适用' }))
    expect(onSetStatus).toHaveBeenCalledWith('01-01', 'skipped')

    fireEvent.click(screen.getByRole('button', { name: '查看修复指南' }))
    expect(onOpenDetail).toHaveBeenCalledWith('01-01')
  })

  it('Task 1C：PatchSprintModal 支持键盘速刷、Combo 连击、结算卡与空池兜底', async () => {
    const item2: KnowledgeItemSummary = {
      ...SAMPLE_ITEM,
      id: '01-02',
      number: 2,
      title: '家中备好独立烟雾报警器',
      xp: 25,
    }
    const onMarkStatus = vi.fn(async () => {})
    const onOpenDetail = vi.fn()
    const onClose = vi.fn()

    render(
      <PatchSprintModal
        open={true}
        items={[SAMPLE_ITEM, item2]}
        progress={{}}
        summary={computeScoreSummary([SAMPLE_ITEM, item2], {}, DEFAULT_DIMENSIONS)}
        profile={{}}
        onClose={onClose}
        onMarkStatus={onMarkStatus}
        onOpenDetail={onOpenDetail}
        t={t}
      />,
    )

    expect(screen.getByText('上车无论前后排都系安全带')).toBeTruthy()

    // Space 打开详情
    fireEvent.keyDown(window, { key: ' ' })
    expect(onOpenDetail).toHaveBeenCalledWith('01-01')

    // → 标记已做到，触发 1 连击并切到第 2 张
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(onMarkStatus).toHaveBeenCalledWith('01-01', 'done'))
    await waitFor(() => expect(screen.getByText('家中备好独立烟雾报警器')).toBeTruthy())
    expect(screen.getByText('1 连击')).toBeTruthy()

    // ↑ 加入行动清单，进入结算卡并记录最高 2x 连击
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    await waitFor(() => expect(onMarkStatus).toHaveBeenCalledWith('01-02', 'planned'))
    await waitFor(() => expect(screen.getByText('本轮速刷完成！')).toBeTruthy())
    expect(screen.getByText('+40')).toBeTruthy()
    expect(screen.getByText('2x')).toBeTruthy()

    // Esc 退出
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    // 空池兜底展示
    cleanup()
    render(
      <PatchSprintModal
        open={true}
        items={[SAMPLE_ITEM]}
        progress={{ '01-01': { status: 'done', updatedAt: '2026-11-21T00:00:00Z' } }}
        summary={computeScoreSummary([SAMPLE_ITEM], { '01-01': { status: 'done', updatedAt: '2026-11-21T00:00:00Z' } }, DEFAULT_DIMENSIONS)}
        profile={{}}
        onClose={() => {}}
        onMarkStatus={async () => {}}
        onOpenDetail={() => {}}
        t={t}
      />,
    )
    expect(screen.getByText('当前模式已全部刷完')).toBeTruthy()
  })

  it('Task 1C：DailyPickCard 支持展示「3 分钟速刷」入口按钮', () => {
    const onOpenSprint = vi.fn()
    render(
      <DailyPickCard
        item={SAMPLE_ITEM}
        itemStatus="todo"
        xpFeedback={null}
        onMarkStatus={async () => {}}
        onReroll={async () => {}}
        onOpenDetail={() => {}}
        onOpenSprint={onOpenSprint}
        t={t}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '3 分钟速刷' }))
    expect(onOpenSprint).toHaveBeenCalledTimes(1)
  })
})
