import clsx from 'clsx'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { SCENARIOS } from '../../shared/scenarios.ts'
import type { ScenarioPreset } from '../../shared/types.ts'
import type { HowToLiveLocaleKey } from '../locales.ts'
import { IconArrowUpRight, IconFlame, ScenarioIcon } from './Icons.tsx'
import css from './ScenarioBar.module.css'

export interface ScenarioBarProps {
  readonly onSelectScenario: (scenario: ScenarioPreset) => void
  /** 启动「人生混沌工程 · 防坑演练场」AI 文字 RPG 压力测试 */
  readonly onStartChaosDrill?: () => void
  readonly t: TranslateNS<'howtolive'>
}

const SCENARIO_LOCALE_KEYS: Record<
  string,
  { readonly title: HowToLiveLocaleKey; readonly subtitle: HowToLiveLocaleKey } | undefined
> = {
  layoff: { title: 'scenario.layoff.title', subtitle: 'scenario.layoff.subtitle' },
  medical: { title: 'scenario.medical.title', subtitle: 'scenario.medical.subtitle' },
  housing: { title: 'scenario.housing.title', subtitle: 'scenario.housing.subtitle' },
  developer: { title: 'scenario.developer.title', subtitle: 'scenario.developer.subtitle' },
  security: { title: 'scenario.security.title', subtitle: 'scenario.security.subtitle' },
  recovery: { title: 'scenario.recovery.title', subtitle: 'scenario.recovery.subtitle' },
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
export function ScenarioBar({ onSelectScenario, onStartChaosDrill, t }: ScenarioBarProps) {
  return (
    <section className={css.wrap} aria-label={t('scenario.heading')}>
      <div className={css.header}>
        <div className={css.headerMeta}>
          <h2 className={css.title}>{t('scenario.heading')}</h2>
          <span className={css.subheading}>{t('scenario.subheading')}</span>
        </div>
        {onStartChaosDrill && (
          <button
            type="button"
            className={css.drillBtn}
            title={t('scenario.chaosDrillHint')}
            onClick={onStartChaosDrill}
          >
            <IconFlame size={14} />
            <span>{t('scenario.chaosDrill')}</span>
            <IconArrowUpRight size={13} className={css.drillArrow} />
          </button>
        )}
      </div>

      <div className={css.grid}>
        {SCENARIOS.map((sc) => {
          const keys = SCENARIO_LOCALE_KEYS[sc.id]
          const title = keys ? t(keys.title) : sc.title
          const subtitle = keys ? t(keys.subtitle) : sc.subtitle
          return (
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
                <span className={css.cardTitle}>{title}</span>
                <span className={css.cardSub}>{subtitle}</span>
              </div>
              <span className={css.arrow} aria-hidden="true">
                <IconArrowUpRight size={15} />
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
