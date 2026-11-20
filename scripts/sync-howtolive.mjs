#!/usr/bin/env node
/**
 * 同步并解析 github.com/eternity4719/HowToLiveBetter 的 book/*.md
 * 生成结构化的知识库 JSON，供 dsh-howtolive 插件（Host 检索 + Client 仪表盘）直接消费。
 *
 * 用法：
 *   node scripts/sync-howtolive.mjs                     # 从 GitHub 实时拉取并解析
 *   node scripts/sync-howtolive.mjs --local <repoPath>  # 从本地已克隆的仓库解析（离线秒跑）
 *   node scripts/sync-howtolive.mjs --out data          # 指定输出目录（默认 data）
 *
 * 环境变量：
 *   GITHUB_TOKEN  可选，避免 GitHub API 匿名限流（60次/小时）
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_OWNER = 'eternity4719'
const REPO_NAME = 'HowToLiveBetter'
const DEFAULT_OUT_DIR = path.resolve(__dirname, '../data')

/**
 * 将 34 个章节聚合映射到 6 大“人生属性维度”，用于雷达图与仪表盘可视化。
 * 未显式映射的章节会归入 life（生活与决策）。
 */
const DIMENSION_META = [
  {
    id: 'survival',
    name: '生命防线',
    subtitle: '意外防护、急救、慢病与用药安全',
    chapters: [1, 2, 13, 16, 24, 28, 33, 34],
  },
  {
    id: 'wealth',
    name: '财富护城河',
    subtitle: '省钱避坑、财务底线、买房租房与创业',
    chapters: [5, 7, 12, 15],
  },
  {
    id: 'legal',
    name: '法律防坑盾',
    subtitle: '普通人红线、技术人红线与防身避祸',
    chapters: [6, 8, 9, 11, 26],
  },
  {
    id: 'career',
    name: '职场与效率',
    subtitle: '精力时间、技能投资、离职工伤与人生路径',
    chapters: [3, 4, 19, 23, 31, 32],
  },
  {
    id: 'family',
    name: '家庭与关系',
    subtitle: '婚恋、孕育、育儿、养老与身后事',
    chapters: [10, 17, 18, 20, 25, 27, 30],
  },
  {
    id: 'resilience',
    name: '安全与韧性',
    subtitle: '信息安全、境外安全、心理修复与放松',
    chapters: [14, 21, 22, 29],
  },
]

const CHAPTER_TO_DIMENSION = new Map()
for (const dim of DIMENSION_META) {
  for (const ch of dim.chapters) {
    CHAPTER_TO_DIMENSION.set(ch, dim.id)
  }
}

/** 解析命令行参数 */
function parseArgs(argv) {
  const args = { local: null, out: DEFAULT_OUT_DIR }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--local' && argv[i + 1]) {
      args.local = path.resolve(argv[++i])
    } else if (argv[i] === '--out' && argv[i + 1]) {
      args.out = path.resolve(argv[++i])
    }
  }
  return args
}

/** 带重试与可选 Token 的请求封装 */
async function fetchWithRetry(url, headers, retries = 3) {
  let lastErr
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers })
      if (!res.ok) {
        throw new Error(`请求失败 ${res.status} ${res.statusText}: ${url}`)
      }
      return res
    } catch (err) {
      lastErr = err
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * attempt))
      }
    }
  }
  throw lastErr
}

async function fetchJson(url) {
  const headers = {
    'User-Agent': 'dsh-howtolive-sync/0.1',
    Accept: 'application/vnd.github+json',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  const res = await fetchWithRetry(url, headers)
  return res.json()
}

async function fetchText(url) {
  const headers = { 'User-Agent': 'dsh-howtolive-sync/0.1' }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  const res = await fetchWithRetry(url, headers)
  return res.text()
}

/**
 * 解析 <!-- 成本标签: 钱=0 时间=少 毅力=否 收益=大 口径=死亡率 人群=婴幼儿,孩子 -->
 */
function parseCostTags(rawBlock) {
  const match = rawBlock.match(/<!--\s*成本标签[:：]\s*([^>]+?)\s*-->/)
  if (!match) return null

  const tags = {
    money: null,       // 0 / 少 / 中 / 多
    time: null,        // 0 / 少 / 中 / 多
    willpower: null,   // 否 / 是 / 持续 等
    benefit: null,     // 大 / 中 / 小
    metric: null,      // 口径：死亡率 / 发病率 / 省钱 / 法律风险 等
    audience: [],      // 人群标签数组
    raw: match[1].trim(),
  }

  const pairs = match[1].trim().split(/\s+/)
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=')
    if (eqIdx === -1) continue
    const key = pair.slice(0, eqIdx).trim()
    const val = pair.slice(eqIdx + 1).trim()
    switch (key) {
      case '钱':
        tags.money = val
        break
      case '时间':
        tags.time = val
        break
      case '毅力':
        tags.willpower = val
        break
      case '收益':
        tags.benefit = val
        break
      case '口径':
        tags.metric = val
        break
      case '人群':
        tags.audience = val.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
        break
      default:
        tags[key] = val
    }
  }
  return tags
}

/**
 * 计算单条建议的“性价比等级（S / A / B / C）”与基础游戏化经验值（XP），
 * 用于仪表盘排序、筛选与“打补丁升级”反馈。
 */
function computeRoiScore(tags, evidenceGrade) {
  let score = 40
  if (tags) {
    if (tags.money === '0') score += 20
    else if (tags.money === '少') score += 10
    else if (tags.money === '多') score -= 10

    if (tags.time === '0') score += 15
    else if (tags.time === '少') score += 10
    else if (tags.time === '多') score -= 10

    if (tags.willpower === '否') score += 10
    else if (tags.willpower === '是') score -= 10

    if (tags.benefit === '大' || tags.benefit === '极大') score += 15
    else if (tags.benefit === '中') score += 5
  }

  const grade = (evidenceGrade || '').toUpperCase().trim()
  if (grade.startsWith('A')) score += 10
  else if (grade.startsWith('B')) score += 5

  // S 级：几乎零花钱 + 极省时间 + 不靠毅力 + 大收益 + 高证据等级（真正的“闭眼先做”黄金补丁）
  let tier = 'B'
  if (score >= 100) tier = 'S'
  else if (score >= 85) tier = 'A'
  else if (score < 65) tier = 'C'

  const xp = tier === 'S' ? 40 : tier === 'A' ? 25 : tier === 'B' ? 15 : 10
  return { roiScore: Math.max(10, Math.min(100, score)), roiTier: tier, xp }
}

/** 提取正文中的交叉引用，例如“第 34 节第 12 条” */
function extractCrossRefs(text) {
  const refs = []
  const seen = new Set()
  const regex = /第\s*(\d+)\s*节第\s*(\d+)\s*条/g
  let m
  while ((m = regex.exec(text)) !== null) {
    const id = `${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`
    if (!seen.has(id)) {
      seen.add(id)
      refs.push(id)
    }
  }
  return refs
}

/**
 * 解析章节开头的主题分组映射，例如：
 * **路上**：系安全带（第 1 条），戴头盔（第 2 条）...
 */
function parseTopicGroups(introText) {
  const itemToTopic = new Map()
  const topics = []
  const lines = introText.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^\*\*([^*]+)\*\*[：:]\s*(.+)$/)
    if (!match) continue
    const topicName = match[1].trim()
    const body = match[2]
    const numRegex = /第\s*(\d+)\s*条/g
    let m
    const itemNumbers = []
    while ((m = numRegex.exec(body)) !== null) {
      const n = Number(m[1])
      itemNumbers.push(n)
      itemToTopic.set(n, topicName)
    }
    if (itemNumbers.length > 0) {
      topics.push({ name: topicName, itemNumbers })
    }
  }
  return { topics, itemToTopic }
}

/** 解析单篇章节 Markdown */
function parseChapterMarkdown(filename, content) {
  const fileMatch = filename.match(/^(\d+)-(.+)\.md$/)
  if (!fileMatch) return null

  const chapterNum = Number(fileMatch[1])
  const slug = filename.replace(/\.md$/, '')
  const lines = content.replace(/\r\n/g, '\n').split('\n')

  // 提取章节标题（# 1. 不要早死）
  let title = fileMatch[2]
  for (const line of lines) {
    const h1 = line.match(/^#\s+(?:\d+\.\s*)?(.+)$/)
    if (h1) {
      title = h1[1].trim()
      break
    }
  }

  // 按 ### <编号>. <标题> 切分条目
  const itemHeadingRegex = /^###\s+(\d+)\.\s+(.+)$/
  const itemIndices = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(itemHeadingRegex)
    if (m) {
      itemIndices.push({ lineIdx: i, number: Number(m[1]), title: m[2].trim() })
    }
  }

  const introEnd = itemIndices.length > 0 ? itemIndices[0].lineIdx : lines.length
  const introLines = lines.slice(0, introEnd).filter((l) => !l.startsWith('[←') && !l.startsWith('# '))
  const introText = introLines.join('\n').trim()
  const { topics, itemToTopic } = parseTopicGroups(introText)

  // 取导言首段作为章节简介
  const summary = introText
    .split(/\n\n+/)
    .find((p) => p.trim() && !p.trim().startsWith('**') && !p.trim().startsWith('本节条目'))
    ?.trim() || ''

  const dimension = CHAPTER_TO_DIMENSION.get(chapterNum) || 'resilience'
  const items = []

  for (let idx = 0; idx < itemIndices.length; idx++) {
    const current = itemIndices[idx]
    const nextLineIdx = idx + 1 < itemIndices.length ? itemIndices[idx + 1].lineIdx : lines.length
    const blockLines = lines.slice(current.lineIdx + 1, nextLineIdx)
    const blockText = blockLines.join('\n').trim()

    const tags = parseCostTags(blockText)

    // 解析标准字段（- 成本： / - 说人话： / - 收益： / - 证据等级： / - 来源： / - 备注：）
    const fields = {
      cost: '',
      plain: '',
      benefit: '',
      evidenceGrade: '',
      sources: '',
      notes: '',
      extra: {},
    }

    const fieldMap = {
      成本: 'cost',
      说人话: 'plain',
      收益: 'benefit',
      代价: 'benefit',
      风险: 'benefit',
      证据等级: 'evidenceGrade',
      来源: 'sources',
      依据: 'sources',
      备注: 'notes',
      怎么做: 'notes',
    }

    let activeKey = null
    for (const rawLine of blockLines) {
      const trimmed = rawLine.trim()
      if (!trimmed || trimmed.startsWith('<!--')) continue

      const fieldMatch = rawLine.match(/^-\s*([^：:]{1,12})[：:]\s*(.*)$/)
      if (fieldMatch) {
        const label = fieldMatch[1].trim()
        const value = fieldMatch[2].trim()
        const mapped = fieldMap[label]
        if (mapped) {
          activeKey = mapped
          fields[mapped] = fields[mapped] ? `${fields[mapped]}\n${value}` : value
        } else {
          activeKey = `extra:${label}`
          fields.extra[label] = value
        }
      } else if (activeKey) {
        if (activeKey.startsWith('extra:')) {
          const k = activeKey.slice(6)
          fields.extra[k] = `${fields.extra[k]}\n${trimmed}`
        } else {
          fields[activeKey] = `${fields[activeKey]}\n${trimmed}`
        }
      }
    }

    const { roiScore, roiTier, xp } = computeRoiScore(tags, fields.evidenceGrade)
    const id = `${String(chapterNum).padStart(2, '0')}-${String(current.number).padStart(2, '0')}`

    items.push({
      id,
      chapterNumber: chapterNum,
      chapterTitle: title,
      number: current.number,
      title: current.title,
      topic: itemToTopic.get(current.number) || null,
      dimension,
      tags,
      roiScore,
      roiTier,
      xp,
      cost: fields.cost,
      plain: fields.plain,
      benefit: fields.benefit,
      evidenceGrade: fields.evidenceGrade,
      sources: fields.sources,
      notes: fields.notes,
      ...(Object.keys(fields.extra).length > 0 ? { extra: fields.extra } : {}),
      crossRefs: extractCrossRefs(blockText),
      rawMarkdown: `### ${current.number}. ${current.title}\n${blockText}`,
    })
  }

  return {
    chapter: {
      number: chapterNum,
      slug,
      filename,
      title,
      dimension,
      summary,
      topics,
      itemCount: items.length,
    },
    items,
  }
}

/** 从本地仓库加载 book/*.md */
async function loadFromLocal(repoPath) {
  const bookDir = path.join(repoPath, 'book')
  const entries = await fs.readdir(bookDir)
  const mdFiles = entries.filter((f) => /^\d+-.+\.md$/.test(f)).sort()
  const files = []
  for (const name of mdFiles) {
    const content = await fs.readFile(path.join(bookDir, name), 'utf8')
    files.push({ name, content })
  }
  return { sourceType: 'local', commitSha: null, files }
}

/** 从 GitHub API 并发拉取 book/*.md */
async function loadFromGitHub() {
  const repoInfo = await fetchJson(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?per_page=1`)
  const commitSha = repoInfo?.[0]?.sha || null

  const list = await fetchJson(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/book`)
  const mdEntries = list
    .filter((item) => item.type === 'file' && /^\d+-.+\.md$/.test(item.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))

  // 控制并发数为 6，避免触发速率限制
  const files = []
  const concurrency = 6
  for (let i = 0; i < mdEntries.length; i += concurrency) {
    const batch = mdEntries.slice(i, i + concurrency)
    const results = await Promise.all(
      batch.map(async (entry) => ({
        name: entry.name,
        content: await fetchText(entry.download_url),
      })),
    )
    files.push(...results)
    process.stdout.write(`\r已拉取章节：${files.length}/${mdEntries.length}`)
  }
  process.stdout.write('\n')
  return { sourceType: 'github', commitSha, files }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  console.log(args.local ? `从本地目录解析：${args.local}` : `从 GitHub 同步：${REPO_OWNER}/${REPO_NAME}`)

  const loaded = args.local ? await loadFromLocal(args.local) : await loadFromGitHub()

  const chapters = []
  const allItems = []
  const audienceCounts = {}
  const tierCounts = { S: 0, A: 0, B: 0, C: 0 }
  let taggedCount = 0

  for (const file of loaded.files) {
    const parsed = parseChapterMarkdown(file.name, file.content)
    if (!parsed) continue
    chapters.push(parsed.chapter)
    for (const item of parsed.items) {
      allItems.push(item)
      tierCounts[item.roiTier] = (tierCounts[item.roiTier] || 0) + 1
      if (item.tags) {
        taggedCount++
        for (const aud of item.tags.audience) {
          audienceCounts[aud] = (audienceCounts[aud] || 0) + 1
        }
      }
    }
  }

  chapters.sort((a, b) => a.number - b.number)

  const meta = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    upstream: {
      repo: `${REPO_OWNER}/${REPO_NAME}`,
      url: `https://github.com/${REPO_OWNER}/${REPO_NAME}`,
      commitSha: loaded.commitSha,
      sourceType: loaded.sourceType,
    },
    stats: {
      chapterCount: chapters.length,
      itemCount: allItems.length,
      taggedItemCount: taggedCount,
      tierCounts,
      topAudiences: Object.entries(audienceCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => ({ name, count })),
    },
    dimensions: DIMENSION_META.map((d) => ({
      id: d.id,
      name: d.name,
      subtitle: d.subtitle,
      chapterNumbers: d.chapters,
      itemCount: allItems.filter((it) => it.dimension === d.id).length,
    })),
  }

  await fs.mkdir(args.out, { recursive: true })
  const knowledgePath = path.join(args.out, 'knowledge.json')
  const metaPath = path.join(args.out, 'meta.json')

  await fs.writeFile(
    knowledgePath,
    JSON.stringify({ meta, chapters, items: allItems }, null, 2),
    'utf8',
  )
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8')

  console.log(`\n解析完成！`)
  console.log(`- 章节数：${meta.stats.chapterCount}`)
  console.log(`- 条目总数：${meta.stats.itemCount}（含结构化成本标签：${meta.stats.taggedItemCount}）`)
  console.log(`- 性价比分级：S=${tierCounts.S}, A=${tierCounts.A}, B=${tierCounts.B}, C=${tierCounts.C}`)
  console.log(`- 输出文件：${knowledgePath}`)
}

main().catch((err) => {
  console.error('[sync-howtolive] 执行失败：', err)
  process.exit(1)
})
