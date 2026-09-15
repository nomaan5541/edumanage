import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

interface SubAdminRow {
  userRoleId: string
  userId: string
  isActive: boolean
  fullName: string | null
  email: string | null
}

interface PermissionRow {
  key: string
  module: string
  description: string
}

async function fetchSubAdmins(schoolId: string): Promise<SubAdminRow[]> {
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('id, user_id, is_active')
    .eq('school_id', schoolId)
    .eq('role', 'sub_admin')
  if (rolesError) throw rolesError
  if (roles.length === 0) return []

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in(
      'id',
      roles.map((r) => r.user_id),
    )
  if (profilesError) throw profilesError

  const profileById = new Map(profiles.map((p) => [p.id, p]))
  return roles.map((r) => ({
    userRoleId: r.id,
    userId: r.user_id,
    isActive: r.is_active,
    fullName: profileById.get(r.user_id)?.full_name ?? null,
    email: profileById.get(r.user_id)?.email ?? null,
  }))
}

async function fetchPermissions(): Promise<PermissionRow[]> {
  const { data, error } = await supabase.from('permissions').select('key, module, description').order('module')
  if (error) throw error
  return data
}

async function fetchGrantedKeys(schoolId: string, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
  if (error) throw error
  return new Set(data.filter((row) => row.granted).map((row) => row.permission_key))
}

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  full_name: z.string().optional(),
})
type InviteValues = z.infer<typeof inviteSchema>

export function SubAdminsPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [editingUserId, setEditingUserId] = React.useState<string | null>(null)

  const { data: subAdmins, isLoading } = useQuery({
    queryKey: ['sub-admins', schoolId],
    queryFn: () => fetchSubAdmins(schoolId as string),
    enabled: !!schoolId,
  })

  const { data: permissions } = useQuery({ queryKey: ['permissions'], queryFn: fetchPermissions })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema) })

  const invite = useMutation({
    mutationFn: async (values: InviteValues) => {
      const { error } = await supabase.functions.invoke('invite-school-sub-admin', {
        body: { school_id: schoolId, email: values.email, full_name: values.full_name },
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Sub-Admin invited.')
      setInviteOpen(false)
      reset()
      void queryClient.invalidateQueries({ queryKey: ['sub-admins', schoolId] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to invite Sub-Admin.'),
  })

  if (!schoolId) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>New Sub-Admin</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a Sub-Admin</DialogTitle>
              <DialogDescription>
                They'll receive an email invite. Grant specific permissions after they're created.
              </DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit((v) => invite.mutate(v))} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" {...register('full_name')} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={invite.isPending}>
                  {invite.isPending ? 'Inviting…' : 'Send invite'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && subAdmins?.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            No Sub-Admins yet. Invite one to delegate specific permissions.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {subAdmins?.map((sa) => (
          <Card key={sa.userRoleId}>
            <CardHeader>
              <CardTitle className="text-base">{sa.fullName || sa.email || 'Sub-Admin'}</CardTitle>
              <CardDescription>{sa.email}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => setEditingUserId(sa.userId)}>
                Manage permissions
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {editingUserId ? (
        <PermissionsDialog
          schoolId={schoolId}
          userId={editingUserId}
          permissions={permissions ?? []}
          onClose={() => setEditingUserId(null)}
        />
      ) : null}
    </div>
  )
}

function PermissionsDialog({
  schoolId,
  userId,
  permissions,
  onClose,
}: {
  schoolId: string
  userId: string
  permissions: PermissionRow[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data: granted } = useQuery({
    queryKey: ['role-permissions', schoolId, userId],
    queryFn: () => fetchGrantedKeys(schoolId, userId),
  })

  const toggle = useMutation({
    mutationFn: async ({ key, next }: { key: string; next: boolean }) => {
      if (next) {
        const { error } = await supabase
          .from('role_permissions')
          .upsert(
            { school_id: schoolId, user_id: userId, permission_key: key, granted: true },
            { onConflict: 'user_id,school_id,permission_key' },
          )
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('role_permissions')
          .update({ granted: false })
          .eq('school_id', schoolId)
          .eq('user_id', userId)
          .eq('permission_key', key)
        if (error) throw error
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['role-permissions', schoolId, userId] }),
    onError: (err: Error) => toast.error(err.message || 'Failed to update permission.'),
  })

  const grouped = React.useMemo(() => {
    const byModule = new Map<string, PermissionRow[]>()
    for (const p of permissions) {
      const list = byModule.get(p.module) ?? []
      list.push(p)
      byModule.set(p.module, list)
    }
    return byModule
  }, [permissions])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sub-Admin permissions</DialogTitle>
          <DialogDescription>
            Only checked permissions are granted. Everything else stays denied by default.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {Array.from(grouped.entries()).map(([module, perms]) => (
            <div key={module}>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{module}</p>
              <div className="flex flex-col gap-2">
                {perms.map((p) => {
                  const isGranted = granted?.has(p.key) ?? false
                  return (
                    <label key={p.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isGranted}
                        disabled={toggle.isPending}
                        onChange={() => toggle.mutate({ key: p.key, next: !isGranted })}
                      />
                      <span>{p.description}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
