import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { MovementDoc } from '../../data/deriveLedger'
import { useData } from '../../data/DataProvider'
import { saveSettings } from '../../data/repos/settings'
import { settleQuickly, type Settled } from '../../data/settle'
import {
  parseCoverageInput,
  parseReorderInput,
  reorderImpact,
  settingsPatch,
  validateSettings,
  type SettingsDraft,
} from '../../domain/settings'
import type { Item, Settings as StoredSettings } from '../../domain/types'
import { Button } from '../components/Button'
import { ParsedField, type Parsed } from '../components/ParsedField'
import styles from './Settings.module.css'

const SAVED = 'اتحفظ.'
const QUEUED = 'اتحفظ على الجهاز، وهيتبعت لما النت يرجع.'
const REFUSED = 'السيرفر رفض الحفظ. جرّب تاني.'

/** Text that is not a number commits NaN, so a half-typed value can never be saved as the old one. */
const coverage = (text: string): Parsed<number | null> => ({
  ok: true,
  value: text.trim() === '' ? null : (parseCoverageInput(text) ?? Number.NaN),
})
const reorder = (text: string): Parsed<number | null> => ({
  ok: true,
  value: text.trim() === '' ? null : (parseReorderInput(text) ?? Number.NaN),
})
const show = (value: number | null): string =>
  value === null || Number.isNaN(value) ? '' : String(value)

const MESSAGES: Readonly<Record<Settled, string>> = {
  saved: SAVED,
  pending: QUEUED,
  failed: REFUSED,
}

export interface SettingsViewProps {
  readonly settings: StoredSettings
  readonly items: readonly Item[]
  readonly movements: readonly MovementDoc[]
  readonly save: (patch: ReturnType<typeof settingsPatch>) => Promise<Settled>
}

/**
 * Coverage months and the default reorder point (FR-012). Reorder points are worked out from
 * these on the fly, so a change moves every affected item at once; nothing is rewritten.
 * The form keeps only what the user typed: until then it shows the stored settings, which on a
 * cold start may arrive after the screen opens, so a late value is never hidden by a stale copy.
 */
export function SettingsView({ settings, items, movements, save: write }: SettingsViewProps) {
  const [edited, setEdited] = useState<SettingsDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [outcome, setOutcome] = useState<Settled | null>(null)
  const { coverageMonths, defaultReorder } = settings
  const draft = useMemo<SettingsDraft>(
    () => edited ?? { coverageMonths, defaultReorder },
    [edited, coverageMonths, defaultReorder],
  )

  const errors = validateSettings(draft)
  const valid = Object.keys(errors).length === 0
  const unchanged =
    draft.coverageMonths === settings.coverageMonths &&
    draft.defaultReorder === settings.defaultReorder
  const impact = useMemo(
    () => (valid ? reorderImpact(items, movements, settings, settingsPatch(draft)) : 0),
    [valid, items, movements, settings, draft],
  )

  const edit = (change: Partial<SettingsDraft>): void => {
    setEdited({ ...draft, ...change })
    setOutcome(null)
  }

  const save = async (): Promise<void> => {
    if (!valid) return
    setSaving(true)
    const result = await write(settingsPatch(draft))
    setOutcome(result)
    setSaving(false)
  }

  return (
    <section className={styles.screen} aria-labelledby="settings-title">
      <h1 id="settings-title" className={styles.title}>
        إعدادات المخزن
      </h1>
      <p className={styles.note}>
        حد الطلب بيتحسب لكل صنف من اللي اتصرف منه. الإعدادين دول بيحدّدوا الحساب.
      </p>

      <ParsedField<number | null>
        label="مدة التغطية لحد الطلب (بالشهور)"
        value={draft.coverageMonths}
        format={show}
        parse={coverage}
        inputMode="decimal"
        dir="ltr"
        hint={
          errors.coverageMonths ? (
            <span className={styles.problem}>{errors.coverageMonths}</span>
          ) : (
            'حد الطلب = اللي اتصرف في الشهر × المدة دي'
          )
        }
        onCommit={(coverageMonths) => edit({ coverageMonths })}
      />
      <ParsedField<number | null>
        label="الحد الافتراضي للأصناف الجديدة"
        value={draft.defaultReorder}
        format={show}
        parse={reorder}
        inputMode="numeric"
        dir="ltr"
        hint={
          errors.defaultReorder ? (
            <span className={styles.problem}>{errors.defaultReorder}</span>
          ) : (
            'بيتطبق على الصنف اللي لسه ماتصرفش منه'
          )
        }
        onCommit={(defaultReorder) => edit({ defaultReorder })}
      />

      {valid && !unchanged ? (
        <p className={styles.impact} role="status">
          {impact === 0
            ? 'التغيير ده مش هيغيّر حد الطلب لأي صنف.'
            : `التغيير ده هيغيّر حد الطلب لـ ${impact} صنف.`}
        </p>
      ) : null}

      {outcome ? (
        <p className={outcome === 'failed' ? styles.problem : styles.done} role="status">
          {MESSAGES[outcome]}
        </p>
      ) : null}

      <p className={styles.foot}>
        <Link to="/items">الأصناف</Link> · <Link to="/import">استيراد الإكسيل وأكواد الهيئة</Link>
      </p>

      <div className={styles.actions}>
        <Button
          variant="primary"
          size="main"
          disabled={!valid || unchanged || saving}
          onClick={() => void save()}
        >
          {saving ? 'بيحفظ...' : 'حفظ'}
        </Button>
      </div>
    </section>
  )
}

/** The route `/settings`. */
export function Settings() {
  const { settings, items, movements } = useData()
  return (
    <SettingsView
      settings={settings}
      items={items}
      movements={movements}
      save={(patch) => settleQuickly(saveSettings(patch))}
    />
  )
}
