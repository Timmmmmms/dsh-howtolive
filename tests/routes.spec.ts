import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { API_PREFIX, createHowToLiveRoutes, KnowledgeStore, StateStore } from '../src/host/index.ts'

const tempDirs: string[] = []

async function createTempStateFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'howtolive-routes-'))
  tempDirs.push(dir)
  return path.join(dir, 'state.json')
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!
    await fs.rm(dir, { recursive: true, force: true })
  }
})

describe('Host JSON API Routes', () => {
  it('完整跑通 bootstrap -> item -> progress -> profile -> reroll -> export-markdown', async () => {
    const stateFile = await createTempStateFile()
    const knowledge = new KnowledgeStore().loadSync()
    const stateStore = new StateStore(stateFile)
    stateStore.loadSync()

    const routes = createHowToLiveRoutes(knowledge, stateStore)
    const call = async (routePath: string, method: 'GET' | 'POST', body?: unknown) => {
      const url = new URL(`http://127.0.0.1${routePath}`)
      const route = routes.find((r) => r.path === url.pathname)
      if (!route) throw new Error(`Missing route: ${url.pathname}`)
      const req = new Request(url, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
      })
      const res = await route.fetch(req)
      return { status: res.status, data: (await res.json()) as Record<string, unknown> }
    }

    const boot = await call(`${API_PREFIX}/bootstrap`, 'GET')
    expect(boot.status).toBe(200)
    expect((boot.data.items as unknown[]).length).toBe(knowledge.allItems.length)
    expect(boot.data.dailyPickItem).toBeTruthy()
    const firstPickId = (boot.data.dailyPickItem as { id: string }).id

    const detail = await call(`${API_PREFIX}/item?id=01-01`, 'GET')
    expect(detail.status).toBe(200)
    expect((detail.data.item as { id: string }).id).toBe('01-01')

    const missing = await call(`${API_PREFIX}/item?id=99-99`, 'GET')
    expect(missing.status).toBe(404)

    const prog = await call(`${API_PREFIX}/progress`, 'POST', {
      id: '01-01',
      status: 'done',
      note: '开车后排也系好安全带',
    })
    expect(prog.status).toBe(200)
    expect(prog.data.xpDelta).toBeGreaterThan(0)
    expect(prog.data.currentStatus).toBe('done')

    const progPlan = await call(`${API_PREFIX}/progress`, 'POST', {
      id: '01-02',
      status: 'planned',
    })
    expect(progPlan.status).toBe(200)

    const prof = await call(`${API_PREFIX}/profile`, 'POST', {
      occupation: 'programmer',
      housing: 'renting',
      goals: ['legal', 'health'],
    })
    expect(prof.status).toBe(200)
    expect((prof.data.state as { profile: { occupation: string } }).profile.occupation).toBe('programmer')

    const reroll = await call(`${API_PREFIX}/daily-pick/reroll`, 'POST', {})
    expect(reroll.status).toBe(200)
    expect((reroll.data.dailyPickItem as { id: string }).id).not.toBe(firstPickId)

    const exp = await call(`${API_PREFIX}/export-markdown`, 'GET')
    expect(exp.status).toBe(200)
    const md = exp.data.markdown as string
    expect(md).toContain('我的人生补丁配置单')
    expect(md).toContain('01-02')
    expect(md).toContain('eternity4719/HowToLiveBetter')

    // 轻量 /state 接口：只返回 state + summary + dailyPickItem，不返回全量 items
    const lightState = await call(`${API_PREFIX}/state`, 'GET')
    expect(lightState.status).toBe(200)
    expect(lightState.data.state).toBeTruthy()
    expect(lightState.data.summary).toBeTruthy()
    expect('items' in lightState.data).toBe(false)

    // /progress 支持复检周期与复检时间
    const progReview = await call(`${API_PREFIX}/progress`, 'POST', {
      id: '01-01',
      reviewIntervalDays: 365,
      lastReviewedAt: '2026-11-21T00:00:00.000Z',
    })
    expect(progReview.status).toBe(200)
    const progEntry = (progReview.data.state as { progress: Record<string, { reviewIntervalDays?: number; lastReviewedAt?: string }> }).progress['01-01']
    expect(progEntry?.reviewIntervalDays).toBe(365)
    expect(progEntry?.lastReviewedAt).toBe('2026-11-21T00:00:00.000Z')

    // 非法 reviewIntervalDays 返回 400
    const badReview = await call(`${API_PREFIX}/progress`, 'POST', {
      id: '01-01',
      reviewIntervalDays: 'abc',
    })
    expect(badReview.status).toBe(400)

    // /state/export 与 /state/import JSON 备份恢复
    const exported = await call(`${API_PREFIX}/state/export`, 'GET')
    expect(exported.status).toBe(200)
    expect(String(exported.data.filename)).toMatch(/^life-patch-state-.*\.json$/)

    // 清空进度后通过 /state/import 恢复
    await stateStore.importState({ version: 1, profile: {}, progress: {} })
    expect(Object.keys(stateStore.getSnapshot().progress).length).toBe(0)

    const imported = await call(`${API_PREFIX}/state/import`, 'POST', exported.data)
    expect(imported.status).toBe(200)
    expect(imported.data.ok).toBe(true)
    expect(stateStore.getSnapshot().progress['01-01']?.status).toBe('done')
    expect(stateStore.getSnapshot().progress['01-01']?.reviewIntervalDays).toBe(365)

    // 非法导入体返回 400
    const badImport = await call(`${API_PREFIX}/state/import`, 'POST', { version: 999 })
    expect(badImport.status).toBe(400)

    // /progress/batch 单次批量标记不适用
    const batchRes = await call(`${API_PREFIX}/progress/batch`, 'POST', {
      updates: [
        { id: '01-01', status: 'skipped' },
        { id: '01-02', status: 'skipped' },
      ],
    })
    expect(batchRes.status).toBe(200)
    expect(batchRes.data.updatedCount).toBe(2)
    expect((batchRes.data.summary as { skippedCount: number }).skippedCount).toBe(2)

    // /workspace 确保专属工作区目录已创建并返回规范路径与默认名称
    const wsRes = await call(`${API_PREFIX}/workspace`, 'POST', {})
    expect(wsRes.status).toBe(200)
    expect(wsRes.data.defaultTitle).toBe('人生补丁')
    const wsPath = String(wsRes.data.path)
    expect(path.basename(wsPath)).toBe('workspace')
    const stat = await fs.stat(wsPath)
    expect(stat.isDirectory()).toBe(true)
  })
})
