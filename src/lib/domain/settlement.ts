export interface PlayerBalance {
  id: string;
  /** Positive = the player is owed money. Negative = the player owes money. */
  amountAgorot: number;
}

export interface Transfer {
  from: string;
  to: string;
  amountAgorot: number;
}

/**
 * Works out who pays whom, using as few transfers as is practical.
 *
 * Repeatedly matches the largest debtor against the largest creditor and
 * settles the smaller of the two in full. Each step removes at least one
 * player from the open set, so at most n-1 transfers are produced — the
 * theoretical minimum for the common case, and close to it otherwise
 * (exact minimisation is NP-hard and not worth it for a poker night).
 *
 * Balances must sum to zero; `computeFinalResults` guarantees that.
 */
export function computeSettlement(balances: readonly PlayerBalance[]): Transfer[] {
  const total = balances.reduce((sum, b) => sum + b.amountAgorot, 0);
  if (total !== 0) {
    throw new Error(`computeSettlement: balances must sum to zero, got ${total}`);
  }
  for (const b of balances) {
    if (!Number.isInteger(b.amountAgorot)) {
      throw new Error('computeSettlement: balances must be integer agorot');
    }
  }

  // Deterministic ordering keeps the output stable for identical inputs.
  const byId = (a: PlayerBalance, b: PlayerBalance) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const creditors = balances
    .filter((b) => b.amountAgorot > 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.amountAgorot - a.amountAgorot || byId(a, b));
  const debtors = balances
    .filter((b) => b.amountAgorot < 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.amountAgorot - b.amountAgorot || byId(a, b));

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!;
    const debtor = debtors[di]!;
    const amount = Math.min(creditor.amountAgorot, -debtor.amountAgorot);

    if (amount > 0) {
      transfers.push({ from: debtor.id, to: creditor.id, amountAgorot: amount });
      creditor.amountAgorot -= amount;
      debtor.amountAgorot += amount;
    }

    if (creditor.amountAgorot === 0) ci += 1;
    if (debtor.amountAgorot === 0) di += 1;
  }

  return transfers;
}

/**
 * Confirms a transfer plan fully resolves every balance. The database runs the
 * same check before it will store a settlement.
 */
export function verifySettlement(
  balances: readonly PlayerBalance[],
  transfers: readonly Transfer[],
): boolean {
  const net = new Map<string, number>();
  for (const b of balances) net.set(b.id, 0);
  for (const t of transfers) {
    if (t.amountAgorot <= 0 || t.from === t.to) return false;
    if (!net.has(t.from) || !net.has(t.to)) return false;
    net.set(t.to, net.get(t.to)! + t.amountAgorot);
    net.set(t.from, net.get(t.from)! - t.amountAgorot);
  }
  return balances.every((b) => net.get(b.id) === b.amountAgorot);
}
