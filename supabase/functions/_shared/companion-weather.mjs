const MINUTE = 60000;
const CACHE_MS = 10 * MINUTE, MAX_AGE_MS = 45 * MINUTE, RETRY_MS = MINUTE;
const CONDITIONS = new Map([
  [0, '晴'], [1, '大致晴朗'], [2, '局部多云'], [3, '阴'], [45, '雾'], [48, '雾凇'],
  [51, '小毛毛雨'], [53, '毛毛雨'], [55, '较强毛毛雨'], [56, '轻微冻毛毛雨'], [57, '冻毛毛雨'],
  [61, '小雨'], [63, '中雨'], [65, '大雨'], [66, '轻微冻雨'], [67, '冻雨'],
  [71, '小雪'], [73, '中雪'], [75, '大雪'], [77, '雪粒'],
  [80, '小阵雨'], [81, '阵雨'], [82, '强阵雨'], [85, '小阵雪'], [86, '强阵雪'],
  [95, '雷暴'], [96, '雷暴伴小冰雹'], [99, '雷暴伴大冰雹']
]);
const numeric = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function osakaWeatherUrl() {
  const query = new URLSearchParams({
    latitude: '34.6937', longitude: '135.5023', timezone: 'Asia/Tokyo', timeformat: 'unixtime',
    current: 'temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m,is_day',
    temperature_unit: 'celsius', wind_speed_unit: 'kmh', forecast_days: '1'
  });
  return 'https://api.open-meteo.com/v1/forecast?' + query;
}

export function parseOsakaWeather(payload, at) {
  const current = payload?.current, units = payload?.current_units;
  if (!current || units?.temperature_2m !== '°C' || units?.time !== 'unixtime' || !numeric(current.time, 0, 1e11)) return null;
  const observed = current.time * 1000;
  if (observed > at + 5 * MINUTE || at - observed > MAX_AGE_MS || !numeric(current.temperature_2m, -80, 65) || !CONDITIONS.has(current.weather_code)) return null;
  // Numeric, fixed-city facts only. No provider text, client-supplied URLs or user data.
  return {
    city: '大阪', source: 'Open-Meteo', observed_at: new Date(observed).toISOString(), fetched_at: new Date(at).toISOString(),
    temperature_c: current.temperature_2m, condition: CONDITIONS.get(current.weather_code),
    feels_like_c: units.apparent_temperature === '°C' && numeric(current.apparent_temperature, -100, 80) ? current.apparent_temperature : null,
    precipitation_mm: units.precipitation === 'mm' && numeric(current.precipitation, 0, 300) ? current.precipitation : null,
    wind_kmh: units.wind_speed_10m === 'km/h' && numeric(current.wind_speed_10m, 0, 400) ? current.wind_speed_10m : null,
    is_day: [0, 1].includes(current.is_day) ? current.is_day === 1 : null
  };
}

export function createCompanionWeather({ fetcher = fetch, now = () => Date.now() } = {}) {
  let cached = null, pending = null, retryAt = 0;
  return async function weather() {
    const at = now(), fetched = Date.parse(cached?.fetched_at), observed = Date.parse(cached?.observed_at);
    if (cached && at >= fetched && at - fetched < CACHE_MS && at - observed <= MAX_AGE_MS) return { ...cached };
    if (pending) return pending;
    if (at < retryAt) return null;
    pending = (async () => {
      try {
        const response = await fetcher(osakaWeatherUrl(), { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(3500), headers: { Accept: 'application/json' } });
        if (!response.ok) throw Error('weather_unavailable');
        cached = parseOsakaWeather(await response.json(), now());
        if (!cached) throw Error('weather_unavailable');
        retryAt = 0;
        return { ...cached };
      } catch { retryAt = now() + RETRY_MS; return null; }
    })().finally(() => { pending = null; });
    return pending;
  };
}
