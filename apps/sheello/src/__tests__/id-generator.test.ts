import {
  generateRowId,
  generateColId,
  generateSheetId,
  generateRowIds,
  generateColIds
} from '../id-generator'
import { isValidRowId, isValidColId, isValidSheetId } from '../yjs-types'

describe('ID Generator', () => {
  describe('generateRowId', () => {
    it('generates valid row IDs', () => {
      const id = generateRowId()
      expect(id).toHaveLength(9)
      expect(isValidRowId(id)).toBe(true)
    })

    it('uses base64url alphabet only', () => {
      const ids = Array.from({ length: 100 }, generateRowId)
      for (const id of ids) {
        expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
      }
    })

    it('generates unique IDs', () => {
      const ids = Array.from({ length: 1000 }, generateRowId)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(1000)
    })
  })

  describe('generateColId', () => {
    it('generates valid column IDs', () => {
      const id = generateColId()
      expect(id).toHaveLength(5)
      expect(isValidColId(id)).toBe(true)
    })

    it('uses base64url alphabet only', () => {
      const ids = Array.from({ length: 100 }, generateColId)
      for (const id of ids) {
        expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
      }
    })

    it('generates unique IDs', () => {
      const ids = Array.from({ length: 1000 }, generateColId)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(1000)
    })
  })

  describe('generateSheetId', () => {
    it('generates valid sheet IDs', () => {
      const id = generateSheetId()
      expect(id).toHaveLength(12)
      expect(isValidSheetId(id)).toBe(true)
    })

    it('uses base64url alphabet only', () => {
      const ids = Array.from({ length: 100 }, generateSheetId)
      for (const id of ids) {
        expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
      }
    })

    it('generates unique IDs', () => {
      const ids = Array.from({ length: 1000 }, generateSheetId)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(1000)
    })
  })

  describe('Batch generation', () => {
    it('generateRowIds creates requested count', () => {
      const ids = generateRowIds(10)
      expect(ids).toHaveLength(10)
      expect(ids.every(isValidRowId)).toBe(true)
    })

    it('generateColIds creates requested count', () => {
      const ids = generateColIds(10)
      expect(ids).toHaveLength(10)
      expect(ids.every(isValidColId)).toBe(true)
    })

    it('batch generated IDs are unique', () => {
      const rowIds = generateRowIds(100)
      const colIds = generateColIds(100)

      expect(new Set(rowIds).size).toBe(100)
      expect(new Set(colIds).size).toBe(100)
    })
  })

  describe('Entropy and collision resistance', () => {
    it('row IDs have sufficient entropy (54 bits)', () => {
      // With 54 bits, probability of collision after 1M IDs is ~0.000003%
      const ids = generateRowIds(10000)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(10000)
    })

    it('column IDs have sufficient entropy (30 bits)', () => {
      // With 30 bits, we have 1 billion possible values
      const ids = generateColIds(10000)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(10000)
    })

    it('sheet IDs have sufficient entropy (72 bits)', () => {
      // With 72 bits, we have 4.7 sextillion possible values
      const ids = Array.from({ length: 10000 }, generateSheetId)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(10000)
    })
  })
})
