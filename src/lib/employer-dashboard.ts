type JobStatus = { status: string; expires_at: string }

/** Display only. The server remains responsible for job scope and permissions. */
export function employerJobStatus(job: JobStatus, now: number): string {
  if (job.status !== 'active' && job.status !== 'pending_review') return job.status
  const expires = Date.parse(job.expires_at)
  if (!Number.isFinite(expires)) return 'unavailable'
  return expires <= now ? 'expired' : job.status
}

export async function markJobFilled(
  archive: () => PromiseLike<unknown>,
): Promise<{ state: 'filled' | 'rejected' | 'unknown'; message: string }> {
  try {
    const result = await archive()
    if (result && typeof result === 'object' && 'success' in result) {
      if (result.success === true) {
        return { state: 'filled', message: 'Job marked filled.' }
      }
      if (result.success === false) {
        const error =
          'error' in result && typeof result.error === 'string' && result.error.trim()
            ? result.error
            : 'We could not mark this job filled. Try again.'
        return { state: 'rejected', message: error }
      }
    }
  } catch {
    // A lost response can follow a successful write. Do not invite a blind retry.
  }
  return {
    state: 'unknown',
    message: 'We could not confirm the change. Refresh this page to check the job status before trying again.',
  }
}
