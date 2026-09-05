import type { PostJobResult } from '@/app/post-job/actions'

export const UNCONFIRMED_POST_JOB =
  'We could not confirm whether your job was saved. Check your email for a verification link before trying again.'

function unconfirmedPostJob(): PostJobResult {
  return { success: false, error: UNCONFIRMED_POST_JOB }
}

/**
 * A response interrupted after the server action runs does not prove that the
 * job was not saved. Only render a confirmed result whose runtime shape is
 * complete, and never retry the action from here.
 */
export async function settlePostJob(
  request: () => PromiseLike<unknown>,
): Promise<PostJobResult> {
  try {
    const result = await request()
    if (!result || typeof result !== 'object' || Array.isArray(result) || !('success' in result)) {
      return unconfirmedPostJob()
    }

    if (result.success === true) {
      if (!('job_slug' in result) || typeof result.job_slug !== 'string' || !result.job_slug.trim()) {
        return unconfirmedPostJob()
      }

      return {
        success: true,
        job_slug: result.job_slug.trim(),
        ...('already_submitted' in result && typeof result.already_submitted === 'boolean'
          ? { already_submitted: result.already_submitted }
          : {}),
        ...('verify_email_sent' in result && typeof result.verify_email_sent === 'boolean'
          ? { verify_email_sent: result.verify_email_sent }
          : {}),
      }
    }

    if (result.success === false && 'error' in result &&
      typeof result.error === 'string' && result.error.trim()) {
      return { success: false, error: result.error }
    }
  } catch {
    // A transport failure can follow a successful write. Do not resend here.
  }

  return unconfirmedPostJob()
}
