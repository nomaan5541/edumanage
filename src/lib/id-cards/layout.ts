export const ID_CARD_LAYOUT_VERSION = 1 as const

export const ID_CARD_CATEGORIES = ['student', 'staff', 'visitor', 'other'] as const
export type IdCardCategory = (typeof ID_CARD_CATEGORIES)[number]

export const ID_CARD_COMPONENT_TYPES = ['text', 'logo', 'photo', 'qr', 'shape'] as const
export type IdCardComponentType = (typeof ID_CARD_COMPONENT_TYPES)[number]

export type TextAlign = 'left' | 'center' | 'right'
export type PhotoShape = 'rect' | 'rounded' | 'circle'
export type ShapeKind = 'rect' | 'rounded-rect' | 'circle' | 'ellipse' | 'line'
export type BackgroundType = 'solid' | 'linear-gradient'
export type FontWeight = 400 | 500 | 600 | 700

const HEX_COLOR = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/
const COMPONENT_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/
const FIELD_PATH = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*){0,4}$/

export interface IdCardCanvasBackground {
  type: BackgroundType
  color: string
  gradientFrom?: string
  gradientTo?: string
  gradientAngleDeg?: number
}

export interface IdCardCanvas {
  widthMm: number
  heightMm: number
  background: IdCardCanvasBackground
}

interface IdCardComponentBase {
  id: string
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
  rotationDeg?: number
}

export interface IdCardTextComponent extends IdCardComponentBase {
  type: 'text'
  field?: string
  text?: string
  fontSizeMm: number
  fontWeight?: FontWeight
  color: string
  align?: TextAlign
  uppercase?: boolean
  letterSpacingMm?: number
}

export interface IdCardLogoComponent extends IdCardComponentBase {
  type: 'logo'
  shape?: PhotoShape
}

export interface IdCardPhotoComponent extends IdCardComponentBase {
  type: 'photo'
  shape?: PhotoShape
  field?: string
}

export interface IdCardQrComponent extends IdCardComponentBase {
  type: 'qr'
  field?: string
}

export interface IdCardShapeComponent extends IdCardComponentBase {
  type: 'shape'
  shape: ShapeKind
  fill?: string
  stroke?: string
  strokeWidthMm?: number
  radiusMm?: number
}

export type IdCardComponent =
  | IdCardTextComponent
  | IdCardLogoComponent
  | IdCardPhotoComponent
  | IdCardQrComponent
  | IdCardShapeComponent

export interface IdCardLayoutV1 {
  version: typeof ID_CARD_LAYOUT_VERSION
  canvas: IdCardCanvas
  components: IdCardComponent[]
}

export type ParseLayoutResult =
  | { ok: true; layout: IdCardLayoutV1 }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function fail(error: string): ParseLayoutResult {
  return { ok: false, error }
}

function parseBase(
  raw: Record<string, unknown>,
  seenIds: Set<string>,
): { error: string } | { base: IdCardComponentBase } {
  if (typeof raw.id !== 'string' || !COMPONENT_ID.test(raw.id)) {
    return { error: 'Each component needs a stable id (letter, then letters/digits/_/-).' }
  }
  if (seenIds.has(raw.id)) {
    return { error: `Duplicate component id: ${raw.id}` }
  }
  seenIds.add(raw.id)
  if (!isFiniteNumber(raw.xMm) || !isFiniteNumber(raw.yMm) || !isFiniteNumber(raw.widthMm) || !isFiniteNumber(raw.heightMm)) {
    return { error: `Component ${raw.id} must have numeric xMm, yMm, widthMm, and heightMm.` }
  }
  if (raw.widthMm <= 0 || raw.heightMm <= 0) {
    return { error: `Component ${raw.id} widthMm and heightMm must be positive.` }
  }
  if (raw.widthMm > 120 || raw.heightMm > 120) {
    return { error: `Component ${raw.id} exceeds the maximum size.` }
  }
  if (raw.rotationDeg !== undefined && !isFiniteNumber(raw.rotationDeg)) {
    return { error: `Component ${raw.id} rotationDeg must be a number.` }
  }
  return {
    base: {
      id: raw.id,
      xMm: raw.xMm,
      yMm: raw.yMm,
      widthMm: raw.widthMm,
      heightMm: raw.heightMm,
      rotationDeg: raw.rotationDeg,
    },
  }
}

function parseOptionalField(raw: Record<string, unknown>, id: string): { error: string } | { field?: string } {
  if (raw.field === undefined) return {}
  if (typeof raw.field !== 'string' || !FIELD_PATH.test(raw.field)) {
    return { error: `Component ${id} has an invalid field path.` }
  }
  return { field: raw.field }
}

function parsePhotoShape(raw: Record<string, unknown>, id: string): { error: string } | { shape?: PhotoShape } {
  if (raw.shape === undefined) return {}
  if (raw.shape !== 'rect' && raw.shape !== 'rounded' && raw.shape !== 'circle') {
    return { error: `Component ${id} photo/logo shape is invalid.` }
  }
  return { shape: raw.shape }
}

function parseComponent(raw: unknown, seenIds: Set<string>): { error: string } | { component: IdCardComponent } {
  if (!isRecord(raw)) {
    return { error: 'Each ID card component must be an object.' }
  }
  const parsedBase = parseBase(raw, seenIds)
  if ('error' in parsedBase) return parsedBase
  const { base } = parsedBase
  const type = raw.type

  if (type === 'text') {
    if (!isFiniteNumber(raw.fontSizeMm) || raw.fontSizeMm < 1 || raw.fontSizeMm > 20) {
      return { error: `Text component ${base.id} needs fontSizeMm between 1 and 20.` }
    }
    if (!isHexColor(raw.color)) {
      return { error: `Text component ${base.id} needs a hex color.` }
    }
    const fieldResult = parseOptionalField(raw, base.id)
    if ('error' in fieldResult) return fieldResult
    if (!fieldResult.field && typeof raw.text !== 'string') {
      return { error: `Text component ${base.id} needs a field or text value.` }
    }
    if (raw.align !== undefined && raw.align !== 'left' && raw.align !== 'center' && raw.align !== 'right') {
      return { error: `Text component ${base.id} align is invalid.` }
    }
    if (
      raw.fontWeight !== undefined &&
      raw.fontWeight !== 400 &&
      raw.fontWeight !== 500 &&
      raw.fontWeight !== 600 &&
      raw.fontWeight !== 700
    ) {
      return { error: `Text component ${base.id} fontWeight is invalid.` }
    }
    const component: IdCardTextComponent = {
      ...base,
      type: 'text',
      fontSizeMm: raw.fontSizeMm,
      color: raw.color,
      field: fieldResult.field,
      text: typeof raw.text === 'string' ? raw.text : undefined,
      fontWeight: raw.fontWeight,
      align: raw.align,
      uppercase: raw.uppercase === true,
      letterSpacingMm: isFiniteNumber(raw.letterSpacingMm) ? raw.letterSpacingMm : undefined,
    }
    return { component }
  }

  if (type === 'logo') {
    const shapeResult = parsePhotoShape(raw, base.id)
    if ('error' in shapeResult) return shapeResult
    return { component: { ...base, type: 'logo', shape: shapeResult.shape } }
  }

  if (type === 'photo') {
    const shapeResult = parsePhotoShape(raw, base.id)
    if ('error' in shapeResult) return shapeResult
    const fieldResult = parseOptionalField(raw, base.id)
    if ('error' in fieldResult) return fieldResult
    return { component: { ...base, type: 'photo', shape: shapeResult.shape, field: fieldResult.field } }
  }

  if (type === 'qr') {
    const fieldResult = parseOptionalField(raw, base.id)
    if ('error' in fieldResult) return fieldResult
    return { component: { ...base, type: 'qr', field: fieldResult.field } }
  }

  if (type === 'shape') {
    if (
      raw.shape !== 'rect' &&
      raw.shape !== 'rounded-rect' &&
      raw.shape !== 'circle' &&
      raw.shape !== 'ellipse' &&
      raw.shape !== 'line'
    ) {
      return { error: `Shape component ${base.id} needs a valid shape kind.` }
    }
    if (raw.fill !== undefined && !isHexColor(raw.fill)) {
      return { error: `Shape component ${base.id} fill must be a hex color.` }
    }
    if (raw.stroke !== undefined && !isHexColor(raw.stroke)) {
      return { error: `Shape component ${base.id} stroke must be a hex color.` }
    }
    const component: IdCardShapeComponent = {
      ...base,
      type: 'shape',
      shape: raw.shape,
      fill: isHexColor(raw.fill) ? raw.fill : undefined,
      stroke: isHexColor(raw.stroke) ? raw.stroke : undefined,
      strokeWidthMm: isFiniteNumber(raw.strokeWidthMm) ? raw.strokeWidthMm : undefined,
      radiusMm: isFiniteNumber(raw.radiusMm) ? raw.radiusMm : undefined,
    }
    return { component }
  }

  return { error: `Component ${base.id} has unsupported type ${String(type)}.` }
}

export function parseIdCardLayout(input: unknown): ParseLayoutResult {
  if (!isRecord(input)) {
    return fail('ID card layout must be a JSON object.')
  }
  if (input.version !== ID_CARD_LAYOUT_VERSION) {
    return fail('ID card layout.version must be 1.')
  }
  if (!isRecord(input.canvas)) {
    return fail('ID card layout.canvas is required.')
  }
  const canvasRaw = input.canvas
  if (!isFiniteNumber(canvasRaw.widthMm) || !isFiniteNumber(canvasRaw.heightMm)) {
    return fail('ID card canvas widthMm and heightMm must be numbers.')
  }
  if (canvasRaw.widthMm < 40 || canvasRaw.widthMm > 120 || canvasRaw.heightMm < 40 || canvasRaw.heightMm > 120) {
    return fail('ID card canvas size must be between 40mm and 120mm.')
  }
  if (!isRecord(canvasRaw.background)) {
    return fail('ID card canvas.background is required.')
  }
  const backgroundRaw = canvasRaw.background
  if (backgroundRaw.type !== 'solid' && backgroundRaw.type !== 'linear-gradient') {
    return fail('ID card background.type must be solid or linear-gradient.')
  }
  if (!isHexColor(backgroundRaw.color)) {
    return fail('ID card background.color must be a hex color.')
  }
  if (backgroundRaw.type === 'linear-gradient') {
    if (!isHexColor(backgroundRaw.gradientFrom) || !isHexColor(backgroundRaw.gradientTo)) {
      return fail('Gradient backgrounds require hex gradientFrom and gradientTo.')
    }
  }
  if (!Array.isArray(input.components)) {
    return fail('ID card layout.components must be an array.')
  }
  if (input.components.length < 1 || input.components.length > 40) {
    return fail('ID card layouts must have between 1 and 40 components.')
  }

  const seenIds = new Set<string>()
  const components: IdCardComponent[] = []
  for (const raw of input.components) {
    const parsed = parseComponent(raw, seenIds)
    if ('error' in parsed) return fail(parsed.error)
    components.push(parsed.component)
  }

  const layout: IdCardLayoutV1 = {
    version: ID_CARD_LAYOUT_VERSION,
    canvas: {
      widthMm: canvasRaw.widthMm,
      heightMm: canvasRaw.heightMm,
      background: {
        type: backgroundRaw.type,
        color: backgroundRaw.color,
        gradientFrom: isHexColor(backgroundRaw.gradientFrom) ? backgroundRaw.gradientFrom : undefined,
        gradientTo: isHexColor(backgroundRaw.gradientTo) ? backgroundRaw.gradientTo : undefined,
        gradientAngleDeg: isFiniteNumber(backgroundRaw.gradientAngleDeg) ? backgroundRaw.gradientAngleDeg : undefined,
      },
    },
    components,
  }
  return { ok: true, layout }
}

export function lookupDataValue(data: unknown, path: string): string {
  const parts = path.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (!isRecord(current) || !(part in current)) return ''
    current = current[part]
  }
  if (current === null || current === undefined) return ''
  if (typeof current === 'string' || typeof current === 'number') return String(current)
  return ''
}

const TOKEN = /\{\{\s*([a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*){0,4})\s*\}\}/g

export function interpolateText(template: string, data: unknown): string {
  return template.replace(TOKEN, (_match, path: string) => lookupDataValue(data, path))
}

export function resolveTextContent(component: IdCardTextComponent, data: unknown): string {
  if (component.field) {
    const value = lookupDataValue(data, component.field)
    if (value) return component.uppercase ? value.toUpperCase() : value
  }
  if (component.text) {
    const value = interpolateText(component.text, data)
    return component.uppercase ? value.toUpperCase() : value
  }
  return ''
}

export interface IdCardStarterMeta {
  key: string
  name: string
  category: IdCardCategory
  description: string
  tags: string[]
}

export function matchesIdCardQuery(
  item: { name: string; category: string; description?: string | null; tags?: string[] },
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [item.name, item.category, item.description ?? '', ...(item.tags ?? [])].join(' ').toLowerCase()
  return haystack.includes(q)
}

export function previewWidthFor(layout: IdCardLayoutV1, compact = false) {
  const landscape = layout.canvas.widthMm >= layout.canvas.heightMm
  if (compact) return landscape ? 240 : 148
  return landscape ? 420 : 260
}

export const BLANK_ID_CARD_LAYOUT: IdCardLayoutV1 = {
  version: 1,
  canvas: {
    widthMm: 54,
    heightMm: 86,
    background: { type: 'solid', color: '#f8fafc' },
  },
  components: [
    {
      id: 'header',
      type: 'shape',
      shape: 'rect',
      xMm: 0,
      yMm: 0,
      widthMm: 54,
      heightMm: 18,
      fill: '#1e3a5f',
    },
    {
      id: 'school-name',
      type: 'text',
      field: 'school.name',
      xMm: 4,
      yMm: 5,
      widthMm: 46,
      heightMm: 8,
      fontSizeMm: 3.2,
      fontWeight: 700,
      color: '#ffffff',
      align: 'center',
    },
    {
      id: 'photo',
      type: 'photo',
      shape: 'rounded',
      xMm: 16,
      yMm: 24,
      widthMm: 22,
      heightMm: 26,
      field: 'student.photoUrl',
    },
    {
      id: 'student-name',
      type: 'text',
      field: 'student.fullName',
      xMm: 4,
      yMm: 54,
      widthMm: 46,
      heightMm: 8,
      fontSizeMm: 3.4,
      fontWeight: 700,
      color: '#0f172a',
      align: 'center',
    },
    {
      id: 'admission',
      type: 'text',
      field: 'student.admissionNo',
      xMm: 4,
      yMm: 63,
      widthMm: 46,
      heightMm: 6,
      fontSizeMm: 2.4,
      color: '#475569',
      align: 'center',
    },
    {
      id: 'qr',
      type: 'qr',
      field: 'card.qrPayload',
      xMm: 20,
      yMm: 70,
      widthMm: 14,
      heightMm: 14,
    },
  ],
}
