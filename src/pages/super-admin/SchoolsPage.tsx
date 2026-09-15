import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import type { SchoolStatus } from '@/types/database'

interface SchoolRow {
  id: string
  name: string
  school_code: string
  district: string | null
  status: SchoolStatus
}

async function fetchSchools(): Promise<SchoolRow[]> {
  const { data, error } = await supabase
    .from('schools')
    .select('id, name, school_code, district, status')
    .order('name')
  if (error) throw error
  return data
}

const createSchoolSchema = z.object({
  name: z.string().min(2, 'School name is required.'),
  school_code: z
    .string()
    .min(2, 'School code is required.')
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, and hyphens only.'),
  district: z.string().optional(),
  admin_email: z.string().email('Enter a valid email address.'),
  admin_full_name: z.string().optional(),
})

type CreateSchoolValues = z.infer<typeof createSchoolSchema>

function statusVariant(status: SchoolStatus) {
  if (status === 'active') return 'success' as const
  if (status === 'suspended') return 'warning' as const
  return 'destructive' as const
}

export function SchoolsPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const { data: schools, isLoading, error } = useQuery({ queryKey: ['schools'], queryFn: fetchSchools })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateSchoolValues>({ resolver: zodResolver(createSchoolSchema) })

  const createSchool = useMutation({
    mutationFn: async (values: CreateSchoolValues) => {
      const { data, error: invokeError } = await supabase.functions.invoke('create-school-admin', {
        body: {
          school: { name: values.name, school_code: values.school_code, district: values.district },
          admin: { email: values.admin_email, full_name: values.admin_full_name },
        },
      })
      if (invokeError) throw invokeError
      return data
    },
    onSuccess: () => {
      toast.success('School created. The School Admin will receive an invite email.')
      setOpen(false)
      reset()
      void queryClient.invalidateQueries({ queryKey: ['schools'] })
      void queryClient.invalidateQueries({ queryKey: ['school-counts'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create school.')
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>New School</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new school</DialogTitle>
              <DialogDescription>
                This creates the school and invites its first School Admin by email (Rule 0.8 — Super Admin
                creates School + School Admin only).
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-4"
              onSubmit={handleSubmit((values) => createSchool.mutate(values))}
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">School name</Label>
                <Input id="name" {...register('name')} />
                {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="school_code">School code</Label>
                <Input id="school_code" placeholder="e.g. HYD-001" {...register('school_code')} />
                {errors.school_code ? (
                  <p className="text-xs text-destructive">{errors.school_code.message}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="district">District</Label>
                <Input id="district" {...register('district')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="admin_email">School Admin email</Label>
                <Input id="admin_email" type="email" {...register('admin_email')} />
                {errors.admin_email ? (
                  <p className="text-xs text-destructive">{errors.admin_email.message}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="admin_full_name">School Admin name</Label>
                <Input id="admin_full_name" {...register('admin_full_name')} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createSchool.isPending}>
                  {createSchool.isPending ? 'Creating…' : 'Create school'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error ? <p className="text-sm text-destructive">Failed to load schools: {(error as Error).message}</p> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading schools…</p> : null}
      {!isLoading && schools?.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            No schools yet. Create your first school to get started.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {schools?.map((school) => (
          <Card key={school.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{school.name}</CardTitle>
                <Badge variant={statusVariant(school.status)}>{school.status}</Badge>
              </div>
              <CardDescription>{school.school_code}</CardDescription>
            </CardHeader>
            <CardFooter className="text-sm text-muted-foreground">{school.district ?? '—'}</CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
