// ============================================================
// split.js — 分帳核心邏輯 (純函式, 無 DOM/網路依賴, 方便測試)
// 所有金額一律用「整數最小單位 (分)」運算, 避免浮點誤差。
// ============================================================

// 元 -> 分 (四捨五入到整數分)
export function toCents(amount) {
  return Math.round(Number(amount) * 100);
}
// 分 -> 元字串
export function fromCents(cents) {
  return (cents / 100).toFixed(2);
}

// ------------------------------------------------------------
// 計算「單筆消費」中, 每位參與者各自應分攤多少 (回傳: {memberId: cents})
// expense.splitType: 'equal' | 'exact' | 'percent' | 'shares'
// expense.amountCents: 整數分
// expense.participants: [{ memberId, value }]
//   - equal:   value 忽略 (每人均分)
//   - exact:   value = 該人應付的「元」
//   - percent: value = 百分比 (總和應為 100)
//   - shares:  value = 份數 (正整數/小數)
// ------------------------------------------------------------
// 把 total(分) 依 weights 比例分配, 用「最大餘數法 (Hamilton)」:
//   - 每人先拿 floor(比例), 剩餘的分逐一配給小數部分最大者
//   - 保證: 每份 >= 0、總和精確等於 total (不會有最後一人變負數的捨入 bug)
function apportion(total, weights) {
  const n = weights.length;
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (!(sumW > 0)) return new Array(n).fill(0); // 防 NaN / 全 0
  const raw = weights.map((w) => (total * w) / sumW);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = total - floors.reduce((s, x) => s + x, 0); // 整數, 0..n-1
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac); // 小數部分大者優先
  const result = floors.slice();
  for (let k = 0; k < remainder && k < n; k++) result[order[k].i] += 1;
  return result;
}

export function computeShares(expense) {
  const parts = expense.participants;
  const total = expense.amountCents;
  const owed = {};
  if (!parts || parts.length === 0) return owed;

  if (expense.splitType === 'exact') {
    // 指定金額: 直接採用 (總和正確性由 validateExpense 把關)
    parts.forEach((p) => { owed[p.memberId] = toCents(p.value); });
    return owed;
  }

  // equal / percent / shares 統一用比例分配:
  //   equal  -> 每人權重 1
  //   percent-> 權重 = 百分比 (apportion 內部會除以總和, 不依賴剛好=100)
  //   shares -> 權重 = 份數
  const weights = expense.splitType === 'equal'
    ? parts.map(() => 1)
    : parts.map((p) => Number(p.value));
  const alloc = apportion(total, weights);
  parts.forEach((p, i) => { owed[p.memberId] = alloc[i]; });
  return owed;
}

// 檢查單筆消費是否合法; 回傳 { ok, error }
export function validateExpense(expense) {
  if (!expense.description || !expense.description.trim())
    return { ok: false, error: '請輸入消費名稱' };
  if (!(expense.amountCents > 0))
    return { ok: false, error: '金額必須大於 0' };
  if (!expense.paidBy)
    return { ok: false, error: '請選擇付款人' };
  if (!expense.participants || expense.participants.length === 0)
    return { ok: false, error: '請至少選一位分攤者' };

  // percent/shares/exact: 每個數值都必須是「有限的非負數」
  // (擋掉負數讓人倒賺、以及空白/亂打造成的 NaN 汙染整本帳)
  if (expense.splitType !== 'equal') {
    const bad = expense.participants.some((p) => {
      const v = Number(p.value);
      return !Number.isFinite(v) || v < 0;
    });
    if (bad) return { ok: false, error: '每位分攤者的數值必須是 0 或正數' };
  }

  if (expense.splitType === 'exact') {
    const sum = expense.participants.reduce((s, p) => s + toCents(p.value), 0);
    if (sum !== expense.amountCents)
      return { ok: false, error: `指定金額總和 ${fromCents(sum)} 必須等於消費金額 ${fromCents(expense.amountCents)}` };
  }
  if (expense.splitType === 'percent') {
    const sum = expense.participants.reduce((s, p) => s + Number(p.value), 0);
    if (Math.abs(sum - 100) > 0.5) // 容許 33.33×3=99.99 這類四捨五入
      return { ok: false, error: `百分比總和為 ${sum}%, 必須接近 100%` };
  }
  if (expense.splitType === 'shares') {
    const sum = expense.participants.reduce((s, p) => s + Number(p.value), 0);
    if (!(sum > 0)) return { ok: false, error: '份數總和必須大於 0' };
  }
  return { ok: true };
}

// ------------------------------------------------------------
// 計算整個群組的「淨額」(回傳: {memberId: cents})
//   正值 = 別人欠他 (他先墊的多); 負值 = 他欠別人
// expenses: [{ amountCents, paidBy, splitType, participants }]
// settlements: [{ fromMember, toMember, amountCents }]  (from 付錢給 to)
// ------------------------------------------------------------
export function computeBalances(members, expenses, settlements) {
  const bal = {};
  members.forEach((m) => { bal[m.id] = 0; });

  expenses.forEach((e) => {
    if (bal[e.paidBy] === undefined) bal[e.paidBy] = 0;
    bal[e.paidBy] += e.amountCents;            // 付款人先墊了全額
    const owed = computeShares(e);
    Object.entries(owed).forEach(([mid, c]) => {
      if (bal[mid] === undefined) bal[mid] = 0;
      bal[mid] -= c;                            // 各參與者扣掉自己該分攤的
    });
  });

  settlements.forEach((s) => {
    if (bal[s.fromMember] === undefined) bal[s.fromMember] = 0;
    if (bal[s.toMember] === undefined) bal[s.toMember] = 0;
    bal[s.fromMember] += s.amountCents;  // 還錢的人: 欠款減少 (淨額上升)
    bal[s.toMember]   -= s.amountCents;  // 收錢的人: 應收減少
  });

  return bal;
}

// ------------------------------------------------------------
// 債務簡化: 把淨額轉成「最少筆數」的還款建議
// 回傳 [{ from, to, amountCents }]  (from 應付給 to)
// 貪婪法: 每次拿「最大債務人」配「最大債權人」
// ------------------------------------------------------------
export function simplifyDebts(balances) {
  const creditors = []; // {id, amount>0}
  const debtors = [];    // {id, amount>0}  (欠的絕對值)
  Object.entries(balances).forEach(([id, c]) => {
    if (c > 0) creditors.push({ id, amount: c });
    else if (c < 0) debtors.push({ id, amount: -c });
  });
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const txns = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0) txns.push({ from: debtors[i].id, to: creditors[j].id, amountCents: pay });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return txns;
}
