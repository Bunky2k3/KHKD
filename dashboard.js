// ====== CẤU HÌNH ======
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbypxVOhXyHz5Gfq2tXkI7_NkIRW7oOon5UyLNH8mwQ-6noUkDbq4PGr8psI_bLJOMH6yQ/exec";
const TOTAL_ROW_LABEL = "Tổng cộng";
const HIDDEN_BRANCHES = ["PKH"]; // Cộng vào Tổng nhưng ẩn khỏi lưới hiển thị
const REFRESH_SECONDS = 300;

const heroSection = document.getElementById('heroSection');
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

// ---- Đọc dữ liệu thô từ Apps Script & tự xử lý nghiệp vụ (trước đây nằm bên C#) ----

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function isHidden(name) {
  return HIDDEN_BRANCHES.some((h) => h.toLowerCase() === name.toLowerCase());
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Dữ liệu thô của view "year": mỗi dòng là [Chi nhánh, Kế hoạch, Đã thực hiện, Còn lại]
function parseYearRows(rows) {
  const allItems = [];

  rows.forEach((row) => {
    const name = String(row[0] || '').trim();
    if (!name) return;
    if (name.toLowerCase() === TOTAL_ROW_LABEL.toLowerCase()) return; // bỏ dòng Tổng có sẵn, tự cộng lại bên dưới

    const plan = toNumber(row[1]);
    const done = toNumber(row[2]);
    const remain = toNumber(row[3]);
    const percent = plan !== 0 ? round2((done / plan) * 100) : 100;

    allItems.push({ name, plan, done, remain, percent });
  });

  if (allItems.length === 0) return null;

  // Tổng = cộng dồn TẤT CẢ đơn vị, kể cả đơn vị bị ẩn khỏi lưới (ví dụ PKH)
  const totalPlan = allItems.reduce((s, i) => s + i.plan, 0);
  const totalDone = allItems.reduce((s, i) => s + i.done, 0);
  const totalRemain = allItems.reduce((s, i) => s + i.remain, 0);
  const totalPercent = totalPlan !== 0 ? round2((totalDone / totalPlan) * 100) : 100;

  return {
    total: { name: TOTAL_ROW_LABEL, plan: totalPlan, done: totalDone, remain: totalRemain, percent: totalPercent },
    branches: allItems.filter((i) => !isHidden(i.name)),
  };
}

// Dữ liệu thô của view "q1".."q4": mỗi dòng là [Năm, Quý, Chi nhánh, Kế hoạch, Đã thực hiện]
// Gộp theo Chi nhánh, chỉ lấy đúng Năm hiện tại + đúng Quý đang xem
function parseQuarterRows(rows, quarterKey) {
  const currentYear = new Date().getFullYear();
  const groups = {};

  rows.forEach((row) => {
    const year = toNumber(row[0]);
    const quarter = String(row[1] || '').trim();
    const branch = String(row[2] || '').trim();
    if (!branch || !year) return;
    if (year !== currentYear) return;
    if (quarter.toLowerCase() !== quarterKey.toLowerCase()) return;

    const plan = toNumber(row[3]);
    const done = toNumber(row[4]);

    if (!groups[branch]) groups[branch] = { plan: 0, done: 0 };
    groups[branch].plan += plan;
    groups[branch].done += done;
  });

  const names = Object.keys(groups);
  if (names.length === 0) return null;

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
    total: { name: quarterKey.toUpperCase(), plan: totalPlan, done: totalDone, remain: totalPlan - totalDone, percent: totalPercent },
    branches,
  };
}

// Đếm số chạy dần từ giá trị cũ -> giá trị mới, kèm hiệu ứng nảy nhẹ
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

// ---- Khối Tổng (hero) ----
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

  // Đơn vị không có Kế hoạch (plan = 0) luôn rơi xuống cuối dù % hiển thị 100%,
  // trong nhóm đó sắp theo Đã thực hiện giảm dần. Còn lại sắp theo % hoàn thành giảm dần.
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
      branchGrid.appendChild(card); // đưa card đã có về đúng vị trí mới theo thứ hạng
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
  if (!daysEl) return; // hero chưa dựng xong (lần load đầu tiên)

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
  const jitter = Math.random() * 30000; // lệch ngẫu nhiên 0-30s, tránh nhiều máy cùng gọi 1 lúc
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

    if (!parsed) {
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

    updateHero(parsed.total);
    renderBranches(parsed.branches);
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
  hasLoadedOnce = false; // để lỗi/rỗng của view mới hiện rõ ngay, không lẫn với dữ liệu view cũ

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
setInterval(updateTimeRemaining, 60000); // cập nhật đếm ngược mỗi phút

updateTitle();
loadData();
