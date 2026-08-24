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

/** Maps any thrown value / Supabase error into a Hebrew, user-safe message. */
export function toHebrewError(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };

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
  if (/invalid login credentials/i.test(raw)) {
    return { code: 'BAD_CREDENTIALS', message: 'האימייל או הסיסמה שגויים' };
  }
  if (/user already registered|already been registered/i.test(raw)) {
    return { code: 'EMAIL_TAKEN', message: 'כתובת האימייל הזו כבר רשומה במערכת' };
  }
  if (/password.*(at least|should be)/i.test(raw)) {
    return { code: 'WEAK_PASSWORD', message: 'הסיסמה קצרה מדי — לפחות 8 תווים' };
  }
  if (/email.*(invalid|valid)/i.test(raw)) {
    return { code: 'BAD_EMAIL', message: 'כתובת האימייל אינה תקינה' };
  }
  if (/Supabase is not configured/i.test(raw)) {
    return { code: 'NOT_CONFIGURED', message: 'האפליקציה עדיין לא חוברה ל‑Supabase. ראו docs/SETUP.md' };
  }

  return { code: 'UNKNOWN', message: GENERIC_ERROR };
}

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? GENERIC_ERROR;
}
