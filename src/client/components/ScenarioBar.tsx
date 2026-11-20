import clsx from 'clsx'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { SCENARIOS } from '../../shared/scenarios.ts'
import type { ScenarioPreset } from '../../shared/types.ts'
import { IconArrowUpRight, ScenarioIcon } from './Icons.tsx'
import css from './ScenarioBar.module.css'

export interface ScenarioBarProps {
  readonly onSelectScenario: (scenario: ScenarioPreset) => void
  readonly t: TranslateNS<'howtolive'>
}

const TONE_CLASS: Record<string, string | undefined> = {
  layoff: css.toneBlue,
  medical: css.toneRose,
  housing: css.toneAmber,
  developer: css.toneViolet,
  security: css.toneCyan,
  recovery: css.toneEmerald,
}

/**
 * 6 大「遇事不慌」情景急救 Bento 卡片条：
 * - 采用统一线性 SVG 图标 + 低饱和语义色微光容器，彻底告别粗糙 emoji
 * - 点击一键创建并发送循证急救会话
 */
export function ScenarioBar({ onSelectScenario, t }: ScenarioBarProps) {
  return (
    <section className={css.wrap} aria-label={t('scenario.heading')}>
      <div className={css.header}>
        <h2 className={css.title}>{t('scenario.heading')}</h2>
        <span className={css.subheading}>{t('scenario.subheading')}</span>
      </div>

      <div className={css.grid}>
        {SCENARIOS.map((sc) => (
          <button
            key={sc.id}
            type="button"
            className={clsx(css.card, TONE_CLASS[sc.id])}
            title={t('scenario.launch')}
            onClick={() => onSelectScenario(sc)}
          >
            <span className={css.iconBox} aria-hidden="true">
              <ScenarioIcon id={sc.id} size={18} />
            </span>
            <div className={css.cardBody}>
              <span className={css.cardTitle}>{sc.title}</span>
              <span className={css.cardSub}>{sc.subtitle}</span>
            </div>
            <span className={css.arrow} aria-hidden="true">
              <IconArrowUpRight size={15} />
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
