import * as React from 'react'

import { SAMPLE_ID_CARD_DATA } from '@/lib/id-cards/data'
import type { IdCardComponent, IdCardLayoutV1, PhotoShape } from '@/lib/id-cards/layout'
import { lookupDataValue, resolveTextContent } from '@/lib/id-cards/layout'
import { qrPreviewModules } from '@/lib/id-cards/qr-preview'
import { cn } from '@/lib/utils'

function mm(value: number, scale: number) {
  return value * scale
}

function clipRadius(shape: PhotoShape | undefined, width: number, height: number) {
  if (shape === 'circle') return '50%'
  if (shape === 'rounded') return `${Math.min(width, height) * 0.12}px`
  return '2px'
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'S'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function PhotoPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-200 text-slate-500">
      <svg viewBox="0 0 24 24" className="h-3/5 w-3/5" aria-hidden="true">
        <circle cx="12" cy="8" r="4" fill="currentColor" />
        <path d="M4 20c1.6-4 14.4-4 16 0" fill="currentColor" />
      </svg>
    </div>
  )
}

function MediaFrame({
  url,
  shape,
  alt,
  fallback,
}: {
  url: string
  shape?: PhotoShape
  alt: string
  fallback: React.ReactNode
}) {
  const [failed, setFailed] = React.useState(false)
  const showImage = Boolean(url) && !failed
  return (
    <div
      className="h-full w-full overflow-hidden bg-white"
      style={{ borderRadius: clipRadius(shape, 100, 100) }}
    >
      {showImage ? (
        <img src={url} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        fallback
      )}
    </div>
  )
}

function QrPreview({ payload }: { payload: string }) {
  const modules = React.useMemo(() => qrPreviewModules(payload), [payload])
  const size = modules.length
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full bg-white p-[6%]" role="img" aria-label="QR preview">
      {modules.flatMap((row, y) =>
        row.map((on, x) =>
          on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0f172a" /> : null,
        ),
      )}
    </svg>
  )
}

function ShapeView({ component, scale }: { component: Extract<IdCardComponent, { type: 'shape' }>; scale: number }) {
  const radius =
    component.shape === 'circle' || component.shape === 'ellipse'
      ? '50%'
      : component.shape === 'rounded-rect'
        ? `${mm(component.radiusMm ?? 2, scale)}px`
        : 0
  if (component.shape === 'line') {
    return (
      <div
        className="h-full w-full"
        style={{
          background: component.stroke ?? component.fill ?? '#0f172a',
          height: `${mm(component.strokeWidthMm ?? Math.max(component.heightMm, 0.4), scale)}px`,
        }}
      />
    )
  }
  return (
    <div
      className="h-full w-full"
      style={{
        background: component.fill ?? 'transparent',
        borderRadius: radius,
        border: component.stroke
          ? `${mm(component.strokeWidthMm ?? 0.4, scale)}px solid ${component.stroke}`
          : undefined,
      }}
    />
  )
}

function ComponentView({
  component,
  scale,
  data,
}: {
  component: IdCardComponent
  scale: number
  data: unknown
}) {
  if (component.type === 'text') {
    const content = resolveTextContent(component, data)
    return (
      <div
        className="flex h-full w-full items-center overflow-hidden"
        style={{
          justifyContent: component.align === 'center' ? 'center' : component.align === 'right' ? 'flex-end' : 'flex-start',
          color: component.color,
          fontSize: `${mm(component.fontSizeMm, scale)}px`,
          fontWeight: component.fontWeight ?? 400,
          letterSpacing: component.letterSpacingMm ? `${mm(component.letterSpacingMm, scale)}px` : undefined,
          textAlign: component.align ?? 'left',
          lineHeight: 1.15,
          whiteSpace: 'nowrap',
        }}
      >
        {content}
      </div>
    )
  }

  if (component.type === 'photo') {
    const url = lookupDataValue(data, component.field ?? 'student.photoUrl')
    return (
      <MediaFrame url={url} shape={component.shape} alt="Photo" fallback={<PhotoPlaceholder />} />
    )
  }

  if (component.type === 'logo') {
    const url = lookupDataValue(data, 'school.logoUrl')
    const name = lookupDataValue(data, 'school.name') || 'School'
    return (
      <MediaFrame
        url={url}
        shape={component.shape}
        alt="School logo"
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-white/90 text-[0.55em] font-semibold text-slate-700">
            {initialsFromName(name)}
          </div>
        }
      />
    )
  }

  if (component.type === 'qr') {
    return <QrPreview payload={lookupDataValue(data, component.field ?? 'card.qrPayload')} />
  }

  return <ShapeView component={component} scale={scale} />
}

export function IdCardRenderer({
  layout,
  data = SAMPLE_ID_CARD_DATA,
  widthPx,
  className,
}: {
  layout: IdCardLayoutV1
  data?: unknown
  widthPx: number
  className?: string
}) {
  const scale = widthPx / layout.canvas.widthMm
  const heightPx = mm(layout.canvas.heightMm, scale)
  const background =
    layout.canvas.background.type === 'linear-gradient'
      ? `linear-gradient(${layout.canvas.background.gradientAngleDeg ?? 160}deg, ${layout.canvas.background.gradientFrom}, ${layout.canvas.background.gradientTo})`
      : layout.canvas.background.color

  return (
    <div
      className={cn('relative overflow-hidden shadow-md', className)}
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        background,
        borderRadius: 8,
      }}
      aria-label="ID card preview"
    >
      {layout.components.map((component) => (
        <div
          key={component.id}
          className="absolute overflow-hidden"
          style={{
            left: `${mm(component.xMm, scale)}px`,
            top: `${mm(component.yMm, scale)}px`,
            width: `${mm(component.widthMm, scale)}px`,
            height: `${mm(component.heightMm, scale)}px`,
            transform: component.rotationDeg ? `rotate(${component.rotationDeg}deg)` : undefined,
            transformOrigin: 'center center',
          }}
        >
          <ComponentView component={component} scale={scale} data={data} />
        </div>
      ))}
    </div>
  )
}
