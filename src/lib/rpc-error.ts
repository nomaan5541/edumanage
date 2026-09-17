export function rpcErrorMessage(err: unknown, fallback = 'Something went wrong.') {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const message = raw.replace(/^ERROR:\s*/i, '').split('\n')[0]?.trim() ?? ''
  if (!message) return fallback
  if (message.includes('Admission number already exists')) return 'Admission number already exists.'
  if (message.includes('active on another device')) {
    return 'Your teacher account is active on another device.'
  }
  if (message.includes('read-only mode')) {
    return 'School is in read-only mode. Subscription renewal is required to make changes.'
  }
  if (message.includes('do not have permission')) {
    return 'You do not have permission to perform this action.'
  }
  if (message.includes('not available')) return 'This resource is not available.'
  return message
}
