/**
 * Drawing a share card.
 *
 * Straight onto a canvas, with no rendering library. That is a deliberate
 * choice and it is mostly about two words: bidi and iOS.
 *
 * A DOM-to-image library rasterises a live element through an SVG
 * `foreignObject`, which on iOS Safari is the least reliable path there is —
 * fonts silently fall back, and the result differs from what the user just
 * looked at. Rendering on the server with Satori would need a Hebrew font
 * shipped in the deployment and would put the card behind a new endpoint that
 * has to re-prove the viewer may read the game. Both are more moving parts
 * than this needs.
 *
 * Drawing by hand costs a few hundred lines of layout and buys exact control
 * over the thing that is hardest to get right here: a Hebrew card full of
 * money. Every string is placed at a position this module chooses, with
 * `ctx.direction` set for that string — so `+540₪` is drawn left-to-right
 * beside a right-to-left name and cannot be reordered by the bidi algorithm.
 *
 * It also adds no dependency, works with no network, and is loaded only when
 * somebody asks for a card.
 */

import { formatMoney, formatSignedMoney } from '@/lib/format';
import {
  formatGameLength,
  medalFor,
  type ShareCardModel,
  type ShareRow,
} from '@/lib/domain/share-card';

export type ShareCardKind = 'QUICK' | 'FULL';

const WIDTH = 1080;
const BASE_HEIGHT = 1920;

/**
 * The card's own colours, not the viewer's.
 *
 * Two people sharing the same night must produce the same picture, so nothing
 * here reads a CSS variable or the light/dark preference. These are the app's
 * dark palette, fixed.
 */
const C = {
  bg: '#0d1117',
  bgGlow: '#16202b',
  panel: '#161d26',
  line: '#232c38',
  ink: '#f2f5f8',
  inkMuted: '#9aa7b6',
  inkFaint: '#6b7889',
  gold: '#e8b84b',
  profit: '#3fb27f',
  loss: '#e2645c',
  brand: '#2f7d5d',
};

const SANS =
  '"Heebo", "Assistant", -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Hebrew", Arial, sans-serif';

const font = (size: number, weight = 400) => `${weight} ${size}px ${SANS}`;

/** Draws right-to-left text ending at `right`. */
function rtl(ctx: CanvasRenderingContext2D, text: string, right: number, y: number) {
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillText(text, right, y);
}

/**
 * Draws a number or money value, always left-to-right.
 *
 * This is the whole reason the card is drawn by hand. `+540₪` contains a sign,
 * digits and a currency mark; dropped into a right-to-left paragraph the bidi
 * algorithm is entitled to move the sign to the other end. Forcing the
 * direction for this one string, and placing it ourselves, makes that
 * impossible.
 */
function ltr(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign = 'left',
) {
  ctx.direction = 'ltr';
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

/**
 * Draws right-to-left text whose *left* edge is fixed.
 *
 * For a phrase that mixes a number with a Hebrew word — "4:32 שעות", "5
 * כניסות" — the number has to end up on the right, because that is where a
 * Hebrew sentence starts. Drawing it left-to-right puts the word first and the
 * phrase reads backwards.
 */
function rtlFromLeft(ctx: CanvasRenderingContext2D, text: string, left: number, y: number) {
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillText(text, left + ctx.measureText(text).width, y);
}

/** Shortens a name that will not fit, with a real ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low).trimEnd()}…`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function background(ctx: CanvasRenderingContext2D, height: number) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, WIDTH, height);

  // A single soft pool of light behind the header — the felt of a table lit
  // from above. One gradient, no glitter.
  const glow = ctx.createRadialGradient(WIDTH / 2, 260, 0, WIDTH / 2, 260, 760);
  glow.addColorStop(0, C.bgGlow);
  glow.addColorStop(1, C.bg);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, Math.min(height, 1100));

  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  roundRect(ctx, 24, 24, WIDTH - 48, height - 48, 44);
  ctx.stroke();
}

/** The wordmark, with the suit marks the app already uses on its home screen. */
function header(ctx: CanvasRenderingContext2D, y: number): number {
  ctx.fillStyle = C.gold;
  ctx.font = font(30, 700);
  ltr(ctx, '♠  ♥  ♦  ♣', WIDTH / 2, y, 'center');

  ctx.fillStyle = C.ink;
  ctx.font = font(46, 800);
  ltr(ctx, 'POKER WITH FRIENDS', WIDTH / 2, y + 74, 'center');

  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 150, y + 116);
  ctx.lineTo(WIDTH / 2 + 150, y + 116);
  ctx.stroke();
  return y + 116;
}

function statTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  /** True only for a bare number or money value; a Hebrew phrase is not one. */
  valueIsNumber: boolean,
) {
  ctx.fillStyle = C.panel;
  roundRect(ctx, x, y, w, h, 28);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = C.inkMuted;
  ctx.font = font(26, 600);
  rtl(ctx, label, x + w - 32, y + 56);

  ctx.fillStyle = C.ink;
  ctx.font = font(44, 800);
  const cy = y + 118;
  if (valueIsNumber) ltr(ctx, value, x + w - 32, cy, 'right');
  else rtl(ctx, value, x + w - 32, cy);
}

/** The winner's panel: the one place gold is used. */
function winnerPanel(ctx: CanvasRenderingContext2D, model: ShareCardModel, y: number): number {
  const h = 250;
  const x = 64;
  const w = WIDTH - 128;

  ctx.fillStyle = C.panel;
  roundRect(ctx, x, y, w, h, 34);
  ctx.fill();
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = C.gold;
  ctx.font = font(30, 700);
  rtl(ctx, '🏆  המנצח הגדול', x + w - 44, y + 66);

  const winner = model.winner!;
  ctx.fillStyle = C.ink;
  ctx.font = font(64, 800);
  const nameRight = x + w - 44;
  rtl(ctx, fit(ctx, winner.name, w - 88), nameRight, y + 148);

  ctx.fillStyle = C.profit;
  ctx.font = font(58, 800);
  ltr(ctx, formatSignedMoney(winner.netAgorot ?? 0), nameRight, y + 218, 'right');
  return y + h;
}

function footer(ctx: CanvasRenderingContext2D, model: ShareCardModel, height: number) {
  ctx.fillStyle = C.inkFaint;
  ctx.font = font(28, 600);
  ltr(ctx, israeliDate(model.playedOn), WIDTH / 2, height - 74, 'center');
}

/** 28.08.2026 — the same order the app writes dates in everywhere else. */
function israeliDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Quick share — one screen, the few things worth reading at a glance.
// ---------------------------------------------------------------------------
function drawQuick(ctx: CanvasRenderingContext2D, model: ShareCardModel) {
  background(ctx, BASE_HEIGHT);
  ctx.textBaseline = 'alphabetic';

  let y = header(ctx, 240);
  y += 170;

  if (model.winner) {
    y = winnerPanel(ctx, model, y) + 90;
  } else {
    // Nobody finished ahead. Say so plainly rather than crowning a loser.
    ctx.fillStyle = C.inkMuted;
    ctx.font = font(40, 700);
    rtl(ctx, 'ערב מאוזן — אף אחד לא יצא ברווח', WIDTH - 96, y + 80);
    y += 200;
  }

  const gap = 32;
  const tileW = (WIDTH - 128 - gap) / 2;
  const length = formatGameLength(model.durationMs);

  statTile(ctx, 64, y, tileW, 180, '💰 הקופה הכוללת', formatMoney(model.potAgorot), true);
  statTile(ctx, 64 + tileW + gap, y, tileW, 180, '🎲 שחקנים', String(model.playerCount), true);
  y += 180 + gap;

  statTile(ctx, 64, y, tileW, 180, '🔄 סך הכניסות', String(model.totalBuyIns), true);
  // The duration is a Hebrew phrase, not a number: "4:32 שעות" has to read
  // with the clock on the right.
  statTile(ctx, 64 + tileW + gap, y, tileW, 180, '⏱️ משך המשחק', length ?? '—', false);
  y += 180 + 90;

  if (model.rebuyKing) {
    ctx.fillStyle = C.panel;
    roundRect(ctx, 64, y, WIDTH - 128, 170, 30);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = C.inkMuted;
    ctx.font = font(28, 600);
    rtl(ctx, '🔄  מלך הריבאיים', WIDTH - 108, y + 62);

    ctx.fillStyle = C.gold;
    ctx.font = font(36, 700);
    const entries = `${model.rebuyKing.count} כניסות`;
    rtlFromLeft(ctx, entries, 108, y + 126);
    const entriesWidth = ctx.measureText(entries).width;

    ctx.fillStyle = C.ink;
    ctx.font = font(46, 800);
    rtl(ctx, fit(ctx, model.rebuyKing.name, WIDTH - 216 - entriesWidth - 48), WIDTH - 108, y + 126);
  }

  footer(ctx, model, BASE_HEIGHT);
}

// ---------------------------------------------------------------------------
// Full results — everybody, however many that is.
// ---------------------------------------------------------------------------
const ROW_H = 96;
const LIST_TOP = 470;
/** The divider, its gap, and the four summary lines at their tallest. */
const SUMMARY_H = 40 + 66 + 4 * 62;
/** Room under the summary so the date never crowds it. */
const FOOTER_H = 130;

/**
 * How tall the card has to be.
 *
 * A story is 1080×1920 and that is what this returns whenever the list fits,
 * because that is the shape every app expects. A table big enough to overflow
 * it grows the canvas downwards instead of shrinking the type: a name nobody
 * can read is worse than a card that scrolls in the chat. The rows keep their
 * size, so a two-player card and a twelve-player card look like the same card.
 */
export function fullResultsHeight(playerCount: number): number {
  const needed = LIST_TOP + playerCount * ROW_H + SUMMARY_H + FOOTER_H;
  return Math.max(BASE_HEIGHT, Math.ceil(needed / 8) * 8);
}

function drawRow(ctx: CanvasRenderingContext2D, row: ShareRow, y: number) {
  const x = 64;
  const w = WIDTH - 128;
  const podium = row.rank <= 3;

  ctx.fillStyle = podium ? C.panel : 'rgba(22,29,38,0.55)';
  roundRect(ctx, x, y, w, ROW_H - 14, 24);
  ctx.fill();
  if (row.rank === 1) {
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Rank marker on the right, where a Hebrew reader starts.
  const medal = medalFor(row.rank);
  ctx.font = font(38, 700);
  if (medal) {
    ctx.fillStyle = C.ink;
    ltr(ctx, medal, x + w - 34, y + 56, 'right');
  } else {
    ctx.fillStyle = C.inkFaint;
    ltr(ctx, String(row.rank), x + w - 42, y + 56, 'right');
  }

  // The money is drawn first so the name knows how much room is left.
  const money = formatSignedMoney(row.netAgorot);
  ctx.font = font(42, 800);
  ctx.fillStyle = row.netAgorot > 0 ? C.profit : row.netAgorot < 0 ? C.loss : C.inkMuted;
  const moneyWidth = ctx.measureText(money).width;
  ltr(ctx, money, x + 34, y + 56, 'left');

  ctx.fillStyle = C.ink;
  ctx.font = font(40, row.rank === 1 ? 800 : 700);
  const nameRight = x + w - 96;
  const nameMax = nameRight - (x + 34 + moneyWidth + 40);
  rtl(ctx, fit(ctx, row.name, Math.max(120, nameMax)), nameRight, y + 56);
}

function drawFull(ctx: CanvasRenderingContext2D, model: ShareCardModel, height: number) {
  background(ctx, height);
  ctx.textBaseline = 'alphabetic';

  header(ctx, 170);

  // A six-player night and a fourteen-player night are the same card with a
  // different amount in the middle. Rather than pinning the list to the top
  // and leaving a hole under a short one, the block is settled into the space
  // it has — biased upwards, because the bottom of a story is where the app's
  // own controls sit.
  const summaryLines = 2 + (formatGameLength(model.durationMs) ? 1 : 0) + (model.rebuyKing ? 1 : 0);
  const contentHeight = model.rows.length * ROW_H + 40 + 66 + summaryLines * 62;
  const spare = Math.max(0, height - FOOTER_H - LIST_TOP - contentHeight);
  const offset = Math.round(spare * 0.38);

  ctx.fillStyle = C.gold;
  ctx.font = font(38, 800);
  rtl(ctx, '🏆  תוצאות הערב', WIDTH - 96, 400 + offset);

  let y = LIST_TOP + offset;
  for (const row of model.rows) {
    drawRow(ctx, row, y);
    y += ROW_H;
  }

  y += 40;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, y);
  ctx.lineTo(WIDTH - 64, y);
  ctx.stroke();
  y += 66;

  const lines: Array<[string, string]> = [
    ['💰  קופה כוללת', formatMoney(model.potAgorot)],
    ['🎲  שחקנים', String(model.playerCount)],
  ];
  const length = formatGameLength(model.durationMs);
  if (length) lines.push(['⏱️  משך המשחק', length]);
  if (model.rebuyKing) {
    lines.push(['🔄  מלך הריבאיים', `${model.rebuyKing.name} · ${model.rebuyKing.count}`]);
  }

  for (const [label, value] of lines) {
    ctx.fillStyle = C.inkMuted;
    ctx.font = font(32, 600);
    rtl(ctx, label, WIDTH - 96, y);

    ctx.fillStyle = C.ink;
    ctx.font = font(34, 700);
    // A value that is only digits and money is forced left-to-right; one that
    // carries a name is drawn as the Hebrew line it is.
    if (/^[\d.,+\-₪ ]+$/.test(value)) ltr(ctx, value, 96, y, 'left');
    else rtlFromLeft(ctx, fit(ctx, value, WIDTH - 520), 96, y);
    y += 62;
  }

  footer(ctx, model, height);
}

/** Renders a card and hands back a PNG. */
export async function renderShareCard(
  model: ShareCardModel,
  kind: ShareCardKind,
): Promise<Blob> {
  const height = kind === 'QUICK' ? BASE_HEIGHT : fullResultsHeight(model.rows.length);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');

  if (kind === 'QUICK') drawQuick(ctx, model);
  else drawFull(ctx, model, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('CANVAS_UNAVAILABLE');
  return blob;
}
