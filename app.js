(function () {
  'use strict';

  var STORAGE_KEY = 'budget-planner:v1';
  var DAY = 24 * 60 * 60 * 1000;
  var MAX_AMOUNT = 999999;

  var INCOME_CATEGORIES = [
    { key: 'living', name: '生活费', color: '#2f6f5e' },
    { key: 'salary', name: '工资', color: '#3f6fa8' },
    { key: 'parttime', name: '兼职', color: '#6a8a4a' },
    { key: 'scholarship', name: '奖学金', color: '#8a6a9a' },
    { key: 'income-other', name: '其他', color: '#818780' }
  ];

  var EXPENSE_CATEGORIES = [
    { key: 'food', name: '餐饮', bucket: 'essential', weight: 0.30, color: '#c26a43' },
    { key: 'transport', name: '交通', bucket: 'essential', weight: 0.12, color: '#3f6fa8' },
    { key: 'study', name: '学习', bucket: 'essential', weight: 0.10, color: '#6a8a4a' },
    { key: 'housing', name: '居住', bucket: 'essential', weight: 0.38, color: '#8a6a9a' },
    { key: 'medical', name: '医疗', bucket: 'essential', weight: 0.10, color: '#b84c3b' },
    { key: 'shopping', name: '购物', bucket: 'wants', weight: 0.40, color: '#d08a3e' },
    { key: 'entertainment', name: '娱乐', bucket: 'wants', weight: 0.35, color: '#b25c7a' },
    { key: 'other', name: '其他', bucket: 'wants', weight: 0.25, color: '#818780' }
  ];

  var SAVING_CATEGORY = { key: 'saving', name: '储蓄', bucket: 'savings', color: '#3f6fa8' };
  var QUOTA_CATEGORIES = EXPENSE_CATEGORIES.concat([SAVING_CATEGORY]);

  var SCHEMES = {
    '50-30-20': { ratio: '50 / 30 / 20', label: '稳健型 · 必要 / 想要 / 储蓄', essential: 0.5, wants: 0.3, savings: 0.2 },
    '60-25-15': { ratio: '60 / 25 / 15', label: '节俭型 · 必要 / 想要 / 储蓄', essential: 0.6, wants: 0.25, savings: 0.15 },
    '40-30-30': { ratio: '40 / 30 / 30', label: '储蓄优先 · 必要 / 想要 / 储蓄', essential: 0.4, wants: 0.3, savings: 0.3 }
  };

  var BUCKETS = {
    essential: { name: '必要开支', color: '#2f6f5e' },
    wants: { name: '想要开支', color: '#c26a43' },
    savings: { name: '储蓄', color: '#3f6fa8' }
  };

  var LEVELS = {
    high: { label: '警示', rank: 3 },
    medium: { label: '提示', rank: 2 },
    info: { label: '说明', rank: 1 }
  };

  var CATEGORY_MAP = new Map();
  EXPENSE_CATEGORIES.concat(INCOME_CATEGORIES).forEach(function (cat) {
    CATEGORY_MAP.set(cat.key, cat);
  });

  var TOP_ACTIONS = {
    food: '先试试每周 2 次自带午饭或去食堂，减少外卖频次。',
    transport: '把部分短途打车换成公交、地铁或骑行。',
    shopping: '下单前把商品放进购物车，48 小时后再决定。',
    entertainment: '盘点会员和自动续费，停掉近一个月没用过的服务。',
    study: '优先使用图书馆、二手教材和免费公开课。',
    housing: '核对房租、水电和话费套餐，固定支出通常有优化空间。',
    medical: '医疗支出优先保障，可以留意医保报销和常备药清单。',
    other: '给「其他」类补上备注，连续记两周后再看哪些可以压缩。'
  };

  var TOP_SAVE_RATES = {
    food: 0.2,
    transport: 0.15,
    study: 0.15,
    housing: 0.05,
    medical: 0,
    shopping: 0.3,
    entertainment: 0.3,
    other: 0.2
  };

  var GENERIC_TIPS = [
    {
      id: 'generic-save-first',
      title: '先存后花',
      detail: '把储蓄当成一笔固定支出，而不是月底剩下的钱。',
      action: '发薪日先转出计划储蓄，再用剩余的钱安排当月开销。'
    },
    {
      id: 'generic-cooling',
      title: '48 小时冷静期',
      detail: '很多冲动消费在两天后就没那么想要了。',
      action: '非急需商品先加入购物车，48 小时后再决定是否购买。'
    },
    {
      id: 'generic-subscription',
      title: '盘点自动续费',
      detail: '小额订阅按月扣款，累计起来往往比想象中多。',
      action: '每月检查一次会员订阅，停掉近 30 天没用过的服务。'
    },
    {
      id: 'generic-list',
      title: '列好清单再购物',
      detail: '没有清单时，更容易顺手买回计划外的东西。',
      action: '去超市或网购前先列清单，只买清单上的物品。'
    },
    {
      id: 'generic-no-spend',
      title: '每周一天无消费日',
      detail: '给消费留一个暂停键，也能看清哪些支出并非必要。',
      action: '每周选一天不点外卖、不网购，只安排已有食物和活动。'
    }
  ];

  var moneyFmt = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  var state = loadState();
  var selectedMonth = monthOf(todayISO());
  var currentType = 'expense';
  var selectedCategory = 'food';
  var editingId = null;
  var selectedScheme = '50-30-20';
  var toastTimer = null;

  /* ---------- 工具 ---------- */

  function $(id) {
    return document.getElementById(id);
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function round2(n) {
    var value = Number(n);
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function money(value) {
    var num = round2(value);
    return (num < 0 ? '-¥' : '¥') + moneyFmt.format(Math.abs(num));
  }

  function pct(ratio) {
    return Math.round((Number(ratio) || 0) * 100);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function monthOf(dateStr) {
    return String(dateStr).slice(0, 7);
  }

  function shiftMonth(month, delta) {
    var parts = month.split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  function daysInMonth(month) {
    var parts = month.split('-').map(Number);
    return new Date(parts[0], parts[1], 0).getDate();
  }

  function parseDate(dateStr) {
    var parts = String(dateStr).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatDay(dateStr) {
    var d = parseDate(dateStr);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function formatTimestamp(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function monthState(month) {
    var now = new Date();
    var current = now.getFullYear() + '-' + pad(now.getMonth() + 1);
    var days = daysInMonth(month);
    var isCurrent = month === current;
    var isPast = month < current;
    var elapsed = isCurrent ? now.getDate() : (isPast ? days : 0);
    var remaining = isCurrent ? Math.max(days - now.getDate() + 1, 1) : (isPast ? 0 : days);
    return { days: days, elapsed: elapsed, remaining: remaining, isCurrent: isCurrent, isPast: isPast };
  }

  function referenceDate(month) {
    var ms = monthState(month);
    var parts = month.split('-').map(Number);
    if (ms.isCurrent) return new Date();
    if (ms.isPast) return new Date(parts[0], parts[1] - 1, daysInMonth(month), 23, 59, 59);
    return new Date(parts[0], parts[1] - 1, 1);
  }

  function categoryName(key) {
    var cat = CATEGORY_MAP.get(key);
    return cat ? cat.name : key;
  }

  function categoryColor(key, type) {
    if (type === 'income') return '#2f6f5e';
    var cat = CATEGORY_MAP.get(key);
    return cat ? cat.color : '#818780';
  }

  function bucketOf(key) {
    var cat = CATEGORY_MAP.get(key);
    return cat && cat.bucket ? cat.bucket : 'wants';
  }

  /* ---------- 数据 ---------- */

  function defaultState() {
    return {
      version: 1,
      records: [],
      budgets: {},
      dismissed: {},
      feedback: {},
      settings: { savingGoal: 0 },
      ui: { lastCategory: { expense: 'food', income: 'living' } }
    };
  }

  function isValidRecord(record) {
    if (!record || typeof record !== 'object') return false;
    if (record.type !== 'expense' && record.type !== 'income') return false;
    var list = record.type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    var exists = list.some(function (cat) { return cat.key === record.category; });
    if (!exists) return false;
    if (typeof record.amount !== 'number' || !Number.isFinite(record.amount) || record.amount <= 0) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.date))) return false;
    return true;
  }

  function loadState() {
    var base = defaultState();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;

      var lastCategory = parsed.ui && parsed.ui.lastCategory ? parsed.ui.lastCategory : {};
      var budget = parsed.budgets && typeof parsed.budgets === 'object' ? parsed.budgets : {};
      var dismissed = parsed.dismissed && typeof parsed.dismissed === 'object' ? parsed.dismissed : {};
      var feedback = parsed.feedback && typeof parsed.feedback === 'object' ? parsed.feedback : {};
      var settings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {};

      return {
        version: 1,
        records: Array.isArray(parsed.records) ? parsed.records.filter(isValidRecord) : [],
        budgets: budget,
        dismissed: dismissed,
        feedback: feedback,
        settings: {
          savingGoal: Number(settings.savingGoal) || 0
        },
        ui: {
          lastCategory: {
            expense: lastCategory.expense || 'food',
            income: lastCategory.income || 'living'
          }
        }
      };
    } catch (err) {
      return base;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      toast('本地存储空间不足，数据可能未保存');
    }
  }

  function monthRecords(month) {
    return state.records.filter(function (record) {
      return record.date.indexOf(month) === 0;
    });
  }

  function sortedRecords(month) {
    return monthRecords(month).slice().sort(function (a, b) {
      var byDate = String(b.date).localeCompare(String(a.date));
      if (byDate !== 0) return byDate;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function sumAmount(records) {
    return round2(records.reduce(function (sum, record) {
      return sum + (Number(record.amount) || 0);
    }, 0));
  }

  function sumType(records, type) {
    return sumAmount(records.filter(function (record) {
      return record.type === type;
    }));
  }

  function getBudget(month) {
    var budget = state.budgets[month];
    if (!budget || typeof budget !== 'object') return null;
    if (typeof budget.income !== 'number' || !isFinite(budget.income) || !budget.quotas) return null;
    return budget;
  }

  function quotaOf(budget, key) {
    return round2(Number(budget.quotas[key]) || 0);
  }

  function bucketQuota(budget, bucket) {
    return round2(QUOTA_CATEGORIES.reduce(function (sum, cat) {
      return cat.bucket === bucket ? sum + quotaOf(budget, cat.key) : sum;
    }, 0));
  }

  function bucketSpent(records, bucket) {
    return round2(records.filter(function (record) {
      return record.type === 'expense' && bucketOf(record.category) === bucket;
    }).reduce(function (sum, record) {
      return sum + record.amount;
    }, 0));
  }

  function barStyle(ratio, color) {
    var width = Math.min(Math.max(ratio, 0), 1) * 100;
    if (ratio >= 0.8) return 'width:' + width + '%';
    return 'width:' + width + '%;background:' + color;
  }

  function barClass(ratio) {
    if (ratio >= 1) return 'is-over';
    if (ratio >= 0.8) return 'is-warn';
    return '';
  }

  function toast(message) {
    var node = $('toast');
    node.textContent = message;
    node.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('is-show');
    }, 2200);
  }

  /* ---------- 总览 ---------- */

  function renderHeader() {
    var parts = selectedMonth.split('-');
    $('monthLabel').textContent = parts[0] + '年' + Number(parts[1]) + '月';
    var ms = monthState(selectedMonth);
    $('monthHint').textContent = ms.isCurrent ? '本月' : (ms.isPast ? '历史月份' : '未来月份');
  }

  function renderStats() {
    var records = monthRecords(selectedMonth);
    var incomeRecords = records.filter(function (r) { return r.type === 'income'; });
    var expenseRecords = records.filter(function (r) { return r.type === 'expense'; });
    var income = sumType(records, 'income');
    var expense = sumType(records, 'expense');
    var balance = round2(income - expense);

    $('statIncome').textContent = money(income);
    $('statExpense').textContent = money(expense);
    $('statBalance').textContent = money(balance);
    $('statBalance').classList.toggle('is-negative', balance < 0);

    $('statIncomeSub').textContent = '共 ' + incomeRecords.length + ' 笔';
    $('statExpenseSub').textContent = '共 ' + expenseRecords.length + ' 笔';
    $('statBalanceSub').textContent = balance < 0 ? '已超支 ' + money(Math.abs(balance)) : '收入减去支出';

    var budget = getBudget(selectedMonth);
    var ms = monthState(selectedMonth);
    var expenseBudget = budget ? bucketQuota(budget, 'essential') + bucketQuota(budget, 'wants') : 0;
    var remaining = round2(expenseBudget - expense);

    if (budget && ms.remaining > 0) {
      if (remaining > 0) {
        $('statDaily').textContent = money(remaining / ms.remaining);
        $('statDailySub').textContent = '剩余 ' + money(remaining) + ' / ' + ms.remaining + ' 天';
      } else {
        $('statDaily').textContent = '¥0';
        $('statDailySub').textContent = '本月支出预算已用完';
      }
    } else {
      $('statDaily').textContent = '—';
      $('statDailySub').textContent = budget ? '本月已结束' : '生成预算后按剩余额度估算';
    }
  }

  function renderOverviewBudget() {
    var container = $('overviewBudget');
    var budget = getBudget(selectedMonth);

    if (!budget) {
      container.innerHTML = '<div class="empty-state"><strong>本月还没有预算方案</strong>生成后可以看到必要开支、想要开支和储蓄的额度与执行进度。' +
        '<br><button type="button" class="primary-btn" data-goto="budget">生成预算方案</button></div>';
      return;
    }

    var records = monthRecords(selectedMonth).filter(function (r) { return r.type === 'expense'; });
    var essentialQuota = bucketQuota(budget, 'essential');
    var wantsQuota = bucketQuota(budget, 'wants');
    var savingsQuota = bucketQuota(budget, 'savings');
    var spentEssential = bucketSpent(records, 'essential');
    var spentWants = bucketSpent(records, 'wants');
    var expenseQuota = round2(essentialQuota + wantsQuota);
    var spentTotal = sumAmount(records);
    var remaining = round2(expenseQuota - spentTotal);

    container.innerHTML = '<div class="budget-overview">' +
      '<div class="budget-total">' +
        '<div><span>本月支出预算</span><br><strong>' + money(expenseQuota) + '</strong></div>' +
        '<span class="' + (remaining < 0 ? 'over' : '') + '">' +
          (remaining < 0 ? '已超支 ' + money(Math.abs(remaining)) : '剩余 ' + money(remaining)) +
        '</span>' +
      '</div>' +
      budgetLine('必要开支', essentialQuota, spentEssential) +
      budgetLine('想要开支', wantsQuota, spentWants) +
      '<div class="budget-line">' +
        '<div class="budget-line-head"><b>储蓄额度</b><span>' + money(savingsQuota) + '</span></div>' +
        '<span class="muted" style="font-size:11px">建议发薪后先转出储蓄，再使用支出额度</span>' +
      '</div>' +
    '</div>';
  }

  function budgetLine(name, quota, spent) {
    var ratio = quota > 0 ? spent / quota : 0;
    var cls = barClass(ratio);
    return '<div class="budget-line">' +
      '<div class="budget-line-head"><b>' + name + '</b><span class="' + (ratio >= 1 ? 'is-over' : '') + '">' +
        money(spent) + ' / ' + money(quota) +
      '</span></div>' +
      '<div class="bar thin"><i class="' + cls + '" style="' + barStyle(ratio, '#2f6f5e') + '"></i></div>' +
    '</div>';
  }

  function renderAlertsPreview() {
    var container = $('overviewAlerts');
    var alerts = visibleAlerts(selectedMonth);

    if (!alerts.length) {
      container.innerHTML = '<div class="empty-state"><strong>本月暂无明显超支</strong>没有触发分类超支、高频小额或单笔异常提醒。</div>';
      return;
    }

    container.innerHTML = '<div class="mini-alerts">' + alerts.slice(0, 3).map(function (alert) {
      return '<div class="mini-alert level-' + alert.level + '"><strong>' + esc(alert.title) + '</strong><span>' +
        esc(alert.detail) + '</span></div>';
    }).join('') + '</div>';
  }

  function renderBreakdown() {
    var container = $('categoryBreakdown');
    var expenses = monthRecords(selectedMonth).filter(function (r) { return r.type === 'expense'; });
    var total = sumAmount(expenses);
    $('breakdownMeta').textContent = total > 0 ? '合计 ' + money(total) : '';

    if (!expenses.length) {
      container.innerHTML = '<div class="empty-state"><strong>还没有支出记录</strong>记下第一笔支出后，这里会显示分类构成。</div>';
      return;
    }

    var totals = EXPENSE_CATEGORIES.map(function (cat) {
      var list = expenses.filter(function (r) { return r.category === cat.key; });
      return {
        key: cat.key,
        name: cat.name,
        color: cat.color,
        amount: sumAmount(list)
      };
    }).filter(function (item) {
      return item.amount > 0;
    }).sort(function (a, b) {
      return b.amount - a.amount;
    });

    var max = totals[0] ? totals[0].amount : 0;
    container.innerHTML = '<div class="breakdown">' + totals.map(function (item) {
      var share = total > 0 ? item.amount / total : 0;
      var width = max > 0 ? item.amount / max : 0;
      return '<div class="breakdown-row">' +
        '<div class="breakdown-name"><span class="dot" style="--c:' + item.color + '"></span>' + item.name + '</div>' +
        '<div class="bar thin"><i style="width:' + (width * 100) + '%;background:' + item.color + '"></i></div>' +
        '<div class="breakdown-amount">' + money(item.amount) + '<span>' + pct(share) + '%</span></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderRecent() {
    var container = $('recentRecords');
    var records = sortedRecords(selectedMonth).slice(0, 5);

    if (!records.length) {
      container.innerHTML = '<div class="empty-state"><strong>本月还没有流水</strong>点“去记账”记下第一笔收入或支出。</div>';
      return;
    }

    container.innerHTML = '<div class="record-list">' + records.map(function (record) {
      return recordItem(record, false);
    }).join('') + '</div>';
  }

  function recordItem(record, withActions) {
    var isIncome = record.type === 'income';
    var color = categoryColor(record.category, record.type);
    var bucketText = isIncome ? '收入' : (bucketOf(record.category) === 'essential' ? '必要' : '想要');

    return '<div class="record">' +
      '<div class="record-main">' +
        '<div class="record-title">' +
          '<span class="dot" style="--c:' + color + '"></span>' +
          '<span>' + esc(categoryName(record.category)) + '</span>' +
          (record.note ? '<span class="record-note">' + esc(record.note) + '</span>' : '') +
        '</div>' +
        '<span class="record-meta">' + formatDay(record.date) + ' · ' + bucketText + '</span>' +
      '</div>' +
      '<div class="record-side">' +
        '<span class="record-amount' + (isIncome ? ' is-income' : '') + '">' +
          (isIncome ? '+' : '-') + money(record.amount) +
        '</span>' +
        (withActions ?
          '<div class="record-actions">' +
            '<button type="button" data-edit="' + esc(record.id) + '">编辑</button>' +
            '<button type="button" data-delete="' + esc(record.id) + '">删除</button>' +
          '</div>' : '') +
      '</div>' +
    '</div>';
  }

  /* ---------- 记一笔 ---------- */

  function renderEntryMode() {
    var segments = document.querySelectorAll('#typeSegmented .segment');
    Array.prototype.forEach.call(segments, function (btn) {
      var active = btn.getAttribute('data-type') === currentType;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    var categories = currentType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    if (!categories.some(function (cat) { return cat.key === selectedCategory; })) {
      selectedCategory = categories[0].key;
    }

    $('categoryLabel').textContent = currentType === 'expense' ? '支出分类' : '收入分类';
    $('categoryChips').innerHTML = categories.map(function (cat) {
      return '<button type="button" class="chip' + (cat.key === selectedCategory ? ' is-active' : '') + '"' +
        ' data-category="' + cat.key + '" data-type="' + currentType + '">' + cat.name + '</button>';
    }).join('');

    $('submitEntry').textContent = editingId ? '更新记录' : '保存记录';
    $('cancelEdit').hidden = !editingId;

    if (editingId) {
      $('entryHint').textContent = '正在编辑一笔记录，修改后点击「更新记录」。';
    } else {
      var lastKey = state.ui.lastCategory[currentType] || selectedCategory;
      $('entryHint').textContent = '上次使用：' + categoryName(lastKey) + '。点选分类 → 输入金额 → 保存，3 步完成。';
    }
  }

  function renderRecordList() {
    var container = $('recordList');
    var records = sortedRecords(selectedMonth);
    $('recordCount').textContent = records.length ? '共 ' + records.length + ' 笔' : '';

    if (!records.length) {
      container.innerHTML = '<div class="empty-state"><strong>本月还没有记录</strong>用左侧表单记下第一笔收入或支出。</div>';
      return;
    }

    container.innerHTML = '<div class="record-list">' + records.map(function (record) {
      return recordItem(record, true);
    }).join('') + '</div>';
  }

  function resetEntryForm() {
    editingId = null;
    $('entryAmount').value = '';
    $('entryNote').value = '';
    if (!$('entryDate').value) $('entryDate').value = todayISO();
    renderEntryMode();
  }

  function startEdit(id) {
    var record = state.records.find(function (item) { return item.id === id; });
    if (!record) return;

    editingId = id;
    currentType = record.type;
    selectedCategory = record.category;
    $('entryAmount').value = record.amount;
    $('entryDate').value = record.date;
    $('entryNote').value = record.note || '';
    renderEntryMode();
    switchTab('entry');
    setTimeout(function () {
      $('entryAmount').focus();
    }, 60);
  }

  function deleteRecord(id) {
    var exists = state.records.some(function (item) { return item.id === id; });
    if (!exists) return;
    state.records = state.records.filter(function (item) { return item.id !== id; });
    if (editingId === id) resetEntryForm();
    saveState();
    refresh();
    toast('已删除这笔记录');
  }

  function handleEntrySubmit(event) {
    event.preventDefault();

    var rawAmount = $('entryAmount').value.trim();
    var amount = Number(rawAmount);
    if (!rawAmount || !Number.isFinite(amount) || amount <= 0) {
      toast('请输入大于 0 的金额');
      $('entryAmount').focus();
      return;
    }
    if (amount > MAX_AMOUNT) {
      toast('单笔金额不能超过 ' + money(MAX_AMOUNT));
      $('entryAmount').focus();
      return;
    }
    if (!selectedCategory) {
      toast('请选择记录分类');
      return;
    }
    var date = $('entryDate').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast('请选择记录日期');
      $('entryDate').focus();
      return;
    }

    var note = $('entryNote').value.trim().slice(0, 30);
    var record = {
      id: editingId || uid(),
      type: currentType,
      category: selectedCategory,
      amount: round2(amount),
      date: date,
      note: note,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (editingId) {
      var index = state.records.findIndex(function (item) { return item.id === editingId; });
      if (index >= 0) {
        record.createdAt = state.records[index].createdAt || record.createdAt;
        state.records[index] = record;
      } else {
        state.records.push(record);
      }
      toast('已更新：' + money(record.amount) + ' · ' + categoryName(record.category));
    } else {
      state.records.push(record);
      toast('已记录：' + money(record.amount) + ' · ' + categoryName(record.category));
    }

    state.ui.lastCategory[currentType] = selectedCategory;
    saveState();

    if (monthOf(date) !== selectedMonth) {
      selectedMonth = monthOf(date);
      selectedScheme = getBudget(selectedMonth) ? getBudget(selectedMonth).scheme : selectedScheme;
    }

    resetEntryForm();
    refresh();
    $('entryAmount').focus();
  }

  /* ---------- 预算方案 ---------- */

  function generateBudget() {
    var income = sumType(monthRecords(selectedMonth), 'income');
    if (income <= 0) {
      toast('请先录入本月收入，再生成分配方案');
      switchTab('entry');
      return;
    }

    var scheme = SCHEMES[selectedScheme];
    var quotas = {};
    var allocated = 0;

    EXPENSE_CATEGORIES.forEach(function (cat) {
      var quota = round2(income * scheme[cat.bucket] * cat.weight);
      quotas[cat.key] = quota;
      allocated = round2(allocated + quota);
    });
    quotas[SAVING_CATEGORY.key] = round2(income - allocated);

    state.budgets[selectedMonth] = {
      income: round2(income),
      scheme: selectedScheme,
      quotas: quotas,
      generatedAt: Date.now(),
      updatedAt: Date.now()
    };

    saveState();
    refresh();
    toast('已按 ' + scheme.ratio + ' 生成本月分配方案');
  }

  function updateQuota(key, rawValue) {
    var budget = getBudget(selectedMonth);
    if (!budget) return;

    var income = round2(budget.income);
    var validKeys = QUOTA_CATEGORIES.map(function (cat) { return cat.key; });
    if (validKeys.indexOf(key) === -1) return;

    var value = round2(Math.min(Math.max(Number(rawValue) || 0, 0), income));
    var old = quotaOf(budget, key);
    if (value === old) {
      renderBudget();
      return;
    }

    var otherKeys = validKeys.filter(function (item) { return item !== key; });
    var oldOthers = otherKeys.map(function (item) { return quotaOf(budget, item); });
    var othersTotal = round2(oldOthers.reduce(function (sum, item) { return sum + item; }, 0));
    var rest = round2(income - value);

    budget.quotas[key] = value;

    if (othersTotal <= 0) {
      var each = round2(rest / otherKeys.length);
      var assignedEqual = 0;
      otherKeys.forEach(function (item, index) {
        if (index === otherKeys.length - 1) {
          budget.quotas[item] = round2(rest - assignedEqual);
        } else {
          budget.quotas[item] = each;
          assignedEqual = round2(assignedEqual + each);
        }
      });
    } else {
      var assigned = 0;
      otherKeys.forEach(function (item, index) {
        if (index === otherKeys.length - 1) {
          budget.quotas[item] = round2(rest - assigned);
        } else {
          var next = round2(rest * oldOthers[index] / othersTotal);
          budget.quotas[item] = next;
          assigned = round2(assigned + next);
        }
      });
    }

    var total = QUOTA_CATEGORIES.reduce(function (sum, cat) {
      return sum + quotaOf(budget, cat.key);
    }, 0);
    var diff = round2(income - total);
    if (diff !== 0) {
      var adjustKey = key === SAVING_CATEGORY.key ? otherKeys[0] : SAVING_CATEGORY.key;
      budget.quotas[adjustKey] = Math.max(round2(quotaOf(budget, adjustKey) + diff), 0);
    }

    budget.updatedAt = Date.now();
    saveState();
    refresh();
  }

  function renderBudget() {
    var records = monthRecords(selectedMonth);
    var income = sumType(records, 'income');
    var budget = getBudget(selectedMonth);

    $('planIncome').textContent = money(income);

    $('schemeList').innerHTML = Object.keys(SCHEMES).map(function (key) {
      var scheme = SCHEMES[key];
      return '<button type="button" class="scheme-card' + (key === selectedScheme ? ' is-active' : '') + '"' +
        ' data-scheme="' + key + '">' +
        '<strong>' + scheme.ratio + '</strong>' +
        '<span>' + scheme.label + '</span>' +
      '</button>';
    }).join('');

    if (income > 0 && budget && budget.income !== income) {
      $('budgetHint').textContent = '当前方案按 ' + money(budget.income) + ' 生成，本月收入已变为 ' +
        money(income) + '，可以重新生成方案。';
      $('planIncomeHint').textContent = '当前收入与方案基准不一致';
    } else if (income > 0) {
      $('budgetHint').textContent = '方案只提供建议，不强制限制消费。调整任一分类额度后，其他分类会按比例自动调整。';
      $('planIncomeHint').textContent = '可用于分配 ' + money(income);
    } else {
      $('budgetHint').textContent = '请先到「记一笔」录入本月收入，才能生成分配方案。';
      $('planIncomeHint').textContent = '还没有收入记录';
    }

    $('generatePlan').textContent = budget ? '按当前收入重新生成' : '生成本月方案';

    if (!budget) {
      $('planMeta').textContent = '';
      $('planBody').innerHTML = '<div class="empty-state"><strong>还没有本月方案</strong>选择一种分配比例并点击“生成”，系统会按本月收入拆分到各个分类。</div>';
      return;
    }

    $('planMeta').textContent = '按 ' + money(budget.income) + ' 生成 · 更新于 ' + formatTimestamp(budget.updatedAt || budget.generatedAt);

    var ms = monthState(selectedMonth);
    var expenses = records.filter(function (record) { return record.type === 'expense'; });
    var essentialQuota = bucketQuota(budget, 'essential');
    var wantsQuota = bucketQuota(budget, 'wants');
    var savingsQuota = bucketQuota(budget, 'savings');
    var spentEssential = bucketSpent(records, 'essential');
    var spentWants = bucketSpent(records, 'wants');

    var bucketHtml = '<div class="bucket-grid">' +
      bucketCard('必要开支', essentialQuota, spentEssential, 'essential', false) +
      bucketCard('想要开支', wantsQuota, spentWants, 'wants', false) +
      bucketCard('储蓄', savingsQuota, 0, 'savings', true) +
    '</div>';

    var quotaHtml = '<div class="quota-list">' + EXPENSE_CATEGORIES.map(function (cat) {
      var quota = quotaOf(budget, cat.key);
      var list = expenses.filter(function (record) { return record.category === cat.key; });
      var spent = sumAmount(list);
      var remaining = round2(quota - spent);
      var ratio = quota > 0 ? spent / quota : 0;
      var cls = barClass(ratio);
      var dailyText = '';
      if (ms.remaining > 0 && remaining > 0) {
        dailyText = ' · 日均 ' + money(remaining / ms.remaining);
      }

      return '<div class="quota-row">' +
        '<div>' +
          '<div class="quota-name"><span class="dot" style="--c:' + cat.color + '"></span>' +
            cat.name +
            '<span class="quota-tag">' + (cat.bucket === 'essential' ? '必要' : '想要') + '</span>' +
          '</div>' +
          '<div class="quota-info">已花 ' + money(spent) + ' · 剩余 ' +
            '<span class="' + (remaining < 0 ? 'is-over' : '') + '">' + money(remaining) + '</span>' +
            dailyText +
          '</div>' +
          '<div class="bar thin"><i class="' + cls + '" style="' + barStyle(ratio, cat.color) + '"></i></div>' +
        '</div>' +
        '<label class="quota-input"><span>¥</span>' +
          '<input type="number" min="0" step="1" value="' + quota + '" data-quota="' + cat.key + '"' +
          ' aria-label="' + cat.name + '额度">' +
        '</label>' +
      '</div>';
    }).join('') + '</div>';

    var savingHtml = '<div class="saving-card">' +
      '<div>' +
        '<h3>储蓄额度 ' + money(savingsQuota) + '</h3>' +
        '<p>占收入 ' + (budget.income > 0 ? pct(savingsQuota / budget.income) : 0) + '%，建议发薪后先转出，再安排日常开销</p>' +
      '</div>' +
      '<label class="quota-input"><span>¥</span>' +
        '<input type="number" min="0" step="1" value="' + savingsQuota + '" data-quota="' + SAVING_CATEGORY.key + '"' +
        ' aria-label="储蓄额度">' +
      '</label>' +
    '</div>';

    $('planBody').innerHTML = bucketHtml + quotaHtml + savingHtml;
  }

  function bucketCard(name, quota, spent, bucket, isSaving) {
    var ratio = quota > 0 ? spent / quota : 0;
    var cls = barClass(ratio);
    var color = BUCKETS[bucket] ? BUCKETS[bucket].color : '#2f6f5e';
    var detail = isSaving
      ? '不计入支出 · 建议先存后花'
      : '已用 ' + money(spent) + ' · 剩余 ' + money(Math.max(quota - spent, 0));

    return '<article class="bucket-card">' +
      '<div class="bucket-head"><span>' + name + '</span><strong>' + money(quota) + '</strong></div>' +
      (isSaving ? '' : '<div class="bar thin"><i class="' + cls + '" style="' + barStyle(ratio, color) + '"></i></div>') +
      '<p>' + detail + '</p>' +
    '</article>';
  }

  /* ---------- 乱花钱提醒 ---------- */

  function computeAlerts(month) {
    var alerts = [];
    var records = monthRecords(month);
    var expenses = records.filter(function (record) { return record.type === 'expense'; });
    var income = sumType(records, 'income');
    var totalExpense = sumAmount(expenses);
    var budget = getBudget(month);

    if (!budget) {
      alerts.push({
        id: 'no-budget',
        level: 'info',
        title: '还没有本月预算方案',
        detail: '生成分配方案后，系统才能按分类额度给出超支提醒。',
        hint: '到「预算方案」选择一种分配规则并生成即可。'
      });
    } else {
      EXPENSE_CATEGORIES.forEach(function (cat) {
        var quota = quotaOf(budget, cat.key);
        if (quota <= 0) return;
        var spent = sumAmount(expenses.filter(function (record) {
          return record.category === cat.key;
        }));
        if (spent <= 0) return;

        var usage = spent / quota;
        if (usage >= 1) {
          alerts.push({
            id: 'over:' + cat.key,
            level: 'high',
            title: cat.name + '已超出本月预算',
            detail: '本月' + cat.name + '支出 ' + money(spent) + '，额度 ' + money(quota) +
              '，超出 ' + money(spent - quota) + '。',
            hint: '可以查看「省钱思路」，或在「预算方案」中调整分类额度。'
          });
        } else if (usage >= 0.8) {
          alerts.push({
            id: 'near:' + cat.key,
            level: 'medium',
            title: cat.name + '接近本月预算上限',
            detail: '本月' + cat.name + '已使用额度的 ' + pct(usage) + '%，剩余约 ' + money(quota - spent) + '。',
            hint: '后续这类消费可以留意一下剩余额度。'
          });
        }
      });
    }

    if (income > 0 && totalExpense > income) {
      alerts.push({
        id: 'over-income',
        level: 'high',
        title: '本月支出已超过收入',
        detail: '本月支出 ' + money(totalExpense) + '，收入 ' + money(income) +
          '，差额 ' + money(totalExpense - income) + '。',
        hint: '可结合「省钱思路」调整后续支出，或在「预算方案」中重新分配。'
      });
    }

    // 高频小额：最近 7 天，同类支出达到 7 笔。
    var ref = referenceDate(month);
    var refStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
    var windowStart = refStart - 6 * DAY;

    EXPENSE_CATEGORIES.forEach(function (cat) {
      var recent = expenses.filter(function (record) {
        if (record.category !== cat.key) return false;
        var time = parseDate(record.date).getTime();
        return time >= windowStart && time <= refStart;
      });

      if (recent.length >= 7) {
        alerts.push({
          id: 'frequency:' + cat.key,
          level: 'medium',
          title: '最近 7 天' + cat.name + '消费频次较高',
          detail: '最近 7 天' + cat.name + '共 ' + recent.length + ' 笔，累计 ' + money(sumAmount(recent)) + '。',
          hint: '如果其中有可以合并或减少的消费，可参考「省钱思路」。'
        });
      }
    });

    // 单笔异常：有足够历史数据时，单笔 >= 同分类近 30 天均值的 2 倍。
    var unusual = [];
    expenses.forEach(function (record) {
      var time = parseDate(record.date).getTime();
      var start = time - 30 * DAY;
      var history = expenses.filter(function (other) {
        if (other.id === record.id || other.category !== record.category) return false;
        var otherTime = parseDate(other.date).getTime();
        return otherTime >= start && otherTime < time;
      });
      if (history.length < 3) return;

      var avg = sumAmount(history) / history.length;
      if (avg > 0 && record.amount >= avg * 2) {
        unusual.push({
          id: 'unusual:' + record.id,
          level: 'medium',
          title: '单笔消费高于近期平均',
          detail: '这笔' + categoryName(record.category) + '支出 ' + money(record.amount) +
            '，高于近 30 天同类平均 ' + money(avg) + ' 的 2 倍，请确认是否记错。',
          hint: '仅为数据提示；如果确有需要，可以忽略。',
          date: record.date
        });
      }
    });

    unusual.sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    }).slice(0, 3).forEach(function (alert) {
      alerts.push(alert);
    });

    return alerts.sort(function (a, b) {
      return LEVELS[b.level].rank - LEVELS[a.level].rank;
    });
  }

  function visibleAlerts(month) {
    var items = computeAlerts(month);
    var dismissed = state.dismissed[month] || {};
    var now = Date.now();

    return items.filter(function (alert) {
      var ts = Number(dismissed[alert.id]) || 0;
      return !(ts && now - ts < DAY);
    });
  }

  function renderAlerts() {
    var alerts = visibleAlerts(selectedMonth);
    var badge = $('alertBadge');
    var summary = $('alertSummary');

    if (alerts.length) {
      badge.hidden = false;
      badge.textContent = alerts.length > 9 ? '9+' : String(alerts.length);
    } else {
      badge.hidden = true;
    }

    var highCount = alerts.filter(function (alert) { return alert.level === 'high'; }).length;
    var mediumCount = alerts.filter(function (alert) { return alert.level === 'medium'; }).length;

    summary.className = 'status-pill';
    if (!alerts.length) {
      summary.textContent = '状态良好';
      summary.classList.add('is-good');
    } else if (highCount > 0) {
      summary.textContent = '有 ' + highCount + ' 条需要留意';
      summary.classList.add('is-risk');
    } else if (mediumCount > 0) {
      summary.textContent = '有 ' + mediumCount + ' 条提示';
      summary.classList.add('is-warn');
    } else {
      summary.textContent = '有 ' + alerts.length + ' 条说明';
    }

    var container = $('alertList');
    if (!alerts.length) {
      container.innerHTML = '<div class="empty-state"><strong>本月暂无提醒</strong>没有触发分类超支、最近 7 天高频消费或单笔异常。继续保持当前节奏即可。</div>';
      return;
    }

    container.innerHTML = alerts.map(function (alert) {
      return '<article class="alert-card level-' + alert.level + '">' +
        '<div class="alert-head">' +
          '<span class="alert-level">' + LEVELS[alert.level].label + '</span>' +
          '<h3>' + esc(alert.title) + '</h3>' +
          '<button type="button" class="alert-dismiss" data-dismiss="' + esc(alert.id) + '">知道了</button>' +
        '</div>' +
        '<p>' + esc(alert.detail) + '</p>' +
        (alert.hint ? '<p class="alert-hint">' + esc(alert.hint) + '</p>' : '') +
      '</article>';
    }).join('');
  }

  /* ---------- 省钱思路 ---------- */

  function computeTips(month) {
    var records = monthRecords(month);
    var expenses = records.filter(function (record) { return record.type === 'expense'; });
    var totalExpense = sumAmount(expenses);
    var income = sumType(records, 'income');
    var dataTips = [];

    var totals = EXPENSE_CATEGORIES.map(function (cat) {
      var list = expenses.filter(function (record) { return record.category === cat.key; });
      return {
        key: cat.key,
        name: cat.name,
        bucket: cat.bucket,
        amount: sumAmount(list),
        count: list.length
      };
    }).filter(function (item) {
      return item.amount > 0;
    }).sort(function (a, b) {
      return b.amount - a.amount;
    });

    var top = totals[0];
    if (top && totalExpense > 0) {
      var share = top.amount / totalExpense;
      var rate = TOP_SAVE_RATES[top.key] || 0;
      var saving = round2(top.amount * rate);

      dataTips.push({
        id: 'top-' + top.key,
        title: top.name + '是本月最大的支出项',
        detail: '本月' + top.name + '支出 ' + money(top.amount) + '，占总支出的 ' + pct(share) +
          '%，共 ' + top.count + ' 笔。',
        action: TOP_ACTIONS[top.key] || '先记录清楚这类支出的用途，再寻找可压缩的部分。',
        evidence: '依据：本月' + top.name + ' ' + top.count + ' 笔，合计 ' + money(top.amount) + '。',
        estimate: saving > 0 ? '估算可省 ' + money(saving) : '',
        estimateNote: saving > 0 ? '按这类支出减少 ' + Math.round(rate * 100) + '% 估算' : ''
      });
    }

    var wants = expenses.filter(function (record) {
      return bucketOf(record.category) === 'wants';
    });
    var wantsSpend = sumAmount(wants);
    if (wantsSpend > 0) {
      var cut = round2(wantsSpend * 0.2);
      dataTips.push({
        id: 'wants-cut',
        title: '想要型支出还有压缩空间',
        detail: '本月购物、娱乐、其他类支出合计 ' + money(wantsSpend) + '，占总支出 ' +
          pct(wantsSpend / Math.max(totalExpense, 1)) + '%。',
        action: '下月尝试把这类支出减少 20%，按本月水平估算可多存 ' + money(cut) + '。',
        evidence: '依据：本月想要型支出 ' + wants.length + ' 笔，合计 ' + money(wantsSpend) + '。',
        estimate: '估算可省 ' + money(cut),
        estimateNote: '按这类支出减少 20% 估算'
      });
    }

    var frequent = totals.slice().sort(function (a, b) {
      return b.count - a.count;
    })[0];
    if (frequent && frequent.count >= 5) {
      var avg = frequent.amount / frequent.count;
      var freqCut = round2(frequent.amount * 0.2);
      dataTips.push({
        id: 'frequency-' + frequent.key,
        title: frequent.name + '消费频次较高',
        detail: '本月' + frequent.name + '共 ' + frequent.count + ' 笔，平均每笔 ' + money(avg) + '。',
        action: '可以把同类消费集中到固定的一两天，或设一个每周次数上限，减少零散支出。',
        evidence: '依据：本月' + frequent.name + ' ' + frequent.count + ' 笔，合计 ' + money(frequent.amount) + '。',
        estimate: '估算可省 ' + money(freqCut),
        estimateNote: '按减少 20% 的消费笔数估算'
      });
    }

    var goal = Number(state.settings.savingGoal) || 0;
    if (goal > 0 && income > 0) {
      var saved = Math.max(round2(income - totalExpense), 0);
      var progress = Math.min(saved / goal, 1);
      var ms = monthState(month);
      var timeRatio = ms.isPast ? 1 : (ms.elapsed / ms.days);

      dataTips.push({
        id: 'goal-progress',
        title: '储蓄目标进度',
        detail: '每月目标 ' + money(goal) + '，按本月结余估算已存 ' + money(saved) +
          '（' + pct(progress) + '%）。',
        action: progress >= timeRatio
          ? '当前储蓄进度不低于时间进度，保持现在的节奏即可。'
          : '本月时间已过 ' + pct(timeRatio) + '%，储蓄进度 ' + pct(progress) +
            '%。可以先从减少非必要支出开始。',
        evidence: '依据：本月收入 ' + money(income) + ' − 支出 ' + money(totalExpense) +
          ' = 结余 ' + money(saved) + '（估算）。',
        estimate: '',
        estimateNote: ''
      });
    }

    var tips = dataTips.slice(0, 5);
    GENERIC_TIPS.forEach(function (tip) {
      if (tips.length >= 5) return;
      tips.push({
        id: tip.id,
        title: tip.title,
        detail: tip.detail,
        action: tip.action,
        evidence: dataTips.length > 0 ? '通用建议' : '通用建议 · 本月数据不足',
        estimate: '',
        estimateNote: '',
        generic: true
      });
    });

    return {
      tips: tips.slice(0, 5),
      dataCount: dataTips.length
    };
  }

  function renderTips() {
    var result = computeTips(selectedMonth);
    var tips = result.tips;
    var dataCount = result.dataCount;

    $('tipsSourceTag').textContent = dataCount >= 3
      ? '基于本月数据'
      : (dataCount > 0 ? '部分基于本月数据' : '通用建议');

    $('tipList').innerHTML = tips.map(function (tip) {
      var key = selectedMonth + ':' + tip.id;
      var feedback = state.feedback[key];
      return '<article class="tip-card">' +
        '<div class="tip-card-head">' +
          '<h3>' + esc(tip.title) + '</h3>' +
          (tip.estimate ? '<span class="estimate-tag">' + esc(tip.estimate) + '</span>' : '') +
        '</div>' +
        '<p class="tip-detail">' + esc(tip.detail) + '</p>' +
        '<p class="tip-action">' + esc(tip.action) + '</p>' +
        (tip.estimateNote ? '<p class="tip-note">' + esc(tip.estimateNote) + '，为估算值</p>' : '') +
        '<p class="tip-evidence">' + esc(tip.evidence) + '</p>' +
        '<div class="tip-foot">' +
          '<span class="tip-note">仅供参考，最终由你决定</span>' +
          '<div class="feedback" data-tip-id="' + esc(tip.id) + '">' +
            '<button type="button" data-feedback="up" class="' + (feedback === 'up' ? 'is-active' : '') + '">有用</button>' +
            '<button type="button" data-feedback="down" class="' + (feedback === 'down' ? 'is-active' : '') + '">没用</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');

    renderGoal();
  }

  function renderGoal() {
    var container = $('goalProgress');
    var goal = Number(state.settings.savingGoal) || 0;
    var records = monthRecords(selectedMonth);
    var income = sumType(records, 'income');
    var expense = sumType(records, 'expense');
    var saved = Math.max(round2(income - expense), 0);

    if (goal <= 0) {
      container.innerHTML = '<p class="form-hint" style="margin-top:12px">设置一个每月储蓄目标，系统会按本月结余估算完成进度。</p>';
      return;
    }

    var ratio = Math.min(saved / goal, 1);
    var ms = monthState(selectedMonth);
    var timePct = ms.isPast ? 100 : Math.round(ms.elapsed / ms.days * 100);

    container.innerHTML = '<div class="goal-progress">' +
      '<div class="goal-progress-head">' +
        '<strong>' + money(saved) + ' / ' + money(goal) + '</strong>' +
        '<span>' + pct(ratio) + '%</span>' +
      '</div>' +
      '<div class="bar"><i class="' + (ratio >= 1 ? '' : 'is-warn') + '" style="width:' +
        (Math.min(ratio, 1) * 100) + '%"></i></div>' +
      '<p>按本月结余估算；当前时间进度约 ' + timePct + '%。</p>' +
    '</div>';
  }

  /* ---------- 页面切换 ---------- */

  function switchTab(name) {
    var tabs = document.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabs, function (tab) {
      var active = tab.getAttribute('data-tab') === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    var panels = document.querySelectorAll('.tab-panel');
    Array.prototype.forEach.call(panels, function (panel) {
      var active = panel.id === 'tab-' + name;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });

    window.scrollTo(0, 0);
  }

  function refresh() {
    renderHeader();
    renderStats();
    renderOverviewBudget();
    renderAlertsPreview();
    renderBreakdown();
    renderRecent();
    renderRecordList();
    renderEntryMode();
    renderBudget();
    renderAlerts();
    renderTips();
  }

  /* ---------- 事件绑定 ---------- */

  function bindEvents() {
    $('prevMonth').addEventListener('click', function () {
      selectedMonth = shiftMonth(selectedMonth, -1);
      var budget = getBudget(selectedMonth);
      if (budget && budget.scheme) selectedScheme = budget.scheme;
      refresh();
    });

    $('nextMonth').addEventListener('click', function () {
      selectedMonth = shiftMonth(selectedMonth, 1);
      var budget = getBudget(selectedMonth);
      if (budget && budget.scheme) selectedScheme = budget.scheme;
      refresh();
    });

    $('tabs').addEventListener('click', function (event) {
      var tab = event.target.closest('[data-tab]');
      if (tab) switchTab(tab.getAttribute('data-tab'));
    });

    document.addEventListener('click', function (event) {
      var link = event.target.closest('[data-goto]');
      if (link) switchTab(link.getAttribute('data-goto'));
    });

    $('typeSegmented').addEventListener('click', function (event) {
      var button = event.target.closest('[data-type]');
      if (!button) return;
      var nextType = button.getAttribute('data-type');
      if (nextType === currentType) return;

      currentType = nextType;
      var categories = currentType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
      var last = state.ui.lastCategory[currentType];
      selectedCategory = categories.some(function (cat) { return cat.key === last; })
        ? last
        : categories[0].key;
      renderEntryMode();
    });

    $('categoryChips').addEventListener('click', function (event) {
      var chip = event.target.closest('[data-category]');
      if (!chip) return;
      selectedCategory = chip.getAttribute('data-category');
      state.ui.lastCategory[currentType] = selectedCategory;
      saveState();
      renderEntryMode();
    });

    $('entryForm').addEventListener('submit', handleEntrySubmit);

    $('cancelEdit').addEventListener('click', function () {
      resetEntryForm();
      refresh();
    });

    $('recordList').addEventListener('click', function (event) {
      var editBtn = event.target.closest('[data-edit]');
      if (editBtn) {
        startEdit(editBtn.getAttribute('data-edit'));
        return;
      }
      var deleteBtn = event.target.closest('[data-delete]');
      if (deleteBtn) deleteRecord(deleteBtn.getAttribute('data-delete'));
    });

    $('schemeList').addEventListener('click', function (event) {
      var button = event.target.closest('[data-scheme]');
      if (!button) return;
      selectedScheme = button.getAttribute('data-scheme');
      renderBudget();
    });

    $('generatePlan').addEventListener('click', generateBudget);

    $('planBody').addEventListener('change', function (event) {
      var input = event.target.closest('[data-quota]');
      if (!input) return;
      var value = Number(input.value);
      if (!Number.isFinite(value) || value < 0) {
        toast('请输入有效的额度金额');
        renderBudget();
        return;
      }
      updateQuota(input.getAttribute('data-quota'), value);
    });

    $('planBody').addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && event.target.closest('[data-quota]')) {
        event.target.blur();
      }
    });

    $('alertList').addEventListener('click', function (event) {
      var button = event.target.closest('[data-dismiss]');
      if (!button) return;
      var id = button.getAttribute('data-dismiss');
      if (!state.dismissed[selectedMonth]) state.dismissed[selectedMonth] = {};
      state.dismissed[selectedMonth][id] = Date.now();
      saveState();
      refresh();
      toast('已忽略该提醒，24 小时内不再出现');
    });

    $('tipList').addEventListener('click', function (event) {
      var button = event.target.closest('[data-feedback]');
      if (!button) return;
      var wrap = button.closest('[data-tip-id]');
      if (!wrap) return;
      var key = selectedMonth + ':' + wrap.getAttribute('data-tip-id');
      state.feedback[key] = button.getAttribute('data-feedback');
      saveState();
      renderTips();
      toast('感谢反馈');
    });

    $('saveGoal').addEventListener('click', function () {
      var raw = $('savingGoal').value.trim();
      var value = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 9999999) {
        toast('请输入 0 到 9,999,999 之间的目标金额');
        return;
      }
      state.settings.savingGoal = round2(value);
      saveState();
      renderTips();
      toast('储蓄目标已保存');
    });

    $('clearData').addEventListener('click', function () {
      if (!window.confirm('确定要清空所有本地数据吗？此操作无法撤销。')) return;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (err) {
        // 忽略移除失败，后续状态仍会覆盖为空数据
      }
      state = defaultState();
      selectedMonth = monthOf(todayISO());
      selectedScheme = '50-30-20';
      editingId = null;
      currentType = 'expense';
      selectedCategory = 'food';
      $('entryAmount').value = '';
      $('entryNote').value = '';
      $('entryDate').value = todayISO();
      $('savingGoal').value = '';
      resetEntryForm();
      refresh();
      toast('已清空所有本地数据');
    });

    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEY) return;
      state = loadState();
      refresh();
    });
  }

  /* ---------- 启动 ---------- */

  function init() {
    $('entryDate').value = todayISO();

    if (!EXPENSE_CATEGORIES.some(function (cat) { return cat.key === state.ui.lastCategory.expense; })) {
      state.ui.lastCategory.expense = 'food';
    }
    if (!INCOME_CATEGORIES.some(function (cat) { return cat.key === state.ui.lastCategory.income; })) {
      state.ui.lastCategory.income = 'living';
    }

    selectedCategory = state.ui.lastCategory[currentType] || 'food';
    var currentBudget = getBudget(selectedMonth);
    selectedScheme = currentBudget && SCHEMES[currentBudget.scheme] ? currentBudget.scheme : '50-30-20';
    $('savingGoal').value = state.settings.savingGoal || '';

    bindEvents();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
