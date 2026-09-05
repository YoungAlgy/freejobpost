export type EmployerLoginResult = { success: true } | { success: false; error: string }

const UNCONFIRMED_EMAIL = 'We could not confirm the email was sent. Check your inbox before trying again.'

// An interrupted response does not prove that the server did not send mail.
// Return a recoverable result without automatically repeating the request.
export async function settleEmployerLogin(
  request: () => PromiseLike<unknown>,
): Promise<EmployerLoginResult> {
  try {
    const result = await request()
    if (result && typeof result === 'object' && 'success' in result) {
      if (result.success === true) return { success: true }
      if (result.success === false && 'error' in result && typeof result.error === 'string' && result.error.trim()) {
        return { success: false, error: result.error }
      }
    }
    return { success: false, error: UNCONFIRMED_EMAIL }
  } catch {
    return {
      success: false,
      error: UNCONFIRMED_EMAIL,
    }
  }
}
