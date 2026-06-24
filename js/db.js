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
// 對應 supabase/schema.sql 的資料表
// ============================================================
const cloudBackend = {
  async getGroup(code) {
    const { data } = await sb.from('groups').select('*').eq('code', code).maybeSingle();
    return data ? { code: data.code, name: data.name, currency: data.currency } : null;
  },
  async createGroup(name, currency) {
    let code = genCode();
    for (let tries = 0; tries < 5; tries++) {
      const { data, error } = await sb.from('groups')
        .insert({ code, name, currency }).select().single();
      if (!error) return { code: data.code, name: data.name, currency: data.currency };
      code = genCode(); // 撞代碼了, 重產
    }
    throw new Error('建立群組失敗');
  },
  async addMember(code, name) {
    const { data, error } = await sb.from('members')
      .insert({ group_code: code, name }).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name };
  },
  async removeMember(code, memberId) {
    await sb.from('members').delete().eq('id', memberId);
  },
  async getMembers(code) {
    const { data } = await sb.from('members').select('*').eq('group_code', code).order('created_at');
    return (data || []).map((m) => ({ id: m.id, name: m.name }));
  },
  async addExpense(code, exp) {
    const { data, error } = await sb.from('expenses').insert({
      group_code: code, description: exp.description, amount_cents: exp.amountCents,
      paid_by: exp.paidBy, split_type: exp.splitType, participants: exp.participants,
    }).select().single();
    if (error) throw error;
    return rowToExpense(data);
  },
  async deleteExpense(code, id) {
    await sb.from('expenses').delete().eq('id', id);
  },
  async getExpenses(code) {
    const { data } = await sb.from('expenses').select('*').eq('group_code', code)
      .order('created_at', { ascending: false });
    return (data || []).map(rowToExpense);
  },
  async addSettlement(code, s) {
    const { data, error } = await sb.from('settlements').insert({
      group_code: code, from_member: s.fromMember, to_member: s.toMember, amount_cents: s.amountCents,
    }).select().single();
    if (error) throw error;
    return rowToSettlement(data);
  },
  async deleteSettlement(code, id) {
    await sb.from('settlements').delete().eq('id', id);
  },
  async getSettlements(code) {
    const { data } = await sb.from('settlements').select('*').eq('group_code', code)
      .order('created_at', { ascending: false });
    return (data || []).map(rowToSettlement);
  },
  // 訂閱該群組所有資料表變動, 任何人改動都觸發 callback -> 重新載入畫面
  subscribe(code, callback) {
    const ch = sb.channel('grp_' + code);
    ['members', 'expenses', 'settlements'].forEach((tbl) => {
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table: tbl, filter: `group_code=eq.${code}` },
        callback);
    });
    ch.subscribe();
    return () => sb.removeChannel(ch);
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
