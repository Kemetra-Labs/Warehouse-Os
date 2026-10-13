import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../app/AuthProvider'
import { useData } from '../../data/DataProvider'
import { getDeviceId } from '../../data/deviceId'
import { cancelReceiptDoc, postReceipt, saveDraft } from '../../data/repos/receipts'
import type { CancelAttempt } from '../../data/cancelPost'
import type { PostResult } from '../../data/receiptPost'
import { cairoToday } from '../../domain/dates'
import type { ReceiptDraft } from '../../domain/receipt'
import { isBlankDraft } from '../../domain/receiptEdit'
import { downloadReceiptPrint } from './exportActions'
import { Receive } from './Receive'
import { ReceiptReview, type SealInfo } from './ReceiptReview'
import { useDraftAutosave, type AutosaveAdapter } from './useDraftAutosave'
import { useReceiptLoad } from './useReceiptLoad'
import styles from './Receive.module.css'

const NOT_LOADED: CancelAttempt = {
  ok: false,
  problem: { code: 'incomplete', message: 'الإذن لسه بيتحمّل. استنى لحظة وجرّب تاني.' },
}

const NOT_LOADED_PRINT = 'الإذن لسه بيتحمّل. استنى لحظة وجرّب تاني.'

const RECEIPT_AUTOSAVE: AutosaveAdapter<ReceiptDraft> = { save: saveDraft, isBlank: isBlankDraft }

interface EditorProps {
  readonly id: string
  readonly initial: ReceiptDraft
  readonly sealed: SealInfo | null
  readonly isNew: boolean
}

/** Holds the draft while it is edited. The receive and review steps share it. */
function ReceiptEditor({ id, initial, sealed, isNew }: EditorProps) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { state } = useAuth()
  const { items, receipts, outbox, movements } = useData()
  const [draft, setDraft] = useState(initial)
  const autosave = useDraftAutosave(id, isNew, RECEIPT_AUTOSAVE)
  const existing = useMemo(
    () => receipts.map((r) => ({ id: r.id, deliveryNo: r.deliveryNo, status: r.status })),
    [receipts],
  )

  const update = (next: ReceiptDraft): void => {
    setDraft(next)
    autosave.schedule(next)
  }

  const post = async (): Promise<PostResult> => {
    if (state.status !== 'signedIn') throw new Error('not signed in')
    autosave.pause()
    try {
      const result = await postReceipt(
        { id, draft, items, existing, uid: state.user.uid, deviceId: getDeviceId() },
        outbox,
      )
      if (!result.ok) autosave.resume()
      return result
    } catch (err) {
      autosave.resume()
      throw err
    }
  }

  const cancel = (reason: string): Promise<CancelAttempt> => {
    if (state.status !== 'signedIn') return Promise.reject(new Error('not signed in'))
    const receipt = receipts.find((r) => r.id === id)
    if (!receipt) return Promise.resolve(NOT_LOADED)
    return cancelReceiptDoc(
      receipt,
      { reason, movements, items, uid: state.user.uid, deviceId: getDeviceId() },
      outbox,
    )
  }

  const print = (): Promise<void> => {
    const receipt = receipts.find((r) => r.id === id)
    if (!receipt) return Promise.reject(new Error(NOT_LOADED_PRINT))
    return downloadReceiptPrint({ receipt, items })
  }

  if (sealed || params.get('step') === 'review') {
    return (
      <ReceiptReview
        draft={draft}
        items={items}
        existing={existing}
        selfId={id}
        today={cairoToday()}
        sealed={sealed}
        onChange={update}
        onBack={() => setParams({})}
        onPost={post}
        onCancel={cancel}
        onPrint={print}
        onFinish={() => void navigate('/')}
      />
    )
  }
  return (
    <Receive
      draft={draft}
      items={items}
      existing={existing}
      selfId={id}
      onChange={update}
      onOpenExisting={(otherId) => void navigate(`/receive/${otherId}`)}
      onReview={() => setParams({ step: 'review' })}
    />
  )
}

/** The receiving route: `/receive` starts a draft, `/receive/:id` opens a draft or a posted receipt. */
export default function ReceiptFlow() {
  const { id } = useParams()
  const [newId] = useState(() => crypto.randomUUID())
  const load = useReceiptLoad(id)

  if (load.status === 'loading') return <p className={styles.note}>جاري التحميل...</p>
  if (load.status === 'missing') {
    return (
      <p className={styles.notice} role="alert">
        الإذن ده مش موجود على الجهاز ده. لو لسه متعملش عليه مزامنة، استنى النت وجرّب تاني.
      </p>
    )
  }
  return (
    <ReceiptEditor
      key={id ?? newId}
      id={id ?? newId}
      initial={load.draft}
      sealed={load.sealed}
      isNew={id === undefined}
    />
  )
}
