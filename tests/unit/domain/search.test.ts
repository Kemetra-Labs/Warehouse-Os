import { describe, expect, it } from 'vitest'
import {
  classify,
  normalizeArabic,
  normalizeDigits,
  normalizeGtin,
  parseGs1,
  resolve,
  searchItems,
} from '../../../src/domain/search'

const GS = '\x1d'

describe('normalizeDigits', () => {
  it('converts Arabic-Indic and Eastern Persian digits', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789')
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789')
    expect(normalizeDigits('SCR-٠١')).toBe('SCR-01')
  })
})

describe('normalizeGtin', () => {
  it('turns a GTIN-14 with a leading 0 into GTIN-13', () => {
    expect(normalizeGtin('06221234567890')).toBe('6221234567890')
  })
  it('turns a 12-digit UPC-A into GTIN-13', () => {
    expect(normalizeGtin('012345678905')).toBe('0012345678905')
  })
  it('leaves 8 and 13 digits alone', () => {
    expect(normalizeGtin('12345670')).toBe('12345670')
    expect(normalizeGtin('6221234567890')).toBe('6221234567890')
  })
  it('keeps a GTIN-14 without a leading 0', () => {
    expect(normalizeGtin('16221234567897')).toBe('16221234567897')
  })
})

describe('classify', () => {
  it('classifies 13 digits as GTIN', () => {
    expect(classify('6221234567890')).toMatchObject({ kind: 'gtin', gtin: '6221234567890' })
  })
  it('normalises 12 and 14 digit GTINs', () => {
    expect(classify('012345678905')).toMatchObject({ kind: 'gtin', gtin: '0012345678905' })
    expect(classify('06221234567890')).toMatchObject({ kind: 'gtin', gtin: '6221234567890' })
  })
  it('classifies 1-4 digits as a page number', () => {
    expect(classify('7')).toEqual({ kind: 'page', page: 7 })
    expect(classify('1234')).toEqual({ kind: 'page', page: 1234 })
  })
  it('classifies item codes in any case, upper-cased', () => {
    expect(classify('SCR-01')).toEqual({ kind: 'code', code: 'SCR-01' })
    expect(classify('pla-123')).toEqual({ kind: 'code', code: 'PLA-123' })
  })
  it('classifies 8 and 9 digits as ambiguous (GTIN or authority code)', () => {
    expect(classify('12345670')).toEqual({ kind: 'ambiguous', value: '12345670' })
    expect(classify('70000409')).toEqual({ kind: 'ambiguous', value: '70000409' })
    expect(classify('150004771')).toEqual({ kind: 'ambiguous', value: '150004771' })
  })
  it('sends 5-7 and 10-11 digits to name search', () => {
    for (const d of ['12345', '123456', '1234567', '1234567890', '12345678901']) {
      expect(classify(d).kind).toBe('name')
    }
  })
  it('classifies everything else as a name', () => {
    expect(classify('مسمار عظم')).toEqual({ kind: 'name', query: 'مسمار عظم' })
    expect(classify('SCR-1')).toMatchObject({ kind: 'name' })
    expect(classify('')).toEqual({ kind: 'name', query: '' })
  })
  it('trims whitespace and normalises Arabic digits first', () => {
    expect(classify('  ٧  ')).toEqual({ kind: 'page', page: 7 })
    expect(classify('٦٢٢١٢٣٤٥٦٧٨٩٠')).toMatchObject({ kind: 'gtin', gtin: '6221234567890' })
    expect(classify('١٢٣٤٥٦٧٠')).toEqual({ kind: 'ambiguous', value: '12345670' })
    expect(classify(' scr-٠١ ')).toEqual({ kind: 'code', code: 'SCR-01' })
  })
  it('parses a GS1 element string with GS separators', () => {
    const r = classify(`010622123456789017270331${'10'}LOT42${GS}21XYZ`)
    expect(r).toEqual({
      kind: 'gtin',
      gtin: '6221234567890',
      expiry: '2027-03-31',
      batchNo: 'LOT42',
    })
  })
  it('parses a GS1 element string with the batch last and no separator', () => {
    expect(classify('0106221234567890172703311075B')).toMatchObject({
      kind: 'gtin',
      expiry: '2027-03-31',
      batchNo: '75B',
    })
  })
  it('parses the parenthesised form', () => {
    expect(classify('(01)06221234567890(17)261100(10)AB-9')).toEqual({
      kind: 'gtin',
      gtin: '6221234567890',
      expiry: '2026-11-30',
      batchNo: 'AB-9',
    })
  })
  it('gives plain GTINs null expiry and batch', () => {
    expect(classify('6221234567890')).toEqual({
      kind: 'gtin',
      gtin: '6221234567890',
      expiry: null,
      batchNo: null,
    })
  })
})

describe('parseGs1', () => {
  it('returns null for non GS1 input', () => {
    expect(parseGs1('hello')).toBeNull()
    expect(parseGs1('6221234567890')).toBeNull()
    expect(parseGs1('(17)261100(10)X')).toBeNull() // no GTIN
  })
  it('strips a symbology identifier', () => {
    expect(parseGs1(']d201062212345678901726110010X')?.batchNo).toBe('X')
  })
  it('handles an invalid expiry month as null', () => {
    expect(parseGs1('(01)06221234567890(17)261500')?.expiry).toBeNull()
  })
  it('handles a fixed-length AI after the batch with a separator', () => {
    const r = parseGs1(`01062212345678901047${GS}17270331`)
    expect(r?.batchNo).toBe('47')
    expect(r?.expiry).toBe('2027-03-31')
  })
  it('reads an exact day expiry', () => {
    expect(parseGs1('(01)06221234567890(17)270315')?.expiry).toBe('2027-03-15')
  })
  it('stops at an unknown AI without throwing', () => {
    const r = parseGs1('01062212345678909999abc')
    expect(r?.gtin).toBe('6221234567890')
  })
})

describe('normalizeArabic', () => {
  it('folds alef forms, ya, ta marbuta, tatweel and diacritics', () => {
    expect(normalizeArabic('أإآ')).toBe('ااا')
    expect(normalizeArabic('على')).toBe('علي')
    expect(normalizeArabic('مسطرة')).toBe('مسطره')
    expect(normalizeArabic('مســمار')).toBe('مسمار')
    expect(normalizeArabic('مِسْمَار')).toBe('مسمار')
  })
})

describe('searchItems', () => {
  const items = [
    { code: 'SCR-01', nameAr: 'مسمار عظم', nameEn: 'Bone Screw' },
    { code: 'SCR-02', nameAr: 'مسمار نخاعي', nameEn: 'Spinal screw' },
    { code: 'PLA-01', nameAr: 'شريحة', nameEn: '' },
    { code: 'PLA-02', nameAr: 'أداة قياس', nameEn: undefined },
  ]
  it('returns every match as a list', () => {
    expect(searchItems(items, 'مسمار').map((i) => i.code)).toEqual(['SCR-01', 'SCR-02'])
  })
  it('matches English names case-insensitively', () => {
    expect(searchItems(items, 'bone').map((i) => i.code)).toEqual(['SCR-01'])
  })
  it('uses Arabic normalisation', () => {
    expect(searchItems(items, 'اداه قياس').map((i) => i.code)).toEqual(['PLA-02'])
    expect(searchItems(items, 'شريحه').map((i) => i.code)).toEqual(['PLA-01'])
  })
  it('requires all words to match', () => {
    expect(searchItems(items, 'مسمار نخاعي').map((i) => i.code)).toEqual(['SCR-02'])
  })
  it('returns nothing for an empty query or no match', () => {
    expect(searchItems(items, '  ')).toEqual([])
    expect(searchItems(items, 'zzz')).toEqual([])
  })
})

describe('resolve (FR-020)', () => {
  const items = [
    { code: 'SCR-01', nameAr: 'مسمار عظم', gtins: ['12345670'], authorityCode: null },
    { code: 'SCR-02', nameAr: 'مسمار نخاعي', gtins: [], authorityCode: '12345670' },
    { code: 'PLA-01', nameAr: 'شريحة', gtins: ['6221234567890'], authorityCode: '70000409' },
  ]
  it('returns every item matching an 8-digit value as GTIN or authority code', () => {
    const r = resolve(items, classify('12345670'))
    expect(r.map((i) => i.code)).toEqual(['SCR-01', 'SCR-02'])
  })
  it('finds an item by its authority code alone', () => {
    expect(resolve(items, classify('70000409')).map((i) => i.code)).toEqual(['PLA-01'])
  })
  it('resolves a GTIN, an item code and a name; a page resolves to nothing', () => {
    expect(resolve(items, classify('6221234567890')).map((i) => i.code)).toEqual(['PLA-01'])
    expect(resolve(items, classify('scr-02')).map((i) => i.code)).toEqual(['SCR-02'])
    expect(resolve(items, classify('شريحة')).map((i) => i.code)).toEqual(['PLA-01'])
    expect(resolve(items, classify('7'))).toEqual([])
  })
  it('resolves a page number to the items on that page', () => {
    const paged = [
      { code: 'SCR-01', nameAr: 'أ', gtins: [], page: 7 },
      { code: 'SCR-02', nameAr: 'ب', gtins: [], page: 7 },
      { code: 'PLA-01', nameAr: 'ج', gtins: [], page: 8 },
    ]
    expect(resolve(paged, classify('7')).map((i) => i.code)).toEqual(['SCR-01', 'SCR-02'])
    expect(resolve(paged, classify('9'))).toEqual([])
  })
  it('returns nothing when no item matches', () => {
    expect(resolve(items, classify('99999999'))).toEqual([])
  })
})
