import {
  FREEJOBPOST_SUPPORT_EMAIL_BINDING,
  requireFreeJobPostOwnedEmail,
} from '../../supabase/functions/_shared/freejobpost-email'

export {
  FREEJOBPOST_SUPPORT_EMAIL_BINDING,
  requireFreeJobPostOwnedEmail,
}

export const FREEJOBPOST_SUPPORT_EMAIL = requireFreeJobPostOwnedEmail(
  process.env.NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL,
  FREEJOBPOST_SUPPORT_EMAIL_BINDING,
)
