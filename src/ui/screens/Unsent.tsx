import { useMemo, useState } from 'react'
import { useData } from '../../data/DataProvider'
import { retryOutboxEntry } from '../../data/repos/unsent'
import { describeUnsent, sortUnsent, type UnsentView } from '../../data/unsent'
import { useOutboxEntries } from '../../data/useOutboxEntries'
import { cairoToday } from '../../domain/dates'
import { formatDay } from '../../domain/fieldInput'
import { formatMoney } from '../../domain/money'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import { saveUnsentExport } from './saveUnsentExport'
import styles from './Unsent.module.css'

const REJECTED = 'السيرفر رفض المستند ده. كل بياناته محفوظة هنا.'
const WAITING = 'مستنية النت. هتتبعت لوحدها أول ما يرجع.'
const UNREADABLE = 'المستند ده بياناته تالفة وما ينفعش يتبعت تاني. صدّره لإكسيل.'
const EXPORT_FAILED = 'ما قدرناش نجهّز ملف الإكسيل. جرّب تاني.'

type Notes = Readonly<Record<string, string>>

function withNote(notes: Notes, id: string, text: string | null): Notes {
  const rest = Object.fromEntries(Object.entries(notes).filter(([key]) => key !== id))
  return text === null ? rest : { ...rest, [id]: text }
}

function Lines({ view }: { readonly view: UnsentView }) {
  if (view.lines.length === 0) return <p className={styles.empty}>مفيش حركات مقروءة في المستند.</p>
  return (
    <table className={styles.lines}>
      <caption className={styles.hidden}>حركات المستند</caption>
      <thead>
        <tr>
          <th scope="col">الصنف</th>
          <th scope="col">الكمية</th>
          <th scope="col">السعر</th>
        </tr>
      </thead>
      <tbody>
        {view.lines.map((l, i) => (
          <tr key={`${l.itemCode}-${i}`}>
            <td>
              {l.name !== l.itemCode ? `${l.name} · ` : ''}
              <Bdi>{l.itemCode}</Bdi>
              {l.batchNo ? (
                <small>
                  {' '}
                  تشغيلة <Bdi>{l.batchNo}</Bdi>
                </small>
              ) : null}
            </td>
            <td>
              <Bdi>{l.qty}</Bdi>
            </td>
            <td>
              <Bdi>{formatMoney(l.priceMinor)}</Bdi>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface CardProps {
  /** The first refused document: its retry is the screen's one reversed button. */
  readonly primary: boolean
  readonly view: UnsentView
  readonly note: string | null
  readonly onRetry: (id: string) => void
  readonly onExport: (view: UnsentView) => void
}

function Card({ primary, view, note, onRetry, onExport }: CardProps) {
  const failed = view.status === 'failed'
  return (
    <article
      className={`${styles.card} ${failed ? styles.failed : ''}`}
      data-status={view.status}
      aria-label={`${view.title} ${view.subtitle}`}
    >
      <header className={styles.head}>
        <div>
          <h2 className={styles.name}>{view.title}</h2>
          <p className={styles.meta}>
            {view.subtitle}
            {view.businessDate ? ` · ${formatDay(view.businessDate)}` : ''}
          </p>
        </div>
        <span className={styles.chip}>
          <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d={failed ? 'M3 3l6 6M9 3l-6 6' : 'M6 3v3.5l2 1.5'} />
          </svg>
          {failed ? 'فشل الإرسال' : 'مستنية النت'}
        </span>
      </header>
      <p className={failed ? styles.reason : styles.muted}>{failed ? REJECTED : WAITING}</p>
      {note ? (
        <p className={styles.reason} role="alert">
          {note}
        </p>
      ) : null}
      <details className={styles.details}>
        <summary>التفاصيل ({view.lines.length} حركة)</summary>
        {view.error ? (
          <p className={styles.error}>
            <Bdi>{view.error}</Bdi>
          </p>
        ) : null}
        <Lines view={view} />
      </details>
      <div className={styles.actions}>
        {failed ? (
          <Button variant={primary ? 'primary' : 'secondary'} onClick={() => onRetry(view.id)}>
            إعادة المحاولة
          </Button>
        ) : null}
        <Button onClick={() => onExport(view)}>تصدير لإكسيل</Button>
      </div>
    </article>
  )
}

/** The documents the server has not accepted yet: nothing here is ever discarded (R12). */
export default function Unsent() {
  const { outbox, items } = useData()
  const { entries, loaded } = useOutboxEntries(outbox)
  const [notes, setNotes] = useState<Notes>({})
  const [exportError, setExportError] = useState(false)

  const views = useMemo(() => {
    const names = new Map(items.map((i) => [i.code, i.nameAr]))
    return sortUnsent(entries.map((e) => describeUnsent(e, (code) => names.get(code) ?? code)))
  }, [entries, items])

  const firstFailed = views.find((v) => v.status === 'failed')?.id
  const retry = (id: string): void => {
    const entry = entries.find((e) => e.id === id)
    if (!entry) return
    const unreadable = (): void => setNotes((prev) => withNote(prev, id, UNREADABLE))
    setNotes((prev) => withNote(prev, id, null))
    retryOutboxEntry(entry, outbox)
      .then((result) => {
        if (!result.ok) unreadable()
      })
      .catch(unreadable)
  }

  const download = (picked: readonly UnsentView[]): void => {
    setExportError(false)
    saveUnsentExport(picked, cairoToday()).catch(() => setExportError(true))
  }

  return (
    <section className={styles.screen} aria-labelledby="unsent-title">
      <h1 id="unsent-title" className={styles.title}>
        مستندات لم تُرسل
      </h1>
      <p className={styles.note}>
        المستندات اللي اتعتمدت على الجهاز ده ولسه السيرفر ما قبلهاش. بياناتها محفوظة هنا ومفيش حاجة
        بتتمسح لوحدها.
      </p>
      {loaded && views.length === 0 ? (
        <p className={styles.ok} role="status">
          مفيش حاجة متعلّقة. كل المستندات اتبعتت.
        </p>
      ) : null}
      <ul className={styles.list} aria-label="المستندات اللي لم تُرسل">
        {views.map((v) => (
          <li key={v.id}>
            <Card
              primary={v.id === firstFailed}
              view={v}
              note={notes[v.id] ?? null}
              onRetry={retry}
              onExport={(picked) => download([picked])}
            />
          </li>
        ))}
      </ul>
      {exportError ? (
        <p className={styles.reason} role="alert">
          {EXPORT_FAILED}
        </p>
      ) : null}
      {views.length > 1 ? <Button onClick={() => download(views)}>تصدير الكل لإكسيل</Button> : null}
    </section>
  )
}
