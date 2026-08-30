export const FREEJOBPOST_FROM_EMAIL_BINDING = "FREEJOBPOST_FROM_EMAIL";
export const FREEJOBPOST_REPLY_TO_EMAIL_BINDING = "FREEJOBPOST_REPLY_TO_EMAIL";
export const FREEJOBPOST_SUPPORT_EMAIL_BINDING = "NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL";

type ReadEnvironment = (name: string) => string | undefined;

const LOCAL_PART_RE =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;

function isFreeJobPostDomain(domain: string): boolean {
  return domain === "freejobpost.co";
}

export function requireFreeJobPostOwnedEmail(
  value: string | undefined,
  bindingName: string,
): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  const at = normalized.lastIndexOf("@");
  const localPart = at > 0 ? normalized.slice(0, at) : "";
  const domain = at > 0 ? normalized.slice(at + 1) : "";
  if (
    !normalized ||
    normalized.length > 254 ||
    localPart.length > 64 ||
    !LOCAL_PART_RE.test(localPart) ||
    !isFreeJobPostDomain(domain)
  ) {
    throw new Error(
      `${bindingName} must be a monitored email address on freejobpost.co.`,
    );
  }
  return normalized;
}

export function readFreeJobPostEmailConfig(readEnvironment: ReadEnvironment): {
  fromEmail: string;
  replyToEmail: string;
} {
  return {
    fromEmail: requireFreeJobPostOwnedEmail(
      readEnvironment(FREEJOBPOST_FROM_EMAIL_BINDING),
      FREEJOBPOST_FROM_EMAIL_BINDING,
    ),
    replyToEmail: requireFreeJobPostOwnedEmail(
      readEnvironment(FREEJOBPOST_REPLY_TO_EMAIL_BINDING),
      FREEJOBPOST_REPLY_TO_EMAIL_BINDING,
    ),
  };
}
