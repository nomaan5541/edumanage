import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { IdCardRenderer } from '@/components/id-cards/IdCardRenderer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/lib/auth-context'
import { SAMPLE_ID_CARD_DATA } from '@/lib/id-cards/data'
import { formatIdCardError } from '@/lib/id-cards/errors'
import type { IdCardCategory, IdCardLayoutV1 } from '@/lib/id-cards/layout'
import { matchesIdCardQuery, parseIdCardLayout, previewWidthFor } from '@/lib/id-cards/layout'
import { filterIdCardStarters, ID_CARD_STARTER_COUNT, type IdCardStarter } from '@/lib/id-cards/starters'
import { supabase } from '@/lib/supabase'

interface TemplateRow {
  id: string
  name: string
  category: IdCardCategory
  description: string | null
  layout: unknown
  source_starter_key: string | null
  updated_at: string
}

type CategoryFilter = 'all' | IdCardCategory

function parsedLayout(raw: unknown): IdCardLayoutV1 | null {
  const result = parseIdCardLayout(raw)
  return result.ok && result.layout ? result.layout : null
}

async function uniqueTemplateName(schoolId: string, base: string): Promise<string> {
  const { data, error } = await supabase.from('id_card_templates').select('name').eq('school_id', schoolId)
  if (error) throw error
  const existing = new Set((data ?? []).map((row) => row.name))
  if (!existing.has(base)) return base
  let n = 2
  while (existing.has(`${base} (${n})`)) n += 1
  return `${base} (${n})`
}

export function IdCardsPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState<CategoryFilter>('all')
  const [preview, setPreview] = React.useState<{ title: string; layout: IdCardLayoutV1 } | null>(null)

  const templatesQuery = useQuery({
    queryKey: ['id-card-templates', schoolId],
    enabled: Boolean(schoolId),
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from('id_card_templates')
        .select('id, name, category, description, layout, source_starter_key, updated_at')
        .eq('school_id', schoolId as string)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as TemplateRow[]
    },
  })

  const copyStarter = useMutation({
    mutationFn: async (starter: IdCardStarter) => {
      if (!schoolId) throw new Error('No school is associated with your account yet.')
      const name = await uniqueTemplateName(schoolId, starter.name)
      const { data, error } = await supabase
        .from('id_card_templates')
        .insert({
          school_id: schoolId,
          name,
          category: starter.category,
          description: starter.description,
          layout: starter.layout as unknown as Record<string, unknown>,
          source_starter_key: starter.key,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: (id) => {
      toast.success('Starter copied into your school templates.')
      void queryClient.invalidateQueries({ queryKey: ['id-card-templates', schoolId] })
      navigate(`/admin/id-cards/${id}`)
    },
    onError: (err: unknown) => toast.error(formatIdCardError(err)),
  })

  const duplicate = useMutation({
    mutationFn: async (row: TemplateRow) => {
      if (!schoolId) throw new Error('No school is associated with your account yet.')
      const layout = parsedLayout(row.layout)
      if (!layout) throw new Error('This template has an invalid layout and cannot be duplicated.')
      const name = await uniqueTemplateName(schoolId, `${row.name} copy`)
      const { data, error } = await supabase
        .from('id_card_templates')
        .insert({
          school_id: schoolId,
          name,
          category: row.category,
          description: row.description,
          layout: layout as unknown as Record<string, unknown>,
          source_starter_key: row.source_starter_key,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: (id) => {
      toast.success('Template duplicated.')
      void queryClient.invalidateQueries({ queryKey: ['id-card-templates', schoolId] })
      navigate(`/admin/id-cards/${id}`)
    },
    onError: (err: unknown) => toast.error(formatIdCardError(err)),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('id_card_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Template deleted.')
      void queryClient.invalidateQueries({ queryKey: ['id-card-templates', schoolId] })
    },
    onError: (err: unknown) => toast.error(formatIdCardError(err)),
  })

  if (!schoolId) {
    return <p className="text-sm text-muted-foreground">No school is associated with your account yet.</p>
  }

  const starters = filterIdCardStarters(query, category)
  const schoolTemplates = (templatesQuery.data ?? []).filter((row) => matchesIdCardQuery(row, query) && (category === 'all' || row.category === category))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">ID Card Studio</h2>
          <p className="text-sm text-muted-foreground">
            {ID_CARD_STARTER_COUNT} starter templates. Copy one into your school to edit it. Preview uses placeholder
            student and staff data — live records are not bound yet.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/id-cards/new">New blank template</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search templates"
          aria-label="Search ID card templates"
          className="sm:max-w-sm"
        />
        <Tabs value={category} onValueChange={(value) => setCategory(value as CategoryFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="student">Student</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="visitor">Visitor</TabsTrigger>
            <TabsTrigger value="other">Other</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Starter templates</h3>
        {starters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No starters match this search.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {starters.map((starter) => (
              <Card key={starter.key}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{starter.name}</CardTitle>
                    <Badge variant="secondary">{starter.category}</Badge>
                  </div>
                  <CardDescription>{starter.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center overflow-x-auto">
                  <IdCardRenderer layout={starter.layout} data={SAMPLE_ID_CARD_DATA} widthPx={previewWidthFor(starter.layout, true)} />
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => copyStarter.mutate(starter)} disabled={copyStarter.isPending}>
                    Use starter
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPreview({ title: starter.name, layout: starter.layout })}>
                    Preview
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Your school templates</h3>
        {templatesQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading templates…</p> : null}
        {templatesQuery.error ? (
          <p className="text-sm text-destructive">{formatIdCardError(templatesQuery.error)}</p>
        ) : null}
        {!templatesQuery.isLoading && schoolTemplates.length === 0 ? (
          <Card>
            <CardContent className="pt-5 text-sm text-muted-foreground">
              No school templates yet. Use a starter above — that copies it into this school. Starters are not global
              database rows.
            </CardContent>
          </Card>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {schoolTemplates.map((row) => {
            const layout = parsedLayout(row.layout)
            return (
              <Card key={row.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{row.name}</CardTitle>
                    <Badge variant="outline">{row.category}</Badge>
                  </div>
                  <CardDescription>{row.description ?? 'No description'}</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center overflow-x-auto">
                  {layout ? (
                    <IdCardRenderer layout={layout} data={SAMPLE_ID_CARD_DATA} widthPx={previewWidthFor(layout, true)} />
                  ) : (
                    <p className="text-sm text-destructive">This layout failed validation.</p>
                  )}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button size="sm" asChild>
                    <Link to={`/admin/id-cards/${row.id}`}>Edit</Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => duplicate.mutate(row)} disabled={duplicate.isPending}>
                    Duplicate
                  </Button>
                  {layout ? (
                    <Button size="sm" variant="ghost" onClick={() => setPreview({ title: row.name, layout })}>
                      Preview
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm(`Delete “${row.name}”?`)) remove.mutate(row.id)
                    }}
                    disabled={remove.isPending}
                  >
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </section>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
            <DialogDescription>Placeholder data only. Photos and live student fields are not bound yet.</DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="flex justify-center overflow-x-auto py-2">
              <IdCardRenderer layout={preview.layout} data={SAMPLE_ID_CARD_DATA} widthPx={previewWidthFor(preview.layout)} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
