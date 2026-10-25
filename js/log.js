// Журнал действий респондента. Хранится в localStorage браузера,
// при заданном DP_CONFIG.logEndpoint дополнительно отправляется на сервер.
(function () {
  var KEY = 'dp_log_v1', PKEY = 'dp_participant';
  var cfg = window.DP_CONFIG || {};
  var t0 = Date.now();
  var sid = Math.random().toString(36).slice(2, 8);
  var queue = [];

  function ls(op, k, v) {
    try { return op === 'get' ? localStorage.getItem(k) : op === 'set' ? localStorage.setItem(k, v) : localStorage.removeItem(k); }
    catch (e) { return null; }
  }
  var mem = [];
  function load() { try { return JSON.parse(ls('get', KEY) || '[]'); } catch (e) { return mem; } }
  function save(a) { mem = a; ls('set', KEY, JSON.stringify(a)); }

  var participant = ls('get', PKEY) || '';
  try {
    var q = new URLSearchParams(location.search).get('p');
    if (q) { participant = q; ls('set', PKEY, q); }
  } catch (e) {}

  function flush() {
    if (!cfg.logEndpoint || !queue.length) return;
    var body = JSON.stringify(queue.splice(0));
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(cfg.logEndpoint, body);
      else fetch(cfg.logEndpoint, { method: 'POST', mode: 'no-cors', body: body, keepalive: true });
    } catch (e) {}
  }
  setInterval(flush, 5000);
  window.addEventListener('pagehide', flush);

  var DPLog = {
    sid: function () { return sid; },
    participant: function () { return participant; },
    setParticipant: function (p) { participant = p; ls('set', PKEY, p); DPLog.event('participant_set', { p: p }); },
    newSession: function () { sid = Math.random().toString(36).slice(2, 8); t0 = Date.now(); },
    event: function (e, d) {
      var rec = { p: participant, sid: sid, t: Date.now() - t0, ts: new Date().toISOString(), e: e, d: d || {} };
      var a = load(); a.push(rec); save(a);
      queue.push(rec);
      if (queue.length >= 20) flush();
    },
    all: load,
    session: function () { return load().filter(function (r) { return r.sid === sid; }); },
    clear: function () { save([]); },
    csv: function () {
      var rows = [['participant', 'session', 'time_ms', 'timestamp', 'event', 'details']];
      load().forEach(function (r) { rows.push([r.p, r.sid, r.t, r.ts, r.e, JSON.stringify(r.d)]); });
      return '﻿' + rows.map(function (r) {
        return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';');
      }).join('\r\n');
    },
    summary: function () {
      var s = DPLog.session(), c = function (e) { return s.filter(function (r) { return r.e === e; }); };
      var first = function (e) { var x = c(e)[0]; return x ? x.t : null; };
      var up = first('upload'), conf = first('confirm');
      return {
        'Время в сессии, с': s.length ? Math.round(s[s.length - 1].t / 1000) : 0,
        'Клики': c('click').length,
        'Клики мимо элементов': c('click').filter(function (r) { return r.d.dead; }).length,
        'Загрузок файлов': c('upload').length,
        'Не распознано файлов': c('upload').filter(function (r) { return !r.d.doc; }).length,
        'Правок в ячейках': c('cell_edit').length,
        'Добавлено строк': c('row_add').length,
        'Удалено строк': c('row_delete').length,
        'Подтверждений разноски': c('confirm').length,
        'От загрузки до подтверждения, с': (up != null && conf != null) ? Math.round((conf - up) / 1000) : '–'
      };
    }
  };
  window.DPLog = DPLog;
})();
