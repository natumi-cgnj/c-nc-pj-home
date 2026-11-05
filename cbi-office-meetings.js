(function (global) {
  'use strict';
  var ROOT = 'assets/scenes/cbi-office-meetings/v1/';
  var ORDER = ['jane', 'rigsby', 'vanpelt', 'lisbon', 'cho'];
  var TABLE = [[791,443],[975,443],[994,670],[989,674],[776,674],[776,662]];
  var LEGS = [[[790,670],[805,670],[803,723],[796,729],[790,725]],
    [[965,669],[981,669],[976,722],[970,727],[963,724]]];
  var loading;

  function polygon(ctx, points) {
    ctx.beginPath();
    points.forEach(function (p, i) { if (i) ctx.lineTo(p[0],p[1]); else ctx.moveTo(p[0],p[1]); });
    ctx.closePath();
  }
  function group(ids) {
    var sorted = ORDER.filter(function (id) { return ids.indexOf(id) >= 0; });
    if (sorted.length !== 3) return null;
    return {far:sorted[0],near:sorted[1],left:sorted[2]};
  }
  function placement(manifest, id, seatName) {
    var person = manifest.people[id], seat = manifest.seats[seatName];
    if (!person || !seat) throw new Error('Invalid meeting placement');
    var flip = person.facing !== seat.facing;
    return {id:id,seat:seatName,flip:flip,width:person.width,height:person.height,
      x:seat.x-(flip ? person.width-person.anchor[0] : person.anchor[0]),
      y:seat.y-person.anchor[1]};
  }
  function validate(manifest) {
    if (!manifest || manifest.version !== 1 || manifest.width !== 1672 || manifest.height !== 941) {
      throw new Error('Invalid meeting canvas');
    }
    ORDER.forEach(function (id) {
      var p = manifest.people[id];
      if (!p || !p.src || !p.front || !Number.isInteger(p.width) || !Number.isInteger(p.height) ||
          p.width <= 0 || p.height <= 0 || !Array.isArray(p.anchor) || p.anchor.length !== 2 ||
          !['left','right'].includes(p.facing) || !/^[a-f0-9]{64}$/.test(p.sha256)) {
        throw new Error('Invalid locked meeting figure: '+id);
      }
    });
    return manifest;
  }
  function load() {
    if (loading) return loading;
    loading = global.fetch(ROOT+'manifest.json?v=20261105-lock1').then(function (response) {
      if (!response.ok) throw new Error('Meeting manifest unavailable');
      return response.json();
    }).then(validate).then(function (manifest) {
      var sizes = {};
      ORDER.forEach(function (id) {
        var p = manifest.people[id];
        sizes[p.src] = sizes[p.front] = [p.width,p.height];
      });
      manifest.props.forEach(function (p) { sizes[p.src] = [p.width,p.height]; });
      Object.keys(manifest.away).forEach(function (id) { var p=manifest.away[id]; sizes[p.src]=[p.width,p.height]; });
      Object.keys(manifest.chairs).forEach(function (id) { var p=manifest.chairs[id]; sizes[p.src]=[p.width,p.height]; });
      var images = {};
      return Promise.all(Object.keys(sizes).map(function (src) {
        return new Promise(function (resolve,reject) {
          var image = new global.Image();
          image.decoding='async';
          image.onload=function () {
            if (image.naturalWidth !== sizes[src][0] || image.naturalHeight !== sizes[src][1]) {
              reject(new Error('Meeting figure dimensions changed: '+src)); return;
            }
            images[src]=image; resolve();
          };
          image.onerror=function () { reject(new Error('Meeting figure unavailable: '+src)); };
          image.src=ROOT+src+'?v=20261105-lock1';
        });
      })).then(function () { return {manifest:manifest,images:images}; });
    }).catch(function (error) { loading=null; throw error; });
    return loading;
  }
  function drawPart(ctx, image, p) {
    ctx.save();
    if (p.flip) { ctx.translate(p.x+p.width,p.y); ctx.scale(-1,1); }
    else ctx.translate(p.x,p.y);
    // Intrinsic image dimensions are mandatory. Seats never scale a figure.
    ctx.drawImage(image,0,0);
    ctx.restore();
  }
  function decorate(ctx, assets) {
    assets.manifest.props.forEach(function (p) { ctx.drawImage(assets.images[p.src],p.x,p.y); });
  }
  function draw(ctx, ids, assets, furniture) {
    var seats = group(ids);
    if (!seats) return {};
    var manifest=assets.manifest,images=assets.images;
    var cleared=manifest.away[seats.left];
    ctx.drawImage(images[cleared.src],cleared.x,cleared.y);
    var f=furniture.getContext('2d');
    f.clearRect(0,0,1672,941);f.drawImage(ctx.canvas,0,0);
    var placements={};
    ['far','left','near'].forEach(function (seatName) {
      var id=seats[seatName],p=placement(manifest,id,seatName),person=manifest.people[id];
      placements[id]=p;
      if (seatName==='left' && !person.chair) {
        var chair=manifest.chairs[id],flip=chair.facing!=='right';
        var cp={x:746-(flip?chair.width-chair.anchor[0]:chair.anchor[0]),y:576-chair.anchor[1],
          width:chair.width,height:chair.height,flip:flip};
        drawPart(ctx,images[chair.src],cp);
      }
      drawPart(ctx,images[person.src],p);
    });
    ctx.save();polygon(ctx,TABLE);ctx.clip();ctx.drawImage(furniture,0,0);ctx.restore();
    LEGS.forEach(function (leg) { ctx.save();polygon(ctx,leg);ctx.clip();ctx.drawImage(furniture,0,0);ctx.restore(); });
    ['far','left','near'].forEach(function (seatName) {
      var id=seats[seatName];drawPart(ctx,images[manifest.people[id].front],placements[id]);
    });
    return placements;
  }
  var api={load:load,validate:validate,group:group,placement:placement,decorate:decorate,draw:draw};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  global.CBIOfficeMeetings=api;
})(typeof window!=='undefined'?window:globalThis);
