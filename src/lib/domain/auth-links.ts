/**
 * Why a link from an email did not sign somebody in, in words they can act on.
 *
 * The reason travels as one short token in the query string — never the auth
 * service's own English sentence, which can name internals and changes without
 * notice. Pure: the routes decide what happened, this decides what to say.
 */
export type LinkFailure = 'expired' | 'used' | 'unknown';

export const LINK_FAILURE_MESSAGE: Record<LinkFailure, string> = {
  expired: 'הקישור פג תוקף או שכבר נעשה בו שימוש. אפשר לבקש קישור חדש.',
  // A PKCE exchange with no verifier: opened somewhere other than where it
  // started. Saying "on the same device" is the only useful instruction.
  used: 'צריך לפתוח את הקישור באותו דפדפן שבו נרשמתם. אפשר גם פשוט להתחבר עם האימייל והסיסמה.',
  unknown: 'לא הצלחנו להשלים את הפעולה מהקישור. נסו להתחבר, או לבקש קישור חדש.',
};

/** Whether a value from a query string is a reason we know how to explain. */
export function isLinkFailure(value: unknown): value is LinkFailure {
  return value === 'expired' || value === 'used' || value === 'unknown';
}
