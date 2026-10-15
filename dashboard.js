// ====== CẤU HÌNH ======
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyorZAVs5EOeU8lxdEZR-hxV_JG7eBiuU1vJKZOiUL9d3hOylNZm2fIL1w4a1CYcCvDqg/exec";
const TOTAL_ROW_LABEL = "Tổng cộng";
const ACCOUNTING_ROW_NAME = "Kế toán"; 
const HIDDEN_BRANCHES = ["PKH"]; 
const REFRESH_SECONDS = 300;     
const ROTATE_SECONDS = 150;     
const OUTPUT_UNIT = "";           

const ROTATE_MS = ROTATE_SECONDS * 1000;

const numberText = (n) => Math.round(n).toLocaleString('vi-VN');
const percentText = (n) => n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

function tierOf(percent) {
  if (percent < 50) return 'tier-low';
  if (percent < 80) return 'tier-mid';
  return 'tier-good';
}

// ---- Đọc dữ liệu từ Apps Script ----

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function normalizeText(s) {
  return String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isHidden(name) {
  return HIDDEN_BRANCHES.some((h) => normalizeText(h) === normalizeText(name));
}

function isAccountingRow(name) {
  return normalizeText(name) === normalizeText(ACCOUNTING_ROW_NAME);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function parseYearRows(rows, accounting) {
  const allItems = [];

  rows.forEach((row) => {
    const name = String(row[0] || '').trim();
    if (!name) return;
    if (normalizeText(name) === normalizeText(TOTAL_ROW_LABEL)) return; 

    const plan = toNumber(row[1]);
    const done = toNumber(row[2]);
    const remain = toNumber(row[3]);

    const percent = plan !== 0 ? round2((done / plan) * 100) : 100;
    allItems.push({ name, plan, done, remain, percent });
  });

  if (allItems.length === 0) return { main: null, accounting };

  const totalPlan = allItems.reduce((s, i) => s + i.plan, 0);
  const totalDone = allItems.reduce((s, i) => s + i.done, 0);
  const totalRemain = allItems.reduce((s, i) => s + i.remain, 0);
  const totalPercent = totalPlan !== 0 ? round2((totalDone / totalPlan) * 100) : 100;

  return {
    main: {
      total: { name: TOTAL_ROW_LABEL, plan: totalPlan, done: totalDone, remain: totalRemain, percent: totalPercent },
      branches: allItems.filter((i) => !isHidden(i.name)),
    },
    accounting,
  };
}

function parseQuarterRows(rows, quarterKey) {
  const currentYear = new Date().getFullYear();
  const groups = {};
  let accounting = null;

  rows.forEach((row) => {
    const year = toNumber(row[0]);
    const quarter = String(row[1] || '').trim();
    const branch = String(row[2] || '').trim();
    if (!branch || !year) return;
    if (year !== currentYear) return;
    if (quarter.toLowerCase() !== quarterKey.toLowerCase()) return;

    const plan = toNumber(row[3]);
    const done = toNumber(row[4]);

    if (isAccountingRow(branch)) {
      if (!accounting) accounting = { done: 0 };
      accounting.done += done;
      return;
    }

    if (!groups[branch]) groups[branch] = { plan: 0, done: 0 };
    groups[branch].plan += plan;
    groups[branch].done += done;
  });

  const names = Object.keys(groups);
  if (names.length === 0) return { main: null, accounting };

  let totalPlan = 0, totalDone = 0;
  names.forEach((n) => { totalPlan += groups[n].plan; totalDone += groups[n].done; });
  const totalRemain = totalPlan - totalDone;
  const totalPercent = totalPlan !== 0 ? round2((totalDone / totalPlan) * 100) : 100;

  const branches = names
    .filter((n) => !isHidden(n))
    .map((name) => {
      const plan = groups[name].plan;
      const done = groups[name].done;
      const percent = plan !== 0 ? round2((done / plan) * 100) : 100;
      return { name, plan, done, remain: plan - done, percent };
    });

  return {
    main: {
      total: { name: quarterKey.toUpperCase(), plan: totalPlan, done: totalDone, remain: totalRemain, percent: totalPercent },
      branches,
    },
    accounting,
  };
}

function animateValue(el, toValue, { isPercent = false, duration = 800, format = null } = {}) {
  const from = parseFloat(el.dataset.value || '0');
  const to = toValue;
  const start = performance.now();

  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = from + (to - from) * eased;
    el.textContent = format ? format(current) : (isPercent ? percentText(current) : numberText(current));
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      el.classList.remove('pop');
    }
  }

  requestAnimationFrame(frame);
  el.dataset.value = to;
}

function compareBranches(a, b) {
  const aNoPlan = a.plan === 0;
  const bNoPlan = b.plan === 0;
  if (aNoPlan && bNoPlan) return b.done - a.done;
  if (aNoPlan) return 1;
  if (bNoPlan) return -1;
  return b.percent - a.percent;
}

function getQuarterEnd(year, qNum) {
  return new Date(year, qNum * 3, 0, 23, 59, 59);
}

// ================
//  MỘT MÀN HÌNH
// ================
function createScreen(root, cfg) {
  const heroEl = root.querySelector('.hero');
  const acctEl = root.querySelector('.accounting-panel');
  const gridEl = root.querySelector('.branch-grid');
  const cards = new Map();
  const state = { subtitle: '', updated: '' };

  let view = 'year';
  let heroBuilt = false;
  let acctBuilt = false;
  let hasLoadedOnce = false;
  let refreshTimer = null;
  let loadToken = 0; 

  if (cfg.timeInHero) heroEl.classList.add('five'); 
  if (acctEl) {
    acctEl.innerHTML = `
      ${cfg.hasAccounting ? '<div class="aside-block"><div class="accounting-title">Doanh thu Kế toán</div><div class="acct-body"></div></div>' : ''}
      <div class="aside-block">
        <div class="accounting-title">Thời gian còn lại</div>
        <div class="accounting-value"><span class="value-num js-days" data-value="0">0</span><span class="unit js-days-unit">ngày</span></div>
      </div>`;
  }

  const unitHtml = cfg.unit ? `<span class="unit">${cfg.unit}</span>` : '';
  const $ = (sel) => heroEl.querySelector(sel);

  function buildHero() {
    heroEl.innerHTML = `
      <div class="hero-stat">
        <div class="stat-label">Kế hoạch</div>
        <div class="stat-value"><span class="value-num js-plan" data-value="0">0</span>${unitHtml}</div>
      </div>
      <div class="hero-stat">
        <div class="stat-label">Đã thực hiện</div>
        <div class="stat-value"><span class="value-num js-done" data-value="0">0</span>${unitHtml}</div>
      </div>
      <div class="hero-stat">
        <div class="stat-label">Còn lại</div>
        <div class="stat-value"><span class="value-num js-remain" data-value="0">0</span>${unitHtml}</div>
      </div>
      <div class="hero-stat big percent">
        <div class="stat-label">% hoàn thành</div>
        <div class="stat-value"><span class="value-num js-percent" data-value="0">0,00%</span></div>
      </div>
      <div class="hero-stat hero-time${cfg.timeInHero ? ' big' : ''}">
        <div class="stat-label">Thời gian còn lại</div>
        <div class="stat-value"><span class="value-num js-days" data-value="0">0</span><span class="unit js-days-unit">ngày</span></div>
      </div>
      ${cfg.hasAccounting ? `
      <div class="hero-stat hero-accounting">
        <div class="stat-label">Doanh thu Kế toán</div>
        <div class="stat-value"><span class="value-num js-acct-hero" data-value="0">0</span><span class="unit">VNĐ</span></div>
      </div>` : ''}
      <div class="hero-progress"><div class="hero-progress-fill js-fill" style="width:0%"></div></div>
    `;
    heroBuilt = true;
  }

  function updateHero(total) {
    if (!total) {
      heroEl.innerHTML = '<div class="hero-loading">Chưa có dữ liệu tổng.</div>';
      heroBuilt = false;
      return;
    }
    if (!heroBuilt) buildHero();

    animateValue($('.js-plan'), total.plan);
    animateValue($('.js-done'), total.done);
    animateValue($('.js-remain'), total.remain);
    animateValue($('.js-percent'), total.percent, { isPercent: true });

    const tier = tierOf(total.percent);
    $('.js-fill').style.width = Math.min(100, total.percent) + '%';
    $('.js-fill').className = `hero-progress-fill js-fill ${tier}`;
    $('.js-percent').closest('.hero-stat').className = `hero-stat big percent ${tier}`;
  }

  function updateAccounting(accounting) {
    if (!cfg.hasAccounting || !acctEl) return;
    const body = acctEl.querySelector('.acct-body');

    if (!accounting) {
      body.innerHTML = '<div class="empty-state" style="padding:1vh 0;">Chưa có dữ liệu.</div>';
      acctBuilt = false;
      return;
    }
    if (!acctBuilt) {
      body.innerHTML = '<div class="accounting-value"><span class="value-num acct-done" data-value="0">0</span><span class="unit">VNĐ</span></div>';
      acctBuilt = true;
    }
    animateValue(body.querySelector('.acct-done'), accounting.done);
    const heroAcct = heroEl.querySelector('.js-acct-hero');
    if (heroAcct) animateValue(heroAcct, accounting.done);
  }

  function createCard(b) {
    const card = document.createElement('div');
    card.dataset.name = b.name;
    card.innerHTML = `
      <div class="branch-name"></div>
      <div class="branch-row"><span>Kế hoạch</span><span><span class="value-num plan" data-value="0">0</span>${unitHtml}</span></div>
      <div class="branch-row"><span>Đã thực hiện</span><span><span class="value-num done" data-value="0">0</span>${unitHtml}</span></div>
      <div class="branch-row"><span>Còn lại</span><span><span class="value-num remain" data-value="0">0</span>${unitHtml}</span></div>
      <div class="branch-progress"><div class="branch-progress-fill" style="width:0%"></div></div>
      <div class="branch-percent"><span class="value-num percent" data-value="0">0,00%</span></div>
    `;
    card.querySelector('.branch-name').textContent = b.name;
    gridEl.appendChild(card);
    cards.set(b.name, card);
    return card;
  }

  function updateCard(card, b) {
    const noPlan = b.plan === 0;
    card.className = `branch-card ${tierOf(b.percent)}${noPlan ? ' no-plan' : ''}`;

    animateValue(card.querySelector('.plan'), b.plan);
    animateValue(card.querySelector('.done'), b.done);
    animateValue(card.querySelector('.remain'), b.remain);

    if (!noPlan) {
      animateValue(card.querySelector('.percent'), b.percent, { isPercent: true });
      card.querySelector('.branch-progress-fill').style.width = Math.min(100, b.percent) + '%';
    }
  }

  function renderBranches(branches) {
    if (!branches || branches.length === 0) {
      gridEl.innerHTML = `<div class="empty-state">${cfg.emptyText}</div>`;
      cards.clear();
      return;
    }
    gridEl.querySelectorAll('.empty-state').forEach((e) => e.remove());

    const sorted = branches.filter((b) => !(cfg.hideEmpty && b.plan === 0 && b.done === 0)).sort(compareBranches);
    branches = sorted;
    const seen = new Set();

    sorted.forEach((b, i) => {
      seen.add(b.name);
      let card = cards.get(b.name);
      if (!card) card = createCard(b);
      else gridEl.appendChild(card); 
      card.style.setProperty('--i', i);
      updateCard(card, b);
    });

    for (const [name, card] of cards.entries()) {
      if (!seen.has(name)) { card.remove(); cards.delete(name); }
    }

    state.subtitle = cfg.subtitle(branches.length);
  }

  function updateTimeRemaining() {
    const dayEls = root.querySelectorAll('.js-days');
    if (!dayEls.length) return;

    const now = new Date();
    const year = now.getFullYear();
    const end = view === 'year'
      ? new Date(year, 11, 31, 23, 59, 59)
      : getQuarterEnd(year, parseInt(view.replace('q', ''), 10));
    const over = end < now;
    const days = Math.ceil((end - now) / 86400000);

    dayEls.forEach((daysEl) => {
      const unitEl = daysEl.parentElement.querySelector('.js-days-unit');
      if (over) {
        daysEl.dataset.value = 0;
        daysEl.textContent = 'Đã kết thúc';
        if (unitEl) unitEl.style.display = 'none';
      } else {
        if (unitEl) unitEl.style.display = '';
        animateValue(daysEl, days, { format: (n) => Math.round(n).toLocaleString('vi-VN') });
      }
    });
  }

  async function fetchRows() {
    const res = await fetch(`${APPS_SCRIPT_URL}?view=${cfg.apiView(view)}`, { cache: 'no-store' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.rows || [];
  }


  async function fetchAccounting() {
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?view=accounting`, { cache: 'no-store' });
      const data = await res.json();
      if (data.error || data.value === '' || data.value == null) return null;
      return { done: toNumber(data.value) };
    } catch (e) {
      return null;
    }
  }

  function scheduleNextRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    const jitter = Math.random() * 30000; 
    refreshTimer = setTimeout(load, REFRESH_SECONDS * 1000 + jitter);
  }

  async function load() {
    const token = ++loadToken;
    try {
      const useCell = cfg.hasAccounting && view === 'year'; 
      const [rows, accountingCell] = await Promise.all([
        fetchRows(),
        useCell ? fetchAccounting() : Promise.resolve(null),
      ]);
      if (token !== loadToken) return;

      const parsed = cfg.hasQuarters && view !== 'year'
        ? parseQuarterRows(rows, view)
        : parseYearRows(rows, accountingCell);

      if (!parsed.main) {
        updateAccounting(parsed.accounting);
        const msg = view === 'year'
          ? cfg.noDataText
          : `Chưa có dữ liệu cho ${view.toUpperCase()}/${new Date().getFullYear()}.`;
        if (!hasLoadedOnce) {
          heroEl.innerHTML = `<div class="error-state">${msg}</div>`;
          heroBuilt = false;
        } else {
          state.updated = msg;
        }
        onChange();
        scheduleNextRefresh();
        return;
      }

      updateHero(parsed.main.total);
      updateAccounting(parsed.accounting); 
      renderBranches(parsed.main.branches);
      updateTimeRemaining();

      const now = new Date();
      state.updated = `Cập nhật lúc ${now.toLocaleTimeString('vi-VN')} ${now.toLocaleDateString('vi-VN')}`;
      hasLoadedOnce = true;
      onChange();
      scheduleNextRefresh();
    } catch (err) {
      if (token !== loadToken) return;
      if (!hasLoadedOnce) {
        heroEl.innerHTML = `<div class="error-state">Không tải được dữ liệu: ${err.message}</div>`;
      } else {
        state.updated = 'Mất kết nối, đang hiển thị số liệu cũ (thử lại sau)';
      }
      onChange();
      scheduleNextRefresh();
    }
  }

  function setView(v) {
    if (v === view) return;
    view = v;
    hasLoadedOnce = false;
    cards.clear();
    gridEl.innerHTML = '';
    heroEl.innerHTML = '<div class="hero-loading">Đang tải dữ liệu…</div>';
    heroBuilt = false;
    load();
  }

  let onChange = () => {};
  return {
    root, state, load, setView, updateTimeRemaining,
    getView: () => view,
    onChange: (fn) => { onChange = fn; },
  };
}

// ==================
//  HAI MÀN HÌNH 
// ==================
const pageTitleEl = document.getElementById('pageTitle');
const pageSubtitleEl = document.getElementById('pageSubtitle');
const updatedAtEl = document.getElementById('updatedAt');
const clockEl = document.getElementById('clock');
const titleBlock = document.getElementById('titleBlock');
const viewTabsEl = document.getElementById('viewTabs');
const viewTabs = document.querySelectorAll('.view-tab');
const screenTabs = document.querySelectorAll('.screen-tab');
const rotateFill = document.getElementById('rotateBarFill');

const screens = {
  revenue: createScreen(document.getElementById('screenRevenue'), {
    unit: 'VNĐ',
    hasAccounting: true,
    hasQuarters: true,
    apiView: (v) => v,
    emptyText: 'Chưa có dữ liệu chi nhánh.',
    noDataText: 'Không đọc được dữ liệu năm.',
    subtitle: (n) => `${n} chi nhánh & nhà máy`,
  }),
  output: createScreen(document.getElementById('screenOutput'), {
    unit: OUTPUT_UNIT,
    hasAccounting: false,
    hasQuarters: false,
    timeInHero: true, 
    hideEmpty: true, 
    apiView: () => 'output',
    emptyText: 'Chưa có dữ liệu sản lượng.',
    noDataText: 'Chưa có dữ liệu sản lượng.',
    subtitle: (n) => `${n} đơn vị`,
  }),
};

let activeKey = 'revenue';

function titleFor(key) {
  const year = new Date().getFullYear();
  const word = key === 'output' ? 'SẢN LƯỢNG' : 'DOANH THU';
  const view = screens[key].getView();
  return view === 'year' || key === 'output'
    ? `KẾ HOẠCH ${word} ${year}`
    : `KẾ HOẠCH ${word} ${view.toUpperCase()}/${year}`;
}


function refreshHeader() {
  const s = screens[activeKey];
  pageTitleEl.textContent = titleFor(activeKey);
  pageSubtitleEl.textContent = s.state.subtitle;
  updatedAtEl.textContent = s.state.updated;
}
Object.values(screens).forEach((s) => s.onChange(refreshHeader));

// ---- Tự động chuyển màn hình----
let rotateTimer = null;
let transitionTimer = null;

function restartRotation() {
  if (rotateTimer) clearTimeout(rotateTimer);
  rotateTimer = setTimeout(() => {
    showScreen(activeKey === 'revenue' ? 'output' : 'revenue');
  }, ROTATE_MS);


  rotateFill.classList.remove('run');
  void rotateFill.offsetWidth;
  rotateFill.style.animationDuration = ROTATE_MS + 'ms';
  rotateFill.classList.add('run');
}

function showScreen(key) {
  restartRotation(); 

  if (key === activeKey) return;


  if (transitionTimer) clearTimeout(transitionTimer);
  Object.values(screens).forEach((s) => s.root.classList.remove('leaving', 'entering'));

  const from = screens[activeKey].root;
  const to = screens[key].root;

  from.classList.remove('is-active');
  from.classList.add('leaving');
  to.classList.add('is-active', 'entering');

  activeKey = key;

  screenTabs.forEach((b) => b.classList.toggle('active', b.dataset.screen === key));
  viewTabsEl.classList.toggle('is-hidden', key === 'output'); // Năm/Q1-Q4 chỉ dùng cho Doanh thu

  titleBlock.classList.remove('swap');
  void titleBlock.offsetWidth;
  titleBlock.classList.add('swap');
  refreshHeader();

  transitionTimer = setTimeout(() => {
    from.classList.remove('leaving');
    to.classList.remove('entering');
  }, 900);
}

screenTabs.forEach((btn) => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

// ---- Chuyển Năm/Quý ----
viewTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    viewTabs.forEach((b) => b.classList.toggle('active', b === btn));
    screens.revenue.setView(btn.dataset.view);
    refreshHeader();
    restartRotation(); 
  });
});

function tickClock() {
  clockEl.textContent = new Date().toLocaleTimeString('vi-VN');
}

tickClock();
setInterval(tickClock, 1000);
setInterval(() => Object.values(screens).forEach((s) => s.updateTimeRemaining()), 60000);

refreshHeader();
screens.revenue.load();
screens.output.load();
restartRotation();
