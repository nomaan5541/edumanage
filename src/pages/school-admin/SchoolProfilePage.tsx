import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  name: z.string().min(2, 'School name is required.'),
  legal_name: z.string().optional(),
  address: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email address.').optional().or(z.literal('')),
  website: z.string().optional(),
  principal_name: z.string().optional(),
  board: z.string().optional(),
})
type Values = z.infer<typeof schema>

async function fetchSchool(schoolId: string) {
  const { data, error } = await supabase
    .from('schools')
    .select('name, legal_name, address, district, state, phone, email, website, principal_name, board, school_code')
    .eq('id', schoolId)
    .single()
  if (error) throw error
  return data
}

export function SchoolProfilePage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()

  const { data: school, isLoading } = useQuery({
    queryKey: ['school-profile', schoolId],
    queryFn: () => fetchSchool(schoolId as string),
    enabled: !!schoolId,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (school) {
      reset({
        name: school.name,
        legal_name: school.legal_name ?? '',
        address: school.address ?? '',
        district: school.district ?? '',
        state: school.state ?? '',
        phone: school.phone ?? '',
        email: school.email ?? '',
        website: school.website ?? '',
        principal_name: school.principal_name ?? '',
        board: school.board ?? '',
      })
    }
  }, [school, reset])

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const { error } = await supabase
        .from('schools')
        .update({ ...values, email: values.email || null })
        .eq('id', schoolId as string)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('School profile updated.')
      void queryClient.invalidateQueries({ queryKey: ['school-profile', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update school profile.'),
  })

  if (!schoolId) return null
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>School profile</CardTitle>
        <CardDescription>School code: {school?.school_code} (fixed - contact Super Admin to change it)</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="name">School name</Label>
            <Input id="name" {...register('name')} />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="legal_name">Legal name</Label>
            <Input id="legal_name" {...register('legal_name')} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" {...register('address')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="district">District</Label>
            <Input id="district" {...register('district')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="state">State</Label>
            <Input id="state" {...register('state')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" {...register('phone')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="website">Website</Label>
            <Input id="website" {...register('website')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="board">Board</Label>
            <Input id="board" placeholder="e.g. Telangana SSC" {...register('board')} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="principal_name">Principal name</Label>
            <Input id="principal_name" {...register('principal_name')} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
