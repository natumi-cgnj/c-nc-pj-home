const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const weather = require('../cbi-weather.js');
const index = fs.readFileSync('index.html', 'utf8');

test('Sacramento uses the displayed month, day and hour against the 2006 archive', () => {
  const now = new Date(2026, 8, 3, 17, 9);
  assert.deepEqual(weather.historicalSlot(now), {
    date: '2006-09-03',
    time: '2006-09-03T17:00',
    key: '2006-09-03T17'
  });

  const url = new URL(weather.buildSacramentoUrl(now));
  assert.equal(url.origin, 'https://archive-api.open-meteo.com');
  assert.equal(url.pathname, '/v1/archive');
  assert.equal(url.searchParams.get('start_date'), '2006-09-03');
  assert.equal(url.searchParams.get('end_date'), '2006-09-03');
  assert.equal(url.searchParams.get('hourly'), 'temperature_2m,weather_code');
  assert.equal(url.searchParams.get('timezone'), 'America/Los_Angeles');
});

test('historical weather has a deterministic leap-day fallback', () => {
  const leapDay = new Date(2028, 1, 29, 6, 0);
  assert.equal(weather.historicalSlot(leapDay).time, '2006-02-28T06:00');
});

test('Osaka requests current local conditions without geolocation', () => {
  const url = new URL(weather.buildOsakaUrl());
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.pathname, '/v1/forecast');
  assert.equal(url.searchParams.get('current'), 'temperature_2m,weather_code');
  assert.equal(url.searchParams.get('timezone'), 'Asia/Tokyo');
  assert.equal(url.searchParams.get('latitude'), '34.6937');
  assert.equal(url.searchParams.get('longitude'), '135.5023');
});

test('WMO codes map to the compact homepage weather glyphs', () => {
  assert.equal(weather.weatherGlyph(0), '☀');
  assert.equal(weather.weatherGlyph(3), '☁');
  assert.equal(weather.weatherGlyph(45), '🌫');
  assert.equal(weather.weatherGlyph(61), '🌧');
  assert.equal(weather.weatherGlyph(71), '🌨');
  assert.equal(weather.weatherGlyph(95), '⛈');
  assert.equal(weather.weatherGlyph(999), '·');
});

test('homepage splits desktop weather across the world title and clock columns', () => {
  assert.match(index, /<script src="cbi-weather\.js\?v=20260903-cbi-weather2"><\/script>/);
  assert.match(index, /body\[data-world-id="cbi"\] \.cbi-weather-strip-desktop\{display:flex\}/);
  assert.match(index, /\.cbi-weather-strip-desktop-sacramento\{position:absolute;top:8px;right:0\}/);
  assert.match(index, /\.cbi-weather-strip-desktop-osaka\{position:absolute;top:-41px;left:0;width:100%\}/);
  assert.ok(index.indexOf('data-cbi-weather-strip="osaka"') < index.indexOf('<div class="page-clock"><div class="time" id="clock3"'));
  assert.match(index, /data-cbi-weather-strip="sacramento"[^>]*aria-live="polite"><span class="cbi-weather-icon" data-cbi-weather="sacramento-icon">/);
  assert.match(index, /data-cbi-weather-strip="osaka"[^>]*>[\s\S]*?<span class="cbi-weather-place">OSAKA<\/span>/);
  assert.match(index, /CBIWeather\.setActive\(world\.id==='cbi',new Date\(\)\)/);
  assert.match(index, /CBIWeather\.tick\(now\)/);
  assert.match(index, /data-cbi-weather-strip="combined"[\s\S]*SACRAMENTO[\s\S]*｜[\s\S]*OSAKA/);
});
