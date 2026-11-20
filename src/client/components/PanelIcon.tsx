import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * 左侧边栏「人生补丁」16px 线性盾牌微章图标（继承 currentColor，遵循 1px 非缩放描边规范）。
 */
export function PanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 1.75L13.25 3.65V7.35C13.25 10.95 10.5 13.1 8 14.15C5.5 13.1 2.75 10.95 2.75 7.35V3.65L8 1.75Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M6.1 8.15L7.45 9.5L10.15 6.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
