import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionWeather, parseOsakaWeather, osakaWeatherUrl } from '../supabase/functions/_shared/companion-weather.mjs';
const NOW=Date.parse('2026-11-19T16:00:00+09:00');
const data=(at=NOW)=>({current_units:{time:'unixtime',temperature_2m:'°C',apparent_temperature:'°C',precipitation:'mm',wind_speed_10m:'km/h'},
  current:{time:at/1000,temperature_2m:12.3,apparent_temperature:9.4,weather_code:61,precipitation:.4,wind_speed_10m:12,is_day:1},private:'must not pass'});
test('fixed-city request sends no account, messages, location permissions or client URL',()=>{
  const url=new URL(osakaWeatherUrl());assert.equal(url.origin,'https://api.open-meteo.com');assert.equal(url.searchParams.get('latitude'),'34.6937');
  assert.equal(url.searchParams.get('longitude'),'135.5023');assert.equal(url.searchParams.get('timeformat'),'unixtime');assert.equal(url.searchParams.get('timezone'),'Asia/Tokyo');
  assert.equal(url.searchParams.has('apikey'),false);assert.equal(url.searchParams.get('temperature_unit'),'celsius');
});
test('only current validated Osaka facts enter correspondence, with exact observation time and units',()=>{
  const parsed=parseOsakaWeather(data(),NOW);assert.equal(parsed.city,'大阪');assert.equal(parsed.temperature_c,12.3);assert.equal(parsed.condition,'小雨');
  assert.equal(parsed.observed_at,new Date(NOW).toISOString());assert.equal(parsed.is_day,true);assert.equal(parsed.wind_kmh,12);assert.ok(!JSON.stringify(parsed).includes('must not pass'));
  const optional=data();optional.current.apparent_temperature=null;optional.current.precipitation='99';assert.equal(parseOsakaWeather(optional,NOW).feels_like_c,null);assert.equal(parseOsakaWeather(optional,NOW).precipitation_mm,null);
});
test('stale, future, missing, unknown and mismatched-unit weather is not presented as current',()=>{
  assert.equal(parseOsakaWeather(data(NOW-46*60000),NOW),null);assert.equal(parseOsakaWeather(data(NOW+6*60000),NOW),null);
  for(const change of [x=>{x.current.temperature_2m=null},x=>{x.current.weather_code=999},x=>{x.current_units.temperature_2m='°F'},x=>{delete x.current.time}]){const item=data();change(item);assert.equal(parseOsakaWeather(item,NOW),null);}
  assert.equal(parseOsakaWeather(null,NOW),null);
});
test('cache coalesces simultaneous reads, refreshes after ten minutes and handles transient failure without stale claims',async()=>{
  let at=NOW,count=0,fail=false,options;
  const read=createCompanionWeather({now:()=>at,fetcher:async(url,input)=>{count++;options=input;if(fail)throw Error('offline');return Response.json(data(at));}});
  const values=await Promise.all([read(),read(),read()]);assert.equal(count,1);assert.ok(values.every(x=>x.city==='大阪'));
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);assert.equal(options.headers.Authorization,undefined);
  await read();assert.equal(count,1);at+=11*60000;await read();assert.equal(count,2);
  fail=true;at+=11*60000;assert.equal(await read(),null);assert.equal(count,3);assert.equal(await read(),null);assert.equal(count,3);
  at+=61000;fail=false;assert.equal((await read()).city,'大阪');assert.equal(count,4);
});
test('provider HTTP and JSON errors are optional context failures, and synchronous transport failure can retry',async()=>{
  for(const response of [()=>new Response('bad',{status:503}),()=>new Response('not-json')]){
    const read=createCompanionWeather({now:()=>NOW,fetcher:async()=>response()});assert.equal(await read(),null);
  }
  let at=NOW;
  const read=createCompanionWeather({now:()=>at,fetcher:()=>{throw Error('sync failure')}});assert.equal(await read(),null);at+=61000;assert.equal(await read(),null);
});
