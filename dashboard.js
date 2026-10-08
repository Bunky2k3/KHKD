//const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbypxVOhXyHz5Gfq2tXkI7_NkIRW7oOon5UyLNH8mwQ-6noUkDbq4PGr8psI_bLJOMH6yQ/exec";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkwjxj53CzoaTXa6py4Hg438Eibz34iRWa56qCd_tj70rvAaS5Gl5xhx3Sq_YzDiw9PQ/exec";
const TOTAL_ROW_LABEL = "Tổng cộng";
const ACCOUNTING_ROW_NAME = "Kế toán"; 
const HIDDEN_BRANCHES = ["PKH"];
const REFRESH_SECONDS = 300;

const heroSection = document.getElementById('heroSection');
const accountingSection = document.getElementById('accountingSection');
const branchGrid = document.getElementById('branchGrid');
const updatedAtEl = document.getElementById('updatedAt');
const clockEl = document.getElementById('clock');
const pageTitleEl = document.getElementById('pageTitle');
const pageSubtitleEl = document.getElementById('pageSubtitle');
const viewTabs = document.querySelectorAll('.view-tab');

let currentView = 'year';

const numberText = (n) => Math.round(n).toLocaleString('vi-VN');
const percentText = (n) => n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

function tierOf(percent) {
  if (percent < 50) return 'tier-low';
  if (percent < 80) return 'tier-mid';
  return 'tier-good';
}

// ---- Đọc dữ liệu thô từ Apps Script và tự xử lý nghiệp vụ ----

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


function parseYearRows(rows) {
  const allItems = [];
  let accounting = null;

  rows.forEach((row) => {
    const name = String(row[0] || '').trim();
    if (!name) return;
    if (normalizeText(name) === normalizeText(TOTAL_ROW_LABEL)) return; 

    const plan = toNumber(row[1]);
    const done = toNumber(row[2]);
    const remain = toNumber(row[3]);

    if (isAccountingRow(name)) {
      accounting = { done }; 
      return;
    }

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
      total: { name: quarterKey.toUpperCase(), plan: totalPlan, done: totalDone, remain: totalPlan - totalDone, percent: totalPercent },
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


let heroBuilt = false;

function buildHero() {
  heroSection.innerHTML = `
    <div class="hero-stat">
      <div class="stat-label">Kế hoạch</div>
      <div class="stat-value"><span class="value-num" id="heroPlan" data-value="0">0</span><span class="unit">VNĐ</span></div>
    </div>
    <div class="hero-stat">
      <div class="stat-label">Đã thực hiện</div>
      <div class="stat-value"><span class="value-num" id="heroDone" data-value="0">0</span><span class="unit">VNĐ</span></div>
    </div>
    <div class="hero-stat">
      <div class="stat-label">Còn lại</div>
      <div class="stat-value"><span class="value-num" id="heroRemain" data-value="0">0</span><span class="unit">VNĐ</span></div>
    </div>
    <div class="hero-stat percent">
      <div class="stat-label">% hoàn thành</div>
      <div class="stat-value"><span class="value-num" id="heroPercent" data-value="0">0,00%</span></div>
    </div>
    <div class="hero-stat">
      <div class="stat-label">Thời gian còn lại</div>
      <div class="stat-value"><span class="value-num" id="heroDaysLeft" data-value="0">0</span><span class="unit" id="heroDaysUnit">ngày</span></div>
    </div>
    <div class="hero-stat hero-accounting">
      <div class="stat-label">Doanh thu Kế toán</div>
      <div class="stat-value"><span class="value-num" id="heroAcctDone" data-value="0">0</span><span class="unit">VNĐ</span></div>
    </div>
    <div class="hero-progress"><div class="hero-progress-fill" id="heroProgressFill" style="width:0%"></div></div>
  `;
  heroBuilt = true;
}

function updateHero(total) {
  if (!total) {
    heroSection.innerHTML = '<div class="hero-loading">Chưa có dữ liệu tổng.</div>';
    heroBuilt = false;
    return;
  }

  if (!heroBuilt) buildHero();

  animateValue(document.getElementById('heroPlan'), total.plan);
  animateValue(document.getElementById('heroDone'), total.done);
  animateValue(document.getElementById('heroRemain'), total.remain);
  animateValue(document.getElementById('heroPercent'), total.percent, { isPercent: true });

  document.getElementById('heroProgressFill').style.width = Math.min(100, total.percent) + '%';

  const tier = tierOf(total.percent);
  document.getElementById('heroProgressFill').className = `hero-progress-fill ${tier}`;
  document.getElementById('heroPercent').closest('.hero-stat').className = `hero-stat percent ${tier}`;
}

let accountingBuilt = false;

function buildAccountingPanel() {
  accountingSection.innerHTML = `
    <div class="accounting-title">Doanh thu Kế toán</div>
    <div class="accounting-value"><span class="value-num acct-done" data-value="0">0</span><span class="unit">VNĐ</span></div>
  `;
  accountingBuilt = true;
}

function updateAccounting(accounting) {
    const heroAcctEl = document.getElementById('heroAcctDone'); // bản nằm trong khối Tổng (dùng cho điện thoại)
    const heroAcctStat = heroAcctEl ? heroAcctEl.closest('.hero-stat') : null;

    if (!accounting) {
        accountingSection.innerHTML = '<div class="accounting-title">Doanh thu Kế toán</div><div class="empty-state" style="padding:2vh 0;">Chưa có dữ liệu.</div>';
        accountingBuilt = false;
        if (heroAcctStat) heroAcctStat.style.display = 'none';
        return;
    }

    if (!accountingBuilt) buildAccountingPanel();
    animateValue(accountingSection.querySelector('.acct-done'), accounting.done);

    if (heroAcctStat) heroAcctStat.style.display = '';
    if (heroAcctEl) animateValue(heroAcctEl, accounting.done);
}
// ---- Lưới chi nhánh ----
const branchCards = new Map();

function createBranchCard(b) {
  const card = document.createElement('div');
  card.className = `branch-card ${tierOf(b.percent)}`;
  card.dataset.name = b.name;
  card.innerHTML = `
    <div class="branch-name">${b.name}</div>
    <div class="branch-row"><span>Kế hoạch</span><span><span class="value-num plan" data-value="0">0</span><span class="unit">VNĐ</span></span></div>
    <div class="branch-row"><span>Đã thực hiện</span><span><span class="value-num done" data-value="0">0</span><span class="unit">VNĐ</span></span></div>
    <div class="branch-row"><span>Còn lại</span><span><span class="value-num remain" data-value="0">0</span><span class="unit">VNĐ</span></span></div>
    <div class="branch-progress"><div class="branch-progress-fill" style="width:0%"></div></div>
    <div class="branch-percent"><span class="value-num percent" data-value="0">0,00%</span></div>
  `;
  branchGrid.appendChild(card);
  branchCards.set(b.name, card);
  return card;
}

function updateBranchCard(card, b) {
  const tier = tierOf(b.percent);
  const noPlan = b.plan === 0;

  card.className = `branch-card ${tier}${noPlan ? ' no-plan' : ''}`;

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
    branchGrid.innerHTML = '<div class="empty-state">Chưa có dữ liệu chi nhánh.</div>';
    branchCards.clear();
    return;
  }


  function compareBranches(a, b) {
    const aNoPlan = a.plan === 0;
    const bNoPlan = b.plan === 0;

    if (aNoPlan && bNoPlan) return b.done - a.done;
    if (aNoPlan) return 1;
    if (bNoPlan) return -1;

    return b.percent - a.percent;
  }

  const sorted = branches.slice().sort(compareBranches);
  const seen = new Set();

  sorted.forEach((b) => {
    seen.add(b.name);
    let card = branchCards.get(b.name);
    if (!card) {
      card = createBranchCard(b);
    } else {
      branchGrid.appendChild(card); 
    }
    updateBranchCard(card, b);
  });

  for (const [name, card] of branchCards.entries()) {
    if (!seen.has(name)) {
      card.remove();
      branchCards.delete(name);
    }
  }

  pageSubtitleEl.textContent = `${branches.length} chi nhánh & nhà máy`;
}

// ---- Tiêu đề động theo năm/quý hiện tại ----
function updateTitle() {
  const year = new Date().getFullYear();
  pageTitleEl.textContent = currentView === 'year'
    ? `KẾ HOẠCH DOANH THU ${year}`
    : `KẾ HOẠCH DOANH THU ${currentView.toUpperCase()}/${year}`;
}

// ---- Đếm thời gian còn lại (hết năm / hết quý) ----
function getQuarterEnd(year, qNum) {
  return new Date(year, qNum * 3, 0, 23, 59, 59);
}

function updateTimeRemaining() {
  const daysEl = document.getElementById('heroDaysLeft');
  const unitEl = document.getElementById('heroDaysUnit');
  if (!daysEl) return; 

  const now = new Date();
  const year = now.getFullYear();
  const end = currentView === 'year'
    ? new Date(year, 11, 31, 23, 59, 59)
    : getQuarterEnd(year, parseInt(currentView.replace('q', ''), 10));

  if (end < now) {
    daysEl.dataset.value = 0;
    daysEl.textContent = 'Đã kết thúc';
    if (unitEl) unitEl.style.display = 'none';
    return;
  }

  if (unitEl) unitEl.style.display = '';
  const days = Math.ceil((end - now) / 86400000);
  animateValue(daysEl, days, { format: (n) => Math.round(n).toLocaleString('vi-VN') });
}

// ---- Vòng lặp tải dữ liệu ----
let refreshTimer = null;
let hasLoadedOnce = false;

function scheduleNextRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  const jitter = Math.random() * 30000; 
  refreshTimer = setTimeout(loadData, REFRESH_SECONDS * 1000 + jitter);
}

async function loadData() {
  updateTitle();

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?view=${currentView}`, { cache: 'no-store' });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    const parsed = currentView === 'year'
      ? parseYearRows(data.rows || [])
      : parseQuarterRows(data.rows || [], currentView);

      if (!parsed.main) {
      updateAccounting(parsed.accounting);

          const msg = currentView === 'year'
              ? 'Không đọc được dữ liệu năm.'
              : `Chưa có dữ liệu cho ${currentView.toUpperCase()}/${new Date().getFullYear()}.`;

      if (!hasLoadedOnce) {
        heroSection.innerHTML = `<div class="error-state">${msg}</div>`;
        heroBuilt = false;
      } else {
        updatedAtEl.textContent = msg;
      }
      scheduleNextRefresh();
      return;
    }

      updateHero(parsed.main.total);
      updateAccounting(parsed.accounting);
    renderBranches(parsed.main.branches);
    updateTimeRemaining();

    const now = new Date();
    updatedAtEl.textContent = `Cập nhật lúc ${now.toLocaleTimeString('vi-VN')} ${now.toLocaleDateString('vi-VN')}`;
    hasLoadedOnce = true;
    scheduleNextRefresh();
  } catch (err) {
    if (!hasLoadedOnce) {
      heroSection.innerHTML = `<div class="error-state">Không tải được dữ liệu: ${err.message}</div>`;
    } else {
      updatedAtEl.textContent = 'Mất kết nối, đang hiển thị số liệu cũ (thử lại sau)';
    }
    scheduleNextRefresh();
  }
}

// ---- Chuyển đổi Năm / Q1-Q4 ----
function switchView(view) {
  if (view === currentView) return;
  currentView = view;
  hasLoadedOnce = false;

  branchCards.clear();
  branchGrid.innerHTML = '';
  heroSection.innerHTML = '<div class="hero-loading">Đang tải dữ liệu…</div>';
  heroBuilt = false;

  viewTabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  loadData();
}

viewTabs.forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function tickClock() {
  clockEl.textContent = new Date().toLocaleTimeString('vi-VN');
}

tickClock();
setInterval(tickClock, 1000);
setInterval(updateTimeRemaining, 60000);

updateTitle();
loadData();
