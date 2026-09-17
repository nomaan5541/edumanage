import { describe, expect, it } from 'vitest'

import { SAMPLE_ID_CARD_DATA } from './data'
import { formatIdCardError } from './errors'
import {
  BLANK_ID_CARD_LAYOUT,
  interpolateText,
  lookupDataValue,
  parseIdCardLayout,
  resolveTextContent,
} from './layout'
import { qrPreviewModules } from './qr-preview'
import { filterIdCardStarters, ID_CARD_STARTER_COUNT, ID_CARD_STARTERS } from './starters'

describe('id card layout v1', () => {
  it('accepts the blank layout and every starter', () => {
    expect(parseIdCardLayout(BLANK_ID_CARD_LAYOUT).ok).toBe(true)
    expect(ID_CARD_STARTER_COUNT).toBe(8)
    expect(ID_CARD_STARTERS).toHaveLength(8)
    expect(new Set(ID_CARD_STARTERS.map((starter) => starter.key)).size).toBe(8)
    for (const starter of ID_CARD_STARTERS) {
      expect(parseIdCardLayout(starter.layout).ok, starter.key).toBe(true)
    }
  })

  it('rejects an unknown version and a missing canvas', () => {
    expect(parseIdCardLayout({ version: 2, canvas: {}, components: [] }).ok).toBe(false)
    expect(parseIdCardLayout({ version: 1, components: [] }).ok).toBe(false)
  })

  it('rejects duplicate component ids', () => {
    const parsed = parseIdCardLayout({
      ...BLANK_ID_CARD_LAYOUT,
      components: [BLANK_ID_CARD_LAYOUT.components[0], BLANK_ID_CARD_LAYOUT.components[0]],
    })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/Duplicate component id/)
  })

  it('interpolates placeholder paths and tokens', () => {
    expect(lookupDataValue(SAMPLE_ID_CARD_DATA, 'student.fullName')).toBe('Ananya Reddy')
    expect(lookupDataValue(SAMPLE_ID_CARD_DATA, 'student.missing')).toBe('')
    expect(interpolateText('Adm {{student.admissionNo}}', SAMPLE_ID_CARD_DATA)).toBe('Adm ADM-2026-0142')
    expect(
      resolveTextContent(
        {
          id: 'n',
          type: 'text',
          field: 'student.fullName',
          xMm: 0,
          yMm: 0,
          widthMm: 10,
          heightMm: 10,
          fontSizeMm: 3,
          color: '#000000',
          uppercase: true,
        },
        SAMPLE_ID_CARD_DATA,
      ),
    ).toBe('ANANYA REDDY')
  })

  it('filters starters by category and search text', () => {
    expect(filterIdCardStarters('', 'staff').every((starter) => starter.category === 'staff')).toBe(true)
    expect(filterIdCardStarters('visitor', 'all').some((starter) => starter.key === 'visitor-day-pass')).toBe(true)
    expect(filterIdCardStarters('no-such-template-xyz', 'all')).toHaveLength(0)
  })

  it('builds a QR preview grid with finder patterns', () => {
    const modules = qrPreviewModules('edumanage:student:ADM-2026-0142')
    expect(modules).toHaveLength(21)
    expect(modules[0]?.[0]).toBe(true)
    expect(modules[0]?.[20]).toBe(true)
    expect(modules[20]?.[0]).toBe(true)
  })

  it('maps permission and unique-name database errors', () => {
    expect(formatIdCardError(new Error('new row violates row-level security policy'))).toBe(
      'You do not have permission to perform this action.',
    )
    expect(
      formatIdCardError(new Error('duplicate key value violates unique constraint "id_card_templates_school_name_key"')),
    ).toBe('A template with this name already exists.')
  })
})
