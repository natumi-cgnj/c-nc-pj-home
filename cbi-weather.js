(function (global) {
  'use strict';

  const CACHE_KEY = 'cbi_home_weather_v1';
  const HISTORY_YEAR = 2006;
  const OSAKA_CACHE_MS = 30 * 60 * 1000;
  const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 8000;

  let active = false;
  let inFlight = null;
  let refreshTimer = 0;
  let renderedHistoricalKey = '';

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function historicalSlot(input) {
    const now = input instanceof Date && !Number.isNaN(input.getTime()) ? input : new Date();
    const month = now.getMonth() + 1;
    let day = now.getDate();
    if (month === 2 && day === 29) day = 28;
    const date = HISTORY_YEAR + '-' + pad(month) + '-' + pad(day);
    const hour = pad(now.getHours());
    return {
      date: date,
      time: date + 'T' + hour + ':00',
      key: date + 'T' + hour
    };
  }

  function weatherGlyph(rawCode) {
    const code = Number(rawCode);
    if (code === 0) return '☀';
    if (code === 1) return '🌤';
    if (code === 2) return '⛅';
    if (code === 3) return '☁';
    if (code === 45 || code === 48) return '🌫';
    if ((code >= 51 && code <= 57) || (code >= 80 && code <= 82)) return '🌦';
    if (code >= 61 && code <= 67) return '🌧';
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return '🌨';
    if (code >= 95 && code <= 99) return '⛈';
    return '·';
  }

  function buildSacramentoUrl(input) {
    const slot = historicalSlot(input);
    const params = new URLSearchParams({
      latitude: '38.5816',
      longitude: '-121.4944',
      start_date: slot.date,
      end_date: slot.date,
      hourly: 'temperature_2m,weather_code',
      temperature_unit: 'celsius',
      timezone: 'America/Los_Angeles'
    });
    return 'https://archive-api.open-meteo.com/v1/archive?' + params.toString();
  }

  function buildOsakaUrl() {
    const params = new URLSearchParams({
      latitude: '34.6937',
      longitude: '135.5023',
      current: 'temperature_2m,weather_code',
      temperature_unit: 'celsius',
      timezone: 'Asia/Tokyo'
    });
    return 'https://api.open-meteo.com/v1/forecast?' + params.toString();
  }

  function emptyCache() {
    return { version: 1, sacramento: null, osaka: null };
  }

  function readCache() {
    try {
      if (!global.localStorage) return emptyCache();
      const parsed = JSON.parse(global.localStorage.getItem(CACHE_KEY));
      if (!parsed || parsed.version !== 1) return emptyCache();
      return parsed;
    } catch (error) {
      return emptyCache();
    }
  }

  function writeCache(cache) {
    try {
      if (global.localStorage) global.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {}
  }

  function isWeatherValue(value) {
    return value && Number.isFinite(Number(value.temperature)) && Number.isFinite(Number(value.code));
  }

  function formatTemperature(value) {
    if (!Number.isFinite(Number(value))) return '—°';
    return String(Math.round(Number(value))).replace('-', '−') + '°';
  }

  function setAll(role, value) {
    if (!global.document) return;
    global.document.querySelectorAll('[data-cbi-weather="' + role + '"]').forEach(function (node) {
      node.textContent = value;
    });
  }

  function renderCache(cache, input) {
    const slot = historicalSlot(input);
    const sacramento = isWeatherValue(cache.sacramento) ? cache.sacramento : null;
    const osaka = isWeatherValue(cache.osaka) ? cache.osaka : null;

    setAll('sacramento-icon', sacramento ? weatherGlyph(sacramento.code) : '·');
    setAll('sacramento-temp', sacramento ? formatTemperature(sacramento.temperature) : '—°');
    setAll('osaka-icon', osaka ? weatherGlyph(osaka.code) : '·');
    setAll('osaka-temp', osaka ? formatTemperature(osaka.temperature) : '—°');

    renderedHistoricalKey = slot.key;
    if (!global.document) return;
    const sacSource = sacramento && sacramento.sourceKey ? sacramento.sourceKey.replace('T', ' ') + ':00' : '等待历史天气';
    const stale = !sacramento || sacramento.sourceKey !== slot.key || !osaka || Date.now() - Number(osaka.fetchedAt || 0) > OSAKA_CACHE_MS;
    global.document.querySelectorAll('.cbi-weather-strip').forEach(function (strip) {
      const stripKind = strip.dataset.cbiWeatherStrip || 'combined';
      strip.dataset.stale = stale ? 'true' : 'false';
      if (stripKind === 'sacramento') {
        strip.title = 'Sacramento：' + sacSource + '（2006 历史参考） · Open-Meteo';
        strip.setAttribute('aria-label', '萨克拉门托 ' + (sacramento ? formatTemperature(sacramento.temperature) : '天气读取中'));
      } else if (stripKind === 'osaka') {
        strip.title = 'Osaka：当前实况 · Open-Meteo';
        strip.setAttribute('aria-label', '大阪 ' + (osaka ? formatTemperature(osaka.temperature) : '天气读取中'));
      } else {
        strip.title = 'Sacramento：' + sacSource + '（2006 历史参考） · Osaka：当前实况 · Open-Meteo';
        strip.setAttribute('aria-label', '萨克拉门托 ' + (sacramento ? formatTemperature(sacramento.temperature) : '天气读取中') + '，大阪 ' + (osaka ? formatTemperature(osaka.temperature) : '天气读取中'));
      }
    });
  }

  async function fetchJson(url) {
    if (typeof global.fetch !== 'function') throw new Error('Weather fetch is unavailable');
    const controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    const timeout = global.setTimeout(function () {
      if (controller) controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const response = await global.fetch(url, {
        signal: controller ? controller.signal : undefined,
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Weather request failed: ' + response.status);
      return response.json();
    } finally {
      global.clearTimeout(timeout);
    }
  }

  async function fetchSacramento(input) {
    const slot = historicalSlot(input);
    const payload = await fetchJson(buildSacramentoUrl(input));
    const hourly = payload && payload.hourly;
    const index = hourly && Array.isArray(hourly.time) ? hourly.time.indexOf(slot.time) : -1;
    const temperature = index >= 0 && hourly.temperature_2m ? Number(hourly.temperature_2m[index]) : NaN;
    const code = index >= 0 && hourly.weather_code ? Number(hourly.weather_code[index]) : NaN;
    if (!Number.isFinite(temperature) || !Number.isFinite(code)) throw new Error('Historical weather is incomplete');
    return { temperature: temperature, code: code, sourceKey: slot.key, fetchedAt: Date.now() };
  }

  async function fetchOsaka() {
    const payload = await fetchJson(buildOsakaUrl());
    const current = payload && payload.current;
    const temperature = current ? Number(current.temperature_2m) : NaN;
    const code = current ? Number(current.weather_code) : NaN;
    if (!Number.isFinite(temperature) || !Number.isFinite(code)) throw new Error('Current weather is incomplete');
    return { temperature: temperature, code: code, sourceKey: current.time || '', fetchedAt: Date.now() };
  }

  function needsOsakaRefresh(entry, force) {
    return force || !isWeatherValue(entry) || Date.now() - Number(entry.fetchedAt || 0) >= OSAKA_CACHE_MS;
  }

  function needsSacramentoRefresh(entry, slot, force) {
    return force || !isWeatherValue(entry) || entry.sourceKey !== slot.key;
  }

  async function refresh(input, force) {
    if (!active || inFlight) return inFlight;
    const now = input instanceof Date ? input : new Date();
    const slot = historicalSlot(now);
    const cache = readCache();
    renderCache(cache, now);
    if (global.navigator && global.navigator.onLine === false) return null;

    const jobs = [];
    if (needsSacramentoRefresh(cache.sacramento, slot, !!force)) {
      jobs.push(fetchSacramento(now).then(function (value) { return { place: 'sacramento', value: value }; }));
    }
    if (needsOsakaRefresh(cache.osaka, !!force)) {
      jobs.push(fetchOsaka().then(function (value) { return { place: 'osaka', value: value }; }));
    }
    if (!jobs.length) return null;

    inFlight = Promise.allSettled(jobs).then(function (results) {
      results.forEach(function (result) {
        if (result.status === 'fulfilled') cache[result.value.place] = result.value.value;
      });
      writeCache(cache);
      renderCache(cache, now);
    }).finally(function () {
      inFlight = null;
    });
    return inFlight;
  }

  function stopTimer() {
    if (!refreshTimer) return;
    global.clearInterval(refreshTimer);
    refreshTimer = 0;
  }

  function setActive(nextActive, input) {
    active = !!nextActive;
    stopTimer();
    if (!active) return;
    const now = input instanceof Date ? input : new Date();
    renderCache(readCache(), now);
    refresh(now, false);
    refreshTimer = global.setInterval(function () { refresh(new Date(), false); }, REFRESH_INTERVAL_MS);
  }

  function tick(input) {
    if (!active) return;
    const now = input instanceof Date ? input : new Date();
    if (historicalSlot(now).key !== renderedHistoricalKey) refresh(now, false);
  }

  const api = {
    CACHE_KEY: CACHE_KEY,
    HISTORY_YEAR: HISTORY_YEAR,
    historicalSlot: historicalSlot,
    weatherGlyph: weatherGlyph,
    buildSacramentoUrl: buildSacramentoUrl,
    buildOsakaUrl: buildOsakaUrl,
    setActive: setActive,
    tick: tick,
    refresh: refresh
  };

  global.CBIWeather = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (global.addEventListener) {
    global.addEventListener('online', function () {
      if (active) refresh(new Date(), true);
    });
  }
  if (global.document) {
    global.document.addEventListener('visibilitychange', function () {
      if (active && global.document.visibilityState === 'visible') refresh(new Date(), false);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
