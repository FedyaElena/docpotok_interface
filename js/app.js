(function () {
  'use strict';
  var CFG = window.DP_CONFIG || {};
  var DOCS = window.DOCS || [];
  var Log = window.DPLog;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var NB = ' ';

  /* ------------------------------------------------------------ утилиты */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0).replace(/[  ]/g, NB) + NB + '₽';
  }
  function parseMoney(s) {
    var t = String(s).replace(/[^\d,.\-]/g, '').replace(',', '.');
    var v = parseFloat(t);
    return isNaN(v) ? 0 : v;
  }
  function plural(n, f) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return f[2];
    if (b > 1 && b < 5) return f[1];
    if (b === 1) return f[0];
    return f[2];
  }
  var OBJ = {
    'контейнер': ['контейнер', 'контейнера', 'контейнеров'],
    'отправка': ['отправка', 'отправки', 'отправок'],
    'машина': ['машина', 'машины', 'машин'],
    'вагон': ['вагон', 'вагона', 'вагонов']
  };
  function objWord(label, n) { var f = OBJ[label] || [label, label, label]; return plural(n, f); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function nowStr() {
    var d = new Date();
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(2) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function sizeStr(b) {
    return b >= 104858 ? (b / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';
  }
  function extOf(name) { var m = /\.([a-z0-9]+)$/i.exec(name); return m ? m[1].toUpperCase() : 'FILE'; }
  function shortDate(d) { return String(d || '').slice(0, 5); }

  /* ------------------------------------------------ распознавание файла */
  // Определяет документ по имени файла: doc1, doc_2, Doc 03 ... либо по списку fileNames из данных.
  function baseName(n) { return String(n).toLowerCase().replace(/\.[a-z0-9]{2,5}$/i, '').trim(); }
  function matchDoc(fileName) {
    var base = baseName(fileName), i, d;
    for (i = 0; i < DOCS.length; i++) {
      d = DOCS[i];
      var list = (d.fileNames || []).map(baseName);
      if (list.indexOf(base) !== -1) return d;
    }
    var m = /(?:^|[^a-zа-я0-9])doc[\s_\-]*0*(\d+)(?!\d)/i.exec(base) || /^doc[\s_\-]*0*(\d+)(?!\d)/i.exec(base);
    if (m) {
      var key = 'doc' + parseInt(m[1], 10);
      for (i = 0; i < DOCS.length; i++) if (DOCS[i].key === key) return DOCS[i];
    }
    return null;
  }

  /* ----------------------------------------------------------- состояние */
  var COLS = [
    ['date', 'Дата'], ['dt', 'Счет Дт'], ['kt', 'Счет Кт'], ['supplier', 'Поставщик'], ['currency', 'Валюта'],
    ['amount', 'Сумма'], ['transport', 'Перевозка'], ['payer', 'Плательщик'], ['docNo', 'Номер документа'],
    ['desc', 'Описание расхода'], ['base', 'База распределения']
  ];
  var STATIC_ROWS = [
    { s: 'ИП Сорокин А.В.', n: '2025/04-112', d: '17.04', sum: 45360, o: 1, st: 'ok' },
    { s: 'АО «Феникс Лог»', n: 'ФЛ-20250416', d: '16.04', sum: 1247800, o: 23, st: 'err' },
    { s: 'ООО «СкайКарго»', n: 'SKC-2025-891', d: '15.04', sum: 312450, o: 5, st: 'ok' },
    { s: 'ТК «Даль»', n: 'ТКД-0419', d: '14.04', sum: 98760, o: 2, st: 'ok' },
    { s: 'ООО «ВостТранс»', n: 'ВТ-25-0441', d: '14.04', sum: 763200, o: 12, st: 'info' }
  ];
  var BADGE = {
    processing: ['neu', 'Обработка'], binding: ['warn', 'Привязка'], ready: ['ok', 'Готово'],
    error: ['err', 'Ошибка'], info: ['info', 'Проверка'], ok: ['ok', 'Готово'], err: ['err', 'Ошибка']
  };
  var SLOTS = [
    ['transport', 'Данные перевозок', 'Справочник с информацией о перевозках и маршрутах для привязки счетов'],
    ['partners', 'Контрагенты', 'Реестр поставщиков: ИНН, КПП, реквизиты, контакты'],
    ['alloc', 'База распределения расходов', 'Ключи распределения затрат по объектам и статьям бюджета'],
    ['types', 'Типы расходов', 'Классификатор статей расходов для автоматической разноски'],
    ['accounts', 'Счета', 'План счетов бухгалтерского учета для формирования проводок']
  ];

  var state = {
    screen: 'login', settingsTab: 'docs', items: [], modal: null, nextId: 1, settingsFiles: {}, pw: false, newId: null
  };
  var seedDoc = DOCS.filter(function (d) { return d.key === 'doc1'; })[0] || DOCS[0];
  if (seedDoc) {
    state.items.push({
      id: 'seed', doc: seedDoc, fileName: 'МорТранс_СФ-2024-0847.pdf', size: 2.4 * 1048576, uploadedAt: '18.04.25, 09:42',
      status: 'binding', rows: clone(seedDoc.rows), confirmed: false, edits: 0, seeded: true
    });
  }
  function find(id) { return state.items.filter(function (i) { return i.id === id; })[0]; }

  /* ------------------------------------------------------------- тосты */
  function toast(msg, err) {
    var el = document.createElement('div');
    el.className = 'toast' + (err ? ' err' : '');
    el.textContent = msg;
    $('#toast-root').appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  /* --------------------------------------------------------- шаблоны UI */
  function header(tab) {
    function t(id, label) {
      return '<button class="tab' + (tab === id ? ' active' : '') + '" data-act="nav" data-to="' + id + '">' + label + '</button>';
    }
    return '<div class="app-header"><div class="logo"><i></i>ДокПоток</div><div class="tabs">' +
      t('queue', 'Очередь') + t('analytics', 'Аналитика') + t('settings', 'Настройки') +
      '</div><div class="user">Иванова М.С.<button class="icon-btn" data-act="logout" data-log="Выход" aria-label="Выйти">' + ic('logout', 14) + '</button></div></div>';
  }
  function metric(a, b, c) { return '<div class="metric"><span>' + a + '</span><b>' + b + '</b><span>' + c + '</span></div>'; }

  function screenLogin() {
    return '<div class="login-wrap"><form class="login" id="login-form" autocomplete="off">' +
      '<div class="logo"><i></i>ДокПоток</div><h1>Вход в систему</h1><p class="sub">Автоматическая обработка финансовых документов</p>' +
      '<div class="field"><label for="email">Email</label><input class="input" id="email" type="text" placeholder="name@company.ru"></div>' +
      '<div class="field"><label for="pw">Пароль</label><div class="input-wrap"><input class="input" id="pw" type="' + (state.pw ? 'text' : 'password') + '" placeholder="••••••••">' +
      '<button type="button" class="icon-btn" data-act="toggle-pw" data-log="Показать пароль" aria-label="Показать пароль">' + ic(state.pw ? 'eyeoff' : 'eye', 14) + '</button></div></div>' +
      '<button class="btn block" type="submit" data-log="Войти">Войти</button>' +
      '<button type="button" class="forgot" data-act="forgot">Забыли пароль?</button>' +
      '<div class="demo-note"><b>Демо:</b> введите любой email и пароль.</div></form></div>';
  }

  function qBadge(key) { var b = BADGE[key]; return '<span class="badge ' + b[0] + '">' + (key === 'processing' ? '<i class="spin"></i>' : '') + b[1] + '</span>'; }

  function qRowItem(it) {
    var inv = it.doc && it.doc.invoice, st = it.status;
    var sup = st === 'processing' ? '<span class="muted">' + esc(it.fileName) + '</span>' : st === 'error' ? '<span class="muted">Не распознан</span>' : esc(inv.supplier);
    var ok = st === 'binding' || st === 'ready';
    return '<tr' + (state.newId === it.id ? ' class="new"' : '') + '><td>' + sup + '</td>' +
      '<td class="mono">' + (ok ? esc(inv.number) : '–') + '</td><td class="muted">' + (ok ? shortDate(inv.date) : '–') + '</td>' +
      '<td class="sum">' + (ok ? money(inv.total) : '–') + '</td><td class="num muted">' + (ok ? it.doc.objects : '–') + '</td>' +
      '<td>' + qBadge(st) + '</td><td><div class="actions"><button class="btn sm outline" data-act="open" data-id="' + it.id + '" data-log="Открыть">Открыть</button>' +
      (st === 'ready' ? '<button class="btn sm outline excel" data-act="excel" data-id="' + it.id + '" data-log="Excel">' + ic('sheet', 12) + 'Excel</button>' : '') +
      '</div></td></tr>';
  }
  function qRowStatic(r, i) {
    return '<tr><td>' + esc(r.s) + '</td><td class="mono">' + esc(r.n) + '</td><td class="muted">' + r.d + '</td><td class="sum">' + money(r.sum) +
      '</td><td class="num muted">' + r.o + '</td><td>' + qBadge(r.st) + '</td><td><div class="actions"><button class="btn sm outline" data-act="open-static" data-log="Открыть">Открыть</button>' +
      (r.st === 'ok' ? '<button class="btn sm outline excel" data-act="excel-static" data-log="Excel">' + ic('sheet', 12) + 'Excel</button>' : '') + '</div></td></tr>';
  }
  function screenQueue() {
    var rows = state.items.map(qRowItem).join('') + STATIC_ROWS.map(qRowStatic).join('');
    return '<div class="app">' + header('queue') + '<div class="app-body">' +
      '<div class="metrics">' + metric('Обработано сегодня', '47', '+12 к вчерашнему') + metric('На проверке', '12', '3 срочных') +
      metric('Требуют внимания', '3', '1 дубль · 2 расхождения') + metric('Сэкономлено', '6.5 ч', '≈ 1 рабочий день') + '</div>' +
      '<div class="panel"><div class="panel-head"><h3>Очередь документов</h3><div class="panel-actions">' +
      '<div class="dz-inline" data-act="pick-queue" data-log="Перетащите или выберите файл">' + ic('upload', 13) + '<span>Перетащите или <u>выберите файл</u></span></div>' +
      '<button class="btn sm outline" data-act="pick-queue" data-log="Загрузить счет">' + ic('upload', 14) + 'Загрузить счет</button></div></div>' +
      '<table class="q-table"><colgroup><col style="width:190px"><col style="width:140px"><col style="width:76px"><col style="width:130px"><col style="width:92px"><col style="width:112px"><col></colgroup>' +
      '<thead><tr><th>Поставщик</th><th>Счет</th><th>Дата</th><th>Сумма</th><th class="num">Объекты</th><th>Статус</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div></div>';
  }

  function screenAnalytics() {
    var vals = [42, 68, 55, 91, 47, 83, 72], days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var bars = vals.map(function (v, i) {
      return '<div class="col"><span>' + v + '</span><div class="bar" style="height:' + Math.round(v * 0.58) + 'px"></div><span>' + days[i] + '</span></div>';
    }).join('');
    function tr(a, b, c, d, cls, e) {
      return '<tr><td>' + a + '</td><td>' + b + '</td><td class="b">' + c + '</td><td><span class="badge ' + cls + '">' + d + '</span></td><td>' + e + '</td></tr>';
    }
    return '<div class="app">' + header('analytics') + '<div class="app-body">' +
      '<div class="metrics">' + metric('Обработано за апрель', '1 247', 'счетов') + metric('Авто без корректировки', '94.2%', '+2.1% к марту') +
      metric('Ошибки контрагентов', '2.1%', '−1.3% к марту') + metric('Сэкономлено', '312 ч', '≈ 8.7 рабочих недель') + '</div>' +
      '<div class="panel"><div class="panel-head" style="border:0"><h3>Объем обработки за 7 дней</h3></div><div class="chart">' + bars + '</div></div>' +
      '<div class="panel"><div class="panel-head"><h3>Контрагенты – апрель</h3></div><table class="an-table"><thead><tr><th style="width:26%">Контрагент</th><th style="width:16%">Счетов</th><th style="width:20%">Сумма</th><th style="width:20%">Ошибки</th><th>Ср. объектов</th></tr></thead><tbody>' +
      tr('ООО «МорТранс»', 187, '109.3 М ₽', '0%', 'ok', '9.2') + tr('АО «Феникс Лог»', 143, '287.1 М ₽', '4.2%', 'warn', '18.7') +
      tr('ООО «СкайКарго»', 98, '43.8 М ₽', '1.0%', 'ok', '4.5') + tr('ТК «Даль»', 87, '12.4 М ₽', '0%', 'ok', '1.8') +
      tr('ООО «ВостТранс»', 74, '152.6 М ₽', '6.8%', 'err', '11.3') + '</tbody></table></div></div></div>';
  }

  function slotCard(s) {
    var f = state.settingsFiles[s[0]];
    return '<div class="card"><h4>' + s[1] + '</h4><p>' + s[2] + '</p>' +
      '<div class="dropzone' + (f ? ' done' : '') + '" data-act="pick-slot" data-slot="' + s[0] + '" data-log="Загрузка: ' + s[1] + '">' +
      (f ? ic('checkcircle', 18) + '<span><b>' + esc(f) + '</b></span><small>Файл загружен</small>'
        : ic('upload', 18) + '<span>Перетащите файл или <a>выберите с компьютера</a></span><small>XLS, XLSX, CSV</small>') + '</div>' +
      '<button class="btn sm outline" data-act="pick-slot" data-slot="' + s[0] + '" data-log="Выбрать файл: ' + s[1] + '">' + ic('filetext', 13) + 'Выбрать файл</button></div>';
  }
  function chk(label, on) { return '<label class="check"><input type="checkbox"' + (on ? ' checked' : '') + ' data-log="' + label + '"><span>' + label + '</span></label>'; }
  function fld(label, val, id) { return '<div class="field"><label>' + label + '</label><input class="input" value="' + esc(val) + '"' + (id ? ' id="' + id + '"' : '') + '></div>'; }
  function screenSettings() {
    var docs = state.settingsTab === 'docs';
    var body = docs
      ? '<p class="hint">Загрузите актуальные файлы справочников для корректной работы системы</p>' + SLOTS.map(slotCard).join('')
      : '<div class="form-card"><h4>Организация</h4><div class="form-body"><div class="grid2">' + fld('Наименование организации', 'ООО «ТрансЛогистик»') + fld('ИНН', '7712345678') +
      '</div><div class="grid2" style="margin-bottom:0">' + fld('КПП', '771201001') + fld('ОГРН', '1027700123456') + '</div></div></div>' +
      '<div class="form-card"><h4>Параметры обработки</h4><div class="form-body"><div class="grid2">' + fld('Порог расхождения суммы, %', '2') + fld('Срок обработки, рабочих дней', '3') + '</div>' +
      '<div class="checks">' + chk('Проверять дублирование счетов', 1) + chk('Проверять ИНН в реестре ЕГРЮЛ', 1) + chk('Проверять арифметику НДС', 1) + chk('Требовать наличие печати', 1) + '</div></div></div>' +
      '<div class="form-card"><h4>Уведомления</h4><div class="form-body">' + fld('Email для уведомлений', 'accounting@translogistic.ru') +
      '<div class="checks" style="border:0;padding:0">' + chk('Уведомлять об ошибках обработки', 1) + chk('Уведомлять о предупреждениях', 1) + chk('Уведомлять о завершении разноски', 1) + '</div></div></div>' +
      '<div class="save-row"><button class="btn" data-act="save-settings" data-log="Сохранить настройки">Сохранить настройки</button></div>';
    return '<div class="app">' + header('settings') + '<div class="app-body"><div class="page-title">Настройки</div>' +
      '<div class="subtabs"><button class="tab' + (docs ? ' active' : '') + '" data-act="subtab" data-to="docs">Документы</button>' +
      '<button class="tab' + (docs ? '' : ' active') + '" data-act="subtab" data-to="general">Общие настройки</button></div>' + body + '</div></div>';
  }

  /* ---------------------------------------------------- модальное окно */
  function fieldRows(it) {
    if (it.status === 'processing') {
      return ['Поставщик', 'ИНН', 'Номер счета', 'Дата', 'Сумма без НДС', 'Ставка НДС', 'Сумма НДС', 'Итого', 'Валюта']
        .map(function (l) { return '<div class="frow"><span>' + l + '</span><b><i class="sk"></i></b></div>'; }).join('');
    }
    if (it.status === 'error') {
      return '<div class="frow"><span>Поля не извлечены</span><b></b></div>';
    }
    var inv = it.doc.invoice, low = it.doc.lowConfidence || [];
    var list = [['Поставщик', inv.supplier], ['ИНН', inv.inn], ['Номер счета', inv.number], ['Дата', inv.date],
      ['Сумма без НДС', money(inv.net)], ['Ставка НДС', inv.vatRate + '%'], ['Сумма НДС', money(inv.vat)], ['Итого', money(inv.total)], ['Валюта', inv.currency]];
    return list.map(function (r) {
      var isLow = low.indexOf(r[0]) !== -1;
      return '<div class="frow"><span>' + r[0] + '</span><b>' + esc(r[1]) + '<i class="dot' + (isLow ? ' low' : '') + '"' + (isLow ? ' title="Низкая уверенность – проверьте значение"' : '') + '></i></b></div>';
    }).join('');
  }
  function tabInput(it) {
    var d = it.doc, st = it.status;
    var fileCard = '<div class="file-card"><div class="file-ico">' + esc(extOf(it.fileName)) + '</div><div class="fc-text"><b>' + esc(it.fileName) + '</b><small>' +
      sizeStr(it.size) + ' · ' + it.uploadedAt + '</small></div></div>';
    var status = '', objs = '', btn = '';
    if (st === 'processing') {
      status = '<div class="box load"><i class="spin"></i><div><b>Извлечение данных…</b>Модель анализирует документ<div class="bar-track"><i></i></div></div></div>';
    } else if (st === 'error') {
      status = '<div class="box err">' + ic('alert', 16) + '<div><b>Не удалось распознать документ</b>Проверьте файл и загрузите его повторно</div></div>';
    } else {
      status = '<div class="box ok">' + ic('checkcircle', 16) + '<div><b>Извлечение завершено</b>Точность ' + d.accuracy + '% · ' + d.seconds + ' сек</div></div>';
      objs = '<div class="obj-card"><span>Выявлено объектов учета</span><b>' + d.objects + ' ' + objWord(d.objectLabel, d.objects) + '</b><span>Модель: Qwen3-VL · дообученная</span></div>';
      btn = '<button class="btn block" data-act="mtab" data-tab="sheet" data-log="Перейти к разноске">Перейти к разноске →</button>';
    }
    return '<div class="m-body"><div class="cols"><div><div class="sec-title">Загрузка документа</div>' + fileCard + status + objs + btn + '</div>' +
      '<div><div class="sec-title">Извлеченные поля</div><div class="fields">' + fieldRows(it) + '</div></div></div></div>';
  }
  function pRow(it, r, i) {
    var ro = it.confirmed ? ' readonly tabindex="-1"' : '';
    function c(col, cls) { return '<td><input class="cell ' + (cls || '') + '" data-col="' + col + '" value="' + esc(col === 'amount' ? money(r.amount) : r[col]) + '"' + ro + '></td>'; }
    return '<tr data-i="' + i + '">' + c('date') + c('dt') + c('kt') + c('supplier') + c('currency') + c('amount') + c('transport', 'mono') + c('payer') + c('docNo', 'mono') + c('desc') + c('base') +
      '<td>' + (it.confirmed ? '' : '<button class="x-btn" data-act="row-del" data-i="' + i + '" data-log="Удалить строку" aria-label="Удалить строку">' + ic('x', 14) + '</button>') + '</td></tr>';
  }
  function sum(rows) { return rows.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0); }
  function xName(it) { return 'Разноска_' + String(it.doc.invoice.number).replace(/[\\\/:*?"<>|]/g, '-') + '.xlsx'; }
  function tabSheet(it) {
    var n = it.rows.length;
    var widths = [88, 52, 52, 140, 64, 104, 108, 140, 116, 134, 120, 40];
    var col = '<colgroup>' + widths.map(function (w) { return '<col style="width:' + w + 'px">'; }).join('') + '</colgroup>';
    var head = '<tr><th>Дата</th><th>Счет Дт</th><th>Счет Кт</th><th>Поставщик</th><th>Валюта</th><th>Сумма</th><th>Перевозка</th><th>Плательщик</th><th>Номер документа</th><th>Описание расхода</th><th>База распределения</th><th></th></tr>';
    var banner = it.confirmed
      ? '<div class="banner ok">' + ic('checkcircle', 16) + '<span>Проводки созданы. Файл разноски готов к скачиванию. Суммы указаны без НДС.</span></div>'
      : '<div class="banner">' + ic('info', 16) + '<span>Проверьте проводки перед подтверждением: ячейки можно редактировать, строки – добавлять и удалять. Суммы указаны без НДС.</span></div>';
    var actions = it.confirmed
      ? '<button class="btn" disabled>' + ic('check', 14) + 'Проводки созданы</button>' +
        '<button class="xlsx-chip ready" data-act="dl" data-log="Скачать разноску">' + ic('sheet', 20) + '<span><b>' + esc(xName(it)) + '</b><small>Нажмите, чтобы скачать</small></span></button>'
      : '<button class="btn" data-act="confirm" data-log="Подтвердить и создать проводки">Подтвердить и создать проводки</button>' +
        '<div class="xlsx-chip">' + ic('filetext', 18) + '<span><b>' + esc(xName(it)) + '</b><small>Формируется после подтверждения</small></span></div>';
    return '<div class="m-body"><div class="t-head"><div class="sec-title" style="margin:0">Разноска расходов</div><span class="badge info" id="rows-badge">' + n + ' ' + plural(n, ['проводка', 'проводки', 'проводок']) + '</span></div>' +
      banner + '<div class="tbl-wrap"><table class="p-table">' + col + '<thead>' + head + '</thead><tbody>' + it.rows.map(function (r, i) { return pRow(it, r, i); }).join('') +
      '</tbody><tfoot><tr><td colspan="5">Итого</td><td colspan="7" id="p-total" style="padding-left:12px">' + money(sum(it.rows)) + '</td></tr></tfoot></table></div>' +
      (it.confirmed ? '' : '<button class="btn sm outline" data-act="row-add" data-log="Добавить строку" style="margin-bottom:16px">' + ic('plus', 13) + 'Добавить строку</button>') +
      '<div class="m-actions">' + actions + '</div></div>';
  }
  function renderModal() {
    var root = $('#modal-root'), m = state.modal;
    var prev = root.firstChild ? root.firstChild.scrollTop : 0;
    if (!m) { root.innerHTML = ''; document.body.style.overflow = ''; return; }
    var it = find(m.id);
    if (!it) { state.modal = null; return renderModal(); }
    var inv = it.doc && it.doc.invoice, ok = it.status === 'binding' || it.status === 'ready';
    var title = ok ? esc(inv.number) : esc(it.fileName);
    var sub = ok ? '· ' + esc(inv.supplier) : (it.status === 'processing' ? '· обработка…' : '· не распознан');
    var disabled = !ok;
    document.body.style.overflow = 'hidden';
    root.innerHTML = '<div class="overlay" data-act="overlay"><div class="modal' + (m.tab === 'sheet' && ok ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="m-head"><div class="m-title"><b>' + title + '</b><span>' + sub + '</span></div><div class="m-right">' +
      (ok ? '<span class="chip">' + money(inv.total) + '</span>' : '') +
      '<button class="icon-btn" data-act="modal-close" data-log="Закрыть" aria-label="Закрыть">' + ic('x', 16) + '</button></div></div>' +
      '<div class="m-tabs"><button class="tab' + (m.tab === 'input' || disabled ? ' active' : '') + '" data-act="mtab" data-tab="input">Ввод</button>' +
      '<button class="tab' + (m.tab === 'sheet' && !disabled ? ' active' : '') + '" data-act="mtab" data-tab="sheet"' + (disabled ? ' aria-disabled="true"' : '') + '>Разноска</button></div>' +
      (m.tab === 'sheet' && ok ? tabSheet(it) : tabInput(it)) + '</div></div>';
    if (root.firstChild) root.firstChild.scrollTop = prev;
  }

  /* ---------------------------------------------------------- рендеринг */
  function render() {
    var app = $('#app');
    var scr = state.screen;
    app.innerHTML = scr === 'login' ? screenLogin() : scr === 'queue' ? screenQueue() : scr === 'analytics' ? screenAnalytics() : screenSettings();
    state.newId = null;
  }
  function go(screen) {
    state.screen = screen;
    render();
    window.scrollTo(0, 0);
    Log.event('screen_view', { screen: screen === 'settings' ? 'settings_' + state.settingsTab : screen });
  }

  /* --------------------------------------------------------- действия */
  var fileTarget = { kind: 'queue' };
  function pick(target) { fileTarget = target; var f = $('#file-input'); f.value = ''; f.click(); }

  function handleQueueFiles(files, via) {
    if (!files || !files.length) return;
    var list = Array.prototype.slice.call(files), firstItem = null;
    list.forEach(function (file) {
      var doc = matchDoc(file.name);
      var it = {
        id: 'u' + (state.nextId++), doc: doc, fileName: file.name, size: file.size, uploadedAt: nowStr(),
        status: 'processing', rows: doc ? clone(doc.rows) : [], confirmed: false, edits: 0, openedAt: 0
      };
      state.items.unshift(it);
      if (!firstItem) firstItem = it;
      state.newId = it.id;
      Log.event('upload', { name: file.name, size: file.size, doc: doc ? doc.key : null, via: via, id: it.id });
      setTimeout(function () {
        it.status = doc ? 'binding' : 'error';
        Log.event('extraction_done', { id: it.id, doc: doc ? doc.key : null, ok: !!doc });
        if (state.screen === 'queue') render();
        if (state.modal && state.modal.id === it.id) renderModal();
        if (!doc) toast('Не удалось распознать документ «' + file.name + '»', true);
      }, CFG.processingMs || 2600);
    });
    if (state.screen !== 'queue') go('queue'); else render();
    if (CFG.autoOpenAfterUpload && firstItem) openDoc(firstItem.id, 'auto');
  }
  function handleSlotFiles(files, slot, via) {
    if (!files || !files.length) return;
    state.settingsFiles[slot] = files[0].name;
    Log.event('settings_upload', { slot: slot, name: files[0].name, via: via });
    render();
    toast('Файл «' + files[0].name + '» загружен');
  }

  function openDoc(id, via) {
    var it = find(id); if (!it) return;
    it.openedAt = Date.now();
    state.modal = { id: id, tab: 'input' };
    Log.event('modal_open', { id: id, doc: it.doc ? it.doc.key : null, via: via });
    renderModal();
  }
  function closeModal() {
    if (!state.modal) return;
    Log.event('modal_close', { id: state.modal.id, tab: state.modal.tab });
    state.modal = null; renderModal();
  }

  function downloadXlsx(it) {
    if (!window.XLSX) { toast('Не удалось сформировать Excel', true); return; }
    var aoa = [COLS.map(function (c) { return c[1]; })];
    it.rows.forEach(function (r) { aoa.push(COLS.map(function (c) { return r[c[0]]; })); });
    aoa.push(['Итого', '', '', '', '', sum(it.rows)]);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [12, 8, 8, 24, 8, 12, 16, 22, 18, 30, 20].map(function (w) { return { wch: w }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Разноска');
    var buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = xName(it);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    Log.event('download', { id: it.id, doc: it.doc.key, file: xName(it) });
  }

  function onClick(e) {
    if (e.target.closest('#researcher-root')) return;
    var interactive = e.target.closest('[data-act],button,a,input,label,select,textarea,.dropzone,.dz-inline,.cell');
    var label = interactive ? (interactive.getAttribute('data-log') || interactive.textContent.trim().slice(0, 40) || interactive.getAttribute('data-act') || interactive.tagName) : '';
    Log.event('click', { x: Math.round(e.clientX), y: Math.round(e.clientY), target: label, screen: state.screen, dead: !interactive });
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act'), it, m = state.modal;
    switch (act) {
      case 'overlay': if (e.target === el) closeModal(); break;
      case 'modal-close': closeModal(); break;
      case 'nav': if (el.getAttribute('data-to') !== state.screen) go(el.getAttribute('data-to')); break;
      case 'logout': state.modal = null; renderModal(); go('login'); break;
      case 'toggle-pw': state.pw = !state.pw; var v = $('#email').value, p = $('#pw').value; render(); $('#email').value = v; $('#pw').value = p; break;
      case 'forgot': toast('Восстановление пароля недоступно в прототипе'); break;
      case 'subtab': state.settingsTab = el.getAttribute('data-to'); render(); Log.event('screen_view', { screen: 'settings_' + state.settingsTab }); break;
      case 'save-settings': Log.event('settings_save', {}); toast('Настройки сохранены'); break;
      case 'pick-queue': pick({ kind: 'queue', via: 'button' }); break;
      case 'pick-slot': pick({ kind: 'slot', slot: el.getAttribute('data-slot') }); break;
      case 'open': openDoc(el.getAttribute('data-id'), 'queue'); break;
      case 'open-static': toast('В прототипе открываются счет МорТранс и загруженные вами документы'); break;
      case 'excel-static': toast('Скачивание этого файла недоступно в прототипе'); break;
      case 'excel': it = find(el.getAttribute('data-id')); if (it) downloadXlsx(it); break;
      case 'mtab':
        if (!m) break;
        it = find(m.id);
        if (el.getAttribute('aria-disabled') === 'true') { toast('Дождитесь завершения обработки документа'); break; }
        if (el.getAttribute('data-tab') === m.tab) break;
        m.tab = el.getAttribute('data-tab'); Log.event('tab_switch', { tab: m.tab, id: m.id }); renderModal(); break;
      case 'row-del':
        it = find(m.id); var i = +el.getAttribute('data-i');
        Log.event('row_delete', { id: it.id, row: i, desc: it.rows[i] && it.rows[i].desc, amount: it.rows[i] && it.rows[i].amount });
        it.rows.splice(i, 1); it.edits++; renderModal(); break;
      case 'row-add':
        it = find(m.id);
        var last = it.rows[it.rows.length - 1] || {};
        it.rows.push({ date: last.date || '', dt: last.dt || '', kt: last.kt || '', supplier: last.supplier || it.doc.invoice.supplier, currency: last.currency || 'RUB',
          amount: 0, transport: '', payer: last.payer || '', docNo: last.docNo || it.doc.invoice.number, desc: '', base: '' });
        it.edits++; Log.event('row_add', { id: it.id, rows: it.rows.length });
        renderModal();
        var inputs = document.querySelectorAll('.p-table tbody tr:last-child .cell');
        if (inputs[5]) { inputs[5].focus(); inputs[5].select(); }
        var ov = $('.overlay'); if (ov) ov.scrollTop = ov.scrollHeight;
        break;
      case 'confirm':
        it = find(m.id);
        if (!it.rows.length) { toast('Добавьте хотя бы одну проводку', true); break; }
        it.confirmed = true; it.status = 'ready';
        Log.event('confirm', { id: it.id, doc: it.doc.key, rows: it.rows.length, total: sum(it.rows), edits: it.edits, ms_since_open: Date.now() - it.openedAt });
        render(); renderModal(); toast('Проводки созданы');
        break;
      case 'dl': it = find(m.id); if (it) downloadXlsx(it); break;
    }
  }

  /* --------------------------------------- редактирование ячеек таблицы */
  function onModalInput(e) {
    var c = e.target.closest('.cell'); if (!c || !state.modal) return;
    var it = find(state.modal.id), row = it.rows[+c.closest('tr').getAttribute('data-i')], col = c.getAttribute('data-col');
    row[col] = col === 'amount' ? parseMoney(c.value) : c.value;
    var t = $('#p-total'); if (t) t.textContent = money(sum(it.rows));
  }
  function onModalChange(e) {
    var c = e.target.closest('.cell'); if (!c || !state.modal) return;
    var it = find(state.modal.id), i = +c.closest('tr').getAttribute('data-i'), col = c.getAttribute('data-col');
    var old = c.getAttribute('data-old'), nw = col === 'amount' ? String(it.rows[i].amount) : c.value;
    if (col === 'amount') c.value = money(it.rows[i].amount);
    it.edits++;
    Log.event('cell_edit', { id: it.id, row: i, col: col, old: old, new: nw });
  }
  function onFocusIn(e) {
    var c = e.target.closest && e.target.closest('.cell');
    if (c) { c.setAttribute('data-old', c.getAttribute('data-col') === 'amount' ? String(parseMoney(c.value)) : c.value); if (c.getAttribute('data-col') === 'amount' && !c.readOnly) c.select(); }
  }

  /* -------------------------------------------------------------- вход */
  function onSubmit(e) {
    if (e.target.id !== 'login-form') return;
    e.preventDefault();
    Log.event('login', { email_filled: !!$('#email').value, pw_filled: !!$('#pw').value });
    go('queue');
  }

  /* ---------------------------------------------- перетаскивание файлов */
  function onDragOver(e) {
    e.preventDefault();
    var z = e.target.closest && e.target.closest('.dz-inline,.dropzone');
    document.querySelectorAll('.drag').forEach(function (n) { if (n !== z) n.classList.remove('drag'); });
    if (z) z.classList.add('drag');
  }
  function onDrop(e) {
    e.preventDefault();
    document.querySelectorAll('.drag').forEach(function (n) { n.classList.remove('drag'); });
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length || state.modal) return;
    var slot = e.target.closest && e.target.closest('[data-slot]');
    if (state.screen === 'settings' && state.settingsTab === 'docs' && slot) handleSlotFiles(files, slot.getAttribute('data-slot'), 'drop');
    else if (state.screen === 'queue') handleQueueFiles(files, 'drop');
  }

  /* ----------------------------------------------- панель исследователя */
  function panel() {
    var r = $('#researcher-root');
    if (r.firstChild) { r.innerHTML = ''; return; }
    var s = Log.summary();
    r.innerHTML = '<div class="rp"><h4>Панель исследователя <button id="rp-x" style="height:22px">×</button></h4>' +
      '<label>Код участника</label><input id="rp-p" value="' + esc(Log.participant()) + '" placeholder="например, Р01">' +
      '<div class="row"><button id="rp-save">Сохранить код</button><button id="rp-csv">Скачать журнал CSV</button><button id="rp-json">JSON</button></div>' +
      '<div class="row"><button id="rp-new">Новая сессия (сброс прототипа)</button><button id="rp-clear">Очистить журнал</button></div>' +
      '<div class="m">' + Object.keys(s).map(function (k) { return '<span>' + k + '</span><b>' + s[k] + '</b>'; }).join('') + '</div>' +
      '<small>Сессия ' + Log.sid() + '. Записей в журнале: ' + Log.all().length + '. Открыть и закрыть панель: Ctrl+Shift+L.</small></div>';
    function dl(name, text, type) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    }
    $('#rp-x').onclick = function () { r.innerHTML = ''; };
    $('#rp-save').onclick = function () { Log.setParticipant($('#rp-p').value.trim()); toast('Код участника сохранен'); panel(); panel(); };
    $('#rp-csv').onclick = function () { dl('docpotok_log_' + (Log.participant() || 'anon') + '.csv', Log.csv(), 'text/csv;charset=utf-8'); };
    $('#rp-json').onclick = function () { dl('docpotok_log.json', JSON.stringify(Log.all(), null, 1), 'application/json'); };
    $('#rp-clear').onclick = function () { if (confirm('Удалить весь журнал в этом браузере?')) { Log.clear(); panel(); panel(); } };
    $('#rp-new').onclick = function () { Log.event('session_end', {}); location.reload(); };
  }

  /* ------------------------------------------------------------- старт */
  document.addEventListener('click', onClick);
  document.addEventListener('input', function (e) { if (e.target.closest('#modal-root')) onModalInput(e); });
  document.addEventListener('change', function (e) { if (e.target.closest('#modal-root')) onModalChange(e); });
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('dragleave', function (e) { if (!e.relatedTarget) document.querySelectorAll('.drag').forEach(function (n) { n.classList.remove('drag'); }); });
  document.addEventListener('drop', onDrop);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') { e.preventDefault(); panel(); }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('cell')) e.target.blur();
  });
  $('#file-input').addEventListener('change', function (e) {
    var files = e.target.files;
    if (fileTarget.kind === 'slot') handleSlotFiles(files, fileTarget.slot, 'picker'); else handleQueueFiles(files, 'picker');
  });

  Log.event('session_start', { version: CFG.version, ua: navigator.userAgent.slice(0, 80), w: window.innerWidth, h: window.innerHeight });
  if (!DOCS.length) toast('Нет данных документов: запустите tools/build_docs.py', true);
  render();
  Log.event('screen_view', { screen: 'login' });

  window.DP = { state: state, matchDoc: matchDoc };
})();
