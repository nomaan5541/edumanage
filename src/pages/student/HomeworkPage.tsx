import { useMutation, useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type HomeworkRow = Database['public']['Tables']['homework']['Row']
type MaterialRow = Database['public']['Tables']['study_materials']['Row']

function useOwnSchoolId() {
  const { primaryRole } = useAuth()
  return primaryRole?.schoolId ?? null
}

export function StudentHomeworkPage() {
  const schoolId = useOwnSchoolId()
  if (!schoolId) return null

  return (
    <Tabs defaultValue="homework">
      <TabsList>
        <TabsTrigger value="homework">Homework</TabsTrigger>
        <TabsTrigger value="materials">Study Materials</TabsTrigger>
      </TabsList>
      <TabsContent value="homework">
        <HomeworkList schoolId={schoolId} />
      </TabsContent>
      <TabsContent value="materials">
        <MaterialsList schoolId={schoolId} />
      </TabsContent>
    </Tabs>
  )
}

function HomeworkList({ schoolId }: { schoolId: string }) {
  const { data: homework, isLoading } = useQuery({
    queryKey: ['homework', schoolId],
    queryFn: async (): Promise<HomeworkRow[]> => {
      const { data, error } = await supabase
        .from('homework')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  return (
    <div className="flex flex-col gap-3 pt-4">
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && homework?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No homework posted yet.</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {homework?.map((h) => (
          <Card key={h.id}>
            <CardHeader>
              <CardTitle className="text-base">{h.title}</CardTitle>
              <CardDescription>{h.due_date ? `Due ${h.due_date}` : 'No due date'}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              {h.description}
              {h.attachment_url ? (
                <a href={h.attachment_url} target="_blank" rel="noreferrer" className="text-primary underline">
                  Open attachment
                </a>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function MaterialsList({ schoolId }: { schoolId: string }) {
  const { data: materials, isLoading } = useQuery({
    queryKey: ['study-materials', schoolId],
    queryFn: async (): Promise<MaterialRow[]> => {
      const { data, error } = await supabase
        .from('study_materials')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const download = useMutation({
    mutationFn: async (path: string) => {
      const { data, error } = await supabase.storage.from('study-materials').createSignedUrl(path, 60)
      if (error) throw error
      return data.signedUrl
    },
    onSuccess: (url) => window.open(url, '_blank'),
  })

  return (
    <div className="flex flex-col gap-2 pt-4">
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && materials?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No study materials uploaded yet.</p>
      ) : null}
      {materials?.map((m) => (
        <Card key={m.id}>
          <CardContent className="flex items-center justify-between pt-5 text-sm">
            <span>{m.title}</span>
            <Button variant="outline" size="sm" onClick={() => download.mutate(m.storage_path)}>
              Download
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
