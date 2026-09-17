# ID card layout contract (v1)

School-owned templates store a JSON `layout` on `public.id_card_templates`. System starters live in `src/lib/id-cards/starters.ts` and are copied into that table. There are no null-school global rows.

Coordinates are millimetres from the top-left of the canvas. ISO CR80 is 54×86 (portrait) or 86×54 (landscape). Canvas sides must be between 40mm and 120mm.

## Root

```json
{
  "version": 1,
  "canvas": {
    "widthMm": 54,
    "heightMm": 86,
    "background": {
      "type": "solid",
      "color": "#f8fafc",
      "gradientFrom": "#0f766e",
      "gradientTo": "#1e3a5f",
      "gradientAngleDeg": 160
    }
  },
  "components": []
}
```

- `version` must be the number `1`.
- `background.type` is `solid` or `linear-gradient`. Gradient fills also need hex `gradientFrom` and `gradientTo`.
- Colors are `#RGB`, `#RRGGBB`, or `#RRGGBBAA`.
- `components` has 1–40 items. Each `id` is unique.

## Components

Every component has `id`, `type`, `xMm`, `yMm`, `widthMm`, `heightMm`, and optional `rotationDeg`.

| type | Extra fields | Renders |
| --- | --- | --- |
| `text` | `field` and/or `text`, `fontSizeMm` (1–20), `color`, optional `fontWeight`, `align`, `uppercase`, `letterSpacingMm` | Literal text, `{{path}}` tokens in `text`, or a placeholder path in `field` |
| `logo` | optional `shape`: `rect` \| `rounded` \| `circle` | `school.logoUrl`, or a monogram |
| `photo` | optional `shape`, optional `field` (default `student.photoUrl`) | Photo URL, or a silhouette placeholder |
| `qr` | optional `field` (default `card.qrPayload`) | Preview QR modules from the payload |
| `shape` | `shape`: `rect` \| `rounded-rect` \| `circle` \| `ellipse` \| `line`; optional `fill`, `stroke`, `strokeWidthMm`, `radiusMm` | Decorative geometry |

Placeholder paths look like `student.fullName` (letter, then letters/digits, dotted segments). Unknown paths render as empty.

## Placeholder data (foundation)

Live student/staff photos wait on the Students & Teachers module. Preview uses `SAMPLE_ID_CARD_DATA` in `src/lib/id-cards/data.ts`: school, student, staff, visitor, guardian, and `card.qrPayload`.

## Validation

Postgres `assert_valid_id_card_layout(jsonb)` and `parseIdCardLayout()` in `src/lib/id-cards/layout.ts` enforce this contract. Bump `version` and both validators together if the schema changes.
