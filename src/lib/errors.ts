/**
 * Database functions raise stable machine codes. Everything the user sees is
 * translated here — raw Postgres/PostgREST errors are never surfaced.
 */
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'צריך להתחבר כדי לבצע את הפעולה',
  NOT_AUTHORIZED: 'אין לך הרשאה לבצע פעולה זו',
  TABLE_NOT_FOUND: 'קוד השולחן לא נמצא',
  TABLE_CLOSED: 'השולחן כבר לא פתוח להצטרפות',
  PLAYER_NOT_FOUND: 'השחקן לא נמצא',
  PLAYER_NOT_ACTIVE: 'השחקן אינו פעיל בשולחן',
  PLAYER_HAS_TRANSACTIONS: 'לא ניתן להסיר שחקן שכבר נכנס למשחק',
  NAME_TAKEN: 'השם הזה כבר תפוס בשולחן, בחרו שם אחר',
  INVALID_NAME: 'צריך להזין שם תקין',
  MAX_BUYINS_REACHED: 'הגעת למספר הכניסות המקסימלי',
  REQUEST_ALREADY_HANDLED: 'הבקשה כבר טופלה',
  REQUEST_NOT_FOUND: 'הבקשה לא נמצאה',
  TRANSACTION_NOT_FOUND: 'הכניסה לא נמצאה',
  ALREADY_REVERSED: 'הכניסה כבר בוטלה',
  GAME_LOCKED: 'המשחק כבר נסגר לשינויים',
  INVALID_STATUS: 'לא ניתן לבצע את הפעולה בשלב הנוכחי של המשחק',
  INVALID_TRANSITION: 'לא ניתן לעבור לשלב הזה מהמצב הנוכחי',
  ALREADY_COMPLETED: 'המשחק כבר הסתיים',
  MISSING_CHIP_COUNTS: 'לא ניתן לסיים את המשחק לפני שכל השחקנים הזינו ספירה',
  CHIP_MISMATCH: 'יש חוסר התאמה בספירת הז׳יטונים',
  INVALID_SETTLEMENT: 'חישוב ההתחשבנות לא תקין, נסו שוב',
  MAX_BELOW_ISSUED: 'לא ניתן להגדיר מקסימום כניסות נמוך ממה שכבר חולק',
  REASON_REQUIRED: 'צריך לציין סיבה לתיקון',
  CODE_GENERATION_FAILED: 'שגיאה ביצירת קוד השולחן, נסו שוב',
  INVALID_INPUT: 'חלק מהפרטים שהוזנו אינם תקינים',
  NOT_FOUND: 'הפריט המבוקש לא נמצא',
  ANONYMOUS_DISABLED: 'הצטרפות כאורח אינה זמינה כרגע. נסו להתחבר עם חשבון.',
  RPC_BAD_SHAPE: 'קיבלנו תשובה לא צפויה מהשרת. נסו שוב בעוד רגע.',
  TABLE_NOT_READABLE: 'השולחן נוצר אך אינו נגיש כרגע. רעננו את הדף ובדקו ב״השולחנות שלי״.',
  GAME_ALREADY_STARTED: 'לא ניתן למחוק שולחן אחרי שהמשחק התחיל',
  PROFILE_PRIVATE: 'השחקן בחר להסתיר את הפרופיל שלו',
  ALREADY_LEFT: 'כבר עזבת את השולחן',
  PLAYER_HAS_LEFT: 'השחקן כבר עזב את השולחן',
  IMAGE_PROCESSING_FAILED: 'לא הצלחנו לעבד את התמונה. נסו לבחור תמונה אחרת מהגלריה.',
  INVALID_CHIP_COUNT: 'יש להזין מספר ז׳יטונים שלם, אפס או יותר',
  NOT_A_TABLE_MEMBER: 'אינך משתתף בשולחן הזה',
  SCHEMA_OUT_OF_DATE: 'הפעולה אינה זמינה כרגע. נסו שוב מאוחר יותר.',

  // Friendships. Each refusal names its own cause, so a failure is legible in
  // the server log without guessing which of several rules said no.
  CANNOT_FRIEND_SELF: 'אי אפשר לשלוח בקשת חברות לעצמך',
  ALREADY_FRIENDS: 'אתם כבר חברים',
  REQUEST_ALREADY_SENT: 'כבר שלחתם בקשת חברות לשחקן הזה',
  FRIEND_REQUEST_NOT_FOUND: 'בקשת החברות לא נמצאה',
  NOT_FRIENDS: 'אתם לא חברים',
  GUEST_CANNOT_FRIEND: 'חברויות זמינות רק לחשבונות רשומים',

  // Blind levels.
  INVALID_BLIND_STRUCTURE: 'מבנה הבליינדים אינו תקין. בדקו את הסכומים ואת משך השלבים.',
  BLIND_TIMER_NOT_RUNNING: 'טיימר הבליינדים אינו פעיל בשולחן הזה',
  NO_SUCH_BLIND_LEVEL: 'אין שלב בליינדים נוסף בכיוון הזה',
  TARGET_IS_GUEST: 'אפשר להוסיף כחברים רק חשבונות רשומים',

  // Accounts: signing up, signing in, confirming an address, resetting a
  // password. Supabase answers with a stable machine code (`user_already_exists`,
  // `weak_password`, …); `authErrorCode` below turns one into one of these.
  //
  // Three of them deliberately read the same as the generic failure. A signup
  // that fails because a trigger raised, because the confirmation email could
  // not be sent, or because the auth service itself is unwell, is nothing the
  // person filling in the form can act on and nothing they should be told the
  // internals of — but the *code* is precise, so the server log names the cause
  // even though the screen does not.
  EMAIL_TAKEN: 'כבר קיים חשבון עם כתובת האימייל הזו',
  BAD_EMAIL: 'כתובת האימייל אינה תקינה',
  BAD_CREDENTIALS: 'האימייל או הסיסמה שגויים',
  WEAK_PASSWORD: 'הסיסמה חלשה מדי — לפחות 8 תווים',
  SHORT_PASSWORD: 'הסיסמה קצרה מדי — לפחות 8 תווים',
  SAME_PASSWORD: 'הסיסמה החדשה זהה לסיסמה הנוכחית',
  TOO_MANY_ATTEMPTS: 'בוצעו יותר מדי ניסיונות. נסו שוב בעוד מספר דקות',
  EMAIL_NOT_CONFIRMED: 'צריך לאשר את כתובת האימייל לפני ההתחברות. בדקו את תיבת הדואר.',
  SIGNUP_DISABLED: 'ההרשמה סגורה כרגע. נסו שוב מאוחר יותר.',
  EMAIL_SIGNUP_DISABLED: 'הרשמה עם אימייל אינה זמינה כרגע',
  CAPTCHA_FAILED: 'אימות האבטחה נכשל. רעננו את הדף ונסו שוב.',
  USER_BANNED: 'החשבון הזה חסום',
  LINK_EXPIRED: 'הקישור פג תוקף. בקשו קישור חדש.',
  NETWORK_ERROR: 'אין חיבור לשרת כרגע. בדקו את החיבור לאינטרנט ונסו שוב.',
  SIGNUP_DB_ERROR: 'משהו השתבש. נסו שוב בעוד רגע.',
  EMAIL_SEND_FAILED: 'משהו השתבש. נסו שוב בעוד רגע.',
  AUTH_SERVER_ERROR: 'משהו השתבש. נסו שוב בעוד רגע.',

  // Leaving a table. Each has its own code so a failure names its own cause in
  // the server log; the Hebrew stays plain and free of internals.
  LEAVE_UNAUTHORIZED: 'אין לך הרשאה לעזוב עבור שחקן אחר',
  LEAVE_PLAYER_NOT_FOUND: 'לא מצאנו את הכיסא שלך בשולחן הזה',
  LEAVE_ALREADY_LEFT: 'כבר עזבת את השולחן',
  LEAVE_TABLE_NOT_ACTIVE: 'לא ניתן לעזוב את השולחן בשלב הנוכחי של המשחק',
  LEAVE_INVALID_STATE: 'הכיסא שלך אינו פעיל בשולחן הזה',
  LEAVE_INVALID_CHIPS: 'יש להזין מספר ז׳יטונים שלם, אפס או יותר',
};

export const GENERIC_ERROR = 'משהו השתבש. נסו שוב בעוד רגע.';

export class AppError extends Error {
  readonly code: string;
  /**
   * Developer-facing context. Logged on the server, never shown to the user —
   * `message` stays the Hebrew string the UI renders.
   */
  readonly detail?: string;

  constructor(code: string, message?: string, detail?: string) {
    super(message ?? MESSAGES[code] ?? GENERIC_ERROR);
    this.code = code;
    this.detail = detail;
    this.name = 'AppError';
  }
}

/**
 * What a Supabase auth failure looks like once it has crossed the SDK.
 *
 * Two shapes reach us, and the difference decides how much we know:
 *
 *   · `AuthApiError` — anything GoTrue answered with a 4xx. It carries a
 *     stable machine `code` such as `user_already_exists`, which is what this
 *     module keys off: the human `message` beside it is English prose that
 *     Supabase is free to reword, and keying off prose is how a mapping quietly
 *     stops working after somebody else's release.
 *
 *   · `AuthRetryableFetchError` — every 5xx, and a failure to reach the service
 *     at all. The SDK throws this *without a code* (see auth-js `handleError`:
 *     any status in 500…530 short-circuits before the code is read), so a
 *     signup that failed because a database trigger raised arrives carrying
 *     nothing but the sentence "Database error saving new user" and status 500.
 *     Those are matched on status and message below, because there is nothing
 *     else to match on.
 */
interface AuthErrorLike {
  name?: string;
  status?: number;
  code?: string;
  message: string;
  /** Present on AuthWeakPasswordError: why the project refused the password. */
  reasons?: string[];
}

function asAuthError(error: unknown): AuthErrorLike | null {
  if (typeof error !== 'object' || error === null) return null;
  const e = error as Record<string, unknown> & { message?: unknown };
  const isAuth =
    e.__isAuthError === true ||
    (typeof e.name === 'string' && e.name.startsWith('Auth') && typeof e.status === 'number');
  if (!isAuth || typeof e.message !== 'string') return null;
  return {
    name: typeof e.name === 'string' ? e.name : undefined,
    status: typeof e.status === 'number' ? e.status : undefined,
    code: typeof e.code === 'string' ? e.code : undefined,
    message: e.message,
    reasons: Array.isArray(e.reasons) ? e.reasons.filter((r): r is string => typeof r === 'string') : undefined,
  };
}

/** GoTrue's machine codes, which are stable in a way its prose is not. */
const AUTH_CODES: Record<string, string> = {
  user_already_exists: 'EMAIL_TAKEN',
  email_exists: 'EMAIL_TAKEN',
  identity_already_exists: 'EMAIL_TAKEN',
  email_address_invalid: 'BAD_EMAIL',
  email_address_not_authorized: 'BAD_EMAIL',
  weak_password: 'WEAK_PASSWORD',
  same_password: 'SAME_PASSWORD',
  invalid_credentials: 'BAD_CREDENTIALS',
  email_not_confirmed: 'EMAIL_NOT_CONFIRMED',
  signup_disabled: 'SIGNUP_DISABLED',
  email_provider_disabled: 'EMAIL_SIGNUP_DISABLED',
  provider_disabled: 'EMAIL_SIGNUP_DISABLED',
  anonymous_provider_disabled: 'ANONYMOUS_DISABLED',
  captcha_failed: 'CAPTCHA_FAILED',
  user_banned: 'USER_BANNED',
  over_email_send_rate_limit: 'TOO_MANY_ATTEMPTS',
  over_request_rate_limit: 'TOO_MANY_ATTEMPTS',
  over_sms_send_rate_limit: 'TOO_MANY_ATTEMPTS',
  otp_expired: 'LINK_EXPIRED',
  flow_state_expired: 'LINK_EXPIRED',
  flow_state_not_found: 'LINK_EXPIRED',
  bad_code_verifier: 'LINK_EXPIRED',
  validation_failed: 'INVALID_INPUT',
};

/**
 * One auth failure to one of our codes.
 *
 * Returns null when the error is not an auth error at all, so the ordinary
 * database mapping below keeps its behaviour unchanged.
 */
export function authErrorCode(error: unknown): string | null {
  const auth = asAuthError(error);
  if (!auth) return null;

  const mapped = auth.code ? AUTH_CODES[auth.code] : undefined;
  // `validation_failed` covers several fields; the message says which.
  if (mapped === 'INVALID_INPUT') {
    return /email/i.test(auth.message) ? 'BAD_EMAIL' : 'INVALID_INPUT';
  }
  if (mapped) return mapped;

  // Reaching the service failed outright: auth-js reports status 0 for a
  // network error, which is the one case the person *can* act on.
  if (auth.status === 0 || /fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(auth.message)) {
    return 'NETWORK_ERROR';
  }
  if (auth.status === 429) return 'TOO_MANY_ATTEMPTS';

  // The codeless 5xx family. Each keeps the generic Hebrew message and gains a
  // precise code, so the cause is named in the log without being shown.
  if ((auth.status ?? 0) >= 500) {
    if (/database error/i.test(auth.message)) return 'SIGNUP_DB_ERROR';
    if (/(sending|send).*(email|mail)|email.*(not sent|failed)/i.test(auth.message)) {
      return 'EMAIL_SEND_FAILED';
    }
    return 'AUTH_SERVER_ERROR';
  }
  return null;
}

/** A Zod failure, recognised without importing zod into this module. */
function isZodError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ((error as { name?: unknown }).name === 'ZodError' ||
      Array.isArray((error as { issues?: unknown }).issues))
  );
}

/** Maps any thrown value / Supabase error into a Hebrew, user-safe message. */
export function toHebrewError(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };

  // Supabase auth failures first: they carry a machine code, and matching it
  // beats guessing at the English sentence beside it.
  const authCode = authErrorCode(error);
  if (authCode) return { code: authCode, message: MESSAGES[authCode] ?? GENERIC_ERROR };

  // A rejected field is an expected outcome, not an unexpected failure. Zod
  // reports one by throwing, and its `message` is a JSON dump of the issues —
  // which matched none of the patterns below and so reached the user as
  // "something went wrong" for something as ordinary as a mistyped address.
  if (isZodError(error)) return { code: 'INVALID_INPUT', message: MESSAGES.INVALID_INPUT! };

  const raw =
    typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';

  // Postgres raise exception messages come through verbatim.
  const token = raw.trim().split(/\s+/)[0]?.replace(/[^A-Z_]/g, '') ?? '';
  if (token && MESSAGES[token]) return { code: token, message: MESSAGES[token]! };

  // Common Supabase auth / constraint messages.
  if (/anonymous.*(disabled|not enabled)/i.test(raw)) {
    return { code: 'ANONYMOUS_DISABLED', message: MESSAGES.ANONYMOUS_DISABLED! };
  }
  if (/table_players_name_uniq/i.test(raw)) {
    return { code: 'NAME_TAKEN', message: MESSAGES.NAME_TAKEN! };
  }
  // The same failures by their English prose. `authErrorCode` above catches
  // them by machine code and gets there first; these stay as the net for an
  // error that reached us as a plain string or lost its shape crossing a
  // boundary, and they now share one set of words with it.
  if (/invalid login credentials/i.test(raw)) {
    return { code: 'BAD_CREDENTIALS', message: MESSAGES.BAD_CREDENTIALS! };
  }
  if (/user already registered|already been registered/i.test(raw)) {
    return { code: 'EMAIL_TAKEN', message: MESSAGES.EMAIL_TAKEN! };
  }
  if (/database error (saving|granting|finding|querying)/i.test(raw)) {
    return { code: 'SIGNUP_DB_ERROR', message: MESSAGES.SIGNUP_DB_ERROR! };
  }
  if (/password.*(at least|should be|should contain)/i.test(raw)) {
    return { code: 'WEAK_PASSWORD', message: MESSAGES.WEAK_PASSWORD! };
  }
  if (/email.*(invalid|valid)/i.test(raw)) {
    return { code: 'BAD_EMAIL', message: MESSAGES.BAD_EMAIL! };
  }
  if (/rate limit|too many requests/i.test(raw)) {
    return { code: 'TOO_MANY_ATTEMPTS', message: MESSAGES.TOO_MANY_ATTEMPTS! };
  }
  // PostgREST reports a missing function or column when the database is behind
  // the deployed code. The user gets a neutral message; the log says exactly
  // which object is missing, which is the only thing that makes it fixable.
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  if (code === 'PGRST202' || code === 'PGRST204' || /schema cache/i.test(raw)) {
    return { code: 'SCHEMA_OUT_OF_DATE', message: MESSAGES.SCHEMA_OUT_OF_DATE! };
  }

  if (/Supabase is not configured/i.test(raw)) {
    return { code: 'NOT_CONFIGURED', message: 'האפליקציה עדיין לא חוברה ל‑Supabase. ראו docs/SETUP.md' };
  }

  return { code: 'UNKNOWN', message: GENERIC_ERROR };
}

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? GENERIC_ERROR;
}
