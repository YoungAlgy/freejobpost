export type ApplicationResult =
  | { state: 'submitted'; notificationReported: boolean }
  | { state: 'rejected' | 'unknown'; error: string }

const UNKNOWN_APPLICATION = 'We could not confirm whether your application was saved. It may already have reached the employer. Check your email before trying again. Sending again could create a duplicate.'

/** A saved application remains successful even when best-effort email fails. */
export async function settleApplication(
  request: () => PromiseLike<unknown>,
): Promise<ApplicationResult> {
  try {
    const result = await request()
    if (result && typeof result === 'object' && 'success' in result) {
      if (result.success === true) {
        return {
          state: 'submitted',
          notificationReported: 'emails_sent' in result &&
            typeof result.emails_sent === 'number' &&
            Number.isFinite(result.emails_sent) && result.emails_sent > 0,
        }
      }
      if (result.success === false && 'error' in result &&
        typeof result.error === 'string' && result.error.trim()) {
        return { state: 'rejected', error: result.error }
      }
    }
  } catch {
    // A transport failure can follow a successful write. Never resend here.
  }
  return { state: 'unknown', error: UNKNOWN_APPLICATION }
}
