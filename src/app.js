/* ============================================================
   Spendwise — Personal Expense Tracker
   Plain HTML/CSS/JS implementation with Supabase backend
   ============================================================ */

const SUPABASE_URL = 'https://wiefemmswknxtwcvurce.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZWZlbW1zd2tueHR3Y3Z1cmNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MTk3MjcsImV4cCI6MjA5OTM5NTcyN30.cjK7qkAdPfAHqejeRDe1sJDwPudaDt7ZY8FQcmIPbv8';

const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Housing', 'Entertainment', 'Health', 'Bills', 'Other'];
const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investments', 'Gifts', 'Other'];
const PALETTE = ['#1f2430', '#3b5bdb', '#0ca678', '#e8590c', '#e03131', '#7048e8', '#f08c00', '#1098ad', '#495057'];

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============ STATE ============ */
let transactions = [];
let loading = true;
let monthKey = formatMonthKey(new Date());
let formOpen = false;
let editingId = null;
let submitting = false;
let formType = 'expense';

/* ============ HELPERS ============ */
function formatMonthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtCurrency(n, decimals = 2) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrencyShort(n) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDateLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function shiftMonth(delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  monthKey = formatMonthKey(d);
  renderHeader();
  load();
}

/* ============ DATA ============ */
async function load() {
  loading = true;
  hideError();
  renderStats();
  renderTrendChart();
  renderTxList();
  renderCategoryChart();

  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(y, m - 1, 1).toISOString().slice(0, 10);
  const end = new Date(y, m, 0).toISOString().slice(0, 10);

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    transactions = data || [];
  } catch (e) {
    showError(e.message || 'Failed to load transactions');
    transactions = [];
  }

  loading = false;
  renderAll();
}

async function handleSubmit(e) {
  e.preventDefault();
  if (submitting) return;

  const amount = parseFloat(document.getElementById('fAmount').value);
  const description = document.getElementById('fDesc').value.trim();
  const category = document.getElementById('fCategory').value;
  const date = document.getElementById('fDate').value;

  let valid = true;
  if (!(amount > 0)) { showFieldError('errAmount'); valid = false; } else hideFieldError('errAmount');
  if (description.length === 0) { showFieldError('errDesc'); valid = false; } else hideFieldError('errDesc');
  if (!valid) return;

  submitting = true;
  setSubmittingState(true);
  hideError();

  const payload = {
    amount: Math.round(amount * 100) / 100,
    type: formType,
    description,
    category,
    date,
  };

  try {
    if (editingId) {
      const { error } = await supabase.from('transactions').update(payload).eq('id', editingId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('transactions').insert(payload);
      if (error) throw error;
    }
    closeModal();
    await load();
  } catch (err) {
    showError(err.message || 'Failed to save transaction');
  } finally {
    submitting = false;
    setSubmittingState(false);
  }
}

async function handleDelete(id) {
  try {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
    transactions = transactions.filter((t) => t.id !== id);
    renderAll();
  } catch (err) {
    showError(err.message || 'Failed to delete transaction');
  }
}

/* ============ RENDER: HEADER ============ */
function renderHeader() {
  document.getElementById('monthLabel').textContent = monthLabel(monthKey);
}

/* ============ RENDER: STATS ============ */
function renderStats() {
  const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const balance = income - expenses;
  const balanceTone = balance >= 0 ? 'ink' : 'amber';

  const row = document.getElementById('statsRow');
  row.innerHTML = '';

  row.appendChild(makeStatCard('Income', loading ? null : fmtCurrency(income), 'emerald', 'This month', 'trending-up'));
  row.appendChild(makeStatCard('Expenses', loading ? null : fmtCurrency(expenses), 'rose', 'This month', 'trending-down'));
  row.appendChild(makeStatCard('Balance', loading ? null : fmtCurrency(balance), balanceTone, balance >= 0 ? 'In the green' : 'Over budget', 'scale'));
}

function makeStatCard(label, value, tone, sublabel, iconName) {
  const card = document.createElement('div');
  card.className = `stat-card tone-${tone}`;

  const icons = {
    'trending-up': '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    'trending-down': '<path d="M22 17 13.5 8.5 8.5 13.5 2 7"/><path d="M16 17h6v-6"/>',
    'scale': '<path d="M16 16h6"/><path d="M2 16h6"/><path d="M5 16v-6"/><path d="M19 16v-6"/><path d="M12 3v18"/><path d="M8 7h8"/><path d="M8 7l-3 9"/><path d="M16 7l3 9"/>',
  };

  card.innerHTML = `
    <div class="stat-card-head">
      <span class="stat-label">${label}</span>
      <span class="stat-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-20">${icons[iconName]}</svg>
      </span>
    </div>
    <div class="stat-value ${tone === 'amber' ? 'stat-value-accent' : ''}">${value === null ? '<span class="skeleton"></span>' : escapeHtml(value)}</div>
    <div class="stat-sub">${sublabel}</div>
  `;
  return card;
}

/* ============ RENDER: TREND CHART ============ */
function renderTrendChart() {
  const body = document.getElementById('trendChartBody');
  const footer = document.getElementById('trendFooter');

  if (loading) {
    body.innerHTML = '<div style="height:16rem;border-radius:1rem;background:var(--ink-50);animation:pulse 1.5s infinite"></div>';
    footer.classList.add('hidden');
    return;
  }

  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const byDate = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${monthKey}-${String(d).padStart(2, '0')}`;
    byDate[key] = { expense: 0, income: 0 };
  }
  for (const t of transactions) {
    const entry = byDate[t.date];
    if (!entry) continue;
    if (t.type === 'expense') entry.expense += Number(t.amount);
    else entry.income += Number(t.amount);
  }

  const dailyData = Object.entries(byDate).map(([date, v]) => {
    const d = new Date(date + 'T00:00:00');
    return {
      date,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      expense: Math.round(v.expense * 100) / 100,
      income: Math.round(v.income * 100) / 100,
    };
  });

  const hasData = dailyData.some((d) => d.expense > 0 || d.income > 0);
  const peakExpense = Math.max(...dailyData.map((d) => d.expense), 0);

  if (!hasData) {
    body.innerHTML = `
      <div class="trend-empty">
        <div class="trend-empty-title">No activity yet</div>
        <div class="trend-empty-sub">Add transactions to see the trend</div>
      </div>`;
    footer.classList.add('hidden');
    return;
  }

  body.innerHTML = '<div class="trend-canvas-wrap"><canvas class="trend-canvas" id="trendCanvas"></canvas></div>';
  footer.classList.remove('hidden');
  footer.innerHTML = `<span class="trend-footer-label">Peak spending day</span><span class="trend-footer-value">${fmtCurrencyShort(peakExpense)}</span>`;

  requestAnimationFrame(() => drawTrendChart(dailyData));
}

function drawTrendChart(data) {
  const canvas = document.getElementById('trendCanvas');
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const padTop = 8, padRight = 8, padLeft = 48, padBottom = 24;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const maxVal = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 0) * 1.15 || 1;
  const niceMax = Math.ceil(maxVal / 10) * 10;

  // Grid lines
  ctx.strokeStyle = '#eceef2';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 6]);
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const gy = padTop + (chartH / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, gy);
    ctx.lineTo(padLeft + chartW, gy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Y-axis labels
  ctx.fillStyle = '#8593aa';
  ctx.font = '500 11px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= gridSteps; i++) {
    const val = niceMax - (niceMax / gridSteps) * i;
    const gy = padTop + (chartH / gridSteps) * i;
    const label = val >= 1000 ? `$${(val / 1000).toFixed(1)}k` : `$${Math.round(val)}`;
    ctx.fillText(label, padLeft - 8, gy);
  }

  // X-axis labels (sparse)
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  data.forEach((d, i) => {
    if (i % labelStep !== 0 && i !== data.length - 1) return;
    const x = padLeft + (chartW / (data.length - 1 || 1)) * i;
    ctx.fillText(d.label, x, padTop + chartH + 6);
  });

  const xFor = (i) => padLeft + (chartW / (data.length - 1 || 1)) * i;
  const yFor = (v) => padTop + chartH - (v / niceMax) * chartH;

  // Draw area + line for income and expense
  drawArea(ctx, data, 'income', '#0ca678', xFor, yFor, padTop, chartH);
  drawArea(ctx, data, 'expense', '#e03131', xFor, yFor, padTop, chartH);

  // Store geometry for tooltip
  canvas._geom = { data, xFor, yFor, padTop, padLeft, chartW, chartH };

  // Tooltip on hover
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const idx = Math.round(((mx - padLeft) / chartW) * (data.length - 1));
    if (idx < 0 || idx >= data.length) { hideTrendTooltip(); return; }
    showTrendTooltip(data[idx], xFor(idx), yFor(Math.max(data[idx].income, data[idx].expense)), wrap);
  };
  canvas.onmouseleave = hideTrendTooltip;
}

function drawArea(ctx, data, key, color, xFor, yFor, padTop, chartH) {
  // Gradient fill
  const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
  grad.addColorStop(0, color + '38');
  grad.addColorStop(1, color + '00');

  // Fill path
  ctx.beginPath();
  ctx.moveTo(xFor(0), padTop + chartH);
  data.forEach((d, i) => {
    const x = xFor(i);
    const y = yFor(d[key]);
    if (i === 0) ctx.lineTo(x, y);
    else {
      const px = xFor(i - 1);
      const py = yFor(data[i - 1][key]);
      const cpx = (px + x) / 2;
      ctx.bezierCurveTo(cpx, py, cpx, y, x, y);
    }
  });
  ctx.lineTo(xFor(data.length - 1), padTop + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = xFor(i);
    const y = yFor(d[key]);
    if (i === 0) ctx.moveTo(x, y);
    else {
      const px = xFor(i - 1);
      const py = yFor(data[i - 1][key]);
      const cpx = (px + x) / 2;
      ctx.bezierCurveTo(cpx, py, cpx, y, x, y);
    }
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function showTrendTooltip(d, x, y, wrap) {
  let tip = document.getElementById('trendTooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'trendTooltip';
    tip.className = 'trend-tooltip';
    wrap.appendChild(tip);
  }
  tip.innerHTML = `
    <div class="trend-tooltip-label">${d.label}</div>
    <div class="trend-tooltip-row">
      <span class="trend-tooltip-dot" style="background:#e03131"></span>
      <span class="trend-tooltip-key">Expense</span>
      <span class="trend-tooltip-val">${fmtCurrencyShort(d.expense)}</span>
    </div>
    <div class="trend-tooltip-row">
      <span class="trend-tooltip-dot" style="background:#0ca678"></span>
      <span class="trend-tooltip-key">Income</span>
      <span class="trend-tooltip-val">${fmtCurrencyShort(d.income)}</span>
    </div>`;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
  tip.style.display = 'block';
}

function hideTrendTooltip() {
  const tip = document.getElementById('trendTooltip');
  if (tip) tip.style.display = 'none';
}

/* ============ RENDER: TRANSACTION LIST ============ */
function renderTxList() {
  const body = document.getElementById('txBody');
  const countEl = document.getElementById('txCount');

  if (loading) {
    countEl.textContent = '';
    body.innerHTML = `
      <div class="list-skeleton">
        ${Array.from({ length: 5 }).map(() => `
          <div class="list-skeleton-row">
            <div class="list-skeleton-circle"></div>
            <div class="list-skeleton-lines">
              <div class="list-skeleton-line w1"></div>
              <div class="list-skeleton-line w2"></div>
            </div>
            <div class="list-skeleton-line w3"></div>
          </div>`).join('')}
      </div>`;
    return;
  }

  countEl.textContent = `${transactions.length} ${transactions.length === 1 ? 'entry' : 'entries'}`;

  if (transactions.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-28" style="width:28px;height:28px"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>
        </div>
        <h3 class="empty-title">No transactions yet</h3>
        <p class="empty-text">Track your first income or expense to start building your financial picture.</p>
        <button class="empty-btn" onclick="openAdd()">Add transaction</button>
      </div>`;
    return;
  }

  // Group by date
  const groups = {};
  for (const t of transactions) {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
  }
  const groupEntries = Object.entries(groups);

  body.innerHTML = '<div class="tx-list no-scrollbar"></div>';
  const list = body.querySelector('.tx-list');

  for (const [date, items] of groupEntries) {
    const dayTotal = items.reduce((s, t) => s + (t.type === 'expense' ? -Number(t.amount) : Number(t.amount)), 0);
    const group = document.createElement('div');
    group.className = 'tx-group';
    group.innerHTML = `
      <div class="tx-group-head">
        <span class="tx-date-label">${formatDateLabel(date)}</span>
        <span class="tx-day-total ${dayTotal >= 0 ? 'pos' : 'neg'}">${dayTotal >= 0 ? '+' : '−'}${fmtCurrencyShort(Math.abs(dayTotal))}</span>
      </div>`;
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    for (const t of items) {
      ul.appendChild(makeTxItem(t));
    }
    group.appendChild(ul);
    list.appendChild(group);
  }
}

function makeTxItem(t) {
  const li = document.createElement('li');
  li.className = 'tx-item';
  li.innerHTML = `
    <div class="tx-icon ${t.type}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-20">
        ${t.type === 'income'
          ? '<path d="M17 7H7l5 5-5 5h10"/><path d="M17 7v10"/>'
          : '<path d="M7 7h10l-5 5 5 5H7"/><path d="M7 7v10"/>'}
      </svg>
    </div>
    <div class="tx-info">
      <p class="tx-desc">${escapeHtml(t.description)}</p>
      <p class="tx-cat">${escapeHtml(t.category)}</p>
    </div>
    <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '−'}${fmtCurrency(Number(t.amount))}</div>
    <div class="tx-actions" data-id="${t.id}"></div>`;

  const actions = li.querySelector('.tx-actions');
  actions.appendChild(makeEditBtn(t));
  actions.appendChild(makeDeleteBtn(t));
  return li;
}

function makeEditBtn(t) {
  const btn = document.createElement('button');
  btn.className = 'tx-act-btn';
  btn.setAttribute('aria-label', 'Edit');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-16"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
  btn.onclick = () => openEdit(t);
  return btn;
}

function makeDeleteBtn(t) {
  const btn = document.createElement('button');
  btn.className = 'tx-act-btn danger';
  btn.setAttribute('aria-label', 'Delete');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-16"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
  btn.onclick = () => showDeleteConfirm(btn, t.id);
  return btn;
}

function showDeleteConfirm(originalBtn, id) {
  const actions = originalBtn.parentElement;
  actions.innerHTML = '';
  const delBtn = document.createElement('button');
  delBtn.className = 'tx-confirm-delete';
  delBtn.textContent = 'Delete';
  delBtn.onclick = () => handleDelete(id);
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'tx-confirm-cancel';
  cancelBtn.textContent = 'No';
  cancelBtn.onclick = () => renderTxList();
  actions.appendChild(delBtn);
  actions.appendChild(cancelBtn);
}

/* ============ RENDER: CATEGORY CHART ============ */
function renderCategoryChart() {
  const body = document.getElementById('categoryBody');
  const expenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  if (loading) {
    body.innerHTML = '<div class="cat-skeleton"></div>';
    return;
  }

  const expenseByCat = transactions
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + Number(t.amount); return acc; }, {});
  const entries = Object.entries(expenseByCat).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    body.innerHTML = `
      <div class="cat-empty">
        <div class="cat-empty-title">No expenses yet</div>
        <div class="cat-empty-sub">Add a transaction to see the breakdown</div>
      </div>`;
    return;
  }

  const chartData = entries.map(([cat, amt], i) => ({
    name: cat, value: amt, color: PALETTE[i % PALETTE.length],
  }));

  body.innerHTML = `
    <div class="cat-body">
      <div class="cat-donut-wrap">
        <canvas class="cat-donut-canvas" id="catCanvas"></canvas>
        <div class="cat-donut-center">
          <span class="cat-donut-center-label">Total</span>
          <span class="cat-donut-center-value">${fmtCurrencyShort(expenses)}</span>
        </div>
      </div>
      <ul class="cat-legend" id="catLegend"></ul>
    </div>`;

  const legend = document.getElementById('catLegend');
  legend.style.listStyle = 'none';
  for (const s of chartData.slice(0, 6)) {
    const li = document.createElement('li');
    li.className = 'cat-legend-item';
    li.innerHTML = `
      <div class="cat-legend-left">
        <span class="cat-legend-dot" style="background:${s.color}"></span>
        <span class="cat-legend-name">${escapeHtml(s.name)}</span>
      </div>
      <div class="cat-legend-right">
        <span class="cat-legend-amount">${fmtCurrencyShort(s.value)}</span>
        <span class="cat-legend-pct">${expenses > 0 ? Math.round((s.value / expenses) * 100) : 0}%</span>
      </div>`;
    legend.appendChild(li);
  }

  requestAnimationFrame(() => drawDonutChart(chartData, expenses));
}

function drawDonutChart(data, total) {
  const canvas = document.getElementById('catCanvas');
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(wrap.clientWidth, 208);
  const dprSize = size * dpr;
  canvas.width = dprSize;
  canvas.height = dprSize;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = Math.max(size / 2 - 4, 10);
  const innerR = Math.max(outerR * 0.71, 5);
  let startAngle = -Math.PI / 2;
  const gap = 0.035;

  for (const seg of data) {
    const fraction = seg.value / (total || 1);
    const endAngle = startAngle + fraction * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle + gap, endAngle - gap);
    ctx.arc(cx, cy, innerR, endAngle - gap, startAngle + gap, true);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    startAngle = endAngle;
  }
}

/* ============ MODAL / FORM ============ */
function openAdd() {
  editingId = null;
  formType = 'expense';
  resetForm();
  openModal();
}

function openEdit(t) {
  editingId = t.id;
  formType = t.type;
  document.getElementById('fAmount').value = t.amount;
  document.getElementById('fDesc').value = t.description;
  populateCategories();
  document.getElementById('fCategory').value = t.category;
  document.getElementById('fDate').value = t.date;
  updateTypeToggle();
  document.getElementById('modalTitle').textContent = 'Edit transaction';
  document.getElementById('submitLabel').textContent = 'Save changes';
  openModal();
}

function openModal() {
  formOpen = true;
  document.getElementById('modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (!editingId) {
    document.getElementById('modalTitle').textContent = 'New transaction';
    document.getElementById('submitLabel').textContent = 'Add transaction';
  }
}

function closeModal() {
  formOpen = false;
  editingId = null;
  document.getElementById('modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function resetForm() {
  document.getElementById('fAmount').value = '';
  document.getElementById('fDesc').value = '';
  populateCategories();
  document.getElementById('fDate').value = todayISO();
  document.getElementById('fDate').max = todayISO();
  hideFieldError('errAmount');
  hideFieldError('errDesc');
  updateTypeToggle();
}

function populateCategories() {
  const cats = formType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const sel = document.getElementById('fCategory');
  sel.innerHTML = cats.map((c) => `<option value="${c}">${c}</option>`).join('');
}

function updateTypeToggle() {
  const expBtn = document.getElementById('typeExpense');
  const incBtn = document.getElementById('typeIncome');
  expBtn.classList.remove('active', 'expense', 'income');
  incBtn.classList.remove('active', 'expense', 'income');
  if (formType === 'expense') {
    expBtn.classList.add('active', 'expense');
  } else {
    incBtn.classList.add('active', 'income');
  }
}

function setType(type) {
  formType = type;
  populateCategories();
  updateTypeToggle();
}

function setSubmittingState(val) {
  document.getElementById('formSubmit').disabled = val;
  document.getElementById('submitSpinner').classList.toggle('hidden', !val);
}

function showFieldError(id) { document.getElementById(id).classList.remove('hidden'); }
function hideFieldError(id) { document.getElementById(id).classList.add('hidden'); }

function showError(msg) {
  const el = document.getElementById('errorBanner');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError() { document.getElementById('errorBanner').classList.add('hidden'); }

/* ============ RENDER ALL ============ */
function renderAll() {
  renderStats();
  renderTrendChart();
  renderTxList();
  renderCategoryChart();
}

/* ============ EVENT BINDING ============ */
function bindEvents() {
  document.getElementById('prevMonth').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('nextMonth').addEventListener('click', () => shiftMonth(1));
  document.getElementById('addBtnDesktop').addEventListener('click', openAdd);
  document.getElementById('addBtnFab').addEventListener('click', openAdd);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('formCancel').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', closeModal);
  document.getElementById('txForm').addEventListener('submit', handleSubmit);
  document.getElementById('typeExpense').addEventListener('click', () => setType('expense'));
  document.getElementById('typeIncome').addEventListener('click', () => setType('income'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && formOpen) closeModal();
  });

  window.addEventListener('resize', () => {
    if (!loading && transactions.length > 0) {
      renderTrendChart();
      renderCategoryChart();
    }
  });
}

/* ============ INIT ============ */
function init() {
  bindEvents();
  renderHeader();
  resetForm();
  load();
}

document.addEventListener('DOMContentLoaded', init);
