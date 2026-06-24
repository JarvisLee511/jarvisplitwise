// ============================================================
// anim.js — GSAP 動態層 (iOS 手感)
// 原則: 只動關鍵元素、可中斷、尊重 reduced-motion、動態 token 一致。
// 若 GSAP 未載入或使用者要求減少動態, 全部降級為「直接到位」。
// ============================================================
const gsap = window.gsap;
const { Draggable, InertiaPlugin, CustomEase, SplitText } = window;
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ON = !!gsap && !REDUCED;

let EASE = 'power3.out';
if (gsap) {
  try {
    gsap.registerPlugin(Draggable, InertiaPlugin, CustomEase, SplitText);
    // iOS 預設彈簧近似 cubic-bezier(.32,.72,0,1)
    if (CustomEase) { CustomEase.create('ios', 'M0,0 C0.32,0.72 0,1 1,1'); EASE = 'ios'; }
  } catch (e) { /* 缺外掛就用內建 ease, 不致命 */ }
}

// 畫面 push / pop 橫向轉場 (進場從右, 返回從左)
export function enterScreen(direction) {
  if (!ON) return;
  const s = document.querySelector('#app .screen');
  if (!s) return;
  if (direction === 'forward') {
    gsap.from(s, { xPercent: 100, duration: 0.5, ease: EASE, clearProps: 'transform' });
  } else if (direction === 'back') {
    gsap.from(s, { xPercent: -26, duration: 0.44, ease: EASE, clearProps: 'transform' });
  } else {
    gsap.from(s, { opacity: 0, y: 8, duration: 0.4, ease: 'power2.out', clearProps: 'opacity,transform' });
  }
}

// 登機證頭進場: 卡片浮起 + 目的地逐字升起 (SplitText 簽名動作)
export function revealBoardingPass(scope) {
  if (!ON) return;
  const bp = (scope || document).querySelector('.bpass');
  if (!bp) return;
  gsap.from(bp, { opacity: 0, y: 16, duration: 0.55, ease: EASE, clearProps: 'opacity,transform' });
  const dest = bp.querySelector('.bp-dest');
  if (dest && SplitText) {
    try {
      const split = new SplitText(dest, { type: 'chars' });
      gsap.from(split.chars, {
        yPercent: 70, opacity: 0, duration: 0.55, stagger: 0.028, ease: 'power3.out',
        delay: 0.08, onComplete: () => split.revert(),   // 還原 DOM, 避免影響後續 re-render
      });
    } catch (e) { /* SplitText 缺失就略過 */ }
  }
}

// 分頁內容: 分段交錯淡入 (只在切分頁/首次顯示時)
export function staggerIn(container) {
  if (!ON || !container) return;
  const groups = container.querySelectorAll(':scope > .group');
  if (!groups.length) return;
  gsap.from(groups, {
    opacity: 0, y: 12, duration: 0.45, stagger: 0.05,
    ease: 'power2.out', clearProps: 'opacity,transform',
  });
}

// 招牌: 淨額長條成長 (scaleX 變形, GPU, 不觸發 reflow)
export function animBars(pane) {
  if (!ON || !pane) return;
  const bars = pane.querySelectorAll('.barfill');
  if (!bars.length) return;
  gsap.from(bars, {
    scaleX: 0, duration: 0.6, stagger: 0.06, ease: EASE,
    transformOrigin: (i, t) => (t.classList.contains('neg') ? 'right center' : 'left center'),
    clearProps: 'transform',
  });
}

// 全部結清的綠勾彈出
export function popCheck(el) {
  if (!ON || !el) return;
  gsap.from(el, { scale: 0, duration: 0.55, ease: 'back.out(2)', clearProps: 'transform' });
}

// ------------------------------------------------------------
// 左滑刪除 (iOS swipe-to-delete) — 即使 reduced-motion 也可用 (使用者操作)
// ------------------------------------------------------------
const openSwipes = new Set();
function closeOtherSwipes(except) { openSwipes.forEach((a) => { if (a !== except) a.close(); }); }
export function makeSwipe(wrap, onDelete) {
  const cell = wrap.querySelector('.swipe-cell');
  const del = wrap.querySelector('.swipe-del');
  if (!cell || !del) return null;
  if (!gsap || !Draggable) { del.onclick = (e) => { e.stopPropagation(); onDelete(api); }; return null; }
  const W = 88;
  let open = false;
  const move = (toOpen) => {
    open = toOpen;
    gsap.to(cell, { x: toOpen ? -W : 0, duration: 0.42, ease: EASE });
    if (toOpen) openSwipes.add(api); else openSwipes.delete(api);
  };
  const api = { close: () => move(false) };
  Draggable.create(cell, {
    type: 'x', bounds: { minX: -W, maxX: 0 }, edgeResistance: 0.85,
    inertia: false, dragClickables: false, allowContextMenu: true,
    onPress() { closeOtherSwipes(api); },
    onDragEnd() { move(this.x < -W * 0.4); },
  });
  del.onclick = (e) => { e.stopPropagation(); onDelete(api); };
  cell.addEventListener('click', (e) => { if (open) { e.preventDefault(); e.stopPropagation(); api.close(); } });
  return api;
}

// 玻璃控制元件按壓: 縮放 + 彈簧回彈 (iOS 26 interactive glass)
export function bindPressBounce() {
  if (!ON) return;
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('.btn');
    if (!el) return;
    gsap.to(el, { scale: 0.955, duration: 0.12, ease: 'power2.out' });
    const release = () => {
      gsap.to(el, { scale: 1, duration: 0.6, ease: 'elastic.out(1,0.55)' });
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointerleave', release);
      el.removeEventListener('pointercancel', release);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointerleave', release);
    el.addEventListener('pointercancel', release);
  }, { passive: true });
}

// 大標題隨捲動收合 (由 app 的 scroll 監聽呼叫)
export function titleScroll(largeTitle, p) {
  if (!ON || !largeTitle) return;
  gsap.set(largeTitle, { opacity: 1 - p, y: -p * 6 });
}

// ------------------------------------------------------------
// 底部 sheet: 彈簧彈出 + 下滑慣性關閉
// 回傳 { close } — close() 動畫關閉後移除 overlay 並呼叫 onClose
// ------------------------------------------------------------
export function presentSheet(overlay, sheet, { onClose } = {}) {
  const done = () => { try { Draggable.get?.(sheet)?.kill(); } catch (e) {} overlay.remove(); onClose?.(); };

  if (!ON) {            // 降級: 直接顯示 / 直接關閉
    let drag;
    if (gsap && Draggable) drag = makeDrag();
    return { close: () => { drag?.kill?.(); overlay.remove(); onClose?.(); } };
  }

  const h = sheet.offsetHeight || window.innerHeight;
  gsap.set(overlay, { opacity: 0 });
  gsap.set(sheet, { yPercent: 100 });
  gsap.to(overlay, { opacity: 1, duration: 0.3, ease: 'power1.out' });
  gsap.to(sheet, { yPercent: 0, duration: 0.52, ease: EASE });

  function dismiss() {
    gsap.killTweensOf(sheet);
    gsap.to(overlay, { opacity: 0, duration: 0.28, ease: 'power1.in' });
    gsap.to(sheet, { yPercent: 100, y: 0, duration: 0.3, ease: 'power2.in', onComplete: done });
  }
  function snapBack() {
    gsap.to(sheet, { y: 0, duration: 0.5, ease: EASE });
    gsap.to(overlay, { opacity: 1, duration: 0.25 });
  }
  makeDrag(dismiss, snapBack, h);
  return { close: dismiss };

  // 只有頂部把手 + 導覽列可拖曳 (避免和內文捲動衝突)
  function makeDrag(onDismiss, onSnap, height) {
    if (!Draggable) return null;
    const handles = [sheet.querySelector('.grabber'), sheet.querySelector('.sheet-nav')].filter(Boolean);
    const arr = Draggable.create(sheet, {
      type: 'y', trigger: handles, inertia: true, dragClickables: false,
      edgeResistance: 0.92, bounds: { minY: 0, maxY: (height || sheet.offsetHeight) * 1.2 },
      onPress() { if (gsap) gsap.killTweensOf(sheet); },
      onDrag() { if (overlay) overlay.style.opacity = String(1 - Math.min(this.y / (height || 400), 1) * 0.85); },
      onDragEnd() {
        const v = InertiaPlugin?.getVelocity ? InertiaPlugin.getVelocity(sheet, 'y') : 0;
        if (this.y > (height || 400) * 0.32 || v > 700) (onDismiss || done)();
        else (onSnap || (() => {}))();
      },
    });
    return arr && arr[0];
  }
}
