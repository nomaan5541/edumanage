import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { IdCardRenderer } from '@/components/id-cards/IdCardRenderer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth-context'
import { SAMPLE_ID_CARD_DATA } from '@/lib/id-cards/data'
import { formatIdCardError } from '@/lib/id-cards/errors'
import {
  BLANK_ID_CARD_LAYOUT,
  ID_CARD_CATEGORIES,
  parseIdCardLayout,
  previewWidthFor,
  type IdCardCategory,
  type IdCardLayoutV1,
} from '@/lib/id-cards/layout'
import { getIdCardStarter } from '@/lib/id-cards/starters'
import { supabase } from '@/lib/supabase'

function stringifyLayout(layout: IdCardLayoutV1) {
  return JSON.stringify(layout, null, 2)
}

interface EditorDraft {
  templateId: string | null
  name: string
  category: IdCardCategory
  description: string
  layout: IdCardLayoutV1
  sourceStarterKey: string | null
}

export function IdCardEditorPage() {
  const { templateId } = useParams()
  const [searchParams] = useSearchParams()
  const isNew = !templateId || templateId === 'new'
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null

  const existingQuery = useQuery({
    queryKey: ['id-card-template', templateId],
    enabled: Boolean(schoolId) && !isNew && Boolean(templateId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('id_card_templates')
        .select('id, name, category, description, layout, source_starter_key')
        .eq('id', templateId as string)
        .eq('school_id', schoolId as string)
        .single()
      if (error) throw error
      return data
    },
  })

  if (!schoolId) {
    return <p className="text-sm text-muted-foreground">No school is associated with your account yet.</p>
  }

  if (!isNew && existingQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading template…</p>
  }

  if (!isNew && existingQuery.error) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-destructive">{formatIdCardError(existingQuery.error)}</p>
        <Button asChild variant="outline">
          <Link to="/admin/id-cards">Back to ID cards</Link>
        </Button>
      </div>
    )
  }

  if (!isNew && existingQuery.data) {
    const parsed = parseIdCardLayout(existingQuery.data.layout)
    const draft: EditorDraft = {
      templateId: existingQuery.data.id,
      name: existingQuery.data.name,
      category: existingQuery.data.category,
      description: existingQuery.data.description ?? '',
      layout: parsed.ok ? parsed.layout : BLANK_ID_CARD_LAYOUT,
      sourceStarterKey: existingQuery.data.source_starter_key,
    }
    return <IdCardEditorForm key={draft.templateId} schoolId={schoolId} draft={draft} />
  }

  const starter = getIdCardStarter(searchParams.get('starter') ?? '')
  const draft: EditorDraft = starter
    ? {
        templateId: null,
        name: starter.name,
        category: starter.category,
        description: starter.description,
        layout: starter.layout,
        sourceStarterKey: starter.key,
      }
    : {
        templateId: null,
        name: 'Untitled template',
        category: 'student',
        description: '',
        layout: BLANK_ID_CARD_LAYOUT,
        sourceStarterKey: null,
      }

  return <IdCardEditorForm key={starter?.key ?? 'blank'} schoolId={schoolId} draft={draft} />
}

function IdCardEditorForm({ schoolId, draft }: { schoolId: string; draft: EditorDraft }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isNew = !draft.templateId
  const [name, setName] = React.useState(draft.name)
  const [category, setCategory] = React.useState<IdCardCategory>(draft.category)
  const [description, setDescription] = React.useState(draft.description)
  const [layoutText, setLayoutText] = React.useState(() => stringifyLayout(draft.layout))
  const sourceStarterKey = draft.sourceStarterKey

  const parsed = React.useMemo(() => {
    try {
      return parseIdCardLayout(JSON.parse(layoutText) as unknown)
    } catch {
      return { ok: false as const, error: 'Layout JSON is not valid.' }
    }
  }, [layoutText])

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.ok) throw new Error(parsed.error)
      const trimmedName = name.trim()
      if (!trimmedName) throw new Error('Name is required.')
      const payload = {
        name: trimmedName,
        category,
        description: description.trim() || null,
        layout: parsed.layout as unknown as Record<string, unknown>,
        source_starter_key: sourceStarterKey,
      }
      if (isNew) {
        const { data, error } = await supabase
          .from('id_card_templates')
          .insert({ ...payload, school_id: schoolId })
          .select('id')
          .single()
        if (error) throw error
        return data.id
      }
      const { error } = await supabase.from('id_card_templates').update(payload).eq('id', draft.templateId as string)
      if (error) throw error
      return draft.templateId as string
    },
    onSuccess: (id) => {
      toast.success(isNew ? 'Template created.' : 'Template saved.')
      void queryClient.invalidateQueries({ queryKey: ['id-card-templates', schoolId] })
      void queryClient.invalidateQueries({ queryKey: ['id-card-template', id] })
      if (isNew) navigate(`/admin/id-cards/${id}`, { replace: true })
    },
    onError: (err: unknown) => toast.error(formatIdCardError(err)),
  })

  const layout = parsed.ok ? parsed.layout : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{isNew ? 'New ID card template' : 'Edit ID card template'}</h2>
          <p className="text-sm text-muted-foreground">
            Preview uses placeholder data. Live student photos wait on the Students module.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/id-cards">Back</Link>
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
            <CardDescription>Name and category are stored on the school-scoped template row.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-name">Name</Label>
              <Input id="template-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-category">Category</Label>
              <select
                id="template-category"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={category}
                onChange={(event) => setCategory(event.target.value as IdCardCategory)}
              >
                {ID_CARD_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-description">Description</Label>
              <Input
                id="template-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            {layout ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="template-background">Background color</Label>
                <Input
                  id="template-background"
                  type="color"
                  value={layout.canvas.background.color.length === 7 ? layout.canvas.background.color : '#ffffff'}
                  onChange={(event) => {
                    const next = {
                      ...layout,
                      canvas: {
                        ...layout.canvas,
                        background: { ...layout.canvas.background, color: event.target.value },
                      },
                    }
                    setLayoutText(stringifyLayout(next))
                  }}
                  className="h-9 w-16 cursor-pointer p-1"
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-layout">Layout JSON (v1)</Label>
              <Textarea
                id="template-layout"
                value={layoutText}
                onChange={(event) => setLayoutText(event.target.value)}
                className="min-h-64 font-mono text-xs"
                spellCheck={false}
              />
              {parsed.ok ? (
                <p className="text-xs text-muted-foreground">Layout is valid.</p>
              ) : (
                <p className="text-xs text-destructive">{parsed.error}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>Placeholder fields only.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center overflow-x-auto">
            {layout ? (
              <IdCardRenderer layout={layout} data={SAMPLE_ID_CARD_DATA} widthPx={previewWidthFor(layout)} />
            ) : (
              <p className="text-sm text-muted-foreground">Fix the layout JSON to see a preview.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
