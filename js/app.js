// ============================================================
// app.js — UI 與互動邏輯 (iOS / Apple HIG 設計語言)
// ============================================================
import { db, USING_CLOUD } from './db.js';
import {
  toCents, fromCents, computeBalances, simplifyDebts, validateExpense,
} from './split.js';
import * as anim from './anim.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- 圖示: SF-Symbol 量度 (outline 用 stroke; .fill 用實心 silhouette) ----
const ICONS = {
  back: '<path d="M15 4.5l-7.5 7.5L15 19.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<path d="M12 3.6v10.4"/><path d="M8.4 7.2L12 3.6l3.6 3.6"/><path d="M6.5 11.5V18a2 2 0 002 2h7a2 2 0 002-2v-6.5"/>',
  check: '<path d="M5 12.5l4.4 4.4L19.5 6.5"/>',
  card: '<rect x="3" y="6" width="18" height="12.5" rx="2.6"/><path d="M3 10h18"/>',
  'card.fill': '<rect x="3" y="6" width="18" height="12.5" rx="2.6"/><rect x="3" y="9" width="18" height="2.4" fill="var(--card)" stroke="none"/><rect x="6" y="14.2" width="5.5" height="2" rx="1" fill="var(--card)" stroke="none"/>',
  swap: '<circle cx="12" cy="12" r="9"/><path d="M9.4 8.6l-2 1.9 2 1.9" stroke-width="1.6"/><path d="M7.5 10.5H16" stroke-width="1.6"/><path d="M14.6 15.4l2-1.9-2-1.9" stroke-width="1.6"/><path d="M16.5 13.5H8" stroke-width="1.6"/>',
  'swap.fill': '<circle cx="12" cy="12" r="9" stroke="none"/><path d="M9.4 8.6l-2 1.9 2 1.9" fill="none" stroke="var(--card)" stroke-width="1.7"/><path d="M7.5 10.5H16" fill="none" stroke="var(--card)" stroke-width="1.7"/><path d="M14.6 15.4l2-1.9-2-1.9" fill="none" stroke="var(--card)" stroke-width="1.7"/><path d="M16.5 13.5H8" fill="none" stroke="var(--card)" stroke-width="1.7"/>',
  people: '<circle cx="9" cy="8" r="3.1"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 5.3a3.1 3.1 0 010 5.6"/><path d="M21 19c0-2.4-1.7-4.1-3.8-4.7"/>',
  'people.fill': '<circle cx="9" cy="8" r="3.4" stroke="none"/><path d="M2.8 19.6c0-3.5 2.8-5.7 6.2-5.7s6.2 2.2 6.2 5.7z" stroke="none"/><circle cx="17" cy="8.6" r="2.8" stroke="none"/><path d="M16.2 13.9c2.5.3 4.8 2 4.8 4.8 0 .5-.3.9-.9.9H17.2" stroke="none"/>',
  cloud: '<path d="M7 18.5a4.2 4.2 0 01-.3-8.4 5.2 5.2 0 0110-1.2 3.7 3.7 0 01-.2 9.6z"/>',
  offline: '<path d="M5 12.5a8 8 0 0114 0"/><path d="M8.5 16a4 4 0 017 0"/><circle cx="12" cy="19.6" r="1"/><path d="M4 4l16 16"/>',
  moon: '<path d="M20 14.3A8 8 0 119.7 4 6.4 6.4 0 0020 14.3z"/>',
  sun: '<circle cx="12" cy="12" r="4.1"/><path d="M12 2.6v2.3M12 19.1v2.3M21.4 12h-2.3M4.9 12H2.6M18.65 5.35l-1.6 1.6M6.95 17.05l-1.6 1.6M18.65 18.65l-1.6-1.6M6.95 6.95l-1.6-1.6"/>',
  plane: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/>',
};
function icon(name, cls = '') {
  const filled = name.endsWith('.fill');
  return `<svg class="ic ${filled ? 'fill' : ''} ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ---- 深淺色主題 (預設明色, 選擇記在 localStorage) ----
const THEME_KEY = 'jp-theme';
const currentTheme = () => localStorage.getItem(THEME_KEY) || 'light';
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === 'dark' ? '#000000' : '#f2f2f7';
}
// 導覽列右上的切換鈕 (明色顯示月亮→點按轉暗, 暗色顯示太陽→點按轉明)
function themeBtnHTML() {
  return `<button class="nav-btn icon-only" id="themeToggle" aria-label="切換深淺色">${icon(currentTheme() === 'dark' ? 'sun' : 'moon')}</button>`;
}
function wireThemeToggle() {
  const b = $('#themeToggle');
  if (!b) return;
  b.onclick = () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    b.innerHTML = icon(next === 'dark' ? 'sun' : 'moon');
  };
}

// 目前狀態
const state = {
  code: null, group: null, members: [], expenses: [], settlements: [],
  currency: 'NT$', unsubscribe: null, activeTab: 'expenses',
};

const money = (cents) => state.currency + fromCents(cents);
function memberName(id) {
  const m = state.members.find((x) => x.id === id);
  return m ? m.name : '?';
}
// 頭像: 由名字產生穩定底色 + 縮寫
function avatarColor(name) {
  let h = 0; const s = name || '?';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  // iOS 聯絡人風: 降飽和+提亮度, 不刺眼
  return `hsl(${h} 42% 56%)`;
}
function initials(name) {
  const t = (name || '?').trim();
  if (/[一-鿿]/.test(t)) return t.slice(-1);
  const p = t.split(/\s+/).filter(Boolean);
  return (p.slice(0, 2).map((x) => x[0]).join('') || '?').toUpperCase();
}
function avatar(name, cls = '') {
  return `<span class="avatar ${cls}" style="background:${avatarColor(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
}

// ------------------------------------------------------------
// 路由
// ------------------------------------------------------------
let prevHasGroup;
async function route() {
  const code = location.hash.replace(/^#/, '').trim().toUpperCase();
  const hasGroup = !!code;
  const dir = prevHasGroup === undefined ? 'none'
    : hasGroup && !prevHasGroup ? 'forward'
      : !hasGroup && prevHasGroup ? 'back' : 'none';
  if (code) {
    const g = await db.getGroup(code);
    if (!g) { toast('找不到群組代碼 ' + code); prevHasGroup = undefined; location.hash = ''; return; }
    await openGroup(g);
  } else {
    if (state.unsubscribe) { state.unsubscribe(); state.unsubscribe = null; }
    renderLanding();
  }
  prevHasGroup = hasGroup;
  anim.enterScreen(dir);
}
window.addEventListener('hashchange', route);
// 大標題導覽列: 捲動時顯示緊湊標題 + 毛玻璃, 大標題隨捲動淡出
let lastScrollY = 0;
window.addEventListener('scroll', () => {
  const nav = $('.navbar');
  if (!nav) return;
  const y = window.scrollY;
  nav.classList.toggle('scrolled', y > 36);
  const lt = $('.large-title');
  if (lt) anim.titleScroll(lt, Math.min(y / 52, 1));
  // iOS 26: 向下捲動時 Tab Bar 收縮成精簡膠囊, 向上/回頂展開
  const tabbar = $('.tabbar');
  if (tabbar) {
    if (y > lastScrollY + 4 && y > 80) tabbar.classList.add('min');
    else if (y < lastScrollY - 4 || y < 40) tabbar.classList.remove('min');
  }
  lastScrollY = y;
}, { passive: true });

// ------------------------------------------------------------
// 首頁
// ------------------------------------------------------------
function renderLanding() {
  const mode = USING_CLOUD
    ? `<div class="modebadge cloud">${icon('cloud', 'ic-sm')} 雲端同步已啟用 · 朋友用代碼即可共用</div>`
    : `<div class="modebadge local">${icon('offline', 'ic-sm')} 本機模式 · 資料只存在這台裝置</div>`;
  $('#app').innerHTML = `
    <div class="screen no-tabbar">
      <div class="navbar"><span class="spacer"></span>${themeBtnHTML()}</div>
      <div class="hero">
        <svg class="brandmark" viewBox="0 0 64 64" aria-label="Jarvisplitwise">
          <rect width="64" height="64" rx="15" fill="#007aff"/>
          <circle cx="26" cy="32" r="13" fill="none" stroke="#fff" stroke-width="4"/>
          <circle cx="40" cy="32" r="13" fill="none" stroke="#fff" stroke-width="4" opacity=".55"/>
        </svg>
        <h1>Jarvisplitwise</h1>
        <p class="sub">出去玩分帳 · 無筆數限制 · 無廣告</p>
      </div>
      ${mode}

      <div class="group">
        <div class="group-hdr">建立新群組</div>
        <div class="card">
          <label class="frow"><span class="lbl">名稱</span>
            <input id="newName" placeholder="例: 沖繩五日遊" /></label>
          <label class="frow"><span class="lbl">幣別</span>
            <select id="newCur">
              <option>NT$</option><option>$</option><option>¥</option><option>€</option><option>£</option><option>₩</option>
            </select></label>
        </div>
        <div class="btn-wrap"><button id="createBtn" class="btn">建立群組</button></div>
      </div>

      <div class="group">
        <div class="group-hdr">加入已有群組</div>
        <div class="card">
          <div class="frow center"><input id="joinCode" placeholder="群組代碼" maxlength="8"
            autocapitalize="characters" autocomplete="off" /></div>
        </div>
        <div class="btn-wrap"><button id="joinBtn" class="btn tinted">加入群組</button></div>
      </div>
    </div>`;

  $('#createBtn').onclick = async () => {
    const g = await db.createGroup($('#newName').value.trim() || '我的群組', $('#newCur').value);
    location.hash = g.code;
  };
  const join = () => { const c = $('#joinCode').value.trim().toUpperCase(); if (c) location.hash = c; };
  $('#joinBtn').onclick = join;
  $('#joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  wireThemeToggle();
}

// ------------------------------------------------------------
// 載入並開啟群組
// ------------------------------------------------------------
async function openGroup(g) {
  state.code = g.code; state.group = g; state.currency = g.currency || 'NT$';
  await reloadData();
  renderGroup();
  if (state.unsubscribe) state.unsubscribe();
  state.unsubscribe = db.subscribe(g.code, async () => { await reloadData(); renderPane(); });
}
async function reloadData() {
  const [members, expenses, settlements] = await Promise.all([
    db.getMembers(state.code), db.getExpenses(state.code), db.getSettlements(state.code),
  ]);
  state.members = members; state.expenses = expenses; state.settlements = settlements;
}
// 本機模式: 變更後手動重載並重繪 (雲端模式靠 realtime 訂閱)
async function refresh() { if (!USING_CLOUD) { await reloadData(); } renderPane(); }

// ------------------------------------------------------------
// 群組外殼: 大標題 + 內容 + 底部 Tab Bar
// ------------------------------------------------------------
function renderGroup() {
  const tabs = [
    { id: 'expenses', label: '消費', ic: 'card' },
    { id: 'balances', label: '結算', ic: 'swap' },
    { id: 'members', label: '成員', ic: 'people' },
  ];
  $('#app').innerHTML = `
    <div class="screen">
      <div class="navbar">
        <button class="nav-btn" id="backBtn" aria-label="返回">${icon('back')}群組</button>
        <span class="nav-title">${esc(state.group.name)}</span>
        <span class="spacer"></span>
        ${themeBtnHTML()}
        <button class="nav-btn icon-only" id="addBtn" aria-label="新增消費">${icon('plus')}</button>
      </div>
      <div class="bpass" id="codeChip" role="button" tabindex="0" aria-label="複製分享連結">
        <div class="bp-top">
          <div class="bp-eyebrow">
            <span class="e-l">${icon('plane', 'fill ic')}<span class="eyebrow">Boarding Pass</span></span>
            <span class="bp-cur">${esc(state.currency)}</span>
          </div>
          <div class="bp-dest">${esc(state.group.name)}</div>
          <div class="bp-route">分帳行程 · ${state.members.length} 人同行</div>
        </div>
        <div class="bp-perf"></div>
        <div class="bp-bot">
          <div><div class="lbl">Booking Ref</div><div class="bp-ref">${state.code}</div></div>
          <span class="bp-share">${icon('share', 'ic-sm')}分享</span>
        </div>
      </div>
      <div id="pane"></div>
    </div>
    <nav class="tabbar" role="tablist" aria-label="主導覽">
      ${tabs.map((t) => `
        <button class="tabitem${state.activeTab === t.id ? ' active' : ''}" data-tab="${t.id}"
          role="tab" aria-selected="${state.activeTab === t.id}">
          ${icon(t.ic, 'ic-out')}${icon(t.ic + '.fill', 'ic-on')}<span>${t.label}</span></button>`).join('')}
    </nav>`;

  $('#backBtn').onclick = () => { location.hash = ''; };
  $('#addBtn').onclick = openExpenseForm;
  wireThemeToggle();
  anim.revealBoardingPass();
  $('#codeChip').onclick = () => {
    navigator.clipboard?.writeText(location.origin + location.pathname + '#' + state.code);
    toast('已複製分享連結');
  };
  $$('.tabitem').forEach((t) => {
    t.onclick = () => {
      if (state.activeTab === t.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      state.activeTab = t.dataset.tab;
      $$('.tabitem').forEach((x) => {
        const on = x.dataset.tab === state.activeTab;
        x.classList.toggle('active', on); x.setAttribute('aria-selected', on);
      });
      window.scrollTo({ top: 0 });
      renderPane(true);
    };
  });
  renderPane(true);
}

// 依目前分頁繪製內容; animate=true 只在切分頁/首次顯示 (資料變動不重播動畫)
function renderPane(animate = false) {
  const pane = $('#pane');
  if (!pane) return;
  // 登機證頭的「N 人同行」隨成員變動更新 (header 不重繪, 在這同步)
  const rt = $('.bp-route');
  if (rt) rt.textContent = `分帳行程 · ${state.members.length} 人同行`;
  const balances = computeBalances(state.members, state.expenses, state.settlements);
  if (state.activeTab === 'expenses') renderExpensesPane(pane);
  else if (state.activeTab === 'balances') renderBalancesPane(pane, balances, animate);
  else renderMembersPane(pane);
  if (animate) anim.staggerIn(pane);
}

// ---------- 消費 ----------
function renderExpensesPane(pane) {
  const total = state.expenses.reduce((s, e) => s + e.amountCents, 0);
  const labelOf = { equal: '平均', exact: '指定金額', percent: '百分比', shares: '份數' };
  pane.innerHTML = `
    <div class="group">
      <div class="card">
        <div class="cell">
          <div class="main"><div class="title">總消費</div><div class="sub">${state.expenses.length} 筆紀錄</div></div>
          <div class="trail"><span class="amt tnum" style="color:var(--label)">${money(total)}</span></div>
        </div>
      </div>
      <div class="btn-wrap"><button id="openAdd" class="btn">${icon('plus')}新增消費</button></div>
    </div>
    <div class="group">
      <div class="group-hdr">消費紀錄</div>
      <div class="card">
        ${state.expenses.map((e) => `
          <div class="cell inset-line">
            ${avatar(memberName(e.paidBy))}
            <div class="main">
              <div class="title">${esc(e.description)}</div>
              <div class="sub">${esc(memberName(e.paidBy))} 付了 · ${labelOf[e.splitType]} · ${e.participants.length} 人</div>
            </div>
            <div class="trail">
              <span class="amt tnum" style="color:var(--label)">${money(e.amountCents)}</span>
              <button class="cellbtn danger exp-del" data-id="${e.id}" aria-label="刪除消費">${icon('trash', 'ic-sm')}</button>
            </div>
          </div>`).join('') || '<div class="empty-cell">還沒有消費紀錄</div>'}
      </div>
    </div>`;
  $('#openAdd').onclick = openExpenseForm;
  $$('.exp-del', pane).forEach((b) => {
    b.onclick = async () => {
      if (!confirm('刪除這筆消費?')) return;
      await db.deleteExpense(state.code, b.dataset.id); refresh();
    };
  });
}

// ---------- 結算 ----------
function renderBalancesPane(pane, balances, animate) {
  const debts = simplifyDebts(balances);
  const maxAbs = Math.max(1, ...state.members.map((m) => Math.abs(balances[m.id] || 0)));

  const balRows = state.members.map((m) => {
    const c = balances[m.id] || 0;
    const net = c > 0 ? `<span class="pos">+${money(c)}</span>`
      : c < 0 ? `<span class="neg">−${money(-c)}</span>`
        : `<span style="color:var(--label-2)">已結清</span>`;
    const w = (Math.abs(c) / maxAbs) * 50;
    const fill = c > 0 ? `<div class="barfill pos" style="width:${w}%"></div>`
      : c < 0 ? `<div class="barfill neg" style="width:${w}%"></div>` : '';
    return `<div class="balrow">
      <div class="top">${avatar(m.name, 'sm')}<span class="nm">${esc(m.name)}</span><span class="net">${net}</span></div>
      <div class="bartrack"><div class="mid"></div>${fill}</div>
    </div>`;
  }).join('') || '<div class="empty-cell">還沒有成員</div>';

  const debtCard = debts.length
    ? `<div class="card">${debts.map((d) => `
        <div class="cell inset-line">
          ${avatar(memberName(d.from), 'sm')}
          <div class="main"><div class="title">${esc(memberName(d.from))} → ${esc(memberName(d.to))}</div></div>
          <div class="trail">
            <span class="amt tnum" style="color:var(--label)">${money(d.amountCents)}</span>
            <button class="cellbtn settle" style="font-size:15px;min-width:auto"
              data-from="${d.from}" data-to="${d.to}" data-amt="${d.amountCents}">標記已還</button>
          </div>
        </div>`).join('')}</div>`
    : `<div class="card"><div class="allclear"><span class="ok">${icon('check')}</span>全部結清,沒有人欠錢</div></div>`;

  pane.innerHTML = `
    <div class="group">
      <div class="group-hdr">每人淨額</div>
      <div class="card">${balRows}</div>
    </div>
    <div class="group">
      <div class="group-hdr">還款方式 · 最少筆數</div>
      ${debtCard}
    </div>
    <div class="group">
      <div class="group-hdr">結算紀錄 (${state.settlements.length})</div>
      <div class="card">
        ${state.settlements.map((s) => `
          <div class="cell inset-line">
            ${avatar(memberName(s.fromMember), 'sm')}
            <div class="main"><div class="title">${esc(memberName(s.fromMember))} → ${esc(memberName(s.toMember))}</div></div>
            <div class="trail">
              <span class="tnum" style="color:var(--label-2)">${money(s.amountCents)}</span>
              <button class="cellbtn danger set-del" style="font-size:15px;min-width:auto" data-id="${s.id}">撤銷</button>
            </div>
          </div>`).join('') || '<div class="empty-cell">尚無結算</div>'}
      </div>
    </div>`;

  $$('.settle', pane).forEach((b) => {
    b.onclick = async () => {
      await db.addSettlement(state.code, {
        fromMember: b.dataset.from, toMember: b.dataset.to, amountCents: Number(b.dataset.amt),
      });
      toast('已記錄還款'); refresh();
    };
  });
  $$('.set-del', pane).forEach((b) => {
    b.onclick = async () => { await db.deleteSettlement(state.code, b.dataset.id); refresh(); };
  });

  if (animate) {
    anim.animBars(pane);
    if (!debts.length) anim.popCheck($('.allclear .ok', pane));
  }
}

// ---------- 成員 ----------
function renderMembersPane(pane) {
  pane.innerHTML = `
    <div class="group">
      <div class="group-hdr">成員 (${state.members.length})</div>
      <div class="card">
        ${state.members.map((m) => `
          <div class="cell inset-line">
            ${avatar(m.name)}
            <div class="main"><div class="title">${esc(m.name)}</div></div>
            <div class="trail">
              <button class="cellbtn danger del" data-id="${m.id}" aria-label="移除成員">${icon('trash', 'ic-sm')}</button>
            </div>
          </div>`).join('') || '<div class="empty-cell">還沒有成員,先新增一位</div>'}
        <div class="frow">
          <input id="newMember" placeholder="輸入成員名字" autocomplete="off" />
          <button id="addMember" class="cellbtn" style="min-width:auto">新增</button>
        </div>
      </div>
      <div class="group-ftr">已記錄在消費或結算中的成員無法移除,以免帳目對不平。</div>
    </div>`;
  const add = async () => {
    const name = $('#newMember').value.trim(); if (!name) return;
    await db.addMember(state.code, name); refresh();
    const inp = $('#newMember'); if (inp) inp.focus();
  };
  $('#addMember').onclick = add;
  $('#newMember').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  $$('.del', pane).forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.id;
      const used = state.expenses.some((e) => e.paidBy === id || e.participants.some((p) => p.memberId === id))
        || state.settlements.some((s) => s.fromMember === id || s.toMember === id);
      if (used) { alert('這位成員已出現在消費或結算紀錄中,無法移除。\n請先刪除相關紀錄,帳目才不會對不平。'); return; }
      if (!confirm('移除此成員?')) return;
      await db.removeMember(state.code, id); refresh();
    };
  });
}

// ---------- 新增消費 (iOS sheet) ----------
function openExpenseForm() {
  if (state.members.length < 1) { toast('請先到「成員」分頁新增成員'); return; }
  let splitType = 'equal';
  const memberOpts = state.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  const types = [['equal', '平均'], ['exact', '指定'], ['percent', '%'], ['shares', '份數']];

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="新增消費">
      <div class="grabber"></div>
      <div class="sheet-nav">
        <button class="plain" id="f_cancel">取消</button>
        <span class="sheet-title">新增消費</span>
        <button class="plain strong" id="f_save">新增</button>
      </div>
      <div class="sheet-body">
        <div class="group" style="margin-top:4px">
          <div class="card">
            <label class="frow"><span class="lbl">名稱</span>
              <input id="f_desc" placeholder="晚餐、計程車…" /></label>
            <label class="frow"><span class="lbl">金額</span>
              <input id="f_amt" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" /></label>
            <label class="frow"><span class="lbl">誰付的</span>
              <select id="f_paid">${memberOpts}</select></label>
          </div>
        </div>
        <div class="group">
          <div class="group-hdr">分攤方式</div>
          <div class="seg-wrap" style="padding-top:0">
            <div class="seg" id="f_seg" role="tablist">
              ${types.map(([v, l], i) => `<button type="button" data-v="${v}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}
            </div>
          </div>
        </div>
        <div class="group">
          <div class="group-hdr" style="display:flex;justify-content:space-between;align-items:center">
            <span>分攤者</span>
            <button id="f_all" style="color:var(--blue);font-size:13px;font-weight:600">全選 / 全不選</button>
          </div>
          <div class="card" id="f_parts"></div>
          <div class="hint" id="f_hint"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const partsBox = $('#f_parts', overlay);
  const seg = $('#f_seg', overlay);

  function renderParts() {
    partsBox.innerHTML = state.members.map((m) => {
      const valInput = splitType === 'equal' ? ''
        : `<input class="pval" data-id="${m.id}" type="number" inputmode="decimal" min="0" step="0.01"
            placeholder="${splitType === 'percent' ? '%' : splitType === 'shares' ? '份' : '金額'}" />`;
      return `<label class="part">
        <input type="checkbox" class="pchk" data-id="${m.id}" checked />
        ${avatar(m.name, 'sm')}<span class="nm">${esc(m.name)}</span>${valInput}</label>`;
    }).join('');
    syncRows(); updateHint();
  }
  function syncRows() {
    $$('.part', overlay).forEach((row) => {
      const on = row.querySelector('.pchk').checked;
      row.classList.toggle('off', !on);
      const v = row.querySelector('.pval'); if (v) v.disabled = !on;
    });
  }
  function checkedVals() {
    return $$('.pval', overlay).filter((i) =>
      $(`.pchk[data-id="${i.dataset.id}"]`, overlay).checked);
  }
  function updateHint() {
    const h = $('#f_hint', overlay);
    const amt = toCents($('#f_amt', overlay).value || 0);
    const n = $$('.pchk:checked', overlay).length;
    h.classList.remove('good', 'bad');
    if (splitType === 'equal') {
      h.textContent = n ? `每人約 ${money(Math.round(amt / n))}` : '請至少選一位分攤者';
    } else if (splitType === 'percent') {
      const sum = checkedVals().reduce((s, i) => s + Number(i.value || 0), 0);
      h.textContent = `百分比總和 ${Math.round(sum * 100) / 100}% / 100%`;
      h.classList.add(Math.abs(sum - 100) <= 0.5 ? 'good' : 'bad');
    } else if (splitType === 'exact') {
      const sum = checkedVals().reduce((s, i) => s + toCents(i.value || 0), 0);
      h.textContent = `指定總和 ${money(sum)} / 消費 ${money(amt)}`;
      h.classList.add(sum === amt && amt > 0 ? 'good' : 'bad');
    } else {
      const sum = checkedVals().reduce((s, i) => s + Number(i.value || 0), 0);
      h.textContent = `共 ${Math.round(sum * 100) / 100} 份`;
    }
  }

  renderParts();
  seg.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      splitType = b.dataset.v;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      renderParts();
    };
  });
  $('#f_amt', overlay).addEventListener('input', updateHint);
  partsBox.addEventListener('input', () => { syncRows(); updateHint(); });
  $('#f_all', overlay).onclick = () => {
    const boxes = $$('.pchk', overlay);
    const allOn = boxes.every((b) => b.checked);
    boxes.forEach((b) => { b.checked = !allOn; });
    syncRows(); updateHint();
  };

  const sheet = overlay.querySelector('.sheet');
  const { close } = anim.presentSheet(overlay, sheet, {});
  $('#f_cancel', overlay).onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  $('#f_save', overlay).onclick = async () => {
    const participants = [];
    state.members.forEach((m) => {
      const chk = $(`.pchk[data-id="${m.id}"]`, overlay);
      if (!chk || !chk.checked) return;
      const v = $(`.pval[data-id="${m.id}"]`, overlay);
      participants.push({ memberId: m.id, value: v ? Number(v.value || 0) : 0 });
    });
    const exp = {
      description: $('#f_desc', overlay).value.trim(),
      amountCents: toCents($('#f_amt', overlay).value || 0),
      paidBy: $('#f_paid', overlay).value,
      splitType, participants,
    };
    const v = validateExpense(exp);
    if (!v.ok) { toast(v.error); return; }
    await db.addExpense(state.code, exp);
    close(); refresh();
  };
  setTimeout(() => $('#f_desc', overlay)?.focus(), 80);
}

// ------------------------------------------------------------
// toast (aria-live, 自動消失)
// ------------------------------------------------------------
let toastTimer;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

applyTheme(currentTheme());
// 偵測瀏覽器是否支援 SVG 濾鏡用於 backdrop-filter (Chromium 才行) → 開啟鏡頭折射
if (CSS.supports?.('backdrop-filter', 'url(#liquid-glass)')
  || CSS.supports?.('-webkit-backdrop-filter', 'url(#liquid-glass)')) {
  document.documentElement.classList.add('fx-displace');
}
anim.bindPressBounce();
route();
