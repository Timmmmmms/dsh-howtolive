import type { SVGProps } from 'react'

export interface IconProps extends SVGProps<SVGSVGElement> {
  readonly size?: number
}

const baseProps = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
})

/** 闪耀星芒（AI 体检 / 今日精选） */
export function IconSparkles({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
    </svg>
  )
}

/** 盾牌校验（品牌徽章） */
export function IconShieldCheck({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

/** 人物画像 */
export function IconUser({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

/** 导出下载 */
export function IconDownload({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  )
}

/** 刷新 / 换一张 */
export function IconRefresh({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  )
}

/** 筛选滑块 */
export function IconSliders({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <line x1="21" x2="14" y1="4" y2="4" />
      <line x1="10" x2="3" y1="4" y2="4" />
      <line x1="21" x2="12" y1="12" y2="12" />
      <line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="20" y2="20" />
      <line x1="12" x2="3" y1="20" y2="20" />
      <line x1="14" x2="14" y1="2" y2="6" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <line x1="16" x2="16" y1="18" y2="22" />
    </svg>
  )
}

/** 右上箭头（情景急救跳转提示） */
export function IconArrowUpRight({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  )
}

/** 右箭头（查看详情） */
export function IconChevronRight({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

/** 左箭头（返回上一条） */
export function IconArrowLeft({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  )
}

/** 上箭头（回到顶部） */
export function IconArrowUp({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  )
}

/** 关闭/清空（搜索框一键清空） */
export function IconX({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

/** 对勾（打卡） */
export function IconCheck({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} strokeWidth={2.2} {...rest}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/** 书签（计划清单） */
export function IconBookmark({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  )
}

/** 隐藏/跳过 */
export function IconEyeOff({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  )
}

/** 公文包（裁员/劳资纠纷） */
export function IconBriefcase({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </svg>
  )
}

/** 心电脉冲（突发急救/看病） */
export function IconHeartPulse({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </svg>
  )
}

/** 房屋（租房/买房避坑） */
export function IconHome({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

/** 终端代码（程序员合规） */
export function IconTerminal({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  )
}

/** 警示盾牌（账号安全/反诈） */
export function IconShieldAlert({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

/** 破晓日出（低谷重启） */
export function IconSunrise({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M12 2v8" />
      <path d="m4.93 10.93 1.41 1.41" />
      <path d="M2 18h2" />
      <path d="M20 18h2" />
      <path d="m19.07 10.93-1.41 1.41" />
      <path d="M22 22H2" />
      <path d="m8 6 4-4 4 4" />
      <path d="M16 18a4 4 0 0 0-8 0" />
    </svg>
  )
}

/** 闪电（3 分钟速刷盲盒 / Combo 连击） */
export function IconZap({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}

/** 火焰（混沌压力测试 / 防坑演练） */
export function IconFlame({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  )
}

/** 卡片网格（卡片清单视图） */
export function IconLayoutGrid({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  )
}

/** 扫描雷达（漏洞扫描仪视图） */
export function IconScanRadar({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
      <path d="M4 6h.01" />
      <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
      <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
      <path d="M12 18h.01" />
      <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" />
      <circle cx="12" cy="12" r="2" />
      <path d="m13.41 10.59 5.66-5.66" />
    </svg>
  )
}

/** 徽章奖章（成就徽章入口） */
export function IconAward({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  )
}

/** 名片分享（人生 OS 架构师名片） */
export function IconShareCard({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <circle cx="8" cy="12" r="2.2" />
      <path d="M14 10h4" />
      <path d="M14 14h3" />
    </svg>
  )
}

/** 时钟巡检（补丁保质期与定期复检） */
export function IconClock({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

/** 图片导出（PNG 海报） */
export function IconImage({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}

/** 关系星图 / 技能树（PatchGraphView 视图） */
export function IconNetwork({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5.5" cy="18" r="2.2" />
      <circle cx="18.5" cy="18" r="2.2" />
      <circle cx="12" cy="13" r="1.8" />
      <path d="M12 7.2v4" />
      <path d="M10.4 14.1 7.2 16.7" />
      <path d="m13.6 14.1 3.2 2.6" />
    </svg>
  )
}

/** 放大画布 */
export function IconZoomIn({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </svg>
  )
}

/** 缩小画布 */
export function IconZoomOut({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
      <path d="M8 11h6" />
    </svg>
  )
}

/** 重置视角 */
export function IconRotateCcw({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

/** 日历排期（行动清单本周末 AI 排期） */
export function IconCalendar({ size = 14, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
    </svg>
  )
}

/** 根据情景 ID 返回对应的精致线性 SVG 图标 */
export function ScenarioIcon({ id, size = 18 }: { readonly id: string; readonly size?: number }) {
  switch (id) {
    case 'layoff':
      return <IconBriefcase size={size} />
    case 'medical':
      return <IconHeartPulse size={size} />
    case 'housing':
      return <IconHome size={size} />
    case 'developer':
      return <IconTerminal size={size} />
    case 'security':
      return <IconShieldAlert size={size} />
    case 'recovery':
      return <IconSunrise size={size} />
    default:
      return <IconShieldCheck size={size} />
  }
}
