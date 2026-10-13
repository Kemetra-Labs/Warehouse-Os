import { describe, expect, it } from 'vitest'
import { duplicateBatchNumbers, hasDuplicateNumber } from '../../../src/domain/issueNumbers'

describe('duplicateBatchNumbers (R10)', () => {
  it('lists every number carried by more than one batch, lowest first', () => {
    const batches = [
      { id: 'a', number: 14 },
      { id: 'b', number: 12 },
      { id: 'c', number: 14 },
      { id: 'd', number: 12 },
      { id: 'e', number: 13 },
    ]
    expect(duplicateBatchNumbers(batches)).toEqual([
      { number: 12, ids: ['b', 'd'] },
      { number: 14, ids: ['a', 'c'] },
    ])
  })

  it('is empty when every number is unique', () => {
    expect(duplicateBatchNumbers([])).toEqual([])
    expect(
      duplicateBatchNumbers([
        { id: 'a', number: 1 },
        { id: 'b', number: 2 },
      ]),
    ).toEqual([])
  })
})

describe('hasDuplicateNumber', () => {
  const batches = [
    { id: 'a', number: 14 },
    { id: 'b', number: 14 },
    { id: 'c', number: 15 },
  ]
  it('ignores the batch itself and finds another with the same number', () => {
    expect(hasDuplicateNumber(batches, 'a', 14)).toBe(true)
    expect(hasDuplicateNumber(batches, 'c', 15)).toBe(false)
    expect(hasDuplicateNumber([{ id: 'a', number: 14 }], 'a', 14)).toBe(false)
  })
})
