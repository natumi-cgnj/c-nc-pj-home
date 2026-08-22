(function (global) {
  'use strict';

  var STORAGE_KEY = 'omniverse_world_context';
  var DEFAULT_WORLD_ID = 'liminal';

  var WORLD_CONFIGS = {
    liminal: {
      id: 'liminal',
      label: '夹缝空间',
      title: 'Liminal Space',
      subtitle: '夹缝空間',
      description: 'Neal / Jane / Will 与大阪的我',
      scene: 'apartment',
      defaultLocationId: 'apartment',
      locations: {
        apartment: { id: 'apartment', label: '夹缝空间', description: 'Neal / Jane / Will 与大阪的我' }
      },
      characters: ['neal', 'jane', 'will'],
      banner: 'shared',
      routes: {
        daily: 'daily.html',
        wallet: 'wallet.html',
        kitchen: 'kitchen.html',
        story: 'story.html',
        dungeon: 'dungeon.html',
        shop: 'shop.html',
        gacha: 'gacha.html'
      }
    },
    cbi: {
      id: 'cbi',
      label: 'CBI',
      title: 'CBI · Sacramento',
      subtitle: 'California Bureau of Investigation',
      description: 'Boss小组 · CBI AU',
      scene: 'cbi-office',
      defaultLocationId: 'office',
      locations: {
        office: { id: 'office', label: 'CBI办公室', description: 'Serious Crimes Unit' },
        home: { id: 'home', label: 'Boss家', description: "Boss's Home · Guest Room" }
      },
      characters: ['jane'],
      banner: 'empty',
      routes: {
        daily: 'world-empty.html?module=daily',
        wallet: 'world-empty.html?module=wallet',
        kitchen: 'world-empty.html?module=kitchen',
        story: 'cbi.html',
        dungeon: 'world-empty.html?module=dungeon',
        shop: 'world-empty.html?module=shop',
        gacha: 'world-empty.html?module=gacha'
      }
    }
  };

  function safeParse(value) {
    try { return JSON.parse(value); } catch (error) { return null; }
  }

  function readContext() {
    var raw = null;
    try { raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY); } catch (error) {}
    var saved = safeParse(raw);
    var worldId = saved && typeof saved === 'object' ? saved.activeWorldId : saved;
    if (!WORLD_CONFIGS[worldId]) worldId = DEFAULT_WORLD_ID;
    var savedLocations = saved && typeof saved === 'object' && saved.locationByWorld && typeof saved.locationByWorld === 'object' ? saved.locationByWorld : {};
    var locationByWorld = {};
    Object.keys(WORLD_CONFIGS).forEach(function (id) {
      var world = WORLD_CONFIGS[id];
      var locationId = savedLocations[id];
      if (!world.locations || !world.locations[locationId]) locationId = world.defaultLocationId;
      locationByWorld[id] = locationId;
    });
    return {
      version: 2,
      activeWorldId: worldId,
      locationByWorld: locationByWorld
    };
  }

  function getActiveWorldId() {
    return readContext().activeWorldId;
  }

  function getWorld(worldId) {
    return WORLD_CONFIGS[worldId] || WORLD_CONFIGS[DEFAULT_WORLD_ID];
  }

  function getActiveWorld() {
    return getWorld(getActiveWorldId());
  }

  function getActiveLocationId(worldId) {
    var targetWorldId = worldId || getActiveWorldId();
    var world = getWorld(targetWorldId);
    var saved = readContext().locationByWorld[targetWorldId];
    return world.locations && world.locations[saved] ? saved : world.defaultLocationId;
  }

  function getLocation(locationId, worldId) {
    var targetWorldId = worldId || getActiveWorldId();
    var world = getWorld(targetWorldId);
    return world.locations && (world.locations[locationId] || world.locations[world.defaultLocationId]) || null;
  }

  function writeContext(context) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2,
        activeWorldId: context.activeWorldId,
        locationByWorld: context.locationByWorld,
        updatedAt: new Date().toISOString()
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  function emitWorldChange(worldId) {
    if (!global.dispatchEvent) return;
    try {
      global.dispatchEvent(new global.CustomEvent('omniverse:worldchange', {
        detail: { worldId: worldId, world: getWorld(worldId) }
      }));
    } catch (error) {}
  }

  function setActiveWorldId(worldId) {
    if (!WORLD_CONFIGS[worldId]) return false;
    var context = readContext();
    var previous = context.activeWorldId;
    context.activeWorldId = worldId;
    if (!writeContext(context)) return false;
    if (previous !== worldId) emitWorldChange(worldId);
    return true;
  }

  function setActiveLocationId(worldId, locationId) {
    var world = WORLD_CONFIGS[worldId];
    if (!world || !world.locations || !world.locations[locationId]) return false;
    var context = readContext();
    var previous = context.locationByWorld[worldId];
    context.locationByWorld[worldId] = locationId;
    if (!writeContext(context)) return false;
    if (previous !== locationId && global.dispatchEvent) {
      try {
        global.dispatchEvent(new global.CustomEvent('omniverse:locationchange', {
          detail: { worldId: worldId, locationId: locationId, location: getLocation(locationId, worldId) }
        }));
      } catch (error) {}
    }
    return true;
  }

  function getRoute(moduleId, fallbackHref, worldId) {
    var world = getWorld(worldId || getActiveWorldId());
    return world.routes && world.routes[moduleId] || fallbackHref || '#';
  }

  function inferModuleId(href) {
    var path = String(href || '').split('#')[0].split('?')[0].replace(/^\.\//, '');
    var map = {
      'daily.html': 'daily',
      'wallet.html': 'wallet',
      'kitchen.html': 'kitchen',
      'story.html': 'story',
      'cbi.html': 'story',
      'dungeon.html': 'dungeon',
      'shop.html': 'shop',
      'gacha.html': 'gacha'
    };
    return map[path] || '';
  }

  function getScopedStorageKey(baseKey, worldId) {
    var target = worldId || getActiveWorldId();
    return target === DEFAULT_WORLD_ID ? baseKey : baseKey + '__world__' + target;
  }

  function recordIsVisible(record, options) {
    options = options || {};
    if (!record || typeof record !== 'object') return false;
    if (record.scope === 'global') return true;
    var target = options.worldId || getActiveWorldId();
    var recordWorld = record.worldId || options.legacyWorldId || DEFAULT_WORLD_ID;
    return recordWorld === target;
  }

  global.WorldContext = Object.freeze({
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_WORLD_ID: DEFAULT_WORLD_ID,
    worlds: WORLD_CONFIGS,
    read: readContext,
    getWorld: getWorld,
    getActiveWorld: getActiveWorld,
    getActiveWorldId: getActiveWorldId,
    getActiveLocationId: getActiveLocationId,
    getLocation: getLocation,
    setActiveWorldId: setActiveWorldId,
    setActiveLocationId: setActiveLocationId,
    getRoute: getRoute,
    inferModuleId: inferModuleId,
    getScopedStorageKey: getScopedStorageKey,
    recordIsVisible: recordIsVisible
  });
})(window);
