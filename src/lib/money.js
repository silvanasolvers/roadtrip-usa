// Split-expense settlement.
//
// Each expense is paid by one person and shared among a subset of the group.
// We compute what each person's fair share is, subtract what they actually
// paid, and then reduce the resulting debt graph to the minimum number of
// transfers (greedy largest-creditor / largest-debtor matching) so the group
// sees a short, actionable settle-up list instead of every pairwise debt.

export function computeBalances(expenses, people) {
  const net = Object.fromEntries(people.map(p => [p.id, 0]))
  const paid = Object.fromEntries(people.map(p => [p.id, 0]))
  const owed = Object.fromEntries(people.map(p => [p.id, 0]))

  for (const e of expenses) {
    const among = (e.splitAmong || []).filter(id => id in net)
    if (!among.length) continue
    const share = e.amountUsd / among.length
    if (e.paidBy in net) {
      net[e.paidBy] += e.amountUsd
      paid[e.paidBy] += e.amountUsd
    }
    for (const id of among) {
      net[id] -= share
      owed[id] += share
    }
  }

  const round = n => Math.round(n * 100) / 100
  return {
    net: Object.fromEntries(Object.entries(net).map(([k, v]) => [k, round(v)])),
    paid: Object.fromEntries(Object.entries(paid).map(([k, v]) => [k, round(v)])),
    owed: Object.fromEntries(Object.entries(owed).map(([k, v]) => [k, round(v)])),
    total: round(expenses.reduce((s, e) => s + e.amountUsd, 0)),
  }
}

export function settleUp(net) {
  const EPS = 0.01
  const creditors = Object.entries(net).filter(([, v]) => v > EPS).map(([id, v]) => ({ id, v }))
  const debtors = Object.entries(net).filter(([, v]) => v < -EPS).map(([id, v]) => ({ id, v: -v }))

  creditors.sort((a, b) => b.v - a.v)
  debtors.sort((a, b) => b.v - a.v)

  const transfers = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i], c = creditors[j]
    const amt = Math.min(d.v, c.v)
    if (amt > EPS) transfers.push({ from: d.id, to: c.id, amount: Math.round(amt * 100) / 100 })
    d.v -= amt
    c.v -= amt
    if (d.v <= EPS) i++
    if (c.v <= EPS) j++
  }
  return transfers
}

export const usd = n => '$' + (Math.round(Number(n) * 100) / 100).toLocaleString('en-US', {
  minimumFractionDigits: Number(n) % 1 === 0 ? 0 : 2,
  maximumFractionDigits: 2,
})

export const km = mi => Math.round(mi * 1.60934).toLocaleString('en-US')

export function hm(hours) {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m ? `${h} h ${m} min` : `${h} h`
}
