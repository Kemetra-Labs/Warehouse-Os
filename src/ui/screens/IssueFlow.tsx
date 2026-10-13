import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../app/AuthProvider'
import { useData } from '../../data/DataProvider'
import type { CancelAttempt } from '../../data/cancelPost'
import { getDeviceId } from '../../data/deviceId'
import type { IssuePostResult } from '../../data/issuePost'
import { cancelIssueDoc, postIssueBatch, saveIssueDraft } from '../../data/repos/issues'
import { cachedStock } from '../../data/stockView'
import { useLedger } from '../../data/useLedger'
import { cairoToday } from '../../domain/dates'
import type { IssueDraft } from '../../domain/issue'
import { isBlankIssueDraft } from '../../domain/issueEdit'
import { hasDuplicateNumber } from '../../domain/issueNumbers'
import { downloadIssuePrint } from './exportActions'
import { Issue } from './Issue'
import { useDraftAutosave, type AutosaveAdapter } from './useDraftAutosave'
import { useIssueLoad, type SealedBatch } from './useIssueLoad'
import styles from './Receive.module.css'

const NOT_LOADED: CancelAttempt = {
  ok: false,
  problem: { code: 'incomplete', message: 'الدفعة لسه بتتحمّل. استنى لحظة وجرّب تاني.' },
}

const NOT_LOADED_PRINT = 'الدفعة لسه بتتحمّل. استنى لحظة وجرّب تاني.'

const ISSUE_AUTOSAVE: AutosaveAdapter<IssueDraft> = {
  save: saveIssueDraft,
  isBlank: isBlankIssueDraft,
}

interface EditorProps {
  readonly id: string
  readonly initial: IssueDraft
  readonly sealed: SealedBatch | null
  readonly isNew: boolean
}

/** Holds the draft while it is edited and posts it through the outbox. */
function IssueEditor({ id, initial, sealed, isNew }: EditorProps) {
  const navigate = useNavigate()
  const { state } = useAuth()
  const { items, outbox, issueBatches, movements } = useData()
  const ledger = useLedger()
  const stock = useMemo(() => cachedStock(ledger), [ledger])
  const [draft, setDraft] = useState(initial)
  const autosave = useDraftAutosave(id, isNew, ISSUE_AUTOSAVE)

  const update = (next: IssueDraft): void => {
    setDraft(next)
    autosave.schedule(next)
  }

  const post = async (): Promise<IssuePostResult> => {
    if (state.status !== 'signedIn') throw new Error('not signed in')
    autosave.pause()
    try {
      const result = await postIssueBatch(
        { id, draft, items, stock, uid: state.user.uid, deviceId: getDeviceId() },
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
    const batch = issueBatches.find((b) => b.id === id)
    if (!batch) return Promise.resolve(NOT_LOADED)
    return cancelIssueDoc(
      batch,
      { reason, movements, uid: state.user.uid, deviceId: getDeviceId() },
      outbox,
    )
  }

  const print = (): Promise<void> => {
    const batch = issueBatches.find((b) => b.id === id)
    if (!batch) return Promise.reject(new Error(NOT_LOADED_PRINT))
    return downloadIssuePrint({ batch, items, movements })
  }

  return (
    <Issue
      draft={draft}
      items={items}
      stock={stock}
      today={cairoToday()}
      sealed={sealed}
      duplicateNumber={hasDuplicateNumber(issueBatches, id, draft.number)}
      onChange={update}
      onPost={post}
      onCancel={cancel}
      onPrint={print}
      onFinish={() => void navigate('/')}
    />
  )
}

/** The issuing route: `/issue` starts a draft, `/issue/:id` opens a draft or a posted batch. */
export default function IssueFlow() {
  const { id } = useParams()
  const [newId] = useState(() => crypto.randomUUID())
  const load = useIssueLoad(id)

  if (load.status === 'loading') return <p className={styles.note}>جاري التحميل...</p>
  if (load.status === 'missing') {
    return (
      <p className={styles.notice} role="alert">
        الدفعة دي مش موجودة على الجهاز ده. لو لسه متعملش عليها مزامنة، استنى النت وجرّب تاني.
      </p>
    )
  }
  return (
    <IssueEditor
      key={id ?? newId}
      id={id ?? newId}
      initial={load.draft}
      sealed={load.sealed}
      isNew={id === undefined}
    />
  )
}
