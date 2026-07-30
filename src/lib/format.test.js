import { describe, expect, it } from 'vitest'
import { buildSms, normalizeFrenchPhone } from './format'

describe('normalizeFrenchPhone', () => {
  it('normalise un mobile français', () => expect(normalizeFrenchPhone('06 12 34 56 78')).toBe('33612345678'))
  it('conserve un numéro international', () => expect(normalizeFrenchPhone('+33 6 12 34 56 78')).toBe('33612345678'))
})

describe('buildSms', () => {
  it('produit un message court', () => {
    const result = buildSms({ replacement_date: '2026-08-06', start_time: '18:00', end_time: '19:00', venue: 'On Air BNF', class_type: 'Pilates', manager_name: 'Sophie', manager_phone: '0612345678' })
    expect(result).toContain('On Air BNF')
    expect(result).toContain('Pilates')
  })
})
