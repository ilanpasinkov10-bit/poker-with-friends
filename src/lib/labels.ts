import type {
  BuyinType,
  CountingMode,
  JoinMode,
  PlayerStatus,
  PlayerVisibility,
  RequestStatus,
  TableStatus,
} from '@/types/database';

export const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  WAITING: 'ממתין להתחלה',
  ACTIVE: 'משחק פעיל',
  COUNTING: 'ספירת ז׳יטונים',
  COMPLETED: 'המשחק הסתיים',
  CANCELLED: 'המשחק בוטל',
};

export const TABLE_STATUS_TONE: Record<TableStatus, 'neutral' | 'brand' | 'profit' | 'loss' | 'warn'> = {
  WAITING: 'neutral',
  ACTIVE: 'profit',
  COUNTING: 'warn',
  COMPLETED: 'brand',
  CANCELLED: 'loss',
};

export const PLAYER_STATUS_LABEL: Record<PlayerStatus, string> = {
  PENDING: 'ממתין לאישור',
  ACTIVE: 'משחק',
  REJECTED: 'נדחה',
  REMOVED: 'הוסר מהשולחן',
};

export const JOIN_MODE_LABEL: Record<JoinMode, string> = {
  AUTO_JOIN: 'הצטרפות חופשית',
  ADMIN_APPROVAL: 'באישור מנהל השולחן',
};

export const JOIN_MODE_DESCRIPTION: Record<JoinMode, string> = {
  AUTO_JOIN: 'כל מי שיש לו את הקוד נכנס ישירות לשולחן',
  ADMIN_APPROVAL: 'כל בקשת הצטרפות מחכה לאישור שלכם',
};

export const VISIBILITY_LABEL: Record<PlayerVisibility, string> = {
  OPEN: 'פתוח — כולם רואים הכול',
  PRIVATE: 'פרטי — כל שחקן רואה רק את עצמו',
};

export const VISIBILITY_DESCRIPTION: Record<PlayerVisibility, string> = {
  OPEN: 'השחקנים רואים את הכניסות וההשקעה של כולם',
  PRIVATE: 'רק מנהל השולחן רואה את הנתונים של כל השחקנים',
};

export const COUNTING_MODE_LABEL: Record<CountingMode, string> = {
  ADMIN_COUNT: 'מנהל השולחן סופר',
  SELF_COUNT: 'כל שחקן סופר את עצמו',
};

export const COUNTING_MODE_DESCRIPTION: Record<CountingMode, string> = {
  ADMIN_COUNT: 'אתם מזינים את הספירה הסופית של כל שחקן',
  SELF_COUNT: 'כל שחקן מזין כמה ז׳יטונים נשארו לו, ואתם מאשרים',
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: 'ממתינה לאישור',
  APPROVED: 'אושרה',
  REJECTED: 'נדחתה',
  CANCELLED: 'בוטלה',
};

export const BUYIN_TYPE_LABEL: Record<BuyinType, string> = {
  INITIAL_BUYIN: 'כניסה ראשונה',
  REBUY: 'כניסה נוספת',
  REVERSAL: 'ביטול כניסה',
};

/** Hebrew pluralisation for the handful of counters shown in the UI. */
export function plural(count: number, one: string, many: string, two?: string): string {
  if (count === 1) return `${count} ${one}`;
  if (count === 2 && two) return two;
  return `${count} ${many}`;
}

export const chipsWord = (count: number) => plural(count, 'ז׳יטון', 'ז׳יטונים');
export const buyInsWord = (count: number) => plural(count, 'כניסה', 'כניסות', 'שתי כניסות');
export const playersWord = (count: number) => plural(count, 'שחקן', 'שחקנים', 'שני שחקנים');
export const gamesWord = (count: number) => plural(count, 'משחק', 'משחקים', 'שני משחקים');
