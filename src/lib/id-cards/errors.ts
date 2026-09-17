export function formatIdCardError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Something went wrong.'
  if (/row-level security/i.test(message)) {
    return 'You do not have permission to perform this action.'
  }
  if (/read-only mode/i.test(message) || /is_school_read_only/i.test(message)) {
    return 'School is in read-only mode. Subscription renewal is required to make changes.'
  }
  if (/id_card_templates_school_name_key/i.test(message) || /duplicate key value/i.test(message)) {
    return 'A template with this name already exists.'
  }
  if (/school_id cannot be changed/i.test(message)) {
    return 'This resource is not available.'
  }
  if (/ID card layout/i.test(message) || /component /i.test(message)) {
    return message
  }
  if (/violates|postgres|sqlstate/i.test(message)) {
    return 'Could not save the template. Check the name and layout, then try again.'
  }
  return message
}
