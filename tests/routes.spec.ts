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
  })
})
