import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useData } from '../../data/DataProvider'
import { saveItem, updateItem } from '../../data/repos/items'
import { settleQuickly } from '../../data/settle'
import { formatPriceInput, parsePriceInput } from '../../domain/fieldInput'
import {
  buildItem,
  categoriesOf,
  draftFromItem,
  emptyDraft,
  itemEditPatch,
  suggestItemCode,
  suggestPage,
  validateItemDraft,
  type ItemDraft,
  type ItemField,
} from '../../domain/items'
import { formatMoney } from '../../domain/money'
import { normalizeDigits } from '../../domain/search'
import type { Item } from '../../domain/types'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import { ParsedField, type Parsed } from '../components/ParsedField'
import { ItemGtins } from './ItemGtins'
import styles from './ItemEdit.module.css'

const CATEGORIES_ID = 'item-categories'
const SAVE_FAILED = 'السيرفر رفض الحفظ. راجع البيانات وجرّب تاني.'

const text = (value: string): Parsed<string> => ({ ok: true, value })
const same = (value: string): string => value

/**
 * Text that is not a number commits NaN, never "keep the old value": the draft then fails
 * validation, so a half-typed field can never be saved as the number it used to be.
 */
function parseWhole(input: string): Parsed<number | null> {
  const s = normalizeDigits(input).trim()
  if (s === '') return { ok: true, value: null }
  return { ok: true, value: /^\d+$/.test(s) ? Number(s) : Number.NaN }
}

const showWhole = (value: number | null): string =>
  value === null || Number.isNaN(value) ? '' : String(value)

function parsePrice(input: string): Parsed<number | null> {
  return { ok: true, value: parsePriceInput(input) ?? Number.NaN }
}

const showPrice = (value: number | null): string =>
  value === null || Number.isNaN(value) ? '' : formatPriceInput(value)

function Problem({ message }: { readonly message: string | undefined }): ReactNode {
  return message ? <span className={styles.problem}>{message}</span> : null
}

interface FormProps {
  readonly original: Item | null
  readonly items: readonly Item[]
}

/** The add and edit form. A save writes the item document only: movements keep their prices. */
function ItemForm({ original, items }: FormProps) {
  const navigate = useNavigate()
  const [typed, setTyped] = useState<ItemDraft>(() =>
    original ? draftFromItem(original) : emptyDraft(items),
  )
  const [touched, setTouched] = useState({ code: false, page: false })
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  // A new item's code and page follow the items (which may still be loading) and the category,
  // until the user types a value of their own.
  const draft: ItemDraft = original
    ? typed
    : {
        ...typed,
        code: touched.code ? typed.code : suggestItemCode(items, typed.category.trim()),
        page: touched.page ? typed.page : suggestPage(items),
      }
  const issues = validateItemDraft(draft, items, original)
  const invalid = Object.keys(issues.errors).length > 0
  const error = (field: ItemField): string | undefined => issues.errors[field]
  const patch = (change: Partial<ItemDraft>): void => setTyped((d) => ({ ...d, ...change }))

  const priceChanged = original !== null && draft.priceMinor !== original.priceMinor
  const target = original ? `/items/${original.code}` : '/items'

  const save = async (): Promise<void> => {
    if (invalid) return
    setSaving(true)
    setFailed(null)
    // An edit writes only what changed, so a price a receipt wrote meanwhile is kept.
    const code = original ? original.code : buildItem(draft).code
    const write = original
      ? updateItem(original.code, itemEditPatch(original, draft))
      : saveItem(buildItem(draft))
    const outcome = await settleQuickly(write)
    if (outcome === 'failed') {
      setFailed(SAVE_FAILED)
      setSaving(false)
      return
    }
    void navigate(`/items/${code}`)
  }

  return (
    <section className={styles.screen} aria-labelledby="edit-title">
      <h1 id="edit-title" className={styles.title}>
        {original ? 'تعديل الصنف' : 'صنف جديد'}
      </h1>

      <div className={styles.grid}>
        {original ? (
          <div className={styles.locked}>
            <span>الكود</span>
            <b>
              <Bdi>{original.code}</Bdi>
            </b>
            <small>الكود مبيتغيّرش بعد ما الصنف يتعمل.</small>
          </div>
        ) : (
          <ParsedField<string>
            label="الكود"
            value={draft.code}
            format={same}
            parse={text}
            dir="ltr"
            hint={<Problem message={error('code')} />}
            onCommit={(code) => {
              setTouched((t) => ({ ...t, code: true }))
              patch({ code })
            }}
          />
        )}
        <ParsedField<number | null>
          label="رقم الصفحة"
          value={draft.page}
          format={showWhole}
          parse={parseWhole}
          inputMode="numeric"
          dir="ltr"
          hint={<Problem message={error('page')} />}
          onCommit={(page) => {
            setTouched((t) => ({ ...t, page: true }))
            patch({ page })
          }}
        />
      </div>

      <ParsedField<string>
        label="الاسم بالعربي"
        value={draft.nameAr}
        format={same}
        parse={text}
        hint={<Problem message={error('nameAr')} />}
        onCommit={(nameAr) => patch({ nameAr })}
      />
      <ParsedField<string>
        label="الاسم بالإنجليزي (اختياري)"
        value={draft.nameEn}
        format={same}
        parse={text}
        dir="ltr"
        onCommit={(nameEn) => patch({ nameEn })}
      />
      <ParsedField<string>
        label="الفئة"
        value={draft.category}
        format={same}
        parse={text}
        list={CATEGORIES_ID}
        hint={<Problem message={error('category')} />}
        onCommit={(category) => patch({ category })}
      />
      <datalist id={CATEGORIES_ID}>
        {categoriesOf(items).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className={styles.grid}>
        <ParsedField<string>
          label="الخامة"
          value={draft.material}
          format={same}
          parse={text}
          onCommit={(material) => patch({ material })}
        />
        <ParsedField<string>
          label="المقاس"
          value={draft.size}
          format={same}
          parse={text}
          dir="ltr"
          onCommit={(size) => patch({ size })}
        />
        <ParsedField<string>
          label="الوحدة"
          value={draft.unit}
          format={same}
          parse={text}
          onCommit={(unit) => patch({ unit })}
        />
        <ParsedField<string>
          label="الشركة الموردة"
          value={draft.supplier}
          format={same}
          parse={text}
          onCommit={(supplier) => patch({ supplier })}
        />
      </div>

      <div className={styles.grid}>
        <ParsedField<number | null>
          label="السعر (جنيه)"
          value={draft.priceMinor}
          format={showPrice}
          parse={parsePrice}
          inputMode="decimal"
          dir="ltr"
          changed={priceChanged}
          hint={
            priceChanged && original ? (
              <>
                السعر القديم <Bdi>{formatMoney(original.priceMinor)}</Bdi>. الحركات القديمة هتفضل
                بسعرها.
              </>
            ) : (
              <Problem message={error('priceMinor')} />
            )
          }
          onCommit={(priceMinor) => patch({ priceMinor })}
        />
        <ParsedField<number | null>
          label="حد الطلب اليدوي (اختياري)"
          value={draft.reorderManual}
          format={showWhole}
          parse={parseWhole}
          inputMode="numeric"
          dir="ltr"
          hint={<Problem message={error('reorderManual')} />}
          onCommit={(reorderManual) => patch({ reorderManual })}
        />
      </div>

      <ParsedField<string>
        label="كود الهيئة (اختياري)"
        value={draft.authorityCode}
        format={same}
        parse={text}
        inputMode="numeric"
        dir="ltr"
        hint={<Problem message={error('authorityCode')} />}
        onCommit={(authorityCode) => patch({ authorityCode })}
      />

      <ItemGtins gtins={draft.gtins} onChange={(gtins) => patch({ gtins })} />
      {error('gtins') ? (
        <p className={styles.alert} role="alert">
          {error('gtins')}
        </p>
      ) : null}
      {issues.warnings.map((w) => (
        <p key={w} className={styles.warning} role="status">
          {w}
        </p>
      ))}

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(e) => patch({ active: e.target.checked })}
        />
        <span>الصنف شغال (لو موقوف مش بيظهر في القوايم)</span>
      </label>

      {failed ? (
        <p className={styles.alert} role="alert">
          {failed}
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button variant="primary" disabled={invalid || saving} onClick={() => void save()}>
          {saving ? 'بيحفظ...' : 'حفظ'}
        </Button>
        <Link to={target} className={styles.cancel}>
          إلغاء
        </Link>
      </div>
    </section>
  )
}

/** `/items/new` and `/items/:code/edit`. */
export function ItemEdit() {
  const { code } = useParams()
  const { items } = useData()
  const original = code === undefined ? null : (items.find((i) => i.code === code) ?? null)
  if (code !== undefined && original === null) {
    return (
      <section className={styles.screen}>
        <h1 className={styles.title}>الصنف ده مش موجود</h1>
        <Link to="/items">ارجع لقائمة الأصناف</Link>
      </section>
    )
  }
  return <ItemForm key={code ?? 'new'} original={original} items={items} />
}
