import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolsService } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import { KnowledgeStore, StateStore, registerHowToLiveTools } from '../src/host/index.ts'

const tempDirs: string[] = []

async function createTempStateFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'howtolive-test-'))
  tempDirs.push(dir)
  return path.join(dir, 'state.json')
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!
    await fs.rm(dir, { recursive: true, force: true })
  }
})

describe('Host KnowledgeStore & StateStore & Tools', () => {
  it('加载完整知识库并支持多维检索、交叉引用与每日一抽', () => {
    const knowledge = new KnowledgeStore().loadSync()
    expect(knowledge.chapters.length).toBe(34)
    expect(knowledge.allItems.length).toBeGreaterThan(700)

    const zeroCostA = knowledge.search({
      maxMoney: '0',
      evidenceGrades: ['A'],
      roiTiers: ['S'],
      limit: 5,
    })
    expect(zeroCostA.items.length).toBe(5)
    for (const item of zeroCostA.items) {
      expect(item.roiTier).toBe('S')
      expect(item.tags?.money).toBe('0')
      expect(item.evidenceGrade.toUpperCase()).toMatch(/^A/)
    }

    const pick1 = knowledge.pickDailyItem({}, { occupation: 'programmer' }, [], '2026-11-20#0')
    const pick2 = knowledge.pickDailyItem({}, { occupation: 'programmer' }, pick1 ? [pick1.id] : [], '2026-11-20#1')
    expect(pick1).not.toBeNull()
    expect(pick2).not.toBeNull()
    expect(pick2?.id).not.toBe(pick1?.id)
  })

  it('StateStore 支持原子持久化、并发序列化更新与重加载恢复', async () => {
    const filePath = await createTempStateFile()
    const store = new StateStore(filePath)
    store.loadSync()

    await Promise.all([
      store.updateItemProgress('01-01', { status: 'done', note: '已买安全带卡扣检查' }),
      store.updateItemProgress('01-02', { status: 'planned' }),
      store.updateProfile({ occupation: 'programmer', housing: 'renting' }),
    ])

    const reloaded = new StateStore(filePath)
    const state = reloaded.loadSync()
    expect(state.progress['01-01']?.status).toBe('done')
    expect(state.progress['01-01']?.note).toBe('已买安全带卡扣检查')
    expect(state.progress['01-02']?.status).toBe('planned')
    expect(state.profile.occupation).toBe('programmer')
  })

  it('在真实 Cordis 容器中注册 4 个工具并完整执行检索→详情→更新→统计闭环', async () => {
    const stateFile = await createTempStateFile()
    const knowledge = new KnowledgeStore().loadSync()
    const stateStore = new StateStore(stateFile)
    stateStore.loadSync()

    const ctx = new Context()
    ctx.plugin(SystemPrompt)
    ctx.plugin(ToolsService)
    await new Promise<void>((resolve) => {
      ctx.inject(['tools', 'systemPrompt'], () => {
        resolve()
      })
    })

    const disposeTools = registerHowToLiveTools(ctx, knowledge, stateStore)

    const searchTool = ctx.tools.get('howtolive_search')!
    const getItemTool = ctx.tools.get('howtolive_get_item')!
    const getSummaryTool = ctx.tools.get('howtolive_get_summary')!
    const updateTool = ctx.tools.get('howtolive_update_item')!

    expect(searchTool).toBeDefined()
    expect(getItemTool).toBeDefined()
    expect(getSummaryTool).toBeDefined()
    expect(updateTool).toBeDefined()

    const execStub = { signal: new AbortController().signal } as never

    const searchRes = (await searchTool.execute(
      { maxMoney: '0', evidenceGrades: ['A'], limit: 3 },
      execStub,
    )) as { total: number; items: Array<{ id: string; title: string }> }
    expect(searchRes.items.length).toBe(3)

    const firstId = searchRes.items[0]!.id
    const detailRes = (await getItemTool.execute({ id: firstId }, execStub)) as {
      found: boolean
      id: string
      sources: string
    }
    expect(detailRes.found).toBe(true)
    expect(detailRes.id).toBe(firstId)

    const updateRes = (await updateTool.execute(
      { id: firstId, status: 'done', note: '已落实' },
      execStub,
    )) as { ok: boolean; xpDelta: number; totalXp: number; dimensionChange: string }
    expect(updateRes.ok).toBe(true)
    expect(updateRes.xpDelta).toBeGreaterThan(0)
    expect(updateRes.totalXp).toBe(updateRes.xpDelta)

    const summaryRes = (await getSummaryTool.execute({}, execStub)) as {
      totalXp: number
      doneCount: number
    }
    expect(summaryRes.totalXp).toBe(updateRes.totalXp)
    expect(summaryRes.doneCount).toBe(1)

    // excludeDone 默认为 true，已完成的条目不再出现在检索结果中
    const searchAfterDone = (await searchTool.execute(
      { query: firstId, limit: 5 },
      execStub,
    )) as { items: Array<{ id: string }> }
    expect(searchAfterDone.items.some((i) => i.id === firstId)).toBe(false)

    disposeTools()
    await ctx.fiber?.dispose()
  })
})
