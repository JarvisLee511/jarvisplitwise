// ============================================================
// db.js — 資料層: 統一的 async API, 底層自動選擇
//   (1) Supabase 雲端 (設定檔填了金鑰時) — 朋友可即時共用
//   (2) localStorage 本機 (沒填金鑰時) — 單機離線
// 兩種模式對外介面完全相同, app.js 不需要知道用的是哪個。
// ============================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

export const USING_CLOUD = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let sb = null;
if (USING_CLOUD) {
  // supabase-js 由 index.html 透過 CDN 載入為全域 window.supabase
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// 產生短群組代碼 (易讀, 去掉易混淆字元)
export function genCode(len = 6) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
function uid() {
  return 'id_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ============================================================
// 本機模式 (localStorage)
// 結構: fairshare_groups = { [code]: { name, currency, members:[], expenses:[], settlements:[] } }
// ============================================================
const LS_KEY = 'fairshare_db_v1';
function lsLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { groups: {} }; }
  catch { return { groups: {} }; }
}
function lsSave(db) { localStorage.setItem(LS_KEY, JSON.stringify(db)); }

const localBackend = {
  async getGroup(code) {
    const g = lsLoad().groups[code];
    return g ? { code, name: g.name, currency: g.currency } : null;
  },
  async deleteGroup(code) {
    const db = lsLoad();
    delete db.groups[code];
    lsSave(db);
  },
  async createGroup(name, currency) {
    const db = lsLoad();
    let code = genCode();
    while (db.groups[code]) code = genCode();
    db.groups[code] = { name, currency, members: [], expenses: [], settlements: [] };
    lsSave(db);
    return { code, name, currency };
  },
  async addMember(code, name) {
    const db = lsLoad();
    const m = { id: uid(), name };
    db.groups[code].members.push(m);
    lsSave(db);
    return m;
  },
  async removeMember(code, memberId) {
    const db = lsLoad();
    const g = db.groups[code];
    g.members = g.members.filter((m) => m.id !== memberId);
    lsSave(db);
  },
  async getMembers(code) {
    return (lsLoad().groups[code]?.members) || [];
  },
  async addExpense(code, exp) {
    const db = lsLoad();
    const row = { id: uid(), createdAt: Date.now(), ...exp };
    db.groups[code].expenses.push(row);
    lsSave(db);
    return row;
  },
  async deleteExpense(code, id) {
    const db = lsLoad();
    const g = db.groups[code];
    g.expenses = g.expenses.filter((e) => e.id !== id);
    lsSave(db);
  },
  async getExpenses(code) {
    return ((lsLoad().groups[code]?.expenses) || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  },
  async addSettlement(code, s) {
    const db = lsLoad();
    const row = { id: uid(), createdAt: Date.now(), ...s };
    db.groups[code].settlements.push(row);
    lsSave(db);
    return row;
  },
  async deleteSettlement(code, id) {
    const db = lsLoad();
    const g = db.groups[code];
    g.settlements = g.settlements.filter((s) => s.id !== id);
    lsSave(db);
  },
  async getSettlements(code) {
    return ((lsLoad().groups[code]?.settlements) || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  },
  subscribe() { return () => {}; }, // 本機模式無即時同步
};

// ============================================================
// 雲端模式 (Supabase)
// 對應 supabase/schema.sql 的資料表。
// 安全: 每個請求都帶 x-group-code header, 資料庫 RLS 只回傳/允許跟它相符的那個群組,
//       所以公開的 publishable key 不能拿來列出或改動別的群組 (知道代碼 = 有權限)。
// ============================================================
const HDR = 'x-group-code';
const CLIENT_ID = Math.random().toString(36).slice(2); // 分辨「自己發出」的變動通知
const channels = {};
// 通知同群組其他裝置「有變動, 請重抓」: 只帶寄件者 id, 不帶任何帳目內容。
// 走 REST (httpSend) 而不是 websocket, 自己的即時連線默默斷掉時也送得出去
function notify(code) {
  channels[code]?.httpSend('changed', { from: CLIENT_ID }).catch(() => {});
}

const cloudBackend = {
  // 讀取失敗一律丟出 error: 連不上 ≠ 找不到 / 沒資料, 交給畫面顯示「連不上伺服器」
  async getGroup(code) {
    const { data, error } = await sb.from('groups').select('*').eq('code', code)
      .setHeader(HDR, code).maybeSingle();
    if (error) throw error;
    return data ? { code: data.code, name: data.name, currency: data.currency } : null;
  },
  async deleteGroup(code) {
    // groups 刪除會經由 ON DELETE CASCADE 自動清掉 members/expenses/settlements
    const { error } = await sb.from('groups').delete().eq('code', code).setHeader(HDR, code);
    if (error) throw error;
    notify(code);
  },
  async createGroup(name, currency) {
    let code = genCode();
    for (let tries = 0; tries < 5; tries++) {
      const { data, error } = await sb.from('groups')
        .insert({ code, name, currency }).select().setHeader(HDR, code).single();
      if (!error) return { code: data.code, name: data.name, currency: data.currency };
      if (error.code !== '23505') throw error; // 只有撞代碼才重試; 沒網路等其他錯誤直接丟出
      code = genCode(); // 撞代碼了, 重產
    }
    throw new Error('建立群組失敗');
  },
  async addMember(code, name) {
    const { data, error } = await sb.from('members')
      .insert({ group_code: code, name }).select().setHeader(HDR, code).single();
    if (error) throw error;
    notify(code);
    return { id: data.id, name: data.name };
  },
  async removeMember(code, memberId) {
    const { error } = await sb.from('members').delete().eq('id', memberId).setHeader(HDR, code);
    if (error) throw error;
    notify(code);
  },
  async getMembers(code) {
    const { data, error } = await sb.from('members').select('*').eq('group_code', code)
      .order('created_at').setHeader(HDR, code);
    if (error) throw error;
    return data.map((m) => ({ id: m.id, name: m.name }));
  },
  async addExpense(code, exp) {
    const { data, error } = await sb.from('expenses').insert({
      group_code: code, description: exp.description, amount_cents: exp.amountCents,
      paid_by: exp.paidBy, split_type: exp.splitType, participants: exp.participants,
    }).select().setHeader(HDR, code).single();
    if (error) throw error;
    notify(code);
    return rowToExpense(data);
  },
  async deleteExpense(code, id) {
    const { error } = await sb.from('expenses').delete().eq('id', id).setHeader(HDR, code);
    if (error) throw error;
    notify(code);
  },
  async getExpenses(code) {
    const { data, error } = await sb.from('expenses').select('*').eq('group_code', code)
      .order('created_at', { ascending: false }).setHeader(HDR, code);
    if (error) throw error;
    return data.map(rowToExpense);
  },
  async addSettlement(code, s) {
    const { data, error } = await sb.from('settlements').insert({
      group_code: code, from_member: s.fromMember, to_member: s.toMember, amount_cents: s.amountCents,
    }).select().setHeader(HDR, code).single();
    if (error) throw error;
    notify(code);
    return rowToSettlement(data);
  },
  async deleteSettlement(code, id) {
    const { error } = await sb.from('settlements').delete().eq('id', id).setHeader(HDR, code);
    if (error) throw error;
    notify(code);
  },
  async getSettlements(code) {
    const { data, error } = await sb.from('settlements').select('*').eq('group_code', code)
      .order('created_at', { ascending: false }).setHeader(HDR, code);
    if (error) throw error;
    return data.map(rowToSettlement);
  },
  // 訂閱該群組的「有變動」廣播 (別台裝置寫入後發的), 收到就觸發 callback -> 重新載入畫面。
  // 每次(重新)連上也觸發一次: 斷線期間的通知不會補發, 要自己重抓
  subscribe(code, callback) {
    const ch = sb.channel('grp_' + code);
    ch.on('broadcast', { event: 'changed' }, ({ payload }) => { if (payload?.from !== CLIENT_ID) callback(); });
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') callback(); });
    channels[code] = ch;
    return () => { if (channels[code] === ch) delete channels[code]; sb.removeChannel(ch); };
  },
};

function rowToExpense(r) {
  return {
    id: r.id, createdAt: new Date(r.created_at).getTime(),
    description: r.description, amountCents: r.amount_cents,
    paidBy: r.paid_by, splitType: r.split_type, participants: r.participants,
  };
}
function rowToSettlement(r) {
  return {
    id: r.id, createdAt: new Date(r.created_at).getTime(),
    fromMember: r.from_member, toMember: r.to_member, amountCents: r.amount_cents,
  };
}

export const db = USING_CLOUD ? cloudBackend : localBackend;
