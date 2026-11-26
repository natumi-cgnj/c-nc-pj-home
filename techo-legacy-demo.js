(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TechoLegacyDemo = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  // Fictional, locally illustrated sample collection. Never read the current
  // Techo/Stationery storage or connect the historical page to cloud services.
  const STORAGE_KEY = 'techo_legacy_demo_20260903_v1';
  const palettes = {
    forest: ['#526e58','#dbe2c8','leaves','M'], cream: ['#e6d9b9','#9a754b','plain','M'],
    navy: ['#34465f','#e9d8aa','stars','M'], berry: ['#e5a9ab','#9f4255','berries','M'],
    mimosa: ['#e9cb70','#61764e','flowers','M'], latte: ['#c9a58b','#6d493a','coffee','M'],
    sky: ['#b6cdd9','#e7f3f2','cloud','L'], wave: ['#6a95ad','#f5eacb','waves','L'],
    stripe: ['#b6a5c1','#ece1d2','stripe','L'], donut: ['#e5b2a0','#a55a4d','donut','MINI'],
    ice: ['#adc6b6','#e9d6b1','ice','MINI'], lemon: ['#ebd57b','#78945b','lemon','MINI'],
    floral: ['#566675','#ecd6b4','flowers','M'], check: ['#c77c72','#f1d8c5','check','M'],
    peach: ['#e8b99d','#a7574f','berries','M'], ocean: ['#4c7186','#dce6e0','waves','M'],
    night: ['#4c486a','#d4c3a2','stars','M'], tea: ['#b8b69a','#695d48','leaves','M']
  };
  const svg = body => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">' +
    '<rect width="240" height="240" fill="#f7f5f0"/>' + body + '</svg>');
  const dots = (xs, ys, color, radius = 2) => ys.flatMap(y => xs.map(x =>
    '<circle cx="' + x + '" cy="' + y + '" r="' + radius + '" fill="' + color + '"/>')).join('');
  function pattern(kind, ink) {
    if (kind === 'leaves') return [35, 80, 125].map((y,i) =>
      '<g transform="translate('+(i%2?14:36)+' '+y+') rotate('+(i%2?-25:25)+')"><path d="M0 32Q20 0 40 -12" fill="none" stroke="'+ink+'" stroke-width="1.8"/>'+
      '<ellipse cx="11" cy="13" rx="5" ry="13" fill="'+ink+'" transform="rotate(-39 11 13)"/><ellipse cx="25" cy="3" rx="5" ry="13" fill="'+ink+'" transform="rotate(45 25 3)"/><ellipse cx="35" cy="-8" rx="4" ry="11" fill="'+ink+'" transform="rotate(-28 35 -8)"/></g>').join('');
    if (kind === 'stars') return dots([14,36,62,87,106],[32,52,78,102,128,150],ink,1.5)+
      '<path d="M69 63l4 13 13 4-13 4-4 13-4-13-13-4 13-4z" fill="'+ink+'"/><path d="M31 115l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="'+ink+'"/>';
    if (kind === 'flowers') return [ [24,48],[86,44],[51,86],[92,118],[24,139] ].map(([x,y],i)=>
      '<g transform="translate('+x+' '+y+')"><path d="M0 7q7 12 4 25" stroke="'+ink+'" fill="none" stroke-width="1.5"/>'+
      [0,72,144,216,288].map(r=>'<ellipse cx="0" cy="-6" rx="4" ry="7" transform="rotate('+r+')" fill="'+(i%2?'#fff2cd':ink)+'"/>').join('')+
      '<circle r="3" fill="#d89c54"/></g>').join('');
    if (kind === 'berries') return [[28,51],[86,67],[42,112],[92,142]].map(([x,y])=>
      '<g transform="translate('+x+' '+y+')"><path d="M0 -8q-8-8-15-4q6 8 15 8q6-12 14-9q-3 9-14 9" fill="#607a55"/><path d="M-12-3C-15 6-6 21 0 22C6 21 15 6 12-3Q0-11-12-3" fill="'+ink+'"/>'+
      dots([-6,0,6],[2,9], '#f7dbc1',.8)+'</g>').join('');
    if (kind === 'waves') return [45,65,85,105,125,145].map((y,i)=>
      '<path d="M-18 '+y+'Q8 '+(y-17)+' 34 '+y+'T86 '+y+'T138 '+y+'" fill="none" stroke="'+ink+'" stroke-width="'+(i%2?2:4)+'" opacity="'+(i%2?.55:.85)+'"/>').join('');
    if (kind === 'cloud') return [[29,56],[78,85],[33,120],[98,146]].map(([x,y])=>
      '<g fill="'+ink+'" opacity=".88" transform="translate('+x+' '+y+')"><circle cx="-7" cy="2" r="8"/><circle cx="3" cy="-4" r="11"/><circle cx="15" cy="1" r="7"/><rect x="-9" y="3" width="30" height="9" rx="5"/></g>').join('');
    if (kind === 'stripe') return [16,36,56,76,96,116].map(x=>'<path d="M'+x+' 32V166" stroke="'+ink+'" stroke-width="7" opacity=".55"/>').join('');
    if (kind === 'check') return [10,35,60,85,110].map(n=>'<path d="M'+n+' 30V170M0 '+(n+32)+'H120" stroke="'+ink+'" stroke-width="11" opacity=".40"/>').join('');
    if (kind === 'donut') return '<circle cx="60" cy="91" r="33" fill="#b88155"/><circle cx="60" cy="88" r="29" fill="#f4d0b7"/><circle cx="60" cy="89" r="11" fill="#e5b2a0"/>'+
      [[44,66],[76,67],[80,96],[49,110],[35,88],[66,115]].map(([x,y],i)=>'<path d="M'+x+' '+y+'l'+(i%2?4:-3)+' 3" stroke="'+(i%2?'#a75856':'#779987')+'" stroke-width="3" stroke-linecap="round"/>').join('');
    if (kind === 'ice') return '<path d="M38 91H82L60 141Z" fill="#c38d5c"/><path d="M51 98l23 21M69 98l-18 25" stroke="#a8784f" opacity=".5"/><circle cx="60" cy="68" r="24" fill="#f1e1b9"/><circle cx="49" cy="67" r="6" fill="#ecc4b3"/><circle cx="72" cy="71" r="5" fill="#e0bbac"/><path d="M36 82q20 18 48 0v7H36z" fill="#f1e1b9"/>';
    if (kind === 'lemon') return [[33,65],[84,106],[31,144]].map(([x,y])=>'<g transform="translate('+x+' '+y+') rotate(-28)"><ellipse rx="16" ry="11" fill="#f7e9a6" stroke="#c3a448" stroke-width="1"/><ellipse cx="10" cy="-12" rx="10" ry="4" fill="'+ink+'" transform="rotate(12 10 -12)"/></g>').join('');
    if (kind === 'coffee') return '<ellipse cx="60" cy="110" rx="39" ry="9" fill="#eee0c7"/><path d="M34 70H79L76 101Q58 116 37 101Z" fill="#f5eddc"/><path d="M79 78q21-4 17 12q-2 8-18 7" stroke="#f5eddc" stroke-width="7" fill="none"/><ellipse cx="56" cy="72" rx="22" ry="6" fill="'+ink+'"/><path d="M52 56q-5-7 1-14M65 55q-6-7 1-16" fill="none" stroke="#efe0c7" stroke-width="2"/>';
    return '<path d="M13 46H106M13 148H106" stroke="'+ink+'" stroke-width="1" opacity=".6"/><rect x="41" y="83" width="38" height="34" rx="3" fill="none" stroke="'+ink+'" opacity=".6"/><path d="M49 95H71M49 103H65" stroke="'+ink+'" opacity=".6"/>';
  }
  function notebook(key) {
    const [color,ink,kind,size] = palettes[key];
    const [w,h] = size==='MINI'?[112,155]:size==='L'?[145,205]:[137,187],x=(240-w)/2,y=(240-h)/2;
    const rings=Array.from({length:size==='MINI'?8:11},(_,i)=>{
      const cy=y+15+i*(h-30)/(size==='MINI'?7:10);
      return '<circle cx="'+(x+7)+'" cy="'+cy+'" r="2.5" fill="#3c403d" opacity=".7"/><path d="M'+(x-7)+' '+(cy-2)+'q-4 2 0 4h14" fill="none" stroke="#5b5751" stroke-width="2.3" stroke-linecap="round"/>';
    }).join('');
    return svg('<rect x="'+(x+6)+'" y="'+(y+8)+'" width="'+w+'" height="'+h+'" rx="5" fill="#bcb6aa" opacity=".25"/>'+
      '<rect x="'+(x+3)+'" y="'+(y+3)+'" width="'+w+'" height="'+h+'" rx="4" fill="#e8dfcd" stroke="#d6cbb8"/>'+
      '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="4" fill="'+color+'" stroke="#756b5e" stroke-opacity=".22"/>'+
      '<svg x="'+(x+9)+'" y="'+(y+6)+'" width="'+(w-15)+'" height="'+(h-13)+'" viewBox="0 0 120 170">'+
      pattern(kind,ink)+'<rect x="5" y="4" width="110" height="19" rx="2" fill="'+color+'" opacity=".93"/>'+
      '<text x="60" y="16" text-anchor="middle" font-size="10" letter-spacing="1.7" font-family="Georgia,serif" fill="'+ink+'">Pocket Memo</text>'+
      '<text x="60" y="165" text-anchor="middle" font-size="6" letter-spacing="2" font-family="sans-serif" fill="'+ink+'">'+size+'</text></svg>'+
      '<path d="M'+(x+5)+' '+(y+h-5)+'H'+(x+w-5)+'" stroke="#403a31" opacity=".18"/>'+rings);
  }
  const accessoryColors = {
    memo:'#d8c9a7', sticker:'#dca8aa', fruit:'#e6bd7f', flower:'#a6b8a0', label:'#b4c3cc',
    tape:'#c6a5ae', pouch:'#c0cdbb', bookmark:'#bfa36b', clip:'#d5b5a4', pen:'#8f9aa9'
  };
  function stationery(key) {
    const c=accessoryColors[key]||'#c5b69c';
    if(key==='tape')return svg([['#b8cbb9',57,89],['#e1bd91',112,130],['#d5a6af',166,83]].map(([color,x,y])=>
      '<g><ellipse cx="'+(x+3)+'" cy="'+(y+26)+'" rx="39" ry="18" fill="#ae9e8f" opacity=".19"/><path d="M'+(x-36)+' '+y+'v18a36 15 0 0 0 72 0v-18" fill="'+color+'"/><ellipse cx="'+x+'" cy="'+y+'" rx="36" ry="16" fill="'+color+'" stroke="#a89c8e" stroke-opacity=".4"/><ellipse cx="'+x+'" cy="'+y+'" rx="20" ry="9" fill="#eee7da"/><path d="M'+(x-28)+' '+(y+9)+'l56 0" stroke="#fff8eb" stroke-dasharray="4 5" opacity=".7"/></g>').join(''));
    if(key==='bookmark')return svg('<rect x="76" y="28" width="84" height="189" rx="4" fill="#ddd1b5" opacity=".35"/><path d="M88 28H151V191L119 172 88 191Z" fill="'+c+'" stroke="#a88c51" stroke-width="1.5"/><path d="M101 50Q119 111 137 50M119 66v91" stroke="#f9efd3" fill="none" stroke-width="3"/><circle cx="119" cy="44" r="5" fill="#f7f5f0"/>');
    if(key==='pouch')return svg('<rect x="39" y="46" width="166" height="156" rx="14" fill="#bacbb7" opacity=".25"/><rect x="31" y="37" width="166" height="156" rx="11" fill="#d3e0d5" fill-opacity=".75" stroke="#9aaa9b" stroke-width="2"/><rect x="54" y="65" width="81" height="105" rx="3" fill="#b1ac97" opacity=".75"/><rect x="140" y="75" width="14" height="83" rx="5" fill="#b49272"/><path d="M37 54H191" stroke="#94a096" stroke-width="4" stroke-dasharray="3 2"/><rect x="182" y="48" width="8" height="15" rx="2" fill="#92978e"/>');
    if(key==='clip')return svg([['#b79b67',90,83,-18],['#8faaa0',144,139,17],['#c48f93',113,164,-28]].map(([color,x,y,rotation])=>'<g transform="translate('+x+' '+y+') rotate('+rotation+')"><rect x="-24" y="-13" width="48" height="28" rx="4" fill="'+color+'"/><path d="M-13 -13Q-16 -44 0 -44Q16 -44 13 -13M-13 15Q-16 42 0 42Q16 42 13 15" fill="none" stroke="#79776f" stroke-width="2.5"/></g>').join(''));
    if(key==='pen')return svg('<g transform="rotate(35 120 120)"><rect x="107" y="26" width="26" height="172" rx="12" fill="'+c+'" stroke="#737b86"/><rect x="108" y="37" width="24" height="48" rx="8" fill="#6f7d83"/><rect x="128" y="38" width="5" height="40" rx="2" fill="#d6c7a4"/><path d="M108 198h24l-12 17z" fill="#c1b8a4"/></g>');
    const marks=key==='label'?Array.from({length:6},(_,i)=>'<rect x="51" y="'+(55+i*22)+'" width="138" height="14" rx="5" fill="'+(i%2?'#f0e5ca':c)+'"/>').join(''):
      key==='memo'?'<rect x="61" y="55" width="118" height="30" rx="2" fill="'+c+'"/>'+[103,123,143,163].map(y=>'<path d="M58 '+y+'H183" stroke="#cbbda5"/>').join(''):
      Array.from({length:12},(_,i)=>{const x=65+(i%3)*54,y=60+Math.floor(i/3)*40;return '<g transform="translate('+x+' '+y+')"><circle r="13" fill="'+(i%2?c:'#e9d7b5')+'"/><path d="M-6 0Q0-13 6 0Q0 9-6 0Z" fill="'+(i%2?'#f5e8cc':'#79917c')+'"/></g>';}).join('');
    return svg('<rect x="37" y="28" width="172" height="186" rx="6" fill="#beb4a6" opacity=".22"/><rect x="31" y="22" width="172" height="186" rx="5" fill="#fffdf8" stroke="#ded6c7"/><text x="117" y="40" text-anchor="middle" font-family="serif" font-size="9" letter-spacing="2" fill="#978c78">'+(key==='memo'?'MEMO':key==='label'?'LABELS':'PAPER GOODS')+'</text>'+marks);
  }
  const image = key => palettes[key] ? notebook(key) : stationery(key);
  function seed() {
    const db = {
      items: [], sections: [{id:'demo-desk',name:'デスクの手帳'},{id:'demo-bag',name:'持ち歩き'},{id:'demo-sort',name:'整理・出品'}],
      catalogs: [], refs: [], projectCategories: ['Rollbahn','紙もの','手帳小物'],
      sectionCollapsed: {}, shelfCollapsed: {}, refShelfCollapsed: {}
    };
    const byKey = {};
    // row = [art-key, display-name, example price, acquisition state, category]
    const projects = [
      {id:'demo-rollbahn',name:'Rollbahn ポケット付メモ',shelf:'Rollbahn',label:'Collection',color:'#8B6B4A',sections:[
        ['M サイズ',3,[['forest','M フォレスト',770,'desk'],['cream','M アイボリー',715,'pending'],['navy','M ネイビー',715,'done'],['berry','M いちご',880,'bag'],['mimosa','M ミモザ',880,'pending'],['latte','M カフェラテ',880,'']]],
        ['L サイズ',3,[['sky','L スカイブルー',935,'pending'],['wave','L ウェーブ',990,'done'],['stripe','L ストライプ',990,'']]],
        ['Mini',3,[['donut','Mini ドーナツ',550,'bag'],['ice','Mini アイスクリーム',550,'pending'],['lemon','Mini レモン',550,'']]]]},
      {id:'demo-limited',name:'Rollbahn デザイン帖',shelf:'Rollbahn',label:'Design',color:'#87977F',sections:[
        ['イラスト柄',3,[['floral','M ボタニカル',990,'done'],['check','M チェック',880,'pending'],['peach','M ピーチ',880,''],['ocean','M オーシャン',990,'done'],['night','M 夜空',990,''],['tea','M ティーグリーン',880,'desk']]]]},
      {id:'demo-paper',name:'紙ものコレクション',shelf:'紙もの',label:'Paper',color:'#C7A24C',sections:[
        ['メモ・付箋',3,[['memo','ミニメモ',440,'desk','consumable'],['label','ラベルシール',330,'pending','consumable']]],
        ['シール・テープ',3,[['sticker','フレークシール',440,'pending','consumable'],['fruit','フルーツシール',385,'done','consumable'],['flower','ボタニカルシール',440,'','consumable'],['tape','マスキングテープ',550,'pending','consumable']]]]},
      {id:'demo-accessories',name:'手帳アクセサリー',shelf:'手帳小物',label:'Tools',color:'#9B8AE8',sections:[
        ['持ち歩き',3,[['pouch','クリアポーチ',880,'bag'],['bookmark','真鍮のしおり',660,'done'],['clip','ミニクリップ',440,''],['pen','グレーブルーのペン',550,'sort']]]]}
    ];
    let dateIndex=0;
    const dates=['2026-07-26','2026-08-02','2026-08-09','2026-08-16','2026-08-22','2026-08-29','2026-09-01'];
    const notes=['店頭で色を確認','コレクション用','気に入ったデザイン','手帳と一緒に使う','表紙の記録'];
    for(const [order,project] of projects.entries()){
      const catalog={id:project.id,name:project.name,shelf:project.shelf,icon:image(project.sections[0][2][0][0]),note:'',label:{name:project.label,color:project.color},iconPositionX:50,iconPositionY:50,sections:[],items:[],order};
      for(const [section,cols,rows] of project.sections){
        catalog.sections.push({name:section,count:rows.length,cols});
        for(const [key,name,cost,state,category='long_term'] of rows){
          const item={id:catalog.id+'-'+key,name,img:image(key),collected:!!state,locked:false,cost,note:'',records:[]};
          const itemIdx=catalog.items.length;
          if(state){
            const add=(disposition,amount,remark)=>{
              const record={id:item.id+'-r'+(item.records.length+1),date:dates[dateIndex%dates.length],note:remark||notes[dateIndex%notes.length],img:item.img,status:disposition==='sold'?'sold':'keeping',processStatus:disposition==='done'||disposition==='sold'?'processed':'pending',cost:amount};
              dateIndex++;item.records.push(record);
              const active=['desk','bag','sort'].includes(disposition);
              db.items.push({id:record.id+'-owned',name:(project.shelf==='Rollbahn'?'Rollbahn ':'')+name,img:item.img,category,status:active?'active':disposition==='pending'?'pending':'done',assignment:active?'demo-'+disposition:null,cost:amount,note:record.note,source:'catalog',catalogRef:{catalogId:catalog.id,catalogItemId:item.id,itemIdx,recordId:record.id},disposition:disposition==='sold'?'sold':disposition==='done'?'done':null,soldPrice:disposition==='sold'?900:0,addedAt:Date.parse(record.date+'T12:00:00Z')});
            };
            add(state,cost);
            if(key==='forest')add('sold',cost,'予備分を整理');
          }
          catalog.items.push(item);byKey[key]={catalog,item};
        }
      }
      db.catalogs.push(catalog);
    }
    const refs=[
      {id:'demo-ref-rollbahn',name:'Rollbahn 封面資料',shelf:'Rollbahn',label:'Cover',color:'#8B6B4A',sections:[
        ['M サイズ',3,['forest','cream','navy','berry','mimosa','latte']],
        ['L / Mini',3,['sky','wave','stripe','donut','ice','lemon']]]},
      {id:'demo-ref-ideas',name:'紙もの・配色の参考',shelf:'紙もの',label:'Reference',color:'#87977F',sections:[
        ['イラスト柄',3,['floral','check','peach','ocean','night','tea']],
        ['紙もの',3,['memo','sticker','fruit','flower','label','tape']]]},
      {id:'demo-ref-tools',name:'手帳まわりの小物',shelf:'手帳小物',label:'Tools',color:'#9B8AE8',sections:[
        ['アクセサリー',3,['pouch','bookmark','clip','pen']]]}
    ];
    const linkedKeys=new Set(['forest','cream','berry','sky','donut','floral','check','memo','bookmark']);
    for(const [order,project] of refs.entries()){
      const ref={id:project.id,name:project.name,shelf:project.shelf,icon:image(project.sections[0][2][0]),note:'',comment:'',label:{name:project.label,color:project.color},iconPositionX:50,iconPositionY:50,sections:[],items:[],order};
      for(const [section,cols,keys] of project.sections){
        ref.sections.push({name:section,count:keys.length,cols});
        for(const key of keys){
          const pair=byKey[key],id=ref.id+'-'+key,linked=linkedKeys.has(key);
          const entry={id,name:pair.item.name,img:pair.item.img,note:'',mode:linked?'list':'ref',listAssignment:linked?{catalogId:pair.catalog.id,catalogItemId:pair.item.id}:null};
          if(linked)pair.item.sourceRef={refId:ref.id,itemId:id};
          ref.items.push(entry);
        }
      }
      db.refs.push(ref);
    }
    return db;
  }
  function load() {
    try {
      if (new URLSearchParams(root.location?.search||'').has('reset')) {
        root.sessionStorage?.removeItem(STORAGE_KEY);
      } else {
        const data=JSON.parse(root.sessionStorage?.getItem(STORAGE_KEY)||'null');
        if(data&&Array.isArray(data.items)&&Array.isArray(data.sections)&&Array.isArray(data.catalogs)&&Array.isArray(data.refs))return data;
      }
    } catch {}
    return seed();
  }
  function save(db) {
    try { root.sessionStorage?.setItem(STORAGE_KEY,JSON.stringify(db)); } catch {}
  }
  function readImage(file) {
    return new Promise((resolve,reject)=>{
      if(!file||!String(file.type||'').startsWith('image/')){reject(new Error('Choose an image'));return;}
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Image could not be read'));
      reader.onload=()=>{
        const img=new Image();
        img.onerror=()=>reject(new Error('Image could not be read'));
        img.onload=()=>{
          try{
            const ratio=Math.min(1,720/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
            canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));
            const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
            resolve(canvas.toDataURL('image/jpeg',0.83));
          }catch(error){reject(error);}
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  return Object.freeze({storageKey:STORAGE_KEY,seed,load,save,readImage});
});
