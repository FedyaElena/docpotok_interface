// Яндекс Метрика (тот же счетчик, что на лендинге) и баннер согласия на cookie.
// Метрика подключается только после согласия и только на боевом адресе
// (не на localhost и не при открытии файла с диска).
(function () {
  var C = window.DP_CONFIG || {};
  var KEY = 'dp_cookie_consent';
  var loaded = false, pending = [];
  var enabled = !!C.ymId && location.protocol !== 'file:' && !/^(localhost|127\.|\[::1\])/.test(location.hostname);
  var forceBanner = /[?&]cookie=1/.test(location.search);

  function getC() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setC(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadYM() {
    if (loaded || !enabled) return;
    loaded = true;
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date(); k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + C.ymId, 'ym');
    window.ym(C.ymId, 'init', { ssr: true, webvisor: true, clickmap: true, referrer: document.referrer, url: location.href, accurateTrackBounce: true, trackLinks: true });
    pending.splice(0).forEach(function (g) { window.ym(C.ymId, 'reachGoal', g); });
  }

  function goal(name) {
    if (window.DPLog) window.DPLog.event('goal', { name: name });
    if (loaded && window.ym) window.ym(C.ymId, 'reachGoal', name);
    else if (enabled && getC() !== 'no') pending.push(name);
  }

  function showBanner() {
    var root = document.getElementById('cookie-root');
    if (!root) return;
    root.innerHTML = '<div class="cookie" role="dialog" aria-label="Использование cookie"><p>Мы используем cookie и Яндекс Метрику, чтобы понимать, как посетители пользуются сайтом. ' +
      'Метрика включится только с вашего согласия. Действия в демо записываются обезличенно, чтобы улучшать интерфейс. ' +
      'Подробнее – в <a href="' + (C.privacyUrl || '#') + '" target="_blank" rel="noopener">политике обработки персональных данных</a>.</p>' +
      '<div class="cookie-btns"><button class="btn" id="ck-yes">Принять</button><button class="btn outline" id="ck-no">Отказаться</button></div></div>';
    document.getElementById('ck-yes').onclick = function () { setC('yes'); root.innerHTML = ''; loadYM(); };
    document.getElementById('ck-no').onclick = function () { setC('no'); pending = []; root.innerHTML = ''; };
  }

  window.DPAnalytics = { goal: goal, showBanner: showBanner };
  var c = getC();
  if (c === 'yes') loadYM();
  else if ((c === null && enabled) || forceBanner) showBanner();
})();
