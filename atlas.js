/* =====================================================================
   atlas.js — แอตลาสกล้องจุลทรรศน์ (Microscopy Atlas) สำหรับ MedTech Quick Reference
   ภาพทั้งหมดเป็นภาพวาดประกอบ (SVG สร้างด้วยโค้ด) เน้น "จุดสังเกตสำคัญ" ที่ใช้แยกชนิด
   ไม่ใช่ภาพถ่ายจริง — ควรฝึกเทียบกับสไลด์จริง/ภาพจาก Atlas มาตรฐานเสมอ
   โครงสร้าง item: { id, g(group), en, th, stain, um(px ต่อ µm), size, key:[จุดสังเกต], diff, sig, crit, draw() }
   ===================================================================== */
(function(){
'use strict';

/* ---------------- random + math helpers ---------------- */
function rng(seed){ let a = seed>>>0 || 1; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hash(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
const f = n => Math.round(n*10)/10;
const TAU = Math.PI*2;
let RND = Math.random, DEFS = [], UIDP = 'x', GC = {}, UID = 0;
const r = (a,b) => a + (b-a)*RND();
const ri = (a,b) => Math.floor(r(a,b+1));
const pick = arr => arr[Math.floor(RND()*arr.length)];

/* ---------------- primitive SVG writers ---------------- */
function attrs(fill, st, sw, x){
  return ` fill="${fill||'none'}"` + (st ? ` stroke="${st}" stroke-width="${sw||1}" stroke-linecap="round" stroke-linejoin="round"` : '') + (x ? ' '+x : '');
}
function C(cx,cy,rad,fill,st,sw,x){ return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}"${attrs(fill,st,sw,x)}/>`; }
function E(cx,cy,rx,ry,rot,fill,st,sw,x){ return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}"${rot?` transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})"`:''}${attrs(fill,st,sw,x)}/>`; }
function P(d,fill,st,sw,x){ return `<path d="${d}"${attrs(fill,st,sw,x)}/>`; }
function L(x1,y1,x2,y2,st,sw,x){ return `<path d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}"${attrs('none',st,sw,x)}/>`; }
function G(tx,ty,rot,sc,inner,x){ return `<g transform="translate(${f(tx)} ${f(ty)})${rot?` rotate(${f(rot)})`:''}${sc&&sc!==1?` scale(${sc})`:''}"${x?' '+x:''}>${inner}</g>`; }
function T(x,y,s,size,fill,anchor,weight){ return `<text x="${f(x)}" y="${f(y)}" font-size="${size||9}" fill="${fill||'#222'}" text-anchor="${anchor||'middle'}" font-family="IBM Plex Sans Thai,sans-serif"${weight?` font-weight="${weight}"`:''}>${s}</text>`; }

/* smooth closed/open curve through points (Catmull-Rom -> cubic Bezier) */
function smooth(pts, closed){
  const n = pts.length; if(n<2) return '';
  const g = i => closed ? pts[(i+n)%n] : pts[Math.max(0,Math.min(n-1,i))];
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const last = closed ? n : n-1;
  for(let i=0;i<last;i++){
    const p0=g(i-1), p1=g(i), p2=g(i+1), p3=g(i+2);
    d += `C${f(p1[0]+(p2[0]-p0[0])/6)} ${f(p1[1]+(p2[1]-p0[1])/6)} ${f(p2[0]-(p3[0]-p1[0])/6)} ${f(p2[1]-(p3[1]-p1[1])/6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}
function blobPts(cx,cy,rx,ry,irr,n,rot){
  n = n||10; irr = irr==null?0.08:irr; const ro = (rot||0)*Math.PI/180; const pts=[];
  for(let i=0;i<n;i++){
    const a = i/n*TAU, k = 1 + irr*(RND()*2-1);
    const x = Math.cos(a)*rx*k, y = Math.sin(a)*ry*k;
    pts.push([cx + x*Math.cos(ro) - y*Math.sin(ro), cy + x*Math.sin(ro) + y*Math.cos(ro)]);
  }
  return pts;
}
function blob(cx,cy,rx,ry,irr,n,rot){ return smooth(blobPts(cx,cy,rx,ry,irr,n,rot), true); }
function poly(pts){ return 'M' + pts.map(p=>f(p[0])+' '+f(p[1])).join('L') + 'Z'; }
/* polar outline r(θ) */
function polar(cx,cy,fn,steps,rot){
  steps = steps||120; const ro=(rot||0)*Math.PI/180; const pts=[];
  for(let i=0;i<steps;i++){ const a=i/steps*TAU; const rr=fn(a); pts.push([cx+Math.cos(a+ro)*rr, cy+Math.sin(a+ro)*rr]); }
  return poly(pts);
}
/* scatter points uniformly inside an ellipse */
function scatter(cx,cy,rx,ry,n,fn,rot){
  const ro=(rot||0)*Math.PI/180; let s='';
  for(let i=0;i<n;i++){
    let x,y; do{ x=RND()*2-1; y=RND()*2-1; }while(x*x+y*y>1);
    x*=rx; y*=ry;
    s += fn(cx + x*Math.cos(ro) - y*Math.sin(ro), cy + x*Math.sin(ro) + y*Math.cos(ro), i);
  }
  return s;
}
/* sample points spaced along a polyline */
function along(pts, spacing, from, to){
  const seg=[]; let tot=0;
  for(let i=1;i<pts.length;i++){ const d=Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); seg.push(d); tot+=d; }
  from = from||0; to = to==null?tot:to; const out=[];
  for(let s=from; s<=to; s+=spacing){
    let acc=0, i=0; while(i<seg.length-1 && acc+seg[i]<s){ acc+=seg[i]; i++; }
    const t = seg[i] ? (s-acc)/seg[i] : 0;
    const a=pts[i], b=pts[i+1]||pts[i];
    out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, Math.atan2(b[1]-a[1], b[0]-a[0])]);
  }
  out.total = tot; return out;
}
function curve(fn, n){ const pts=[]; for(let i=0;i<=n;i++) pts.push(fn(i/n)); return pts; }
function openPath(pts){ return smooth(pts,false); }

/* gradients (ids unique per SVG) */
function grad(stops, type, x){
  const id = UIDP+'g'+DEFS.length;
  const st = stops.map(s=>`<stop offset="${s[0]}" stop-color="${s[1]}"${s[2]!=null?` stop-opacity="${s[2]}"`:''}/>`).join('');
  DEFS.push(type==='l' ? `<linearGradient id="${id}" ${x||'x1="0" y1="0" x2="0" y2="1"'}>${st}</linearGradient>` : `<radialGradient id="${id}"${x?' '+x:''}>${st}</radialGradient>`);
  return `url(#${id})`;
}
function cached(key, mk){ return GC[key] || (GC[key] = mk()); }

/* place n non-overlapping circles in the field, avoiding given zones */
function placer(n, rad, avoid, maxR, tries){
  const out=[]; avoid = avoid||[]; maxR = maxR||100; tries = tries||600;
  for(let t=0; t<tries && out.length<n; t++){
    const a=RND()*TAU, d=Math.sqrt(RND())*maxR, x=100+Math.cos(a)*d, y=100+Math.sin(a)*d;
    const rr = typeof rad==='function' ? rad() : rad;
    let ok = true;
    for(const o of out) if(Math.hypot(o[0]-x,o[1]-y) < (o[2]+rr)*0.98){ ok=false; break; }
    if(ok) for(const z of avoid) if(Math.hypot(z[0]-x,z[1]-y) < z[2]+rr){ ok=false; break; }
    if(ok) out.push([x,y,rr]);
  }
  return out;
}

/* ---------------- shared cell painters ---------------- */
function shade(hex, k){ // k<1 darker
  const n=parseInt(hex.slice(1),16); let R=n>>16, Gc=(n>>8)&255, B=n&255;
  const m = v => Math.max(0,Math.min(255,Math.round(v*k)));
  return '#'+((1<<24)+(m(R)<<16)+(m(Gc)<<8)+m(B)).toString(16).slice(1);
}
/* RBC (Wright) with central pallor */
function rbcFill(col, pale, pallor){
  col = col||'#E29AA0'; pale = pale||'#F7E2E2'; pallor = pallor==null?0.36:pallor;
  return cached('rbc'+col+pale+pallor, ()=> pallor<=0
    ? grad([[0,shade(col,1.06)],[0.7,col],[1,shade(col,0.9)]])
    : grad([[0,pale],[pallor,pale],[Math.min(0.95,pallor+0.3),col],[1,shade(col,0.9)]]));
}
function rbc(cx,cy,rad,o){
  o=o||{}; const fill = rbcFill(o.col,o.pale,o.pallor);
  const st = o.st || shade(o.col||'#E29AA0',0.85);
  if(o.d) return P(o.d, fill, st, 0.7);
  if(o.ry) return E(cx,cy,rad,o.ry,o.rot||0,fill,st,0.7);
  return P(blob(cx,cy,rad,rad*(o.sq||0.97),o.irr==null?0.025:o.irr,12,r(0,180)), fill, st, 0.7);
}
/* fill the field with background RBCs, avoiding zones [[x,y,r]] */
function rbcBg(n, rad, avoid, o){
  return placer(n, ()=>rad*r(0.92,1.06), avoid, 104).map(p=>rbc(p[0],p[1],p[2],o)).join('');
}
/* nucleus lobes connected by chromatin filaments (Wright) */
function lobes(pts, col, fil){
  col = col||'#4B2A7B'; let s='';
  for(let i=1;i<pts.length;i++) s += L(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1],col,fil||1.8);
  pts.forEach(p=>{ s += P(blob(p[0],p[1],p[2],p[2]*r(0.78,0.92),0.12,9,r(0,180)), col); s += scatter(p[0],p[1],p[2]*0.7,p[2]*0.6,4,(x,y)=>C(x,y,r(0.8,1.6),shade(col,0.72),null,0,'opacity=".7"')); });
  return s;
}
function granules(cx,cy,rx,ry,n,rmin,rmax,col,op){ return scatter(cx,cy,rx,ry,n,(x,y)=>C(x,y,r(rmin,rmax),col,null,0,op?`opacity="${op}"`:'')); }
/* unstained/refractile outline */
function refr(d, fill, st, sw){ return P(d, fill||'rgba(255,255,255,.35)', st||'#7D8076', sw||1.1) + P(d,'none','rgba(255,255,255,.75)',0.6,'transform="translate(-.6 -.6)"'); }

/* stains: field background + label */
const STAINS = {
  wright:  { bg:'#F2E4E8', label:'Wright / Giemsa' },
  giemsa:  { bg:'#EDE3EC', label:'Giemsa (thin film)' },
  thick:   { bg:'#EADFE6', label:'Giemsa (thin film, ภาพขยาย)' },
  nmb:     { bg:'#E4ECEC', label:'Supravital (NMB / BCB)' },
  kb:      { bg:'#F4EDEE', label:'Kleihauer–Betke (acid elution)' },
  wet:     { bg:'#E7E8E1', label:'Unstained wet mount' },
  iodine:  { bg:'#EFE3C1', label:'Lugol\'s iodine wet mount' },
  trich:   { bg:'#E1E7DA', label:'Trichrome stain' },
  mafb:    { bg:'#C9DDE3', label:'Modified acid-fast (Kinyoun)' },
  gram:    { bg:'#F3EDF0', label:'Gram stain' },
  afb:     { bg:'#C3D6EA', label:'Ziehl–Neelsen (AFB)' },
  koh:     { bg:'#E6E6DF', label:'KOH 10–20% wet mount' },
  lpcb:    { bg:'#E5EAF4', label:'Lactophenol cotton blue (LPCB)' },
  ink:     { bg:'#1E1E1E', label:'India ink' },
  pap:     { bg:'#EEF0F4', label:'Papanicolaou (Pap)' },
  sperm:   { bg:'#EFEFF3', label:'Sperm morphology stain (Pap / Diff-Quik)' },
  pol:     { bg:'#B8508A', label:'Compensated polarized light (red plate)' },
};

/* ---------------- build a full SVG for one item ---------------- */
const SVG_CACHE = {};
function svgFor(item){
  if(SVG_CACHE[item.id]) return SVG_CACHE[item.id];
  RND = rng(hash(item.id)); DEFS = []; GC = {}; UIDP = 'm'+(++UID)+'_';
  const st = STAINS[item.stain] || STAINS.wet;
  let inner = '';
  try{ inner = item.draw(); }catch(e){ inner = T(100,104,'draw error',10,'#a00'); console.error(item.id, e); }
  const vig = grad([[0.72,'#000',0],[1,'#000',0.28]]);
  // scale bar
  let bar = '';
  if(item.um){
    const opts=[0.5,1,2,5,10,20,50,100,200]; let bu=opts[0];
    for(const o of opts){ if(o*item.um<=70) bu=o; }
    const len=bu*item.um;
    bar = `<rect x="${f(100-len/2)}" y="203" width="${f(len)}" height="3" rx="1" fill="currentColor" opacity=".75"/>` + `<text x="${f(100+len/2+4)}" y="208" font-size="8.5" fill="currentColor" opacity=".8" font-family="IBM Plex Mono,monospace">${bu} µm</text>`;
  }
  const svg = `<svg viewBox="0 0 200 214" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${item.en}"><defs>${DEFS.join('')}<clipPath id="${UIDP}c"><circle cx="100" cy="100" r="95"/></clipPath></defs>`+
    `<circle cx="100" cy="100" r="98.5" fill="#15191A"/><g clip-path="url(#${UIDP}c)"><rect width="200" height="200" fill="${st.bg}"/>${inner}<circle cx="100" cy="100" r="95" fill="${vig}"/></g>${bar}</svg>`;
  SVG_CACHE[item.id] = svg;
  return svg;
}

const H = { C,E,P,L,G,T,smooth,blob,blobPts,poly,polar,scatter,along,curve,openPath,grad,cached,placer,shade,rbc,rbcFill,rbcBg,lobes,granules,refr,r,ri,pick,TAU,f };
window.__ATLAS_H = H;
window.__ATLAS_CORE = { STAINS, svgFor, ITEMS: [] };
})();
/* ---------- กลุ่ม: เม็ดเลือดขาว & เกล็ดเลือด (Wright–Giemsa) ---------- */
(function(){
const {C,E,P,L,G,T,blob,scatter,polar,smooth,grad,rbcBg,rbc,lobes,granules,r,ri,TAU} = window.__ATLAS_H;
const add = o => window.__ATLAS_CORE.ITEMS.push(Object.assign({g:'wbc', stain:'wright', um:4.5}, o));
const NUC = '#4B2A7B', RBC_R = 17;
const cell = (cx,cy,rad,fill,irr) => P(blob(cx,cy,rad,rad*0.97,irr==null?0.04:irr,14,0), fill, '#B98FA6', 0.7);

add({ id:'neut', en:'Segmented neutrophil', th:'นิวโทรฟิลแบบแบ่งพู', size:'10–15 µm',
  key:['นิวเคลียส 2–5 พู เชื่อมกันด้วยเส้นโครมาทินเส้นเล็ก (filament)','โครมาทินจับตัวหนา สีม่วงเข้ม','ไซโทพลาซึมสีชมพูอ่อน มีแกรนูลละเอียดสีชมพู-ม่วง (lilac)'],
  diff:'Band form (ไม่มี filament, นิวเคลียสกว้างสม่ำเสมอ) · Hypersegmented (≥6 พู หรือ >5% มี 5 พู)',
  sig:'ค่าปกติ 40–70% — เพิ่มในการติดเชื้อแบคทีเรีย/การอักเสบ',
  draw(){ return rbcBg(10,RBC_R,[[100,100,30]]) + cell(100,100,27,'#EDD3DC') + granules(100,100,24,24,70,0.5,0.9,'#B97C9E','.8') +
    lobes([[84,95,7.2],[97,84,7],[113,92,7.4],[108,110,6.8]]); } });

add({ id:'band', en:'Band neutrophil', th:'นิวโทรฟิลตัวอ่อน (Band)', size:'10–15 µm',
  key:['นิวเคลียสรูปตัว U / C หรือ S ความกว้างใกล้เคียงกันตลอด','ส่วนที่คอดแคบสุดยังกว้าง > 1/3 ของส่วนที่กว้างสุด (ไม่มี filament)','ไซโทพลาซึมเหมือน segmented neutrophil'],
  diff:'Segmented neutrophil (มีเส้น filament เชื่อมพู) · Metamyelocyte (นิวเคลียสรูปไต/ถั่ว)',
  sig:'ปกติ 0–5% — เพิ่มขึ้น = shift to the left (ติดเชื้อรุนแรง)',
  draw(){ return rbcBg(10,RBC_R,[[100,100,30]]) + cell(100,100,26,'#EDD3DC') + granules(100,100,23,23,65,0.5,0.9,'#B97C9E','.8') +
    P('M86 84C78 104 90 116 102 115C114 114 122 102 116 84', 'none', NUC, 10) + scatter(100,104,14,10,12,(x,y)=>C(x,y,r(0.8,1.5),'#34195C',null,0,'opacity=".6"')); } });

add({ id:'hyperseg', en:'Hypersegmented neutrophil', th:'นิวโทรฟิลมีพูมากผิดปกติ', size:'12–17 µm (มักใหญ่กว่าปกติ)', crit:false,
  key:['นิวเคลียส ≥ 6 พู (หรือพบ 5 พู > 5% ของ neutrophil)','เซลล์มักขนาดใหญ่กว่าปกติ','มักพบร่วมกับ oval macrocyte'],
  diff:'Segmented neutrophil ปกติ (2–5 พู)',
  sig:'ชี้นำ Megaloblastic anemia (ขาด B12 / folate) — พบก่อนที่ MCV จะสูง',
  draw(){ const pts=[]; for(let i=0;i<6;i++){ const a=i/6*TAU+0.3; pts.push([100+Math.cos(a)*15, 100+Math.sin(a)*15, 5.8]); }
    return rbcBg(9,RBC_R,[[100,100,32]]) + cell(100,100,30,'#EDD3DC') + granules(100,100,27,27,80,0.5,0.9,'#B97C9E','.8') + lobes(pts); } });

add({ id:'lymph', en:'Lymphocyte (small)', th:'ลิมโฟไซต์ (ขนาดเล็ก)', size:'7–10 µm (ใกล้เคียง RBC)',
  key:['นิวเคลียสกลม ทึบ เข้มมาก เกือบเต็มเซลล์ (N:C สูง)','ไซโทพลาซึมบางเป็นขอบสีฟ้าอ่อน (sky blue) ไม่มีแกรนูล/มีน้อย','ขนาดใกล้เคียงเม็ดเลือดแดง — ใช้ RBC รอบ ๆ เทียบขนาด'],
  diff:'nRBC (นิวเคลียสทึบกว่า ไซโทพลาซึมสีชมพูเทา) · Blast (โครมาทินละเอียด มี nucleoli) · Smudge cell',
  sig:'ค่าปกติ 20–40% — เพิ่มในติดเชื้อไวรัส, CLL',
  draw(){ return rbcBg(12,RBC_R,[[100,100,20]]) + cell(100,100,20,'#A9C8EA') + P(blob(101,99,16.5,16,0.05,10), '#3B2166') +
    scatter(101,99,12,12,14,(x,y)=>C(x,y,r(1,2.2),'#2A1450',null,0,'opacity=".6"')); } });

add({ id:'reactlymph', en:'Reactive (atypical) lymphocyte', th:'ลิมโฟไซต์ชนิด Reactive / Atypical', size:'15–30 µm',
  key:['เซลล์ใหญ่ ไซโทพลาซึมมาก ขอบเซลล์โอบรอบ RBC (scalloped / “hugging” RBC)','ไซโทพลาซึมสีฟ้า เข้มขึ้นที่ขอบ (peripheral basophilia)','นิวเคลียสกลม/รี/เว้า โครมาทินหลวมกว่า small lymphocyte'],
  diff:'Monocyte (ไซโทพลาซึมเทาอมฟ้า มี vacuole, นิวเคลียสพับ) · Blast (N:C สูงมาก มี nucleoli)',
  sig:'พบใน Dengue, Infectious mononucleosis (EBV), CMV, ไวรัสตับอักเสบ',
  draw(){ const edge = grad([[0,'#E3ECF7'],[0.6,'#C6DAF0'],[1,'#5E8FCB']]);
    const d = blob(100,100,42,38,0.1,12,20);
    return rbcBg(8,RBC_R,[[100,100,44]]) + P(d, edge, '#5E8FCB', 0.8) + P(blob(90,94,17,15,0.08,10), '#4A2E82') +
      scatter(90,94,12,10,12,(x,y)=>C(x,y,r(1,2),'#3A1F6A',null,0,'opacity=".5"')) +
      rbc(140,112,RBC_R) + rbc(128,142,RBC_R) + rbc(70,134,RBC_R); } });

add({ id:'mono', en:'Monocyte', th:'โมโนไซต์', size:'12–20 µm (WBC ที่ใหญ่ที่สุดในเลือดปกติ)',
  key:['นิวเคลียสรูปไต/เกือกม้า/พับทบ โครมาทินหลวมเป็นลายลูกไม้ (lacy)','ไซโทพลาซึมสีเทาอมฟ้า “ground glass” อาจมีแกรนูลฝุ่นละเอียด','มักมี vacuole ในไซโทพลาซึม'],
  diff:'Reactive lymphocyte · Metamyelocyte · Band (ถ้านิวเคลียสพับ)',
  sig:'ค่าปกติ 2–10% — เพิ่มในติดเชื้อเรื้อรัง (TB), ระยะฟื้นตัว, CMML',
  draw(){ const nuc = smooth([[76,94],[82,77],[100,71],[117,77],[123,92],[117,105],[106,104],[100,97],[93,107],[82,107]], true);
    return rbcBg(9,RBC_R,[[100,100,36]]) + P(blob(100,100,36,34,0.07,14), '#C9C6DA', '#9D98B8', 0.8) +
      granules(100,100,32,30,50,0.4,0.7,'#B195B8','.7') + P(nuc,'#5F4696') +
      scatter(100,90,18,12,26,(x,y)=>C(x,y,r(0.8,1.6),'#8A77B8',null,0,'opacity=".8"')) +
      C(84,120,4,'#EEF0F6','#B7B3CD',0.6) + C(114,122,3,'#EEF0F6','#B7B3CD',0.6) + C(125,112,2.4,'#EEF0F6','#B7B3CD',0.6); } });

add({ id:'eos', en:'Eosinophil', th:'อีโอซิโนฟิล', size:'12–17 µm',
  key:['แกรนูลใหญ่ กลมสม่ำเสมอ สีส้ม-แดง เต็มไซโทพลาซึม (refractile)','นิวเคลียสส่วนใหญ่ 2 พู (คล้ายแว่นตา)','แกรนูลไม่บดบังนิวเคลียสจนมิด'],
  diff:'Neutrophil ที่มี toxic granulation (แกรนูลม่วงเข้ม ไม่ใช่ส้ม) · Basophil (แกรนูลม่วงดำ)',
  sig:'ค่าปกติ 1–4% — เพิ่มในโรคภูมิแพ้ หอบหืด พยาธิ (Strongyloides, Opisthorchis ฯลฯ)',
  draw(){ return rbcBg(10,RBC_R,[[100,100,30]]) + cell(100,100,27,'#F3DCCB') + granules(100,100,24,24,85,1.7,2.2,'#E0643A') +
    lobes([[88,99,8.5],[112,97,8.5]],NUC,2) + granules(100,100,24,24,18,1.7,2.1,'#E86E42'); } });

add({ id:'baso', en:'Basophil', th:'เบโซฟิล', size:'10–14 µm',
  key:['แกรนูลใหญ่ ไม่สม่ำเสมอ สีม่วงเข้ม-ดำ','แกรนูลกระจายทับและบดบังนิวเคลียส','นิวเคลียสมักมองไม่ชัด'],
  diff:'Toxic granulation neutrophil · Mast cell (ในไขกระดูก) · Eosinophil',
  sig:'ค่าปกติ 0–1% — เพิ่มใน CML/Myeloproliferative neoplasm, ภูมิแพ้',
  draw(){ return rbcBg(11,RBC_R,[[100,100,26]]) + cell(100,100,24,'#E4D4E8') + P(blob(100,100,13,11,0.2,8),'#8B6FB3','none',0,'opacity=".7"') +
    granules(100,100,21,21,42,1.8,3,'#2B1045'); } });

add({ id:'blast', en:'Myeloblast with Auer rod', th:'Myeloblast ที่มี Auer rod', size:'15–20 µm', crit:true,
  key:['N:C ratio สูงมาก ไซโทพลาซึมเป็นขอบสีน้ำเงิน','โครมาทินละเอียดสม่ำเสมอ (fine, open) เห็น nucleoli 2–5 อัน','Auer rod = แท่งสีชมพู-แดงรูปเข็มในไซโทพลาซึม → บ่งชี้สายไมอีลอยด์'],
  diff:'Lymphoblast (ไม่มี Auer rod, nucleoli ไม่ชัด) · Reactive lymphocyte',
  sig:'⚠ พบ blast ในเลือดต้องแจ้งแพทย์ — AML (Auer rod), APL (faggot cell)',
  draw(){ return rbcBg(9,RBC_R,[[100,100,34]]) + cell(100,100,32,'#8DB0DD','',0.03) + P(blob(95,99,24,23,0.05,12),'#7253A6') +
    scatter(95,99,19,18,90,(x,y)=>C(x,y,r(0.4,0.8),'#553A86',null,0,'opacity=".6"')) +
    C(88,93,3.6,'#B9C7EA','#8E9CD0',0.5) + C(102,96,3.2,'#B9C7EA','#8E9CD0',0.5) + C(94,108,2.8,'#B9C7EA','#8E9CD0',0.5) +
    L(120,85,125,104,'#C2185B',1.8) + L(117,110,122,121,'#C2185B',1.4); } });

add({ id:'plasma', en:'Plasma cell', th:'พลาสมาเซลล์', size:'8–15 µm',
  key:['รูปไข่ นิวเคลียสกลมอยู่ชิดขอบ (eccentric)','โครมาทินจับเป็นก้อนแบบหน้าปัดนาฬิกา (clock-face / cartwheel)','ไซโทพลาซึมสีน้ำเงินเข้ม มีบริเวณจางข้างนิวเคลียส (perinuclear hof = Golgi)'],
  diff:'Reactive lymphocyte · Lymphocyte ขนาดใหญ่',
  sig:'ปกติไม่พบในเลือด — พบใน Multiple myeloma, plasma cell leukemia, ติดเชื้อรุนแรง',
  draw(){ let clock=''; for(let i=0;i<8;i++){ const a=i/8*TAU; clock+=C(80+Math.cos(a)*8,100+Math.sin(a)*8,2.6,'#241046'); }
    return rbcBg(10,RBC_R,[[100,100,34]]) + E(100,100,32,23,-8,'#3E6CB3','#2D548F',0.8) + E(97,100,9,11,0,'#A9C2E6','none',0,'opacity=".85"') +
      C(80,100,13,'#6A4D9E') + clock + C(80,100,2.6,'#241046'); } });

add({ id:'nrbc', en:'Nucleated RBC (nRBC)', th:'เม็ดเลือดแดงมีนิวเคลียส', size:'7–12 µm',
  key:['นิวเคลียสกลม เล็ก ทึบดำมาก (pyknotic) ไม่เห็นโครงสร้างโครมาทิน','ไซโทพลาซึมสีชมพูอมเทา (polychromatophilic) เหมือนสีของ RBC','ขนาดใกล้เคียง RBC'],
  diff:'Small lymphocyte (ไซโทพลาซึมสีฟ้า โครมาทินยังเห็นเป็นก้อน)',
  sig:'นับเป็น /100 WBC และต้อง แก้ค่า WBC (Corrected WBC) — พบใน thalassemia, hemolysis, ภาวะขาดออกซิเจน, ทารกแรกเกิด',
  draw(){ return rbcBg(13,RBC_R,[[100,100,20]]) + P(blob(100,100,18,17,0.04,10),'#D6B3C3','#B98FA6',0.7) + C(96,98,9.5,'#2A1250'); } });

add({ id:'smudge', en:'Smudge cell', th:'Smudge cell (เซลล์แตก)', size:'ไม่แน่นอน',
  key:['เหลือแต่นิวเคลียสที่ถูกบี้แตก สีม่วงจาง เป็นเส้นใยพร่า','ไม่มีไซโทพลาซึมให้เห็น','เกิดจากลิมโฟไซต์เปราะแตกขณะทำ smear'],
  diff:'Basket cell · เซลล์ที่แตกจากการ smear หนา',
  sig:'พบมากใน CLL — เตรียม smear ด้วย albumin ช่วยลดการแตกเพื่อนับแยกได้แม่นยำ',
  draw(){ let s=''; for(let i=0;i<9;i++){ const a=r(0,TAU); s+=L(100,100,100+Math.cos(a)*r(18,28),100+Math.sin(a)*r(18,28),'#8A70B6',r(0.8,1.6),'opacity=".6"'); }
    return rbcBg(12,RBC_R,[[100,100,28]]) + P(blob(100,100,20,16,0.35,12,30),'#9A82C2','none',0,'opacity=".75"') + s + scatter(100,100,15,12,20,(x,y)=>C(x,y,r(1,2),'#6D55A0',null,0,'opacity=".5"')); } });

add({ id:'toxic', en:'Toxic changes (granulation, vacuole, Döhle body)', th:'Toxic granulation / Vacuolation / Döhle body', size:'10–15 µm',
  key:['แกรนูลหยาบสีม่วงเข้มใน neutrophil (toxic granulation)','ช่องว่างใส (vacuole) ในไซโทพลาซึม','Döhle body = ปื้นสีฟ้าเทาจาง ๆ ใกล้ขอบเซลล์'],
  diff:'Basophil · May–Hegglin anomaly (Döhle-like + giant platelet)',
  sig:'บ่งชี้การติดเชื้อรุนแรง/sepsis, การได้รับ G-CSF — รายงานร่วมกับ WBC diff',
  draw(){ return rbcBg(10,RBC_R,[[100,100,30]]) + cell(100,100,27,'#EACFD9') + granules(100,100,24,24,60,0.9,1.4,'#56206A','.9') +
    C(82,112,3.2,'#F8F4F6','#CDB7C3',0.5) + C(118,82,2.6,'#F8F4F6','#CDB7C3',0.5) + C(112,118,2.2,'#F8F4F6','#CDB7C3',0.5) +
    E(122,104,4.5,2.8,60,'#8FB0D8','none',0,'opacity=".85"') + lobes([[86,95,7],[100,86,7],[112,97,7]]); } });

add({ id:'plt', en:'Platelets & giant platelet', th:'เกล็ดเลือดปกติ และเกล็ดเลือดขนาดใหญ่', size:'ปกติ 1.5–3 µm · giant > 7 µm (≥ ขนาด RBC)',
  key:['ชิ้นส่วนไม่มีนิวเคลียส สีม่วงอ่อน มีแกรนูลม่วงตรงกลาง (granulomere)','ปกติพบ 8–20 ตัว / oil field (≈ ×15,000–20,000 = ค่าประมาณ/µL)','Giant platelet ขนาดเท่าหรือใหญ่กว่า RBC — เครื่องอาจนับเป็น RBC ทำให้ PLT ต่ำเทียม'],
  diff:'Platelet satellitism · สิ่งสกปรก/ตะกอนสี · Howell-Jolly (อยู่ใน RBC)',
  sig:'ใช้ยืนยัน platelet count จากเครื่อง (smear estimate) — giant platelet พบใน ITP, MPN, Bernard-Soulier',
  draw(){ let s = rbcBg(11,RBC_R,[[100,100,16]]);
    const pl = (x,y,rr)=> P(blob(x,y,rr,rr*0.8,0.25,8,r(0,180)),'#C3A7DC','#9F7EC4',0.4) + granules(x,y,rr*0.5,rr*0.4,Math.max(3,rr*2|0),0.35,0.7,'#5B3791');
    [[64,70,3.4],[140,64,3],[132,138,3.6],[58,132,2.8],[150,104,3.2]].forEach(p=>s+=pl(...p));
    return s + pl(100,100,15); } });

add({ id:'pltclump', en:'Platelet clumping', th:'เกล็ดเลือดจับกลุ่ม (Pseudothrombocytopenia)', size:'กลุ่มละหลายสิบ µm',
  key:['เกล็ดเลือดเกาะกันเป็นกลุ่มก้อนใหญ่ มักพบบริเวณขอบ/หาง (feather edge) ของ smear','เครื่องนับ PLT ต่ำ แต่ใน smear ไม่สอดคล้อง','มักเกิดจาก EDTA-dependent antibody หรือเจาะเลือดยาก/ผสมไม่ดี'],
  diff:'Thrombocytopenia จริง (smear เห็น PLT น้อยทั่วทั้งสไลด์)',
  sig:'ห้ามรายงาน PLT ต่ำทันที — ตรวจ smear แล้วเก็บเลือดใหม่ด้วย Sodium citrate (คูณ 1.1) หรือหลอดอุ่น',
  draw(){ let s = rbcBg(10,RBC_R,[[100,100,34]]);
    for(let i=0;i<34;i++){ const a=r(0,TAU), d=Math.sqrt(RND2())*26; const x=100+Math.cos(a)*d*1.2, y=100+Math.sin(a)*d*0.85;
      s += P(blob(x,y,3.4,2.8,0.3,7,r(0,180)),'#C0A2DA','#9F7EC4',0.4) + C(x,y,1,'#5B3791'); }
    return s; } });
function RND2(){ return r(0,1); }
})();
/* ---------- กลุ่ม: รูปร่างเม็ดเลือดแดง & Inclusion ---------- */
(function(){
const {C,E,P,L,G,T,blob,scatter,polar,smooth,poly,grad,rbcBg,rbc,rbcFill,placer,granules,r,ri,TAU,shade} = window.__ATLAS_H;
const add = o => window.__ATLAS_CORE.ITEMS.push(Object.assign({g:'rbc', stain:'wright', um:6}, o));
const RR = 22;
/* center cluster of special cells + normal background */
function field(nSpecial, drawSpecial, nBg, bgOpt, spR){
  spR = spR||RR; const sp = placer(nSpecial, spR*1.05, [], 58);
  let s = rbcBg(nBg==null?9:nBg, RR, sp.map(p=>[p[0],p[1],p[2]+2]), bgOpt);
  sp.forEach((p,i)=> s += drawSpecial(p[0],p[1],i));
  return s;
}
const solid = (col)=> rbcFill(col||'#D9737B','#E88A91',0);

add({ id:'rbcnorm', en:'Normal RBC (normocytic normochromic)', th:'เม็ดเลือดแดงปกติ', size:'7–8 µm',
  key:['กลม ขนาดใกล้เคียงนิวเคลียสของ small lymphocyte','central pallor ประมาณ 1/3 ของเส้นผ่านศูนย์กลาง','ขนาดและสีสม่ำเสมอ'],
  diff:'ใช้เป็นมาตรฐานเทียบขนาด (microcyte < 6 µm, macrocyte > 9 µm)',
  sig:'อ่านรูปร่าง RBC ในบริเวณที่เซลล์เรียงชิดแต่ไม่ซ้อน (monolayer)',
  draw(){ return rbcBg(22,RR,[]); } });

add({ id:'microhypo', en:'Microcytic hypochromic RBC', th:'เม็ดเลือดแดงเล็กติดสีจาง', size:'< 6 µm, MCV < 80 fL',
  key:['เซลล์เล็กกว่านิวเคลียส small lymphocyte','central pallor กว้าง > 1/2 เหลือเพียงขอบบาง ๆ','มักพบ pencil cell (elliptocyte ยาว) ร่วมด้วยใน IDA'],
  diff:'Thalassemia trait (RBC count สูง, Mentzer index < 13, มี target cell) vs IDA (RDW สูง, ferritin ต่ำ)',
  sig:'ภาวะขาดธาตุเหล็ก, Thalassemia, Anemia of chronic disease',
  draw(){ let s = rbcBg(20,16,[], {pallor:0.62, col:'#E6A7AC'}); s += rbc(100,100,20,{ry:6,rot:30,pallor:0.5,col:'#E6A7AC'}); return s; } });

add({ id:'sphero', en:'Spherocyte', th:'Spherocyte', size:'เล็กกว่า RBC ปกติ (~6 µm)',
  key:['กลม เล็ก ติดสีเข้มทั้งเซลล์','ไม่มี central pallor','ขอบเรียบ'],
  diff:'Microcyte (ยังมี pallor) · RBC บริเวณหนาของ smear (ดูบริเวณ monolayer เท่านั้น)',
  sig:'Hereditary spherocytosis, AIHA (DAT +), ปฏิกิริยาจากการให้เลือด, แผลไฟไหม้ — MCHC มักสูง',
  draw(){ return field(4,(x,y)=>rbc(x,y,16,{pallor:0,col:'#D66C76'}),10); } });

add({ id:'target', en:'Target cell (Codocyte)', th:'Target cell', size:'7–9 µm',
  key:['มีจุดติดสีตรงกลาง ล้อมด้วยวงจาง และขอบนอกติดสี (เหมือนเป้ายิงธนู)','เกิดจากพื้นที่ผิวเมมเบรนมากกว่าปริมาตร','ควรพบกระจายทั่วสไลด์ (ถ้าพบเฉพาะบางบริเวณอาจเป็น artifact จากการแห้งช้า)'],
  diff:'Stomatocyte · Artifact',
  sig:'Thalassemia, HbE (พบบ่อยในไทย), โรคตับ/ท่อน้ำดีอุดตัน, หลังตัดม้าม',
  draw(){ const tf = grad([[0,'#DB7F87'],[0.22,'#DB7F87'],[0.34,'#F6E0E1'],[0.6,'#F6E0E1'],[0.78,'#DE8C93'],[1,'#C9707A']]);
    return field(5,(x,y)=>P(blob(x,y,RR,RR*0.97,0.03,12),tf,'#C37880',0.7),8); } });

add({ id:'schisto', en:'Schistocyte (fragmented RBC)', th:'Schistocyte (เม็ดเลือดแดงแตกเป็นชิ้น)', size:'เล็กกว่า RBC', crit:true,
  key:['ชิ้นส่วน RBC รูปหมวกเหล็ก (helmet), สามเหลี่ยม, พระจันทร์เสี้ยวไม่สมมาตร','มีขอบตัดตรง/มุมแหลม ติดสีเข้ม ไม่มี pallor','ถ้าพบ ≥ 1% ของ RBC ถือว่ามีนัยสำคัญ (ICSH)'],
  diff:'Bite cell (มีรอยเว้ากลมที่ขอบ ส่วนที่เหลือยังกลม) · Crenated/Burr cell',
  sig:'⚠ Microangiopathic hemolytic anemia — DIC, TTP, HUS, HELLP, ลิ้นหัวใจเทียม → รายงานแพทย์ด่วนร่วมกับ PLT',
  draw(){ const helmet = 'M-12 6L-14 -4C-10 -12 10 -12 14 -4L12 6L6 -1L-6 -1Z';
    const tri = 'M-10 8L0 -11L10 8Z', cres = 'M-12 4C-8 -10 8 -10 12 4C6 -3 -6 -3 -12 4Z';
    const shapes=[helmet,tri,cres,helmet,tri];
    return field(5,(x,y,i)=>G(x,y,r(0,360),1.35,P(shapes[i],solid('#D56F79'),'#B8606A',0.7)),11,{},14); } });

add({ id:'sickle', en:'Sickle cell (Drepanocyte)', th:'Sickle cell (รูปเคียว)', size:'ยาว 10–15 µm',
  key:['ยาว บาง ปลายแหลมทั้งสองข้าง (รูปเคียว/พระจันทร์เสี้ยว)','ติดสีเข้ม ไม่มี pallor','อาจพบ target cell ร่วมด้วย'],
  diff:'Elliptocyte (ปลายมน ไม่แหลม) · Oat cell (รูปเรือสั้น ๆ)',
  sig:'Sickle cell disease (HbSS), HbSC — ยืนยันด้วย Hb typing / solubility test',
  draw(){ const d = 'M-24 3C-14 -14 14 -14 24 3C12 -5 -12 -5 -24 3Z';
    return field(4,(x,y)=>G(x,y,r(0,180),1,P(d,solid('#D46A74'),'#B35A64',0.7)),10,{},18); } });

add({ id:'tear', en:'Teardrop cell (Dacrocyte)', th:'Teardrop cell (รูปหยดน้ำ)', size:'~ ขนาด RBC',
  key:['รูปหยดน้ำ/ลูกแพร์ มีหางยื่นออกข้างเดียว','หางชี้ไปทิศทางต่าง ๆ (ถ้าชี้ทิศเดียวกันหมด = artifact จากการ smear)','มักมีพื้นที่ pallor เล็กน้อย'],
  diff:'Artifact จากการ smear · Schistocyte',
  sig:'Myelofibrosis, Myelophthisic anemia (มะเร็งแพร่กระจายในไขกระดูก), Thalassemia',
  draw(){ const d = 'M0 -30C4 -18 18 -12 18 3C18 15 9 20 0 20C-9 20 -18 15 -18 3C-18 -12 -4 -18 0 -30Z';
    return field(4,(x,y)=>G(x,y,r(0,360),0.95,P(d,rbcFill('#E29AA0','#F7E2E2',0.28),'#C37880',0.7)),10,{},22); } });

add({ id:'ellipto', en:'Elliptocyte / Ovalocyte', th:'Elliptocyte / Ovalocyte', size:'ยาว 8–10 µm',
  key:['รูปไข่ (ovalocyte) ถึงรูปวงรียาว/ดินสอ (elliptocyte, pencil cell)','ปลายมนทั้งสองข้าง','pallor ยาวตามแนวเซลล์'],
  diff:'Sickle cell (ปลายแหลม) · Southeast Asian ovalocytosis (stomatocytic ovalocyte มีร่องกลาง 1–2 ร่อง)',
  sig:'Hereditary elliptocytosis (>25%), IDA (pencil cell), Thalassemia, Megaloblastic anemia (oval macrocyte)',
  draw(){ return field(5,(x,y)=>rbc(x,y,24,{ry:r(9,14),rot:r(0,180),pallor:0.3}),8,{},20); } });

add({ id:'acantho', en:'Acanthocyte (Spur cell)', th:'Acanthocyte', size:'เล็กกว่า RBC ปกติเล็กน้อย',
  key:['เซลล์หนาแน่น ติดสีเข้ม ไม่มี pallor','มีหนามยื่นออก 2–20 อัน ความยาวและระยะห่างไม่สม่ำเสมอ','ปลายหนามมักกลมมน (knob)'],
  diff:'Echinocyte/Burr cell (หนามสั้น สม่ำเสมอ เรียงรอบเซลล์ ยังมี pallor)',
  sig:'โรคตับรุนแรง (spur cell anemia), Abetalipoproteinemia, หลังตัดม้าม, McLeod phenotype',
  draw(){ const mk = ()=>{ const sp=[]; const n=ri(5,8); for(let i=0;i<n;i++) sp.push([r(0,TAU), r(3.5,8)]);
      return a=>{ let v=15; for(const [pa,len] of sp){ let d=Math.abs(((a-pa+Math.PI)%TAU+TAU)%TAU-Math.PI); v+=len*Math.exp(-(d*d)/0.02); } return v; }; };
    return field(4,(x,y)=>P(polar(x,y,mk(),160),solid('#D46E78'),'#B35F69',0.7),10,{},24); } });

add({ id:'echino', en:'Echinocyte (Burr cell / crenated)', th:'Echinocyte / Burr cell', size:'~ ขนาด RBC',
  key:['มีหนามสั้น ๆ 10–30 อัน กระจายรอบเซลล์อย่างสม่ำเสมอ','ขนาดหนามเท่า ๆ กัน','ยังเห็น central pallor'],
  diff:'Acanthocyte (หนามไม่สม่ำเสมอ ไม่มี pallor) · Artifact จาก EDTA มากเกิน/เลือดทิ้งนาน/smear แห้งช้า',
  sig:'Uremia (CKD), Pyruvate kinase deficiency — แต่ส่วนใหญ่เป็น artifact ต้องตรวจ smear ใหม่ก่อนรายงาน',
  draw(){ return field(4,(x,y)=>{ const n=ri(14,20), ph=r(0,TAU); return P(polar(x,y,a=>20+2.6*Math.pow(Math.abs(Math.cos((a+ph)*n/2)),6),180),rbcFill('#E29AA0','#F7E2E2',0.3),'#C37880',0.7); },10,{},23); } });

add({ id:'stomato', en:'Stomatocyte', th:'Stomatocyte (รูปปาก)', size:'~ ขนาด RBC',
  key:['central pallor เป็นร่องยาวแคบ คล้ายรูปปาก/ช่องจดหมาย','ส่วนอื่นของเซลล์ติดสีสม่ำเสมอ','มักเป็นรูปถ้วยในสภาพจริง'],
  diff:'Target cell · Artifact (บริเวณหนาของ smear) · SAO (มีร่องขวาง 1–2 ร่องใน ovalocyte)',
  sig:'โรคตับจากแอลกอฮอล์, Hereditary stomatocytosis, Rh-null',
  draw(){ return field(5,(x,y)=>{ const rot=r(0,180); return rbc(x,y,RR,{pallor:0.1,col:'#DE8A92'}) + E(x,y,11,2.6,rot,'#F7E4E4'); },8); } });

add({ id:'bite', en:'Bite cell (Degmacyte) & Blister cell', th:'Bite cell / Blister cell', size:'~ ขนาด RBC',
  key:['มีรอยเว้าครึ่งวงกลมที่ขอบเซลล์ 1 จุดหรือมากกว่า (ถูกม้าม “กัด” Heinz body ออก)','Blister cell: ฮีโมโกลบินไปรวมข้างหนึ่ง อีกข้างเป็นถุงใส','มักพบร่วมกับ spherocyte เล็กน้อย'],
  diff:'Schistocyte (มีมุมแหลม/ขอบตัดตรง ไม่ใช่รอยเว้ากลม)',
  sig:'G6PD deficiency (พบบ่อยในไทย) ในภาวะ oxidative hemolysis — ยืนยันด้วย G6PD test และ Heinz body',
  draw(){ const biteF = ()=>{ const pa=r(0,TAU); return a=>{ const d=Math.abs(((a-pa+Math.PI)%TAU+TAU)%TAU-Math.PI); return 21 - 10*Math.exp(-(d*d)/0.09); }; };
    return field(4,(x,y,i)=> i===1
      ? G(x,y,r(0,360),1,C(0,0,21,'#F6ECED','#C9848B',0.7)+P('M-21 0A21 21 0 0 0 21 0C14 -8 -12 -9 -21 0Z',rbcFill('#DB7D86','#E99EA4',0),'#C37880',0.7))
      : P(polar(x,y,biteF(),140),rbcFill('#E29AA0','#F7E2E2',0.3),'#C37880',0.7),10); } });

add({ id:'rouleaux', en:'Rouleaux formation', th:'Rouleaux (เรียงซ้อนเป็นตั้งเหรียญ)', size:'แถวยาว 3–10+ เซลล์',
  key:['RBC ซ้อนกันเป็นแนวเส้นตรงคล้ายเหรียญที่วางเรียงกัน','เห็นในบริเวณ monolayer (ไม่ใช่บริเวณหนา)','พื้นหลัง smear มักติดสีฟ้า (โปรตีนสูง)'],
  diff:'RBC Agglutination (จับกันเป็นกลุ่มก้อนไม่เป็นแนว) — rouleaux สลายได้เมื่อหยด saline (saline replacement)',
  sig:'Multiple myeloma, Macroglobulinemia, fibrinogen/globulin สูง — ESR สูง',
  draw(){ let s = ''; const rows=[[40,62,-18,7],[48,112,8,8],[92,150,-6,6]];
    for(const [x0,y0,ang,n] of rows){ const a=ang*Math.PI/180; for(let i=0;i<n;i++) s += rbc(x0+Math.cos(a)*i*12, y0+Math.sin(a)*i*12, 20, {pallor:0.18}); }
    return s; } });

add({ id:'agglut', en:'RBC agglutination', th:'RBC agglutination (เกาะกลุ่ม)', size:'กลุ่มก้อน',
  key:['RBC เกาะกันเป็นกลุ่มก้อนไม่เป็นระเบียบ (คล้ายพวงองุ่น)','ไม่เรียงเป็นแนวแบบ rouleaux','ไม่สลายด้วย saline'],
  diff:'Rouleaux (เป็นแนวตั้งเหรียญ สลายด้วย saline)',
  sig:'Cold agglutinin disease (Mycoplasma, lymphoma) — ค่า MCHC สูงผิดปกติ, RBC ต่ำเทียม → อุ่นเลือด 37 °C แล้ววัดใหม่',
  draw(){ let s=''; const clump=(cx,cy,n)=>{ for(let i=0;i<n;i++){ const a=r(0,TAU), d=Math.sqrt(r(0,1))*n*3.2; s+=rbc(cx+Math.cos(a)*d, cy+Math.sin(a)*d, 18, {pallor:0.2}); } };
    clump(72,78,9); clump(128,124,11); clump(70,142,5); return s; } });

add({ id:'polychrom', en:'Polychromasia (polychromatophilic RBC)', th:'Polychromasia', size:'ใหญ่กว่า RBC ปกติ (8–10 µm)',
  key:['RBC ขนาดใหญ่ ติดสีเทา-ม่วงอมฟ้า (มี RNA เหลือ)','ไม่มี/มี central pallor น้อย','เทียบเท่า reticulocyte เมื่อย้อม supravital'],
  diff:'Macrocyte ทั่วไป (สีเหมือน RBC ปกติ)',
  sig:'ไขกระดูกตอบสนองดี — hemolysis, เสียเลือดเฉียบพลัน, หลังได้รับธาตุเหล็ก/B12',
  draw(){ return field(3,(x,y)=>rbc(x,y,26,{pallor:0.05,col:'#BCA3C8'}),10,{},26); } });

add({ id:'hj', en:'Howell–Jolly body', th:'Howell–Jolly body', size:'1–2 µm',
  key:['จุดกลม สีม่วงเข้ม-ดำ 1 จุด (บางครั้ง 2) ใน RBC','มักอยู่ค่อนไปทางขอบเซลล์','เป็นชิ้นส่วน DNA ของนิวเคลียส'],
  diff:'Platelet ทับบน RBC (มีขอบจางรอบ ๆ, มีแกรนูล) · Pappenheimer (จุดเล็กหลายจุดเป็นกลุ่ม)',
  sig:'ภาวะไม่มีม้าม/ม้ามทำงานบกพร่อง (splenectomy, sickle cell), Megaloblastic anemia',
  draw(){ return field(3,(x,y)=>rbc(x,y,RR)+C(x+r(-9,9),y+r(-9,9),2.6,'#3A1C5E'),10); } });

add({ id:'stipple', en:'Basophilic stippling', th:'Basophilic stippling (จุดสีน้ำเงินทั่วเซลล์)', size:'จุดละเอียด < 0.5 µm',
  key:['จุดเล็ก ๆ สีน้ำเงิน-ม่วงจำนวนมาก กระจายทั่วทั้งเซลล์','แบบละเอียด (fine) หรือหยาบ (coarse)','เกิดจาก ribosome (RNA) จับกลุ่ม'],
  diff:'Pappenheimer bodies (จุดน้อย เป็นกลุ่มที่ขอบ, Prussian blue +) · HbH inclusion (ต้องย้อม supravital)',
  sig:'Coarse: พิษตะกั่ว (Lead poisoning), Thalassemia, Pyrimidine 5′-nucleotidase deficiency',
  draw(){ return field(3,(x,y)=>rbc(x,y,RR,{pallor:0.28})+scatter(x,y,17,17,34,(a,b)=>C(a,b,r(0.6,1.1),'#353B8C')),9); } });

add({ id:'pappen', en:'Pappenheimer bodies', th:'Pappenheimer bodies (siderotic granules)', size:'< 1 µm',
  key:['จุดเล็กสีม่วงอมน้ำเงิน 1–10 จุด เกาะเป็นกลุ่มเล็ก ๆ','มักอยู่ใกล้ขอบเซลล์','ย้อม Prussian blue ให้ผลบวก (เป็นเหล็ก) = siderocyte'],
  diff:'Basophilic stippling (กระจายทั่วเซลล์) · Howell–Jolly (จุดเดียว ใหญ่กว่า)',
  sig:'Sideroblastic anemia, หลังตัดม้าม, Hemoglobinopathy, Iron overload',
  draw(){ return field(3,(x,y)=>{ const a=r(0,TAU); const cx=x+Math.cos(a)*13, cy=y+Math.sin(a)*13; return rbc(x,y,RR)+scatter(cx,cy,4,3,ri(4,7),(p,q)=>C(p,q,r(0.7,1.1),'#40306E')); },10); } });

add({ id:'heinz', en:'Heinz bodies', th:'Heinz bodies', stain:'nmb', size:'1–3 µm',
  key:['ต้องย้อมแบบ supravital (crystal violet / NMB) — มองไม่เห็นใน Wright','ก้อนกลมสีม่วง-น้ำเงิน 1 ก้อนหรือมากกว่า เกาะติดเยื่อหุ้มด้านใน (ขอบเซลล์)','เกิดจาก Hb ถูกออกซิไดซ์ตกตะกอน'],
  diff:'Reticulocyte (เป็นร่างแหเส้น ไม่ใช่ก้อนกลมที่ขอบ) · HbH inclusion (จุดเล็กกระจายทั่วเซลล์เหมือนลูกกอล์ฟ)',
  sig:'G6PD deficiency (หลังได้รับยา/ถั่วปากอ้า/ติดเชื้อ), Unstable hemoglobin — มักพบ bite cell ร่วมด้วยใน Wright',
  draw(){ const f0 = {col:'#C9D3D6',pale:'#E4EAEB',pallor:0.2};
    return field(5,(x,y)=>{ let s=rbc(x,y,RR,f0); const n=ri(1,3); for(let i=0;i<n;i++){ const a=r(0,TAU); s+=C(x+Math.cos(a)*17,y+Math.sin(a)*17,r(2.4,3.4),'#4E2A83'); } return s; },9,f0); } });

add({ id:'retic', en:'Reticulocyte', th:'Reticulocyte', stain:'nmb', size:'8–9 µm',
  key:['ย้อม New methylene blue (supravital) — เห็นร่างแหเส้น/จุดสีน้ำเงินเข้ม (RNA ตกตะกอน)','ต้องมีจุด/เส้นอย่างน้อย 2 จุดขึ้นไปจึงนับเป็น reticulocyte','RBC ที่โตเต็มที่ติดสีเขียวอมฟ้าจาง'],
  diff:'Heinz body (ก้อนที่ขอบ) · HbH (จุดทั่วเซลล์สม่ำเสมอ) · Pappenheimer',
  sig:'นับ 1,000 RBC (Miller disc) — ประเมินการสร้าง RBC ของไขกระดูก (ปกติ 0.5–2.5%)',
  draw(){ const f0 = {col:'#B8CCCB',pale:'#DDE8E7',pallor:0.2};
    return field(3,(x,y)=>{ let s=rbc(x,y,RR+1,f0); for(let k=0;k<6;k++){ const pts=[]; let px=x+r(-12,12), py=y+r(-12,12); for(let j=0;j<4;j++){ pts.push([px,py]); px+=r(-6,6); py+=r(-6,6);} s+=P(smooth(pts,false),'none','#1F3C8C',1.1); } return s+scatter(x,y,13,13,8,(a,b)=>C(a,b,1,'#1F3C8C')); },10,f0); } });

add({ id:'hbh', en:'HbH inclusion bodies (golf-ball cell)', th:'HbH inclusion (ลักษณะลูกกอล์ฟ)', stain:'nmb', size:'จุด ~0.5 µm สม่ำเสมอ',
  key:['ย้อม Brilliant cresyl blue / NMB แล้ว incubate 37 °C 1–2 ชม.','จุดเล็ก สีน้ำเงินอมเขียว ขนาดเท่ากัน กระจายสม่ำเสมอทั่วทั้งเซลล์ (golf ball)','ต่างจาก reticulocyte ที่เป็นร่างแหไม่สม่ำเสมอ'],
  diff:'Reticulocyte · Heinz body',
  sig:'α-thalassemia — HbH disease (พบบ่อยในไทย) พบหลายเซลล์; α-thal 1 trait พบได้น้อยมาก (1 ใน 1,000–10,000)',
  draw(){ const f0 = {col:'#B8CCCB',pale:'#DDE8E7',pallor:0.2};
    return field(4,(x,y)=>{ let s=rbc(x,y,RR,{col:'#A9C2C4',pale:'#C9D9DA',pallor:0.1}); for(let i=-18;i<=18;i+=4.4) for(let j=-18;j<=18;j+=4.4){ const o=(Math.round(j/4.4)%2)*2.2; if(Math.hypot(i+o,j)<18.5) s+=C(x+i+o,y+j,1.2,'#28508A'); } return s; },9,f0); } });

add({ id:'kb', en:'Kleihauer–Betke: fetal RBC', th:'Kleihauer–Betke (Fetal cell vs Ghost cell)', stain:'kb', size:'~ ขนาด RBC',
  key:['หลังชะด้วยกรด (acid elution) HbA หลุดออก → RBC ผู้ใหญ่เหลือเป็น “ghost cell” สีจาง','RBC ของทารก (HbF ทนกรด) ติดสีชมพูแดงเข้มทั้งเซลล์','นับ fetal cell ต่อ 2,000 RBC'],
  diff:'F-cell ของผู้ใหญ่ (ติดสีบางส่วน/ไม่เข้มเท่า) · HPFH (ติดสีทุกเซลล์สม่ำเสมอ)',
  sig:'ประเมินปริมาณ fetomaternal hemorrhage → คำนวณขนาด Anti-D (RhIG)',
  draw(){ const ghost = {col:'#EAD9DC',pale:'#F3EAEC',pallor:0.1, st:'#D2B7BC'};
    return field(3,(x,y)=>rbc(x,y,RR,{col:'#D23F5E',pale:'#E0667F',pallor:0}),16,ghost); } });
})();
/* ---------- กลุ่ม: ปรสิตในเลือด (Malaria, Microfilaria) ---------- */
(function(){
const {C,E,P,L,G,T,blob,scatter,polar,smooth,openPath,along,curve,grad,rbcBg,rbc,rbcFill,placer,granules,r,ri,TAU} = window.__ATLAS_H;
const add = o => window.__ATLAS_CORE.ITEMS.push(Object.assign({g:'bpara', stain:'giemsa', um:8}, o));
const RR = 29, CYTO = '#4F68B8', CHR = '#B0164A', PIG = '#6B4A1E';
const gOpt = {col:'#DCA6B3', pale:'#F3E3E8', pallor:0.3};
function ring(x,y,rad,o){ o=o||{};
  let s = C(x,y,rad,'none',CYTO,o.w||1.3);
  const a = o.a==null ? r(0,TAU) : o.a;
  s += C(x+Math.cos(a)*rad, y+Math.sin(a)*rad, o.cr||1.6, CHR);
  if(o.dbl) s += C(x+Math.cos(a+0.55)*rad, y+Math.sin(a+0.55)*rad, 1.4, CHR);
  return s;
}
function field(n, fn, spR, nBg, bgOpt){ spR=spR||RR; const sp=placer(n, spR*1.05, [], 66, 2000);
  let s = rbcBg(nBg==null?9:nBg, RR, sp.map(p=>[p[0],p[1],p[2]+2]), bgOpt||gOpt); sp.forEach((p,i)=>s+=fn(p[0],p[1],i)); return s; }

add({ id:'pf_ring', en:'Plasmodium falciparum — ring forms', th:'P. falciparum ระยะ ring', size:'ring ~1/5–1/6 ของ RBC', crit:true,
  key:['RBC ขนาดปกติ ไม่โต ไม่มี Schüffner’s dots','ring เล็ก บอบบาง มักพบ ≥ 2 ring ใน RBC เดียว (multiple infection)','chromatin 2 จุด (double chromatin / headphone) และ ring เกาะขอบเซลล์ (appliqué / accolé)','ในเลือดส่วนปลายพบเฉพาะ ring และ gametocyte (ไม่ค่อยพบ trophozoite โต/schizont)'],
  diff:'P. vivax ring (ใหญ่กว่า หนากว่า RBC เริ่มโต) · Platelet ทับ RBC · Babesia (tetrad “Maltese cross”)',
  sig:'⚠ รายงานด่วน — นับ % parasitemia; > 2–5% หรือพบ schizont ในเลือด = severe malaria',
  draw(){ return field(4,(x,y,i)=>{ let s=rbc(x,y,RR,gOpt); const n=[2,1,3,1][i];
      for(let k=0;k<n;k++){ const a=r(0,TAU); s+= ring(x+Math.cos(a)*r(4,11), y+Math.sin(a)*r(4,11), 5.4, {dbl:k===0&&i%2===0}); }
      if(i===2){ s+= P(`M${x-25} ${y-11}Q${x-29} ${y} ${x-25} ${y+11}`,'none',CYTO,1.5)+C(x-27,y,1.7,CHR); }
      return s; }); } });

add({ id:'pf_gam', en:'Plasmodium falciparum — gametocyte', th:'P. falciparum ระยะ gametocyte (รูปกล้วย)', size:'ยาวกว่า RBC (~1.5 เท่า)', crit:true,
  key:['รูปกล้วย/พระจันทร์เสี้ยว (crescent, banana-shaped) ปลายมน','ยาวเกิน RBC จนเห็น RBC เหลือเป็นขอบโค้งบาง ๆ (Laveran’s bib)','pigment สีน้ำตาลดำรวมอยู่ใกล้กลางเซลล์','Macrogametocyte ติดสีน้ำเงินเข้ม, Microgametocyte สีจางกว่า'],
  diff:'Sickle cell (ไม่มี chromatin/pigment) · Gametocyte ของ species อื่น (กลม)',
  sig:'ยืนยันการวินิจฉัย P. falciparum — ระยะติดต่อสู่ยุง (ต้องได้ยาฆ่า gametocyte เช่น primaquine)',
  draw(){ return field(2,(x,y,i)=>{ const rot=r(-30,30)+i*80; const arc='M-30 8C-20 -14 20 -14 30 8';
      return G(x,y,rot,1,P('M-27 12C-18 -22 18 -22 27 12','none','#C98A9C',2.2)+P(arc,'none',i?'#8A9AD2':'#4E62B0',13)+P(arc,'none',i?'#9EACDD':'#5F73BE',9)+scatter(0,-5,7,3,14,(a,b)=>C(a,b,r(0.8,1.4),PIG))+E(0,-4,6,3,0,'#C95D86','none',0,'opacity=".45"')); },40,6); } });

add({ id:'pv_troph', en:'Plasmodium vivax — amoeboid trophozoite', th:'P. vivax ระยะ trophozoite', size:'RBC โต 1.5–2 เท่า', crit:true,
  key:['RBC ที่ติดเชื้อโตกว่าปกติ 1.5–2 เท่า และติดสีจาง','มี Schüffner’s dots (จุดสีชมพู-แดงละเอียดจำนวนมาก) ทั่วเซลล์','ไซโทพลาซึมของปรสิตรูปร่างไม่แน่นอนแบบอะมีบา (amoeboid) มี pigment สีน้ำตาลทองละเอียด'],
  diff:'P. ovale (RBC รูปไข่ ขอบหยัก fimbriated, James dots) · P. falciparum (RBC ไม่โต)',
  sig:'ต้องให้ primaquine กำจัด hypnozoite ในตับ (ตรวจ G6PD ก่อน) — พบบ่อยในไทย',
  draw(){ return field(1,(x,y)=>{ const R2=44; let s=rbc(x,y,R2,{col:'#E6BAC5',pale:'#F2DDE3',pallor:0.1});
      s+=scatter(x,y,R2-3,R2-3,160,(a,b)=>C(a,b,r(0.5,0.9),'#DE6E8C'));
      s+=P(blob(x-2,y+2,19,15,0.55,11),CYTO,'none',0,'opacity=".9"')+C(x-4,y-3,5,'#E7D9F0','none',0,'opacity=".9"')+C(x+6,y-6,2.3,CHR)+scatter(x,y+4,9,6,10,(a,b)=>C(a,b,0.8,'#A07A2C'));
      return s; },46,6); } });

add({ id:'pv_schiz', en:'Plasmodium vivax — schizont', th:'P. vivax ระยะ schizont', size:'RBC โตมาก', crit:true,
  key:['RBC โต เต็มไปด้วย merozoite 12–24 ตัว (เฉลี่ย 16)','แต่ละ merozoite มีจุด chromatin สีแดง + ไซโทพลาซึมฟ้า','pigment สีน้ำตาลทองรวมเป็นก้อน 1–2 ก้อน, ยังเห็น Schüffner’s dots'],
  diff:'P. malariae schizont (6–12 merozoite เรียงเป็นดอกกุหลาบ, RBC ไม่โต) · P. falciparum schizont (8–24 ตัว RBC ไม่โต พบในเลือดเฉพาะรายรุนแรง)',
  sig:'ยืนยัน species — ใช้ร่วมกับลักษณะ RBC โต',
  draw(){ return field(1,(x,y)=>{ const R2=44; let s=rbc(x,y,R2,{col:'#E6BAC5',pale:'#F2DDE3',pallor:0.1});
      s+=scatter(x,y,R2-3,R2-3,120,(a,b)=>C(a,b,r(0.5,0.9),'#DE6E8C'));
      s+=placer(16,4.3,[[x-100+100,y-100+100,0]],26).map(p=>'').join('');
      let m=''; for(let i=0;i<16;i++){ const a=i/16*TAU*2.3+r(0,.3), d=(i<5?11:i<11?22:31)+r(-2,2); const mx=x+Math.cos(a)*d, my=y+Math.sin(a)*d; m+=C(mx,my,4.4,'#7C8FD0')+C(mx+1,my-1,1.9,CHR); }
      return s+m+scatter(x+3,y+2,4,3,12,(a,b)=>C(a,b,1,'#6E4A18')); },46,6); } });

add({ id:'pm_band', en:'Plasmodium malariae — band form & rosette schizont', th:'P. malariae (band form / rosette)', size:'RBC ปกติหรือเล็กลง', crit:true,
  key:['Trophozoite รูปแถบ (band form) พาดขวาง RBC','pigment สีน้ำตาลเข้ม หยาบ มักเรียงตามขอบแถบ','Schizont มี 6–12 merozoite เรียงรอบ pigment ตรงกลาง (rosette/daisy head)','RBC ขนาดปกติหรือเล็กลง ไม่มี stippling'],
  diff:'P. knowlesi (ring คล้าย falciparum + band form คล้าย malariae; ผู้ป่วยสัมผัสป่า/ลิงแสม — ยืนยันด้วย PCR)',
  sig:'ติดเชื้อเรื้อรัง อาจสัมพันธ์กับ nephrotic syndrome; ไข้จับสั่นทุก 72 ชม. (quartan)',
  draw(){ return field(2,(x,y,i)=>{ let s=rbc(x,y,RR-1,gOpt);
      if(i===0){ const rot=r(0,180); s+=G(x,y,rot,1,P('M-22 -5L22 -5L22 5L-22 5Z',CYTO)+L(-21,5,21,5,CHR,2.2)+scatter(0,-1,19,3,12,(a,b)=>C(a,b,1,'#4A3212'))); }
      else { for(let k=0;k<8;k++){ const a=k/8*TAU; s+=C(x+Math.cos(a)*15,y+Math.sin(a)*15,4.8,'#7C8FD0')+C(x+Math.cos(a)*16.5,y+Math.sin(a)*16.5,2,CHR); } s+=scatter(x,y,4,4,10,(a,b)=>C(a,b,1.3,'#4A3212')); }
      return s; },RR+2,10); } });

function microfil(o){
  let pts = curve(t=>[t*160, Math.sin(t*o.waves*Math.PI)*o.amp + (o.kink? Math.sin(t*37)*3.4:0)], 120);
  let len=0; for(let i=1;i<pts.length;i++) len+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
  const k = o.len/len; const cx = 80*k; const rot=(o.rot||0)*Math.PI/180;
  pts = pts.map(p=>{ const x=p[0]*k-cx, y=p[1]*k; return [100+x*Math.cos(rot)-y*Math.sin(rot), 100+x*Math.sin(rot)+y*Math.cos(rot)]; });
  const d = openPath(pts);
  let s = rbcBg(26,7.5*o.um/2,[],{col:'#DDB2BE',pale:'#EFD9E0',pallor:0.25});
  s += P(d,'none',o.sheathCol,o.w+3.6,'opacity=".85"') + P(d,'none','#C4A3D3',o.w);
  const total = along(pts,1000).total;
  along(pts, o.nucSp, o.head, total - o.tailFree).forEach(p=>{ s+=E(p[0]+r(-.5,.5),p[1]+r(-.5,.5),o.nucR*1.15,o.nucR*0.9,p[2]*180/Math.PI,'#3E2470'); });
  if(o.terminal){ [total-o.tailFree*0.5, total-2.5].forEach(sx=>along(pts,1,sx,sx).forEach(p=>s+=C(p[0],p[1],o.nucR,'#3E2470'))); }
  return s;
}
add({ id:'wb_mf', en:'Wuchereria bancrofti microfilaria', th:'ไมโครฟิลาเรีย W. bancrofti', stain:'giemsa', um:0.85, size:'244–296 × 7.5–10 µm',
  key:['มีปลอก (sheath) — ใน Giemsa มักติดสีจาง/ไม่ติดสี','ลำตัวโค้งเรียบ อ่อนช้อย (graceful curves)','นิวเคลียสในลำตัวแยกกันชัด ไม่ซ้อน','ปลายหาง ไม่มีนิวเคลียส (tail tip free of nuclei); cephalic space สั้น (ยาว ≈ กว้าง)'],
  diff:'Brugia malayi (หางมี 2 terminal nuclei แยกกัน, ลำตัวหักงอ, sheath ติดชมพูเข้ม) · Mansonella (ไม่มีปลอก)',
  sig:'Lymphatic filariasis — nocturnal periodicity: เจาะเลือดช่วง 22.00–02.00 น. (thick film/ Knott’s concentration)',
  draw(){ return microfil({um:0.85, len:230, waves:3, amp:34, rot:12, w:6.8, sheathCol:'#E9DCEA', nucSp:3.1, nucR:2.0, head:7, tailFree:13}); } });

add({ id:'bm_mf', en:'Brugia malayi microfilaria', th:'ไมโครฟิลาเรีย Brugia malayi', stain:'giemsa', um:1.0, size:'177–230 × 5–6 µm',
  key:['มีปลอก (sheath) ติดสีชมพูเข้มใน Giemsa','ลำตัวหักงอเป็นมุม (kinky, secondary kinks)','นิวเคลียสในลำตัวเบียดกัน/ซ้อนกัน','หางมี 2 terminal nuclei แยกห่างกัน; cephalic space ยาว (≈ 2:1)'],
  diff:'W. bancrofti (หางไม่มีนิวเคลียส, โค้งเรียบ)',
  sig:'พบในภาคใต้ของไทย (นราธิวาส) — nocturnal subperiodic',
  draw(){ return microfil({um:1.0, len:205, waves:3.4, amp:30, rot:-10, kink:true, w:5.6, sheathCol:'#E07FAF', nucSp:2.2, nucR:1.9, head:12, tailFree:20, terminal:true}); } });
})();
/* ---------- กลุ่ม: ปรสิตในอุจจาระ / ปัสสาวะ / เทปใส (ไข่หนอนพยาธิ, โปรโตซัว) ---------- */
(function(){
const {C,E,P,L,G,T,blob,scatter,polar,smooth,openPath,along,curve,poly,grad,granules,placer,r,ri,TAU,shade} = window.__ATLAS_H;
const add = o => window.__ATLAS_CORE.ITEMS.push(Object.assign({g:'spara', stain:'iodine'}, o));
const ellR = (rx,ry) => a => 1/Math.sqrt(Math.pow(Math.cos(a)/rx,2)+Math.pow(Math.sin(a)/ry,2));
const debris = (n) => scatter(100,100,92,92,n||14,(x,y)=>P(blob(x,y,r(1,3.5),r(1,2.5),0.4,6,r(0,180)),'#C9B68A','#A9955F',0.4,'opacity=".55"'));
/* egg shape (pointed/rounded) in local coords */
function lemon(Lx,Hy,pt){ pt=pt||0.8; return `M${-Lx} 0C${-Lx*pt} ${-Hy*1.33} ${Lx*pt} ${-Hy*1.33} ${Lx} 0C${Lx*pt} ${Hy*1.33} ${-Lx*pt} ${Hy*1.33} ${-Lx} 0Z`; }
function egg(Lx,Hy,k){ // asymmetric egg (narrow end at -x)
  return polar(0,0,a=>{ const c=Math.cos(a); return ellR(Lx,Hy)(a)*(1+ (k||0.12)*c); },120);
}
function cells(n, rx, ry, col){ let s=''; placer(n,()=>r(Math.min(rx,ry)*0.28,Math.min(rx,ry)*0.4),[],1,0).forEach(()=>{});
  for(let i=0;i<n;i++){ const a=r(0,TAU), d=Math.sqrt(r(0,1)); s+=C(Math.cos(a)*rx*d*0.7, Math.sin(a)*ry*d*0.7, Math.min(rx,ry)*r(0.28,0.42), col, shade(col,0.8), 0.6); } return s; }

add({ id:'asc_f', en:'Ascaris lumbricoides — fertile egg', th:'ไข่พยาธิไส้เดือน (fertilized)', um:1.9, size:'45–75 × 35–50 µm',
  key:['รูปไข่/กลม เปลือกหนา สีน้ำตาลเหลือง (ติดสีน้ำดี)','ผิวนอกเป็นปุ่มขรุขระ (mammillated albuminous coat)','ภายในมีเซลล์ไข่ 1 เซลล์ (unembryonated) มีช่องว่างรูปพระจันทร์ที่ขั้ว','ไข่ที่ลอกผิวนอก (decorticated) ผิวเรียบ ใส'],
  diff:'Unfertilized egg (ยาวกว่า เปลือกบาง ภายในเป็นเม็ด refractile) · Pollen grain / ละอองเกสร',
  sig:'Ascariasis — พบบ่อยในเด็ก; รายงานเป็นจำนวนไข่ต่อ LPF / ต่อกรัม (Kato-Katz)',
  draw(){ const base=ellR(58,45);
    const coat = polar(0,0,a=>base(a)+4.2+2.4*Math.pow(Math.abs(Math.sin(a*19)),0.7)+r(-0.5,0.5),240);
    return debris() + G(100,100,r(-30,30),1, P(coat,'#A56E2B','#7F5019',0.8) + P(polar(0,0,a=>base(a)-1,120),'#D9B06A','#8E6226',1.6) + P(polar(0,0,a=>base(a)-8,120),'#E9CE97','none') +
      P(blob(0,0,34,32,0.08,12),'#C9974E','#9E6C2B',0.8) + scatter(0,0,28,26,60,(x,y)=>C(x,y,r(0.8,2),'#A7773A',null,0,'opacity=".6"'))); } });

add({ id:'asc_u', en:'Ascaris lumbricoides — unfertilized egg', th:'ไข่พยาธิไส้เดือน (unfertilized)', um:1.6, size:'85–95 × 43–47 µm',
  key:['ยาวรีกว่าไข่ fertile รูปร่างไม่สม่ำเสมอ','เปลือกบางกว่า ปุ่มผิวนอกไม่สม่ำเสมอ/อาจไม่มี','ภายในเต็มไปด้วยเม็ด refractile ขนาดต่าง ๆ ไม่เป็นระเบียบ'],
  diff:'Hookworm (เปลือกบางใส มี morula) · Fasciola (มี operculum) · Fertile Ascaris',
  sig:'พบได้เมื่อมีแต่พยาธิตัวเมีย — ยังถือว่าเป็น Ascariasis',
  draw(){ const base=ellR(70,36);
    const coat = polar(0,0,a=>base(a)+2.2+1.8*Math.pow(Math.abs(Math.sin(a*23+r(0,.4))),0.7)*(0.4+r(0,1)),220);
    return debris() + G(100,100,r(-20,20),1, P(coat,'#A87533','#7F5019',0.8) + P(polar(0,0,a=>base(a)-1,120),'#D3AE6F','#8E6226',1) +
      scatter(0,0,62,29,55,(x,y)=>C(x,y,r(2,5.5),'#E9D39F','#A9803E',0.6))); } });

add({ id:'trich', en:'Trichuris trichiura egg', th:'ไข่พยาธิแส้ม้า', um:2.4, size:'50–55 × 22–24 µm',
  key:['รูปถังเบียร์/ผลมะนาว (barrel / lemon shape) สีน้ำตาล','มีจุกใส (hyaline polar plugs) ยื่นออกมาที่ปลายทั้งสองข้าง','เปลือกหนาเรียบ ภายในยังไม่แบ่งเซลล์'],
  diff:'Capillaria philippinensis (รูปถั่วลิสง จุกแบนไม่ยื่น เปลือกมีลายขีด) · Trichostrongylus',
  sig:'Trichuriasis — ติดเชื้อหนักทำให้ไส้ตรงปลิ้น (rectal prolapse), โลหิตจาง',
  draw(){ return debris() + G(100,100,r(-25,25),1, P(lemon(56,24),'#9C6127','#6E3F12',1.2) + P(lemon(50,19),'#C38A45','none') + scatter(0,0,38,13,50,(x,y)=>C(x,y,r(0.8,1.8),'#A06A2C',null,0,'opacity=".7"')) +
      E(-58,0,5,6.5,0,'#F4EAD0','#B69A62',0.9) + E(58,0,5,6.5,0,'#F4EAD0','#B69A62',0.9)); } });

add({ id:'hook', en:'Hookworm egg', th:'ไข่พยาธิปากขอ', um:2, size:'60–75 × 35–40 µm',
  key:['รูปไข่ ปลายมน เปลือกบางใสมาก ไม่มีสี','มีช่องว่างใสระหว่างเปลือกกับเซลล์ภายใน','ภายในเป็นกลุ่มเซลล์ 4–8 เซลล์ (morula) ในอุจจาระสด; ทิ้งไว้นานจะฟักเป็นตัวอ่อน'],
  diff:'Trichostrongylus (ยาวกว่า ปลายแหลมกว่า) · Strongyloides (ในอุจจาระพบเป็นตัวอ่อน rhabditiform ไม่ใช่ไข่)',
  sig:'Necator americanus / Ancylostoma — สาเหตุ iron deficiency anemia ที่สำคัญ; ไข่แยก species ไม่ได้',
  draw(){ let m=''; const pos=[[-10,-8],[8,-9],[-9,8],[9,8],[0,-1],[-18,1],[18,0],[0,14]]; pos.forEach(p=>m+=P(blob(p[0],p[1],10,9,0.12,8),'#BDB18D','#8E8563',0.7)+C(p[0],p[1],2,'#9A8F6D','none',0,'opacity=".6"'));
    return debris() + G(100,100,r(-30,30),1, E(0,0,66,39,0,'#F1EEDD','#7F8272',1.1) + E(0,0,64.6,37.6,0,'none','#fff',0.5) + m); } });

add({ id:'entero', en:'Enterobius vermicularis egg', th:'ไข่พยาธิเข็มหมุด', um:2.4, stain:'wet', size:'50–60 × 20–32 µm',
  key:['รูปตัว D — ด้านหนึ่งแบน อีกด้านนูน','เปลือกหนา 2 ชั้น ใส ไม่มีสี','ภายในมักมีตัวอ่อนขดอยู่ (embryonated)','ตรวจด้วยวิธีเทปใส (Scotch tape / Graham) รอบทวารหนักตอนเช้าก่อนอาบน้ำ'],
  diff:'Hookworm (สมมาตร มี morula) · ฟองอากาศ',
  sig:'Enterobiasis — คันก้นเวลากลางคืน พบบ่อยในเด็ก ไม่ค่อยพบไข่ในอุจจาระ',
  draw(){ const D='M-58 6C-50 -26 30 -30 58 -6C60 4 52 14 40 16C10 20 -30 22 -58 6Z';
    const larva = openPath([[-40,6],[-20,-8],[10,-12],[36,-2],[30,8],[0,6],[-24,10]]);
    return debris(8) + G(100,100,r(-30,30),1, P(D,'#F2F1E8','#6E7266',2.4) + P(D,'none','#fff',0.6,'transform="scale(.93)"') + P(larva,'none','#C8C4A8',7) + P(larva,'none','#DAD6BD',4.5)); } });

add({ id:'strongy', en:'Strongyloides stercoralis — rhabditiform larva', th:'ตัวอ่อนพยาธิสตรองจิลอยด์ (rhabditiform)', um:0.62, stain:'iodine', size:'180–380 × 14–20 µm',
  key:['พบเป็น “ตัวอ่อน” ในอุจจาระสด (ไม่ค่อยพบไข่)','ช่องปาก (buccal canal) สั้น — ยาวน้อยกว่าความกว้างลำตัว','มี genital primordium เป็นกลุ่มเซลล์รูปไข่ชัดเจนกลางลำตัว','หลอดอาหารแบบ rhabditiform (มี bulb)'],
  diff:'Hookworm rhabditiform larva (buccal canal ยาว, genital primordium เล็กไม่ชัด) — เกิดเมื่ออุจจาระทิ้งไว้นาน',
  sig:'Autoinfection → hyperinfection/disseminated ในผู้ได้ steroid, HTLV-1 — ใช้ agar plate culture เพิ่มความไว',
  draw(){ const pts = curve(t=>[22+t*156, 100+Math.sin(t*2.4*Math.PI+0.4)*26],60);
    let s = debris(10) + P(openPath(pts),'none','#8C7A48',11) + P(openPath(pts),'none','#D8C595',8.6);
    const a1 = along(pts,1,4,4)[0], eso = along(pts,1,10,46), gp = along(pts,1,92,92)[0], tail = along(pts,1,150,165);
    s += L(pts[0][0]+1,pts[0][1],a1[0],a1[1],'#5A4A22',1.2);
    eso.forEach(p=>s+=C(p[0],p[1],1.4,'#A38D55','none',0,'opacity=".7"'));
    const b = along(pts,1,44,44)[0]; s += C(b[0],b[1],3.6,'#B49A5E','#7C6A38',0.6);
    s += E(gp[0],gp[1],5.8,3.2,gp[2]*180/Math.PI,'#8D7440','#5C4A20',0.6);
    return s; } });

add({ id:'ov', en:'Opisthorchis viverrini egg', th:'ไข่พยาธิใบไม้ตับ', um:5, size:'19–30 × 12–17 µm',
  key:['ขนาดเล็กมาก (< 30 µm) รูปหลอดไฟ/ผลแตงไทย สีเหลืองน้ำตาลอ่อน','มีฝาปิด (operculum) พร้อมขอบยก “ไหล่” (opercular shoulders) ชัด','ปลายตรงข้ามมีปุ่มเล็ก (abopercular knob)','ภายในมี miracidium; ผิวเปลือกเป็นลายตาข่ายละเอียด (musk-melon)'],
  diff:'Clonorchis sinensis (แยกด้วยตาเปล่าไม่ได้) · Minute intestinal flukes / Heterophyids (ไหล่ไม่ชัด) · Capillaria',
  sig:'พบบ่อยในภาคอีสาน (กินปลาดิบ/ก้อยปลา) — ความเสี่ยงมะเร็งท่อน้ำดี (cholangiocarcinoma)',
  draw(){ const body='M-58 -16C-40 -42 44 -46 66 -14C75 0 75 4 66 16C44 46 -40 42 -58 16Z';
    let net=''; for(let i=-48;i<=60;i+=7) net+=P(`M${i} -38Q${i+6} 0 ${i} 38`,'none','#B08A3F',0.45,'opacity=".45"');
    return debris(6) + G(100,100,r(-25,25),1, P(body,'#D7AF62','#8E6320',1.8) + net +
      P(blob(8,2,40,26,0.1,10),'#C99A4E','none',0,'opacity=".8"') + scatter(8,2,32,20,26,(x,y)=>C(x,y,r(1,2.2),'#A97A34',null,0,'opacity=".6"')) +
      P('M-58 -16C-73 -10 -73 10 -58 16Z','#E8CF98','#8E6320',1.6) +
      P('M-60 -15L-53 -21','none','#7A531A',4.2) + P('M-60 15L-53 21','none','#7A531A',4.2) + C(75,2,4,'#9C6E28','#7A531A',0.6)); } });

add({ id:'taenia', en:'Taenia spp. egg', th:'ไข่พยาธิตัวตืด (Taenia)', um:3.5, size:'30–35 µm',
  key:['กลม เปลือก (embryophore) หนา สีน้ำตาล มีลายเส้นรัศมี (radial striations)','ภายในมีตัวอ่อน oncosphere ที่มีตะขอ 3 คู่ (6 hooklets, hexacanth embryo)','แยก T. saginata / T. solium จากไข่ไม่ได้ (ต้องดู proglottid/scolex)'],
  diff:'Hymenolepis nana (เปลือกบาง มี polar filaments) · Pollen grains',
  sig:'T. solium → cysticercosis (อันตราย, ติดจากไข่) — ใส่ถุงมือเสมอเมื่อจับตัวอย่าง',
  draw(){ let rad=''; for(let i=0;i<110;i++){ const a=i/110*TAU; rad+=L(Math.cos(a)*44,Math.sin(a)*44,Math.cos(a)*57,Math.sin(a)*57,'#5E3C13',0.9); }
    const hook = (x,y,a)=>G(x,y,a,1,P('M0 -5L0 4Q0 6 2 6','none','#4A2E0C',1.3));
    return debris(8) + G(100,100,0,1, C(0,0,58,'#9A6528','#6E4414',1.2) + rad + C(0,0,44,'#DDC392','#6E4414',1) +
      hook(-10,-10,-30)+hook(-5,-13,-10)+hook(6,-12,15)+hook(11,-8,35)+hook(-8,8,-150)+hook(8,9,150) + scatter(0,0,32,32,24,(x,y)=>C(x,y,r(0.8,1.6),'#B89A60',null,0,'opacity=".7"'))); } });

add({ id:'hnana', en:'Hymenolepis nana egg', th:'ไข่พยาธิตืดแคระ', um:3, size:'30–47 µm',
  key:['กลม/รีเล็กน้อย เปลือกนอกบางใส ไม่มีสี','ภายในมี oncosphere ที่มีตะขอ 6 อัน','มีปุ่มหนา 2 ขั้วของเยื่อหุ้ม oncosphere พร้อม polar filaments 4–8 เส้น ในช่องว่าง'],
  diff:'H. diminuta (ใหญ่กว่า 70–85 µm ไม่มี polar filaments) · Taenia (เปลือกหนาลายรัศมี)',
  sig:'ตืดที่พบบ่อยในเด็ก ติดต่อจากคนสู่คนได้ (ไม่ต้องมีโฮสต์กลาง)',
  draw(){ let fil=''; [[-1,1],[1,-1]].forEach(([sx])=>{ for(let k=0;k<4;k++){ const y0=sx*30; fil+=P(`M${-2+k} ${y0}C${sx*18-k*9} ${y0+sx*10} ${-k*10+14} ${y0+sx*16} ${sx*(20+k*6)} ${y0+sx*6+ k*3}`,'none','#9C9A86',0.6); } });
    const hook=(x,y,a)=>G(x,y,a,1,L(0,-4,0,4,'#6B6A58',1.1));
    return debris(6) + G(100,100,r(0,40),1, E(0,0,58,54,0,'#F1EFE3','#8A8B7C',1) + fil + E(0,0,24,30,0,'#E2DDC4','#8A8B7C',1) +
      E(0,-31,5,3,0,'#C9C3A6') + E(0,31,5,3,0,'#C9C3A6') + hook(-7,-6,-25)+hook(0,-8,0)+hook(7,-6,25)+hook(-7,7,25)+hook(0,9,0)+hook(7,7,-25)); } });

add({ id:'sch_m', en:'Schistosoma mansoni egg', th:'ไข่พยาธิใบไม้เลือด S. mansoni', um:0.95, size:'114–180 × 45–70 µm',
  key:['ไข่ใหญ่ รีเรียว ไม่มีฝาปิด','มีหนาม (spine) ใหญ่ ยื่นออกด้านข้างใกล้ปลายข้างหนึ่ง (lateral spine)','ภายในมี miracidium ที่มีขนกวัดได้'],
  diff:'S. haematobium (หนามที่ปลาย terminal spine, พบในปัสสาวะ) · S. japonicum / S. mekongi (กลมกว่า หนามเล็กเป็นปุ่ม)',
  sig:'Intestinal / hepatic schistosomiasis (แอฟริกา อเมริกาใต้) — ในลุ่มน้ำโขงคือ S. mekongi',
  draw(){ return debris(10) + G(100,100,r(-20,20),1, P('M-70 0C-60 -34 50 -32 70 -2C74 8 60 26 30 30C-10 34 -64 26 -70 0Z','#E6D6A6','#8E7A44',1.3) + P('M6 -22L22 -50L30 -20Z','#E6D6A6','#8E7A44',1.2) +
      P(blob(0,0,50,20,0.08,12),'#CDB984','#9E8A54',0.7) + scatter(0,0,42,16,40,(x,y)=>C(x,y,r(1,2.4),'#A99158',null,0,'opacity=".6"')) + C(-18,-2,6,'#E9DDB6','#A99158',0.6)); } });

add({ id:'sch_h', en:'Schistosoma haematobium egg (urine)', th:'ไข่ S. haematobium (ในปัสสาวะ)', um:0.95, stain:'wet', size:'112–170 × 40–70 µm',
  key:['พบใน ตะกอนปัสสาวะ (ช่วงเที่ยง–บ่าย 2 โมง) มากกว่าอุจจาระ','หนามอยู่ที่ ปลายสุด (terminal spine)','ภายในมี miracidium'],
  diff:'S. mansoni (หนามด้านข้าง) · S. intercalatum',
  sig:'Urinary schistosomiasis — hematuria, สัมพันธ์กับมะเร็งกระเพาะปัสสาวะ (squamous cell)',
  draw(){ return G(100,100,r(-20,20),1, P('M-66 0C-60 -32 48 -34 64 -6L84 0L64 6C48 34 -60 32 -66 0Z','#EEE7CE','#7F7A5E',1.3) +
      P(blob(-6,0,48,22,0.08,12),'#DAD1AE','#9E9870',0.7) + scatter(-6,0,40,17,40,(x,y)=>C(x,y,r(1,2.4),'#ADA27A',null,0,'opacity=".6"'))); } });

add({ id:'parag', en:'Paragonimus spp. egg', th:'ไข่พยาธิใบไม้ปอด', um:1.3, size:'80–120 × 45–70 µm',
  key:['สีน้ำตาลทอง รีไม่สมมาตร มีฝาปิดแบน','ฝาปิดมีขอบไหล่ (opercular shoulders) ชัด','ปลายตรงข้ามเปลือกหนาขึ้น (abopercular thickening)','พบใน เสมหะ และอุจจาระ (กลืนเสมหะ)'],
  diff:'Diphyllobothrium (ไม่มีไหล่ มีปุ่มเล็ก) · Fasciola (ใหญ่กว่า ฝาเล็กไม่ชัด)',
  sig:'Paragonimiasis — อาการคล้ายวัณโรค (ไอเป็นเลือด) กินปู/กุ้งน้ำจืดดิบ; อย่าลืมตรวจเสมหะ',
  draw(){ return debris(8) + G(100,100,r(-20,20),1, P(egg(66,38,0.12),'#B8812F','#7A4E14',1.4) + P(egg(62,34,0.12),'#D6A95C','none') +
      P('M72 -18C82 -8 82 8 72 18','none','#6E4410',4) + scatter(0,0,48,24,26,(x,y)=>C(x,y,r(3,5),'#C69249','#A1702B',0.5)) +
      P('M-62 -22C-72 -12 -72 12 -62 22','#E0BE7C','#7A4E14',1.4) + L(-62,-25,-62,25,'#6E4410',2) ); } });

add({ id:'fasc', en:'Fasciola / Fasciolopsis buski egg', th:'ไข่พยาธิใบไม้ตับแกะ / ใบไม้ลำไส้ยักษ์', um:0.95, size:'130–150 × 60–90 µm',
  key:['ไข่ใหญ่มาก รีกลม เปลือกบาง สีเหลืองน้ำตาล','ฝาปิด (operculum) เล็ก ไม่ชัด ที่ปลายด้านหนึ่ง','ภายในยังไม่มีตัวอ่อน เต็มด้วย yolk cells'],
  diff:'Fasciola hepatica กับ Fasciolopsis buski แยกจากไข่ไม่ได้ · Echinostoma (เล็กกว่าเล็กน้อย) · Unfertilized Ascaris',
  sig:'F. buski — กินพืชน้ำดิบ (กระจับ, ผักบุ้ง) พบในภาคกลางของไทย',
  draw(){ return debris(8) + G(100,100,r(-20,20),1, E(0,0,70,42,0,'#D9B36A','#8E6522',1.1) + scatter(0,0,62,35,60,(x,y)=>C(x,y,r(3,5.5),'#E5C98A','#B08A45',0.5)) +
      P('M-68 -12C-73 -5 -73 5 -68 12','none','#6E4A12',1.4)); } });

add({ id:'capil', en:'Capillaria philippinensis egg', th:'ไข่พยาธิแคปิลลาเรีย', um:3, size:'36–45 × 20 µm',
  key:['รูปถั่วลิสง (peanut) ด้านข้างค่อนข้างขนาน','จุกขั้วทั้งสองข้างแบน ไม่ยื่นออกมา (flattened bipolar plugs)','ผิวเปลือกมีลายขีด/รูพรุนละเอียด (striated shell)'],
  diff:'Trichuris (รูปถัง จุกยื่นชัด เปลือกเรียบ)',
  sig:'Intestinal capillariasis — ท้องเสียเรื้อรัง ขาดโปรตีน อาจถึงตาย (กินปลาดิบน้ำจืด); พบในไทย/ฟิลิปปินส์',
  draw(){ const body='M-62 -4C-60 -26 -30 -30 0 -27C30 -30 60 -26 62 -4L62 4C60 26 30 30 0 27C-30 30 -60 26 -62 4Z';
    let st=''; for(let i=-54;i<=54;i+=4) st+=L(i,-25,i+2,25,'#8E6A32',0.35,'opacity=".6"');
    return debris(8) + G(100,100,r(-20,20),1, P(body,'#C99C57','#7A5418',1.3) + st + P(blob(0,0,48,18,0.06,10),'#B98A48','none',0,'opacity=".6"') +
      P('M-62 -12L-66 -12L-66 12L-62 12','#EAD9AE','#8A6A2E',0.9) + P('M62 -12L66 -12L66 12L62 12','#EAD9AE','#8A6A2E',0.9)); } });

/* ---- Protozoa ---- */
add({ id:'giar_t', en:'Giardia duodenalis (lamblia) — trophozoite', th:'Giardia ระยะ trophozoite', um:6.5, stain:'trich', size:'10–20 × 5–15 µm',
  key:['รูปลูกแพร์/หยดน้ำ หัวกว้างท้ายเรียว สมมาตรซ้าย-ขวา','นิวเคลียส 2 อัน ด้านหน้า คล้าย “ดวงตา” (มีหน้าตาเหมือนใบหน้ายิ้ม)','axonemes ตามแนวกลาง + median bodies รูปจุลภาค','มี ventral sucking disk; การเคลื่อนที่แบบ “ใบไม้ร่วง” (falling leaf)'],
  diff:'Chilomastix mesnili (นิวเคลียสเดียว, ร่อง spiral) · Trichomonas',
  sig:'Giardiasis — ท้องเสียเรื้อรัง ถ่ายเป็นไขมัน (malabsorption)',
  draw(){ const body='M0 -44C30 -44 40 -18 32 6C24 30 6 44 0 50C-6 44 -24 30 -32 6C-40 -18 -30 -44 0 -44Z';
    return debris(6) + G(100,100,r(-20,20),1, P(body,'#AFC3A4','#6E8768',1) + E(0,-20,24,15,0,'#C5D4BC','none',0,'opacity=".7"') +
      C(-11,-20,7.5,'#EDF0E6','#6A3563',1)+C(-11,-20,2.8,'#6A3563') + C(11,-20,7.5,'#EDF0E6','#6A3563',1)+C(11,-20,2.8,'#6A3563') +
      L(-2,-12,-2,58,'#5C3A5A',0.9)+L(2,-12,2,58,'#5C3A5A',0.9) + P('M-10 6Q0 12 10 6','none','#6A3563',3)); } });

add({ id:'giar_c', en:'Giardia duodenalis — cyst', th:'Giardia ระยะ cyst', um:7, size:'8–19 × 7–10 µm',
  key:['รูปรี ผนังหนาเรียบ','ไซโทพลาซึมหดตัวแยกจากผนัง (มีช่องว่างใส)','มีนิวเคลียส 4 อัน (มักอยู่ด้านหนึ่ง) + axonemes/fibrils และ median bodies'],
  diff:'Entamoeba cyst (กลม ไม่มี axoneme) · Yeast (เล็กกว่า มี budding) · Chilomastix cyst (รูปมะนาว 1 นิวเคลียส)',
  sig:'ระยะติดต่อ — ทนคลอรีน ติดต่อทางน้ำดื่ม',
  draw(){ return debris(6) + G(100,100,r(-30,30),1, E(0,0,52,34,0,'#F3EBCF','#7F6A34',2.2) + E(2,0,46,28,0,'#D8C288','#A89150',0.6) +
      [[-26,-10],[-26,10],[-10,-12],[-10,12]].map(p=>C(p[0],p[1],6,'#EFE3BD','#6E5518',1.1)+C(p[0],p[1],1.8,'#6E5518')).join('') +
      P('M-30 -3C0 -6 20 -4 42 -8','none','#7E6526',1)+P('M-30 3C0 6 20 4 42 8','none','#7E6526',1) + P('M8 -10q6 4 0 8','none','#6E5518',2.4)+P('M16 3q6 4 0 8','none','#6E5518',2.4)); } });

add({ id:'eh_t', en:'Entamoeba histolytica — trophozoite', th:'Entamoeba histolytica ระยะ trophozoite', um:3.4, stain:'trich', size:'10–60 µm (ส่วนใหญ่ 15–20)',
  key:['นิวเคลียส 1 อัน: karyosome เล็กอยู่ตรงกลาง + peripheral chromatin ละเอียดสม่ำเสมอ','ไซโทพลาซึมละเอียดแบบ “ground glass” มี pseudopodia ใส','มี RBC ที่ถูกกลืนอยู่ภายใน (ingested RBC) = หลักฐานสำคัญของ E. histolytica'],
  diff:'E. dispar (หน้าตาเหมือนกัน แต่ไม่กิน RBC ไม่ก่อโรค) · E. coli trophozoite (karyosome เยื้อง, ไซโทพลาซึมหยาบมี vacuole มาก) · Macrophage',
  sig:'Amoebic dysentery (ถ่ายเป็นมูกเลือด), ฝีบิดในตับ (amoebic liver abscess) — ตัวอย่างต้องสดส่งตรวจภายใน 30 นาที',
  draw(){ return debris(6) + P(blob(100,100,64,50,0.28,11,20),'#A9BFA6','#6D8A6A',1) + P(blob(150,88,14,18,0.2,7),'#D2DDCC','none',0,'opacity=".9"') +
      C(86,96,13,'#E3EBDD','#6B2D5C',1.6) + C(86,96,2.4,'#6B2D5C') + [[112,112],[118,86],[74,124],[128,108]].map(p=>C(p[0],p[1],r(5,6.5),'#B3263D','#8C1A2C',0.6)).join('') +
      scatter(100,104,40,30,40,(x,y)=>C(x,y,r(0.6,1.2),'#7F9D7B',null,0,'opacity=".6"')); } });

add({ id:'eh_c', en:'Entamoeba histolytica/dispar — cyst', th:'Entamoeba histolytica/dispar ระยะ cyst', um:6, size:'10–20 µm',
  key:['กลม มีนิวเคลียส 1–4 อัน (cyst แก่ = 4 นิวเคลียส)','karyosome เล็กอยู่ตรงกลาง','chromatoid bodies รูปแท่งปลายมน (cigar-shaped / rounded ends)','อาจเห็น glycogen vacuole ใน cyst อ่อน (ติดสีน้ำตาลด้วยไอโอดีน)'],
  diff:'E. coli cyst (ถึง 8 นิวเคลียส, chromatoid ปลายแหลมแตกเป็นเสี้ยน) · Blastocystis · Endolimax / Iodamoeba',
  sig:'ระยะติดต่อ — รายงานเป็น “E. histolytica/dispar” ถ้าไม่มีการทดสอบยืนยัน (antigen/PCR)',
  draw(){ return debris(6) + C(100,100,50,'#E9D8A3','#7E6428',2) + [[-18,-16],[16,-18],[-16,16],[18,14]].map(p=>C(100+p[0],100+p[1],8,'#F2E8C6','#6E5518',1.1)+C(100+p[0],100+p[1],1.8,'#6E5518')).join('') +
      E(100,100,18,4.6,-15,'#8F7330','#6E5518',0.6) + E(106,122,11,3.8,10,'#8F7330','#6E5518',0.6); } });

add({ id:'ec_c', en:'Entamoeba coli — cyst', th:'Entamoeba coli ระยะ cyst', um:4.2, size:'10–35 µm',
  key:['กลม ใหญ่กว่า E. histolytica','นิวเคลียสได้ถึง 8 อัน (บางครั้งมากกว่า)','karyosome ใหญ่ อยู่เยื้องศูนย์ peripheral chromatin หยาบไม่สม่ำเสมอ','chromatoid bodies (ถ้ามี) ปลายแหลมคล้ายเสี้ยนไม้ (splintered)'],
  diff:'E. histolytica/dispar cyst (≤ 4 นิวเคลียส karyosome กลาง chromatoid ปลายมน)',
  sig:'Non-pathogen แต่บ่งบอกว่ามีการปนเปื้อนอุจจาระในอาหาร/น้ำ',
  draw(){ let s=''; for(let i=0;i<8;i++){ const a=i/8*TAU+0.3, d=i%2?30:22; const x=100+Math.cos(a)*d, y=100+Math.sin(a)*d; s+=C(x,y,8,'#F2E8C6','#6E5518',1.3)+C(x+2.4,y+1.6,2.4,'#6E5518'); }
    return debris(6) + C(100,100,56,'#E9D8A3','#7E6428',2) + s + P('M84 100L112 94L118 96L90 103Z','#8F7330'); } });

add({ id:'blasto', en:'Blastocystis spp. (vacuolar form)', th:'Blastocystis', um:6, size:'6–40 µm (ส่วนใหญ่ 8–10)',
  key:['กลม ขนาดแตกต่างกันมาก','มี central body (vacuole ใหญ่) กินพื้นที่เกือบทั้งเซลล์','ไซโทพลาซึมเป็นขอบบาง ๆ รอบ ๆ มีนิวเคลียสเล็ก 2–4 อันที่ขอบ'],
  diff:'Entamoeba / Endolimax cyst · Yeast · Fat globule (ไม่มีขอบไซโทพลาซึมและนิวเคลียส)',
  sig:'ความสำคัญในการก่อโรคยังไม่ชัดเจน — รายงานจำนวน (few/moderate/many)',
  draw(){ const cell=(x,y,rr)=>C(x,y,rr,'#CFAE63','#7E6428',1.2)+C(x,y,rr*0.8,'#F4ECCF','#A78C4A',0.6)+[0.3,2.4,4.2].map(a=>E(x+Math.cos(a)*rr*0.9,y+Math.sin(a)*rr*0.9,rr*0.1,rr*0.07,a*57,'#6E5518')).join('');
    return debris(6) + cell(96,96,34) + cell(150,138,20) + cell(52,146,14); } });

add({ id:'crypto', en:'Cryptosporidium spp. oocysts', th:'Cryptosporidium (oocyst)', um:9, stain:'mafb', size:'4–6 µm',
  key:['ย้อม Modified acid-fast (Kinyoun) — oocyst ติดสี ชมพู-แดง บนพื้นฟ้า/เขียว','กลม ขนาดเล็ก 4–6 µm (ขนาดใกล้เคียง yeast)','ติดสีไม่สม่ำเสมอ บางตัวเห็น sporozoite รูปจันทร์เสี้ยวภายใน'],
  diff:'Yeast (ติดสีฟ้า ไม่ติดกรด) · Cyclospora (ใหญ่กว่า 8–10 µm ติดสีหลากหลาย เรืองแสง UV) · Cystoisospora (รีใหญ่ 20–30 µm)',
  sig:'ท้องเสียรุนแรงเรื้อรังในผู้ป่วย HIV/AIDS, ระบาดทางน้ำ (ทนคลอรีน)',
  draw(){ let s=scatter(100,100,92,92,30,(x,y)=>P(blob(x,y,r(2,6),r(1.5,4),0.4,6,r(0,180)),'#6E9DB0','none',0,'opacity=".5"'));
    placer(7,24,[],70).forEach((p,i)=>{ const col = i===5?'#F2C6D3':'#D0386A'; s+=C(p[0],p[1],23,col,'#9E1F48',0.8)+ (i%2? P(`M${p[0]-9} ${p[1]-5}q9 -9 18 0`,'none','#8C1A40',2.4)+P(`M${p[0]-8} ${p[1]+6}q8 7 16 0`,'none','#8C1A40',2.4) : ''); });
    placer(3,20,[],90).forEach(p=>s+=E(p[0],p[1],20,15,r(0,180),'#4F83AE','#2E5D86',0.6,'opacity=".6"'));
    return s; } });
})();
/* ---------- กลุ่ม: ตะกอนปัสสาวะ (Urine sediment — unstained, brightfield) ---------- */
(function(){
const {C,E,P,L,G,T,blob,scatter,polar,smooth,openPath,along,curve,poly,grad,placer,refr,r,ri,TAU,shade} = window.__ATLAS_H;
const add = o => window.__ATLAS_CORE.ITEMS.push(Object.assign({g:'urine', stain:'wet'}, o));
const OUT = '#6F7368';
const bgDots = n => scatter(100,100,94,94,n||20,(x,y)=>C(x,y,r(0.5,1.3),'#A7A99E',null,0,'opacity=".6"'));
function urbc(x,y,rr){ return C(x,y,rr,'#EADBC0','#9C8F72',0.9) + C(x,y,rr*0.55,'none','#C0B08F',0.7); }
function uwbc(x,y,rr){ return P(blob(x,y,rr,rr*0.96,0.05,10),'#E3E2D8',OUT,0.9) + scatter(x,y,rr*0.8,rr*0.8,40,(a,b)=>C(a,b,r(0.5,1),'#8F9185',null,0,'opacity=".7"')) +
  [[-0.35,-0.2],[0.25,-0.3],[0.1,0.3]].map(p=>C(x+p[0]*rr,y+p[1]*rr,rr*0.26,'none','#7D8076',0.9)).join(''); }
/* cast outline: capsule from x1..x2 with width w (local coords), gentle curve */
function castPath(len,w,bend){ const pts=curve(t=>[-len/2+t*len, Math.sin(t*Math.PI)*(bend||0)],20);
  const top=pts.map(p=>[p[0],p[1]-w/2]), bot=pts.map(p=>[p[0],p[1]+w/2]).reverse();
  return smooth(top,false)+`A${w/2} ${w/2} 0 0 1 ${f1(bot[0][0])} ${f1(bot[0][1])}`+smooth(bot,false).replace(/^M[^C]+/,'')+`A${w/2} ${w/2} 0 0 1 ${f1(top[0][0])} ${f1(top[0][1])}Z`; }
const f1 = n => Math.round(n*10)/10;
function cast(inner, o){ o=o||{}; const d=castPath(o.len||150,o.w||30,o.bend||6);
  return G(100,100,o.rot==null?r(-25,25):o.rot,1, P(d,o.fill||'#EDEEE7',o.st||'#9A9D90',o.sw||0.9) + `<clipPath id="cc${o.id}"><path d="${d}"/></clipPath><g clip-path="url(#cc${o.id})">${inner||''}</g>`); }

add({ id:'u_rbc', en:'RBCs in urine', th:'เม็ดเลือดแดงในปัสสาวะ (isomorphic)', um:4.5, size:'6–8 µm',
  key:['จานกลมเล็ก ขอบเรียบ สีเหลืองอ่อน ไม่มีนิวเคลียส','เห็นขอบ 2 ชั้นจากรูปทรงเว้าสองด้าน (biconcave)','ปัสสาวะเข้มข้นเซลล์ย่นหยัก (crenated); ปัสสาวะเจือจาง/ด่างเซลล์พองแตกเหลือ ghost cell','สลายด้วย 2% acetic acid'],
  diff:'Yeast (รูปรี มี budding ไม่สลายด้วยกรด) · Oil droplet (ขนาดต่าง ๆ refractile มาก) · Calcium oxalate monohydrate',
  sig:'ปกติ 0–2 /HPF — รายงานเป็น cells/HPF',
  draw(){ let s=bgDots(); placer(14,17,[],88).forEach((p,i)=>{ s+= i%5===4 ? P(polar(p[0],p[1],a=>13+1.6*Math.pow(Math.abs(Math.cos(a*7)),5),140),'#E4D1AE','#9C8F72',0.9) : i%7===6 ? C(p[0],p[1],16,'#F1ECDF','#C9C0A8',0.6) : urbc(p[0],p[1],15); }); return s; } });

add({ id:'u_dysm', en:'Dysmorphic RBCs (G1 cells / acanthocytes)', th:'เม็ดเลือดแดงรูปร่างผิดปกติ (Dysmorphic RBC)', um:5, size:'4–8 µm',
  key:['RBC ขนาดและรูปร่างไม่เท่ากัน','G1 cell / acanthocyte = RBC รูปวงแหวนที่มีตุ่ม (bleb) ยื่นออก 1 อันหรือมากกว่า (คล้ายหูมิกกี้เมาส์)','ดูได้ดีด้วย phase contrast'],
  diff:'Crenated RBC (หนามสม่ำเสมอรอบเซลล์ จากปัสสาวะเข้มข้น) · Yeast',
  sig:'G1 cell ≥ 5% หรือ dysmorphic > 40–80% → hematuria จาก glomerulus (glomerulonephritis) — รายงานร่วมกับ RBC cast/โปรตีน',
  draw(){ let s=bgDots(); placer(9,20,[],80).forEach((p,i)=>{ const x=p[0], y=p[1];
      if(i<5){ const nb=ri(1,3); s+=C(x,y,13,'#EADBC0','#9C8F72',1.1)+C(x,y,8,'#F2EBDB','#B0A385',0.8); for(let k=0;k<nb;k++){ const a=r(0,TAU); s+=C(x+Math.cos(a)*15,y+Math.sin(a)*15,4.2,'#EADBC0','#9C8F72',1); } }
      else s+=P(blob(x,y,r(9,14),r(7,12),0.35,7),'#EADBC0','#9C8F72',0.9); }); return s; } });

add({ id:'u_wbc', en:'WBCs (pus cells)', th:'เม็ดเลือดขาวในปัสสาวะ', um:4.5, size:'10–12 µm',
  key:['ใหญ่กว่า RBC ~1.5–2 เท่า กลม มีเม็ดเล็ก ๆ (granular) ภายใน','เห็นนิวเคลียสหลายพู (ชัดขึ้นเมื่อหยด acetic acid)','ในปัสสาวะเจือจาง เม็ดภายในเคลื่อนที่แบบ Brownian = “glitter cell”','อาจจับกันเป็นกลุ่ม (clumps) ในการติดเชื้อ'],
  diff:'Renal tubular epithelial cell (นิวเคลียสกลมเดียว ใหญ่) · Trichomonas (มี flagella เคลื่อนที่)',
  sig:'ปกติ 0–5 /HPF — pyuria: UTI, interstitial nephritis; WBC clumps สนับสนุนการติดเชื้อ',
  draw(){ let s=bgDots(); placer(8,26,[],80).forEach(p=>s+=uwbc(p[0],p[1],24)); return s; } });

add({ id:'u_sq', en:'Squamous epithelial cell', th:'เซลล์เยื่อบุชนิด Squamous', um:1.9, size:'30–50 µm',
  key:['เซลล์ใหญ่ที่สุดในตะกอน แบน รูปหลายเหลี่ยมไม่สม่ำเสมอ','นิวเคลียสกลมเล็ก อยู่กลางเซลล์ (ขนาดประมาณ RBC)','ขอบเซลล์อาจม้วนพับ'],
  diff:'Clue cell (ขอบถูกบดบังด้วยแบคทีเรีย) · Transitional cell (เล็กกว่า นิวเคลียสใหญ่กว่า)',
  sig:'มาจากท่อปัสสาวะส่วนปลาย/ช่องคลอด — จำนวนมาก = เก็บตัวอย่างปนเปื้อน (ไม่ใช่ clean-catch midstream)',
  draw(){ let s=bgDots(10); [[82,86,52,0],[138,138,40,40]].forEach(([x,y,rr,rot])=>{ s+=P(blob(x,y,rr,rr*0.8,0.18,7,rot),'#EEEEE8',OUT,1)+C(x+r(-4,4),y+r(-4,4),6,'#D2D3C8','#7D8076',0.9)+scatter(x,y,rr*0.6,rr*0.5,20,(a,b)=>C(a,b,0.6,'#A7A99E')); });
    return s + P(`M40 60Q52 50 64 58`,'none','#8E9186',1.2); } });

add({ id:'u_trans', en:'Transitional (urothelial) epithelial cells', th:'เซลล์เยื่อบุชนิด Transitional (Urothelial)', um:3, size:'20–40 µm',
  key:['กลม/รูปลูกแพร์/มีหาง (caudate)','นิวเคลียสกลม อยู่กลางเซลล์ ชัดเจน อาจมี 2 นิวเคลียส','ไซโทพลาซึมเป็นเม็ดละเอียด ขอบชัด'],
  diff:'Renal tubular epithelial cell (เล็กกว่า นิวเคลียสเยื้อง) · Squamous (แบน ใหญ่กว่ามาก)',
  sig:'มาจากกรวยไต–กระเพาะปัสสาวะ; จำนวนมาก/เป็นแผ่นหลังการสวนหรือมีรูปร่างผิดปกติ → พิจารณาส่งตรวจเซลล์วิทยา',
  draw(){ let s=bgDots(); s+=P(blob(72,82,34,32,0.06,10),'#E9E8DE',OUT,1)+C(72,82,10,'#D4D4C8','#6F7368',1)+scatter(72,82,26,24,30,(a,b)=>C(a,b,0.6,'#9A9C90'));
    s+=P('M112 120C112 96 150 92 160 112C166 126 156 146 138 148L108 172C112 158 112 140 112 120Z','#E9E8DE',OUT,1)+C(136,122,10,'#D4D4C8','#6F7368',1)+scatter(136,124,16,16,20,(a,b)=>C(a,b,0.6,'#9A9C90'));
    return s; } });

add({ id:'u_rte', en:'Renal tubular epithelial (RTE) cells', th:'เซลล์เยื่อบุท่อไต (RTE)', um:4.5, size:'12–20 µm',
  key:['รูปหลายเหลี่ยม/ลูกบาศก์/สี่เหลี่ยมผืนผ้า (columnar)','นิวเคลียสกลมใหญ่ มักอยู่เยื้องศูนย์ (eccentric)','ไซโทพลาซึมเป็นเม็ดหยาบ'],
  diff:'WBC (นิวเคลียสหลายพู กลม) · Transitional cell (ใหญ่กว่า นิวเคลียสกลาง)',
  sig:'> 2 /HPF ถือว่าผิดปกติ — Acute tubular necrosis (ATN), พิษต่อไต, การปฏิเสธไตปลูกถ่าย',
  draw(){ let s=bgDots(); placer(5,32,[],66).forEach(p=>{ const a=r(0,180); s+=P(blob(p[0],p[1],30,24,0.1,6,a),'#E7E4D6',OUT,1)+scatter(p[0],p[1],24,18,40,(x,y)=>C(x,y,r(0.6,1.2),'#8F9185'),a)+C(p[0]+r(-10,10),p[1]+r(-6,6),10,'#D0CEBE','#6F7368',1); }); return s; } });

add({ id:'u_ofb', en:'Oval fat body', th:'Oval fat body', um:4.5, size:'15–30 µm',
  key:['RTE cell หรือ macrophage ที่เต็มไปด้วยหยดไขมันกลม ใส สะท้อนแสงมาก (highly refractile)','ใต้ polarized light หยดไขมันคอเลสเตอรอลเห็นเป็น “Maltese cross”','ย้อม Sudan III/Oil Red O ติดสีส้มแดง (triglyceride)'],
  diff:'Yeast / RBC ซ้อนกัน · เซลล์ที่มี granule หยาบ',
  sig:'Nephrotic syndrome (lipiduria) — พบร่วมกับ fatty cast และโปรตีนในปัสสาวะสูง',
  draw(){ let s=bgDots(); s+=P(blob(96,100,40,34,0.1,10),'#E8E6D8',OUT,1);
    s+=scatter(96,100,32,26,28,(x,y)=>{ const rr=r(2.5,6); return C(x,y,rr,'#F9F8EE','#5D6058',1.1)+C(x-rr*0.3,y-rr*0.3,rr*0.35,'#fff'); });
    [[156,56],[150,150],[44,158]].forEach(([x,y])=>s+=C(x,y,5,'#F9F8EE','#5D6058',1.1)+C(x-1.5,y-1.5,1.8,'#fff'));
    return s; } });

add({ id:'c_hyal', en:'Hyaline cast', th:'Hyaline cast', um:1.4, size:'กว้าง 10–30 µm',
  key:['โปร่งใส ไม่มีสี ขอบจาง ดัชนีหักเหต่ำ — ต้องหรี่แสง/ลด condenser','ด้านข้างขนาน ปลายมน (อาจเรียวปลายหนึ่ง)','ประกอบด้วย Tamm-Horsfall protein (uromodulin) ล้วน'],
  diff:'Mucus thread (ยาวบิดเป็นริบบิ้น ขอบไม่ชัด ปลายไม่มน) · Cylindroid',
  sig:'0–2 /LPF ถือว่าปกติ — เพิ่มหลังออกกำลังกาย, ขาดน้ำ, ไข้, ใช้ยาขับปัสสาวะ',
  draw(){ return bgDots(12) + cast('', {id:'h', fill:'#EDEEE8', st:'#B4B7AA', sw:0.8, len:168, w:24}); } });

add({ id:'c_gran', en:'Granular cast', th:'Granular cast', um:1.4, size:'กว้าง 10–30 µm',
  key:['cast ที่มีเม็ดละเอียด (fine) หรือเม็ดหยาบ (coarse) กระจายในเนื้อ','เม็ดมาจากเซลล์ท่อไตที่สลาย/โปรตีนรวมตัว','“Muddy brown granular cast” สีน้ำตาลเข้มจำนวนมาก'],
  diff:'Cellular cast (เห็นเซลล์ทั้งเซลล์) · กลุ่มผลึก amorphous บน mucus',
  sig:'บ่งชี้โรคของเนื้อไต — muddy brown cast = Acute tubular necrosis',
  draw(){ return bgDots(10) + cast(scatter(0,4,78,12,150,(x,y)=>C(x,y,r(0.8,2.2),'#7E7461',null,0,'opacity=".8"')), {id:'g', fill:'#E3DDCB', st:'#8C8674', len:168, w:28}); } });

add({ id:'c_rbc', en:'RBC cast', th:'RBC cast', um:2.2, size:'กว้าง 15–30 µm', crit:true,
  key:['cast ที่มี RBC ฝังอยู่ในเนื้อ (เห็นขอบเซลล์กลม) หรือเป็นเนื้อสีส้ม-แดงของ Hb (hemoglobin/blood cast)','สีเหลืองส้ม–น้ำตาลแดง','ต้องตรวจยืนยันให้เห็นเซลล์ในเมทริกซ์ของ cast'],
  diff:'RBC ที่เกาะบน mucus/hyaline cast โดยบังเอิญ · Granular cast สีน้ำตาล',
  sig:'⚠ บ่งชี้ Glomerulonephritis (เลือดออกจาก glomerulus) — ควรแจ้งแพทย์/รายงานให้ชัดเจน',
  draw(){ let inn=''; for(let i=-64;i<=64;i+=11) for(const y of [-7,5]) inn+=C(i+r(-3,3),y+r(-2,2)+3,6,'#E2A96F','#A5652F',0.8);
    return bgDots(10) + cast(inn,{id:'r', fill:'#EBC79A', st:'#A5703C', len:160, w:32}) + [[40,54],[162,150]].map(p=>C(p[0],p[1],6.5,'#EADBC0','#9C8F72',0.9)).join(''); } });

add({ id:'c_wbc', en:'WBC cast', th:'WBC cast', um:2.2, size:'กว้าง 15–30 µm',
  key:['cast ที่มีเม็ดเลือดขาว (กลม มี granule นิวเคลียสหลายพู) ฝังในเนื้อ','ต้องแยกจาก RTE cast (นิวเคลียสกลมเดียว)','มักพบร่วมกับ WBC และแบคทีเรียจำนวนมาก'],
  diff:'RTE cast · WBC clump (ไม่มีเมทริกซ์ของ cast และขอบขนาน)',
  sig:'การอักเสบ/ติดเชื้อในเนื้อไต — Acute pyelonephritis, Interstitial nephritis (แยกจาก UTI ส่วนล่าง)',
  draw(){ let inn=''; for(let i=-60;i<=60;i+=19) inn+=uwbc(i+r(-2,2),r(-3,3)+3,10.5);
    return bgDots(10) + cast(inn,{id:'w', fill:'#E9E8DF', st:'#8C8F82', len:162, w:34}); } });

add({ id:'c_waxy', en:'Waxy cast', th:'Waxy cast', um:1.5, size:'กว้างได้ถึง > 50 µm (broad)',
  key:['หักเหแสงสูง (highly refractile) ดูเหมือนขี้ผึ้ง/แก้ว สีเทา-เหลืองอ่อน','ขอบคมชัด มีรอยแตก/รอยบากตามขอบ (cracks, notches)','ปลายทู่ ตัดตรงเหมือนหัก (blunt/broken ends)'],
  diff:'Hyaline cast (ขอบจาง ปลายมน ไม่มีรอยแตก) · Fibers / สิ่งปนเปื้อน',
  sig:'ภาวะปัสสาวะไหลช้าในท่อไตนาน (urine stasis) — Chronic renal failure; broad waxy cast = “renal failure cast”',
  draw(){ const d='M-78 -14L70 -18L78 -8L74 16L-74 18L-80 4Z'; let cr='';
    [-50,-12,24,52].forEach(x=>cr+=L(x,-16,x+3,-8,'#6E6852',1.1)); [-34,6,40].forEach(x=>cr+=L(x,17,x-3,9,'#6E6852',1.1));
    return bgDots(10) + G(100,100,r(-20,20),1, P(d,'#DAD4BC','#5F5A45',2.2)+P('M-72 -10L66 -13','none','#F6F3E6',1.4,'opacity=".8"')+cr); } });

add({ id:'c_fat', en:'Fatty cast', th:'Fatty cast', um:2, size:'กว้าง 15–30 µm',
  key:['cast ที่มีหยดไขมันกลม ใส สะท้อนแสง ขนาดต่าง ๆ ฝังอยู่','Maltese cross ใต้ polarized light (cholesterol ester)','อาจมี oval fat body อยู่ในเนื้อ cast'],
  diff:'RBC cast (เซลล์ขนาดเท่ากัน สีส้ม) · Granular cast',
  sig:'Nephrotic syndrome — พบร่วมกับ oval fat body, proteinuria สูง',
  draw(){ let inn=''; for(let i=0;i<22;i++){ const x=r(-70,70), y=r(-9,12), rr=r(2.5,6.5); inn+=C(x,y,rr,'#FBFAF1','#4F534B',1.1)+C(x-rr*0.3,y-rr*0.3,rr*0.35,'#fff'); }
    return bgDots(10) + cast(inn,{id:'f', fill:'#E8E7DC', st:'#8C8F82', len:160, w:32}); } });

/* crystals */
function envelope(x,y,s,rot){ const h=s/2; return G(x,y,rot,1,P(`M${-h} ${-h}H${h}V${h}H${-h}Z`,'rgba(255,255,255,.45)','#5E635A',1.1)+L(-h,-h,h,h,'#5E635A',0.8)+L(h,-h,-h,h,'#5E635A',0.8)); }
add({ id:'x_caox', en:'Calcium oxalate dihydrate crystals', th:'ผลึก Calcium oxalate dihydrate (ซองจดหมาย)', um:6, size:'5–30 µm',
  key:['ไม่มีสี รูปแปดหน้า (octahedral) มองเห็นเป็นสี่เหลี่ยมมีเส้นทแยงเป็นรูป X = “ซองจดหมาย” (envelope)','ขนาดแตกต่างกันมาก','พบในปัสสาวะกรด–เป็นกลาง'],
  diff:'Calcium oxalate monohydrate (รูปไข่/ดัมเบล/รั้ว) · Cystine (หกเหลี่ยม)',
  sig:'พบได้ในคนปกติ (กินผักโขม ชา ช็อกโกแลต) — จำนวนมากร่วมกับนิ่วไต',
  draw(){ let s=bgDots(); placer(10,()=>r(4,16),[],84).forEach(p=>s+=envelope(p[0],p[1],p[2]*1.25,r(-30,30))); return s; } });

add({ id:'x_caoxm', en:'Calcium oxalate monohydrate crystals', th:'ผลึก Calcium oxalate monohydrate', um:6, size:'3–20 µm',
  key:['ไม่มีสี รูปไข่ (ovoid) รูปดัมเบล (dumbbell) หรือแท่งคล้ายรั้ว (picket fence)','หักเหแสงสองทาง (birefringent) ใต้ polarized light','อาจถูกเข้าใจผิดเป็น RBC'],
  diff:'RBC (สลายด้วย acetic acid) · Calcium carbonate (dumbbell เล็ก ละลายในกรดมีฟองก๊าซ)',
  sig:'⚠ จำนวนมาก + อาการทางระบบประสาท/ไตวาย → คิดถึงพิษ Ethylene glycol',
  draw(){ let s=bgDots(); placer(10,12,[],82).forEach((p,i)=>{ const rot=r(0,180);
      s += i%3===0 ? G(p[0],p[1],rot,1,P('M-12 -5C-4 -9 4 -9 12 -5C16 0 16 0 12 5C4 9 -4 9 -12 5C-16 0 -16 0 -12 -5Z','rgba(255,255,255,.45)','#5E635A',1)+P('M-4 -6C-2 0 -2 0 -4 6M4 -6C2 0 2 0 4 6','none','#5E635A',0.7))
        : i%3===1 ? E(p[0],p[1],9,6,rot,'rgba(255,255,255,.45)','#5E635A',1)+E(p[0],p[1],4,2.4,rot,'none','#8D9187',0.6)
        : G(p[0],p[1],rot,1,P('M-11 -3H11V3H-11Z','rgba(255,255,255,.45)','#5E635A',1)); }); return s; } });

add({ id:'x_uric', en:'Uric acid crystals', th:'ผลึก Uric acid', um:5, size:'5–50 µm',
  key:['สีเหลือง–น้ำตาลแดง (สีเข้มขึ้นตามความหนา)','รูปขนมเปียกปูน (rhombic) / หินลับมีด (whetstone) / ดอกกุหลาบ (rosette) ของแผ่นซ้อนกัน','พบในปัสสาวะกรด (pH < 5.8); birefringence สูงหลายสี'],
  diff:'Cystine (ไม่มีสี หกเหลี่ยม) · Amorphous urate',
  sig:'Gout, Tumor lysis syndrome, หลังเคมีบำบัด (cell turnover สูง); ปกติได้ในปัสสาวะกรดเย็น',
  draw(){ const rh=(x,y,s,rot,c)=>G(x,y,rot,1,P(`M${-s} 0L${-s*0.25} ${-s*0.55}L${s} 0L${s*0.25} ${s*0.55}Z`,c,'#8A5A12',1));
    let s=bgDots(); placer(6,18,[[100,100,40]],84).forEach(p=>s+=rh(p[0],p[1],r(12,20),r(0,180),pick2()));
    for(let k=0;k<6;k++) s+=rh(100,100,24,k*30,k%2?'#E2B24A':'#D39A2E');
    return s; } });
function pick2(){ return ['#E7BE58','#D8A23A','#EFCB6E'][ri(0,2)]; }

add({ id:'x_amorph', en:'Amorphous urates / phosphates', th:'ผลึกไม่มีรูปร่าง (Amorphous)', um:6, size:'เม็ดละเอียดมาก',
  key:['เม็ดเล็กละเอียดไม่มีรูปร่างแน่นอน จับเป็นกลุ่ม','Amorphous urate: ปัสสาวะกรด สีเหลือง-น้ำตาล (ตะกอนสีชมพู “brick dust”) ละลายเมื่ออุ่น 60 °C','Amorphous phosphate: ปัสสาวะด่าง ไม่มีสี (ตะกอนขาว) ละลายในกรดอะซิติก'],
  diff:'แบคทีเรีย (รูปแท่งสม่ำเสมอ เคลื่อนที่) · Granular cast',
  sig:'ไม่มีความสำคัญทางคลินิก แต่บดบังสิ่งอื่นได้ — ใช้วิธีอุ่น/หยดกรดเพื่อให้อ่านตะกอนได้',
  draw(){ let s=bgDots(10); [[70,76,38],[134,128,34],[62,144,22]].forEach(([x,y,rr])=>s+=scatter(x,y,rr,rr*0.8,260,(a,b)=>C(a,b,r(0.5,1.3),'#B8904A',null,0,'opacity=".8"')));
    return s + uwbc(142,62,15); } });

add({ id:'x_triple', en:'Triple phosphate (struvite) crystals', th:'ผลึก Triple phosphate (ฝาโลงศพ)', um:3.5, size:'10–100 µm',
  key:['ไม่มีสี รูปปริซึม 3–6 ด้าน คล้าย “ฝาโลงศพ” (coffin lid)','บางครั้งเป็นรูปขนนก/เฟิร์น (ขณะละลาย)','พบในปัสสาวะด่าง ละลายในกรดอะซิติก'],
  diff:'Cholesterol (แผ่นบางมีมุมบาก) · Calcium oxalate',
  sig:'ปัสสาวะด่างจากการติดเชื้อแบคทีเรียที่สร้าง urease (Proteus, Klebsiella) — นิ่ว staghorn; ปัสสาวะทิ้งไว้นานก็พบได้',
  draw(){ const coffin=(x,y,Lx,Hy,rot)=>{ const b=Lx*0.28; return G(x,y,rot,1,P(`M${-Lx} 0L${-Lx+b} ${-Hy}L${Lx-b} ${-Hy}L${Lx} 0L${Lx-b} ${Hy}L${-Lx+b} ${Hy}Z`,'rgba(255,255,255,.5)','#555A52',1.2)+L(-Lx+b*1.2,0,Lx-b*1.2,0,'#6D7269',0.9)+L(-Lx,0,-Lx+b*1.2,0,'#6D7269',0.8)+L(Lx,0,Lx-b*1.2,0,'#6D7269',0.8)+L(-Lx+b,-Hy,-Lx+b*1.2,0,'#6D7269',0.7)+L(Lx-b,-Hy,Lx-b*1.2,0,'#6D7269',0.7)+L(-Lx+b,Hy,-Lx+b*1.2,0,'#6D7269',0.7)+L(Lx-b,Hy,Lx-b*1.2,0,'#6D7269',0.7)); };
    return bgDots() + coffin(92,90,46,20,-18) + coffin(146,146,24,10,40) + coffin(52,150,18,8,70); } });

add({ id:'x_biurate', en:'Ammonium biurate crystals', th:'ผลึก Ammonium biurate (ผลลำโพง)', um:5, size:'10–40 µm',
  key:['ทรงกลม สีเหลือง-น้ำตาล มีหนามแหลมยื่นออก “thorny apple”','อาจพบเป็นทรงกลมไม่มีหนาม','พบในปัสสาวะด่าง หรือตัวอย่างเก่าที่ทิ้งไว้นาน'],
  diff:'Leucine (ทรงกลมลายวงปี ไม่มีหนาม) · Sulfonamide crystal',
  sig:'มักไม่มีความสำคัญ (ตัวอย่างเก่า) — ละลายเมื่ออุ่น 60 °C หรือเติมกรดอะซิติกแล้วกลายเป็น uric acid',
  draw(){ const ap=(x,y,rr)=>{ let s=''; const n=ri(5,8); for(let i=0;i<n;i++){ const a=r(0,TAU); s+=P(`M${x+Math.cos(a-0.2)*rr} ${y+Math.sin(a-0.2)*rr}Q${x+Math.cos(a)*(rr+10)} ${y+Math.sin(a)*(rr+10)} ${x+Math.cos(a+0.25)*(rr+14)} ${y+Math.sin(a+0.25)*(rr+14)}L${x+Math.cos(a+0.2)*rr} ${y+Math.sin(a+0.2)*rr}Z`,'#C08A34','#7C5214',0.8); }
      return s + C(x,y,rr,grad2(),'#7C5214',1.1); };
    return bgDots() + ap(90,92,24) + ap(146,140,15) + ap(52,146,11); } });
let g2=null; function grad2(){ return grad([[0,'#E9C27A'],[1,'#B77F2A']]); }

add({ id:'x_cystine', en:'Cystine crystals', th:'ผลึก Cystine (หกเหลี่ยม)', um:3.5, size:'30–60 µm',
  key:['ไม่มีสี แผ่นหกเหลี่ยมด้านเท่า (hexagonal plates) หนา','อาจซ้อนกันเป็นชั้น ๆ','พบในปัสสาวะกรด; cyanide–nitroprusside test ให้ผลบวก'],
  diff:'Uric acid ที่เป็นแผ่นหกเหลี่ยม (มีสี, birefringence สูง) · Calcium oxalate',
  sig:'⚠ ผลึกผิดปกติ (pathological) — Cystinuria (โรคทางพันธุกรรม นิ่วไตซ้ำ ๆ) ควรรายงาน',
  draw(){ const hex=(x,y,s,rot)=>G(x,y,rot,1,P(poly([0,1,2,3,4,5].map(k=>[Math.cos(k*Math.PI/3)*s,Math.sin(k*Math.PI/3)*s])),'rgba(255,255,255,.5)','#555A52',1.3));
    return bgDots() + hex(92,94,40,8) + hex(112,110,32,20) + hex(150,150,18,-6) + hex(50,150,14,30); } });

add({ id:'x_chol', en:'Cholesterol crystals', th:'ผลึก Cholesterol', um:1.4, size:'50–100+ µm',
  key:['แผ่นบางใสขนาดใหญ่ รูปสี่เหลี่ยมผืนผ้า มีมุมใดมุมหนึ่งบากหาย (notched corner)','มักซ้อนกันเป็นขั้นบันได','พบร่วมกับไขมันอื่น ๆ; ต้องแยกจากสิ่งปนเปื้อน (เศษแก้ว)'],
  diff:'Radiographic contrast media (แผ่นยาวแหลม, SG สูงมาก > 1.040) · เศษกระจก',
  sig:'Nephrotic syndrome, ภาวะ lipiduria; เก็บตัวอย่างในตู้เย็นนานอาจพบได้',
  draw(){ const pl=(x,y,w,h,rot)=>G(x,y,rot,1,P(`M${-w/2} ${-h/2}H${w/2-12}L${w/2-12} ${-h/2+10}L${w/2} ${-h/2+10}V${h/2}H${-w/2}Z`,'rgba(255,255,255,.4)','#5E635A',1.1));
    return bgDots() + pl(86,84,88,62,-8) + pl(118,120,80,58,-8) + pl(62,150,40,26,20); } });

add({ id:'x_tyr', en:'Tyrosine & Leucine crystals', th:'ผลึก Tyrosine และ Leucine', um:4, size:'Tyrosine เข็ม · Leucine 10–30 µm',
  key:['Tyrosine: เข็มละเอียดไม่มีสี-เหลือง จับเป็นมัด/ดอก (sheaves, rosettes)','Leucine: ทรงกลมสีเหลืองน้ำตาล มีวงซ้อน (concentric) และลายรัศมี คล้ายวงปีไม้','พบในปัสสาวะกรด; มักพบร่วมกับ bilirubin crystal'],
  diff:'Ammonium biurate (มีหนาม) · Oil droplets',
  sig:'⚠ ผลึกผิดปกติ — โรคตับรุนแรง (liver failure), Tyrosinemia / Maple syrup urine disease',
  draw(){ let s=bgDots(); const sheaf=(x,y,rot)=>{ let t=''; for(let i=-6;i<=6;i++){ t+=L(0,0,Math.cos(i*0.06)*28,Math.sin(i*0.06)*28,'#B79A45',0.7)+L(0,0,-Math.cos(i*0.06)*28,-Math.sin(i*0.06)*28,'#B79A45',0.7); } return G(x,y,rot,1,t); };
    s+=sheaf(64,70,30)+sheaf(80,132,-40);
    const leu=(x,y,rr)=>{ let t=C(x,y,rr,'#D9B055','#80581A',1.2); for(let k=0.35;k<1;k+=0.22) t+=C(x,y,rr*k,'none','#8E6420',0.8); for(let a=0;a<TAU;a+=0.45) t+=L(x,y,x+Math.cos(a)*rr,y+Math.sin(a)*rr,'#9A6E28',0.4); return t; };
    return s + leu(138,86,22) + leu(146,140,14); } });

/* organisms */
add({ id:'u_yeast', en:'Yeast in urine (budding ± pseudohyphae)', th:'ยีสต์ในปัสสาวะ', um:5, size:'3–8 µm',
  key:['รูปไข่ ขนาดไม่เท่ากัน ไม่มีสี หักเหแสง','มีการแตกหน่อ (budding) — ลักษณะสำคัญที่ใช้แยกจาก RBC','อาจเห็น pseudohyphae (สายยาวมีรอยคอด)','ไม่สลายด้วย acetic acid'],
  diff:'RBC (กลมเท่ากัน สลายด้วยกรด) · Calcium oxalate monohydrate · Oil droplet',
  sig:'Candida UTI (เบาหวาน, ใส่สายสวน, ได้ยาปฏิชีวนะ) หรือปนเปื้อนจากช่องคลอด',
  draw(){ let s=bgDots(); const y=(x,yy,rr,rot,bud)=>E(x,yy,rr,rr*0.75,rot,'#EDEFE3','#5C6258',1)+(bud?E(x+Math.cos(rot*Math.PI/180)*rr*1.45,yy+Math.sin(rot*Math.PI/180)*rr*1.45,rr*0.55,rr*0.42,rot,'#EDEFE3','#5C6258',1):'');
    placer(11,11,[[120,120,34]],84).forEach((p,i)=>s+=y(p[0],p[1],r(8,12),r(0,180),i%2===0));
    let x=84, yy=138, a=-20; for(let k=0;k<5;k++){ const nx=x+Math.cos(a*Math.PI/180)*20, ny=yy+Math.sin(a*Math.PI/180)*20; s+=E((x+nx)/2,(yy+ny)/2,11,5,a,'#EDEFE3','#5C6258',1); x=nx; yy=ny; a+=r(-20,15); }
    return s; } });

add({ id:'u_bact', en:'Bacteria in urine', th:'แบคทีเรียในปัสสาวะ', um:8, size:'rods 0.5–1 × 1–3 µm',
  key:['แท่งเล็ก ๆ (rods) หรือกลม (cocci) จำนวนมาก สม่ำเสมอ','เห็นการเคลื่อนที่ (motility) ในตัวอย่างสด','รายงานเป็น few / moderate / many /HPF'],
  diff:'Amorphous crystals (ไม่สม่ำเสมอ ไม่เคลื่อนที่ ละลายด้วยกรด/ความร้อน)',
  sig:'ร่วมกับ WBC/nitrite + → UTI; ถ้าไม่มี WBC และตัวอย่างทิ้งไว้นาน = การเจริญเติบโตหลังเก็บ (ต้องตรวจภายใน 2 ชม.)',
  draw(){ let s=scatter(100,100,92,92,160,(x,y)=>{ const a=r(0,180); return E(x,y,r(4,7),2.1,a,'#D7D9CE','#5C6258',0.8); });
    return s + uwbc(74,82,38) + uwbc(142,138,38); } });

add({ id:'tricho', en:'Trichomonas vaginalis', th:'Trichomonas vaginalis', um:6, size:'7–30 µm (ส่วนใหญ่ 10–15)',
  key:['รูปลูกแพร์/หยดน้ำ ใหญ่กว่า WBC เล็กน้อย','flagella 4 เส้นยื่นด้านหน้า + undulating membrane ยาวครึ่งตัว','axostyle ยื่นออกทางด้านท้าย','เคลื่อนที่แบบกระตุก หมุน (jerky) — ต้องตรวจตัวอย่างสดทันที; ตัวที่ตายแล้วคล้าย WBC'],
  diff:'WBC (กลม ไม่มี flagella ไม่เคลื่อนที่แบบกระตุก) · RTE cell',
  sig:'Trichomoniasis — โรคติดต่อทางเพศสัมพันธ์ (รักษาคู่นอนด้วย)',
  draw(){ const body='M0 -34C22 -34 30 -10 24 10C18 26 6 34 0 38C-6 34 -18 26 -24 10C-30 -10 -22 -34 0 -34Z';
    let fl=''; [-10,-4,3,9].forEach((x,i)=>fl+=P(`M${x} -32C${x-8+i*3} -52 ${x+10} -58 ${x+2-i*4} -72`,'none','#5C6258',1));
    return bgDots() + uwbc(162,150,14) + uwbc(40,150,14) + G(100,104,r(-20,20),1, P(body,'#E4E6DA','#5C6258',1.1)+fl+
      P('M22 -24C30 -18 26 -10 30 -2C34 6 28 12 30 18','none','#5C6258',1.4)+E(-4,-16,7,10,0,'#D0D2C4','#6F7368',0.9)+L(0,-18,0,56,'#7D8076',1.2)+scatter(0,10,14,14,20,(x,y)=>C(x,y,0.7,'#8F9185'))); } });
})();
/* ---------- กลุ่ม: แบคทีเรีย (Gram / AFB) ---------- */
(function(){
const {C,E,P,L,G,T,blob,scatter,polar,smooth,openPath,along,curve,poly,grad,placer,r,ri,TAU,shade} = window.__ATLAS_H;
const add = o => window.__ATLAS_CORE.ITEMS.push(Object.assign({g:'bact', stain:'gram', um:8}, o));
const GP='#4A2A86', GPd='#2F1560', GN='#D24F7A', GNd='#A1305A';
const bg = n => scatter(100,100,94,94,n||16,(x,y)=>P(blob(x,y,r(2,7),r(1.5,5),0.4,6,r(0,180)),'#E9C8D5','none',0,'opacity=".6"'));
function pmn(x,y,rr,o){ o=o||{}; let s=P(blob(x,y,rr,rr*0.95,0.06,12),'#F2D3DE','#DDA6BA',0.8);
  const pts=[[-0.35,-0.1],[0.0,-0.35],[0.35,-0.05],[0.1,0.3]].map(p=>[x+p[0]*rr,y+p[1]*rr]);
  for(let i=1;i<pts.length;i++) s+=L(pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1],'#C8577F',2);
  pts.forEach(p=>s+=P(blob(p[0],p[1],rr*0.2,rr*0.16,0.15,8,r(0,180)),'#C8577F'));
  return s; }
function rod(x,y,len,w,rot,fill,st){ const h=len/2-w/2; return G(x,y,rot,1,P(`M${-h} ${-w/2}H${h}A${w/2} ${w/2} 0 0 1 ${h} ${w/2}H${-h}A${w/2} ${w/2} 0 0 1 ${-h} ${-w/2}Z`,fill,st||shade(fill,0.75),0.6)); }
function coccus(x,y,rr,fill){ return C(x,y,rr,fill,shade(fill,0.7),0.6); }

add({ id:'b_staph', en:'Gram-positive cocci in clusters (Staphylococcus)', th:'แกรมบวกรูปกลม เรียงเป็นกลุ่มคล้ายพวงองุ่น', size:'0.8–1 µm',
  key:['กลม ติดสีม่วงน้ำเงิน (Gram +)','เรียงเป็นกลุ่ม/พวงองุ่น (clusters) ปนคู่และเซลล์เดี่ยว','ขนาดสม่ำเสมอ'],
  diff:'Streptococcus (เรียงเป็นสาย) · Micrococcus (tetrad) · Gram + ที่ย้อมเกิน/ตะกอนสี',
  sig:'ทดสอบต่อด้วย catalase (+) และ coagulase → S. aureus vs CoNS; รายงาน Gram stain จาก hemoculture เป็น critical',
  draw(){ let s=bg()+pmn(150,146,40); [[70,70,14],[118,86,10],[70,132,11],[132,50,7],[40,104,6]].forEach(([x,y,n])=>{ let cx=x,cy=y; for(let i=0;i<n;i++){ s+=coccus(cx,cy,4.3,GP); const a=r(0,TAU); cx+=Math.cos(a)*7.6; cy+=Math.sin(a)*7.6; if(Math.hypot(cx-x,cy-y)>16){ cx=x+r(-6,6); cy=y+r(-6,6);} } }); return s; } });

add({ id:'b_strep', en:'Gram-positive cocci in chains (Streptococcus)', th:'แกรมบวกรูปกลม เรียงเป็นสาย', size:'0.5–1 µm',
  key:['กลม/รีเล็กน้อย ติดสีม่วง','เรียงเป็นสายยาว (chains) หรือเป็นคู่','สายยาวชัดเจนในตัวอย่างจากอาหารเลี้ยงเชื้อเหลว (hemoculture broth)'],
  diff:'Enterococcus (คู่/สายสั้น) · Staphylococcus · S. pneumoniae (คู่รูปหอก)',
  sig:'ทดสอบ catalase (−), ดู hemolysis บน blood agar → Bacitracin/Optochin/CAMP/Bile esculin',
  draw(){ let s=bg(); for(let c=0;c<5;c++){ let x=r(30,170), y=r(30,170), a=r(0,TAU); const n=ri(8,16); for(let i=0;i<n;i++){ s+=E(x,y,4.4,3.8,a*57.3+90,GP,GPd,0.6); x+=Math.cos(a)*8.2; y+=Math.sin(a)*8.2; a+=r(-0.35,0.35); } } return s; } });

add({ id:'b_pneumo', en:'Streptococcus pneumoniae (lancet diplococci)', th:'S. pneumoniae — diplococci รูปหอก', size:'0.5–1.25 µm',
  key:['Gram + เรียงเป็นคู่ ปลายด้านนอกเรียวแหลมคล้ายหัวหอก (lancet-shaped diplococci)','มักเห็นแคปซูลเป็นวงใส (halo) รอบคู่เซลล์','พบคู่กับ PMN ในเสมหะ/CSF ที่ติดเชื้อ'],
  diff:'Enterococcus (คู่รี ไม่แหลม ไม่มีแคปซูล) · Viridans strep · Neisseria (Gram −)',
  sig:'ปอดอักเสบ เยื่อหุ้มสมองอักเสบ — Optochin S, bile soluble; ใน CSF ถือเป็น critical',
  draw(){ let s=bg()+pmn(62,70,40)+pmn(140,150,36); const lan='M0 0C4 -4 8 -4 11 -1C9 3 4 4 0 0Z';
    placer(7,16,[[62,70,42],[140,150,38]],86).forEach(p=>{ const rot=r(0,180); s+=G(p[0],p[1],rot,1,E(0,0,15,9,0,'#FBF3F6','#E6CDD6',0.6)+P('M-1 0C-5 -5 -10 -4 -13 0C-10 4 -5 5 -1 0Z',GP,GPd,0.5)+P('M1 0C5 -5 10 -4 13 0C10 4 5 5 1 0Z',GP,GPd,0.5)); }); return s; } });

add({ id:'b_ngon', en:'Gram-negative intracellular diplococci (Neisseria gonorrhoeae)', th:'แกรมลบรูปเมล็ดถั่วเรียงคู่ในเซลล์ PMN', size:'0.6–1 µm',
  key:['Gram − (สีชมพูแดง) รูปเมล็ดถั่ว/ไต เรียงเป็นคู่หันด้านแบนเข้าหากัน','พบ ภายใน neutrophil (intracellular) เป็นกลุ่ม','พบนอกเซลล์ได้บ้าง'],
  diff:'Moraxella / Acinetobacter (coccobacilli อาจดูเป็นคู่) · Neisseria commensal (ในคอ/ช่องคลอด)',
  sig:'หนองท่อปัสสาวะในผู้ชาย: พบ GNID ใน PMN = presumptive gonorrhea; ในผู้หญิงต้องยืนยันด้วยการเพาะเชื้อ/NAAT; CSF → N. meningitidis',
  draw(){ let s=bg(); const pair=(x,y,rot)=>G(x,y,rot,1,P('M-0.8 -3.6A3.8 3.8 0 0 0 -0.8 3.6Z',GN,GNd,0.5)+P('M0.8 -3.6A3.8 3.8 0 0 1 0.8 3.6Z',GN,GNd,0.5));
    [[88,92,50],[152,50,30],[48,160,30]].forEach(([x,y,rr],k)=>{ s+=pmn(x,y,rr); if(k===0) placer(12,7,[],32).forEach(p=>s+=pair(p[0]-100+x+r(-4,4),p[1]-100+y,r(0,180))); });
    placer(4,6,[[88,92,52],[152,50,32],[48,160,32]],90).forEach(p=>s+=pair(p[0],p[1],r(0,180))); return s; } });

add({ id:'b_gnr', en:'Gram-negative rods (Enterobacterales)', th:'แกรมลบรูปแท่ง (เช่น E. coli, Klebsiella)', size:'0.5 × 1–3 µm',
  key:['แท่งสั้นป้อม ปลายมน ติดสีชมพูแดง (Gram −)','กระจายตัวเดี่ยว ๆ ไม่มีการเรียงเฉพาะ','Klebsiella อาจเห็นแคปซูลใส'],
  diff:'Pseudomonas (แท่งบางยาวกว่าเล็กน้อย) · Haemophilus (coccobacilli เล็ก) · Gram + ที่ decolorize เกิน',
  sig:'ต่อด้วย Oxidase, TSI, IMViC หรือ MALDI-TOF; หา ESBL/CRE ในการรายงานความไวต่อยา',
  draw(){ let s=bg()+pmn(128,130,42); placer(34,10,[[128,130,40]],92).forEach(p=>s+=rod(p[0],p[1],r(17,22),7.5,r(0,180),GN)); return s; } });

add({ id:'b_haem', en:'Gram-negative coccobacilli (Haemophilus influenzae)', th:'แกรมลบรูป coccobacilli เล็ก (Haemophilus)', size:'0.3 × 1–1.5 µm',
  key:['แท่งเล็กมาก สั้นเกือบกลม ติดสีชมพูจาง (pleomorphic coccobacilli)','ติดสีจางทำให้มองข้ามง่าย — ใช้ safranin นานขึ้น/carbol fuchsin','ใน CSF/เสมหะ พบร่วมกับ PMN'],
  diff:'Acinetobacter (coccobacilli ใหญ่กว่า เป็นคู่) · Bordetella · ตะกอนโปรตีน',
  sig:'ต้องการ X + V factor เจริญบน Chocolate agar (satellitism รอบ S. aureus บน BA)',
  draw(){ let s=bg()+pmn(110,106,46); placer(46,5,[[110,106,20]],92).forEach(p=>s+=rod(p[0],p[1],r(6,11),5,r(0,180),'#DC7A9C')); return s; } });

add({ id:'b_bps', en:'Burkholderia pseudomallei (bipolar “safety-pin”)', th:'B. pseudomallei — ติดสีสองขั้ว (safety pin)', size:'0.8 × 1.5–5 µm',
  key:['Gram − รูปแท่ง ติดสีเข้มที่สองปลาย ตรงกลางจาง (bipolar staining) คล้ายเข็มกลัดซ่อนปลาย','เห็นชัดขึ้นเมื่อย้อม Wayson/methylene blue','โคโลนีบน Ashdown agar แห้งย่น สีม่วง กลิ่นดิน; oxidase +'],
  diff:'Yersinia pestis (bipolar เช่นกัน) · Pseudomonas aeruginosa · Enterobacterales',
  sig:'⚠ Melioidosis (พบมากในอีสาน) — ดื้อ gentamicin/colistin แต่ไวต่อ amoxicillin-clavulanate; จัดการในตู้ BSC (เชื้อ BSL-3)',
  draw(){ let s=bg()+pmn(64,138,40); placer(28,10,[[64,138,40]],92).forEach(p=>{ const a=r(0,180); s+=G(p[0],p[1],a,1,rod(0,0,20,7.5,0,'#EFB3C8','#C7708F')+E(-6.4,0,3.2,3.2,0,GN)+E(6.4,0,3.2,3.2,0,GN)); }); return s; } });

add({ id:'b_vibrio', en:'Curved Gram-negative rods (Vibrio / Campylobacter)', th:'แกรมลบรูปแท่งโค้ง (Vibrio / Campylobacter)', size:'0.5 × 1.5–3 µm',
  key:['Vibrio: แท่งโค้งรูปจุลภาค (comma-shaped)','Campylobacter: โค้งเป็นรูปตัว S / ปีกนกนางนวล (gull-wing) เมื่อต่อกัน 2 ตัว','ในอุจจาระสดเคลื่อนที่เร็วมาก (darting motility)'],
  diff:'Helicobacter (เกลียว) · Enterobacterales ที่โค้งเล็กน้อย',
  sig:'V. cholerae (อหิวาตกโรค — โรคติดต่ออันตราย ต้องรายงาน) เพาะบน TCBS; Campylobacter เพาะ 42 °C microaerophilic',
  draw(){ let s=bg(); placer(24,12,[],90).forEach((p,i)=>{ const a=r(0,360); s+= i%3===2
      ? G(p[0],p[1],a,1,P('M-12 0C-10 -6 -4 -6 0 0C4 6 10 6 12 0','none',GN,3.6))
      : G(p[0],p[1],a,1,P('M-8 2C-6 -5 4 -6 8 -1','none',GN,4.2)); }); return s; } });

add({ id:'b_bacillus', en:'Large Gram-positive rods with spores (Bacillus)', th:'แกรมบวกแท่งใหญ่ มีสปอร์ (Bacillus)', size:'1 × 3–8 µm',
  key:['แท่งใหญ่ ปลายตัดเหลี่ยม เรียงต่อกันเป็นสายยาวคล้ายตู้รถไฟ (boxcar)','สปอร์รูปไข่ไม่ติดสี อยู่กลาง/ค่อนปลาย (central–subterminal) ไม่ทำให้เซลล์โป่ง','เชื้อเก่าอาจติดสี Gram-variable'],
  diff:'Clostridium (สปอร์ทำให้เซลล์โป่ง, anaerobe) · Lactobacillus (แท่งเรียวยาว)',
  sig:'ส่วนใหญ่เป็น contaminant ใน hemoculture; B. anthracis (แคปซูล, medusa head colony, ไม่เคลื่อนที่) — แจ้งทันที; B. cereus อาหารเป็นพิษ',
  draw(){ let s=bg(); [[22,52,12,5],[14,112,-4,5],[40,160,-14,4]].forEach(([x,y,a,n])=>{ const rad=a*Math.PI/180; for(let i=0;i<n;i++){ const cx=x+Math.cos(rad)*i*38, cy=y+Math.sin(rad)*i*38; s+=G(cx,cy,a,1,P('M-18 -5H18V5H-18Z',GP,GPd,0.7)+(i%2===0?E(r(-4,6),0,5,3.2,0,'#F1E9F6','#C9B6DB',0.5):'')); } }); return s; } });

add({ id:'b_clost', en:'Clostridium tetani (terminal spores, drumstick)', th:'Clostridium — สปอร์ที่ปลาย (รูปไม้ตีกลอง)', size:'0.5 × 2–5 µm',
  key:['Gram + แท่งเรียว','สปอร์กลมใหญ่อยู่ที่ปลาย (terminal) ทำให้ปลายโป่ง = drumstick / tennis racket','anaerobe — เพาะในสภาวะไร้ออกซิเจน'],
  diff:'Bacillus (สปอร์ไม่ทำให้เซลล์โป่ง, aerobe) · C. perfringens (แท่งใหญ่ปลายตัด boxcar ไม่ค่อยเห็นสปอร์, double-zone hemolysis)',
  sig:'Tetanus — วินิจฉัยทางคลินิกเป็นหลัก; C. difficile (ท้องเสียจากยาปฏิชีวนะ) ตรวจ toxin/GDH',
  draw(){ let s=bg(); placer(14,18,[],84).forEach(p=>{ s+=G(p[0],p[1],r(0,360),1,rod(-3,0,28,5,0,GP)+C(12,0,5.4,'#F1E9F6','#6E4FA6',1.2)); }); return s; } });

add({ id:'b_coryne', en:'Corynebacterium (club-shaped, Chinese letters)', th:'Corynebacterium — รูปกระบอง เรียงคล้ายอักษรจีน', size:'0.5 × 1.5–5 µm',
  key:['Gram + แท่งปลายโป่งเล็กน้อยรูปกระบอง (club-shaped) ติดสีเป็นจุด ๆ (beaded)','เรียงเป็นรั้ว (palisade) และทำมุมกันเป็นรูปตัว V/L คล้าย “อักษรจีน”','C. diphtheriae: metachromatic granules เห็นชัดด้วย Albert / Loeffler methylene blue'],
  diff:'Listeria (แท่งสั้น tumbling motility, β-hemolysis แคบ) · Propionibacterium · Actinomyces',
  sig:'ส่วนใหญ่เป็นเชื้อประจำถิ่นที่ผิวหนัง (diphtheroids); C. diphtheriae (คอตีบ) ต้องยืนยัน toxin (Elek test)',
  draw(){ let s=bg(); const club=(x,y,a)=>G(x,y,a,1,P('M-11 -2.6C-11 -4 -4 -3 11 -4C14 -4 14 4 11 4C-4 3 -11 4 -11 2.6Z',GP,GPd,0.6)+C(-6,0,1.6,'#1C0B40')+C(7,0,1.8,'#1C0B40'));
    [[60,60],[130,70],[80,130],[140,140],[40,110]].forEach(([x,y])=>{ s+=club(x,y,r(0,180)); s+=club(x+14,y+6,r(20,80)); s+=club(x-4,y+14,r(-80,-20)); s+=club(x+10,y+22,r(0,20)); s+=club(x+22,y+24,r(0,20)); }); return s; } });

add({ id:'b_afb', en:'Acid-fast bacilli (Mycobacterium tuberculosis)', th:'เชื้อติดสีทนกรด (AFB)', stain:'afb', um:12, size:'0.2–0.6 × 1–10 µm',
  key:['แท่งเรียว ตรง/โค้งเล็กน้อย ติดสี แดง (carbol fuchsin) บนพื้นหลังสีฟ้า (methylene blue)','ติดสีเป็นจุด ๆ (beaded)','อาจจับกันเป็นเส้นเกลียว (cord formation) ในเชื้อ M. tuberculosis'],
  diff:'Nocardia (แตกแขนง ติดกรดบางส่วน — modified Kinyoun) · Rhodococcus · เศษตะกอนสีแดง/crystal fuchsin',
  sig:'รายงานแบบ grading (IUATLD/WHO) เช่น 1–9 AFB/100 fields = scanty, 1+ … 3+; ต้องตรวจ 100 fields ก่อนรายงานผลลบ',
  draw(){ let s=scatter(100,100,94,94,26,(x,y)=>P(blob(x,y,r(3,10),r(2,7),0.4,6,r(0,180)),'#7EA2CB','none',0,'opacity=".6"'));
    s+=P(blob(150,150,34,30,0.1,10),'#8FB0D6','#5E86B8',0.6)+P(blob(146,146,14,12,0.2,8),'#40679C','none',0,'opacity=".6"');
    const bac=(x,y,a,len)=>{ const pts=curve(t=>[x+Math.cos(a)*(t-0.5)*len+Math.sin(t*3)*1.5, y+Math.sin(a)*(t-0.5)*len],6); let t=P(openPath(pts),'none','#D2204E',3.2); along(pts,4.2,2).forEach(p=>t+=C(p[0],p[1],1.4,'#8E0C2E')); return t; };
    placer(9,20,[[150,150,36]],80).forEach(p=>s+=bac(p[0],p[1],r(0,TAU),r(26,40)));
    for(let i=0;i<5;i++) s+=bac(62+i*3.5,74+i*1.2,0.5+i*0.07,44);
    return s; } });

add({ id:'b_nocard', en:'Nocardia (branching beaded Gram-positive filaments)', th:'Nocardia — เส้นใยแตกแขนง ติดสีเป็นจุด', um:6, size:'เส้นใยกว้าง 0.5–1 µm',
  key:['Gram + เป็นเส้นใยบาง แตกแขนงเป็นมุมฉาก (branching filaments) ติดสีเป็นจุด (beaded)','ติดสีทนกรดแบบอ่อน (modified Kinyoun ใช้ 1% H₂SO₄) = partially acid-fast','โคโลนีแห้ง ขาวเหมือนชอล์ก กลิ่นดิน'],
  diff:'Actinomyces (ไม่ติดกรด, anaerobe, sulfur granules) · Streptomyces · เชื้อราเส้นใย (ใหญ่กว่ามาก)',
  sig:'Nocardiosis ในปอด/สมอง ผู้ภูมิคุ้มกันต่ำ; Actinomycetoma',
  draw(){ let s=bg(); const br=(x,y,a,len,d)=>{ if(d>3) return; const x2=x+Math.cos(a)*len, y2=y+Math.sin(a)*len; along([[x,y],[x2,y2]],4).forEach(p=>s+=C(p[0],p[1],1.9,GP)); s+=L(x,y,x2,y2,'#8A74B8',1.2,'opacity=".6"');
      br(x2,y2,a+r(-0.3,0.3),len*r(0.7,0.9),d+1); if(RND2()<0.8) br(x+Math.cos(a)*len*0.5,y+Math.sin(a)*len*0.5,a+(RND2()<0.5?1:-1)*Math.PI/2*r(0.8,1.1),len*0.6,d+1); };
    br(30,120,-0.5,50,0); br(120,160,-1.8,44,0); br(150,40,2.6,40,0); return s; } });
function RND2(){ return r(0,1); }
})();
/* ---------- กลุ่ม: เชื้อรา (KOH / LPCB / India ink / Wright) ---------- */
(function(){
const {C,E,P,L,G,T,blob,scatter,polar,smooth,openPath,along,curve,poly,grad,placer,r,ri,TAU,shade} = window.__ATLAS_H;
const add = o => window.__ATLAS_CORE.ITEMS.push(Object.assign({g:'fungi', stain:'koh', um:4}, o));
const KO = '#5C6258', KF = '#EEF0E6';           // KOH outline / fill (unstained refractile)
const LB = '#2F52A6', LF = '#9FB4E3';           // LPCB blue outline / fill
function tube(pts, w, out, fill, sep, sepCol){
  const d = openPath(pts); let s = P(d,'none',out,w+2.2) + P(d,'none',fill,w);
  if(sep) along(pts, sep, sep*0.6).forEach(p=>{ const nx=-Math.sin(p[2])*w/2, ny=Math.cos(p[2])*w/2; s+=L(p[0]-nx,p[1]-ny,p[0]+nx,p[1]+ny,sepCol||out,1); });
  return s; }
function walk(x,y,a,n,step,wob){ const pts=[[x,y]]; for(let i=0;i<n;i++){ a+=r(-wob,wob); x+=Math.cos(a)*step; y+=Math.sin(a)*step; pts.push([x,y]); } return pts; }
const skinCells = () => { let s=''; placer(5,()=>r(34,44),[],70).forEach(p=>s+=P(blob(p[0],p[1],p[2],p[2]*0.85,0.18,6,r(0,180)),'#ECECE4','#BDBFB3',0.8)+C(p[0],p[1],3,'#D2D3C8','#AEB0A4',0.5)); return s; };
const koDeb = n => scatter(100,100,94,94,n||10,(x,y)=>P(blob(x,y,r(1,3),r(1,2.4),0.4,6),'#C4C6BA','none',0,'opacity=".7"'));

add({ id:'f_cand', en:'Candida — budding yeast & pseudohyphae', th:'Candida (ยีสต์แตกหน่อ + pseudohyphae)', um:5, size:'ยีสต์ 3–6 µm',
  key:['เซลล์ยีสต์รูปไข่ แตกหน่อ (budding) ไม่มีแคปซูล','pseudohyphae = เซลล์ยาวต่อกันเป็นสาย มีรอยคอด (constriction) ตรงรอยต่อ ไม่ใช่ septum จริง','Gram stain: ติดสีม่วง (Gram +)'],
  diff:'Cryptococcus (มีแคปซูลหนา) · Malassezia · Geotrichum (arthroconidia) · Hyphae จริงของรา (ผนังขนานไม่คอด)',
  sig:'ทดสอบ germ tube (C. albicans +) / CHROMagar; เชื้อฉวยโอกาส — ปาก ช่องคลอด เลือด (candidemia)',
  draw(){ let s=koDeb()+skinCells(); let x=36,y=150,a=-0.6; for(let k=0;k<6;k++){ const nx=x+Math.cos(a)*22, ny=y+Math.sin(a)*22; s+=E((x+nx)/2,(y+ny)/2,12.5,5.2,a*57.3,KF,KO,1.1); if(k%2) s+=E(nx+6,ny-10,5.6,4.4,-40,KF,KO,1); x=nx; y=ny; a+=r(-0.25,0.2); }
    placer(10,10,[[90,120,40]],84).forEach((p,i)=>{ const rot=r(0,180); s+=E(p[0],p[1],8,6.2,rot,KF,KO,1.1)+(i%2?E(p[0]+Math.cos(rot/57.3)*11,p[1]+Math.sin(rot/57.3)*11,4.4,3.6,rot,KF,KO,1):''); });
    return s; } });

add({ id:'f_germ', en:'Germ tube test (Candida albicans)', th:'Germ tube test', um:5, size:'ยีสต์ 4–6 µm',
  key:['บ่มยีสต์ในซีรั่ม 35–37 °C 2–3 ชม. (ไม่เกิน 3 ชม.)','ผลบวก: หลอดงอกยื่นออกจากเซลล์ ไม่มีรอยคอดที่จุดเริ่ม (ผนังขนาน) — ซ้ายบน','ผลลบ/pseudohypha: มีรอยคอดตรงรอยต่อกับเซลล์แม่ — ขวาล่าง'],
  diff:'C. tropicalis สร้าง pseudohypha มีรอยคอด (อ่านผิดเป็นบวกได้)',
  sig:'ผลบวก = C. albicans (หรือ C. dubliniensis) — รายงานเบื้องต้นได้เร็ว',
  draw(){ let s=koDeb(); const gt=(x,y,a)=>{ const pts=curve(t=>[x+Math.cos(a)*t*60+Math.sin(t*3)*3, y+Math.sin(a)*t*60],10); return P(openPath(pts),'none',KO,7.6)+P(openPath(pts),'none',KF,5.4)+E(x,y,10,8,a*57.3,KF,KO,1.2); };
    s+=gt(46,64,0.3)+gt(118,40,1.9)+gt(40,110,-0.4);
    s+=E(126,142,10,8,0,KF,KO,1.2)+E(145,150,11,5,20,KF,KO,1.2)+E(166,158,11,5,20,KF,KO,1.2);
    s+=T(40,40,'+',14,'#1F6B3A','middle','700')+T(150,128,'−',16,'#A73B2E','middle','700');
    return s; } });

add({ id:'f_crypto', en:'Cryptococcus neoformans (India ink)', th:'Cryptococcus (India ink)', stain:'ink', um:6, size:'เซลล์ 4–10 µm + แคปซูล',
  key:['พื้นหลังดำจากหมึกอินเดีย เห็นวงใส (แคปซูลหนา) ล้อมรอบเซลล์ยีสต์กลม','เซลล์ขนาดต่าง ๆ กัน แตกหน่อแบบฐานแคบ (narrow-based budding)','ภายในเซลล์มีเม็ดสะท้อนแสง; แคปซูลมีขอบเขตคมชัด'],
  diff:'WBC/lymphocyte (ขอบไม่คม ไม่มี budding, มีฮาโลบางไม่สม่ำเสมอ) · ฟองอากาศ · ผงแป้งจากถุงมือ',
  sig:'⚠ Cryptococcal meningitis (HIV CD4 < 100) — รายงาน CSF ทันที; ยืนยันด้วย Cryptococcal antigen (CrAg, ไวกว่า India ink)',
  draw(){ let s=scatter(100,100,94,94,260,(x,y)=>C(x,y,r(0.4,1.3),'#3A3A3A')); const cc=(x,y,rr,cap,bud)=>{ let t=C(x,y,rr+cap,'#EDEBE2')+C(x,y,rr,'#D9D5C6','#8A8676',1.2)+scatter(x,y,rr*0.6,rr*0.6,5,(a,b)=>C(a,b,r(0.8,1.6),'#A8A393'));
      if(bud){ const a=r(0,TAU); t=C(x+Math.cos(a)*(rr+rr*0.5),y+Math.sin(a)*(rr+rr*0.5),rr*0.55+cap*0.8,'#EDEBE2')+t+C(x+Math.cos(a)*(rr+rr*0.5),y+Math.sin(a)*(rr+rr*0.5),rr*0.5,'#D9D5C6','#8A8676',1.1); } return t; };
    return s + cc(84,86,18,16,true) + cc(146,138,12,11,false) + cc(56,150,9,9,false) + cc(150,58,10,10,true); } });

add({ id:'f_mala', en:'Malassezia furfur (“spaghetti & meatballs”)', th:'Malassezia (สปาเก็ตตี้และมีทบอล)', um:5, size:'ยีสต์ 3–8 µm, hyphae กว้าง 2.5–4 µm',
  key:['KOH จากขุยผิวหนัง: hyphae สั้นโค้ง (spaghetti) ปนกับกลุ่มยีสต์กลม (meatballs)','ยีสต์มีรูปขวด (bottle-shaped) แตกหน่อฐานกว้าง','เพาะเชื้อต้องเติมน้ำมันมะกอก (lipophilic)'],
  diff:'Dermatophyte (hyphae ยาว แตกแขนง ไม่มีกลุ่มยีสต์) · Candida',
  sig:'เกลื้อน (Pityriasis versicolor); M. furfur fungemia ในทารกที่ได้ intralipid',
  draw(){ let s=koDeb()+skinCells(); for(let i=0;i<9;i++){ const x=r(30,170), y=r(30,170), a=r(0,TAU); const pts=curve(t=>[x+Math.cos(a)*(t-0.5)*40+Math.sin(t*4)*4, y+Math.sin(a)*(t-0.5)*40],8); s+=P(openPath(pts),'none',KO,7)+P(openPath(pts),'none',KF,4.8); }
    [[70,80],[130,120],[60,150]].forEach(([x,y])=>{ for(let k=0;k<9;k++) s+=C(x+r(-12,12),y+r(-12,12),r(4.5,6.5),KF,KO,1.1); }); return s; } });

add({ id:'f_derm', en:'Dermatophyte hyphae in KOH', th:'เส้นใยรา Dermatophyte ใน KOH', um:4, size:'hyphae กว้าง 2–4 µm',
  key:['เส้นใยใส ยาว มีผนังกั้น (septate) แตกแขนง ทอดข้ามขอบเซลล์ผิวหนัง','บางส่วนแตกเป็นสายของ arthroconidia (เซลล์สี่เหลี่ยมต่อกัน)','ผนังเรียบขนาน ไม่มีรอยคอด'],
  diff:'Mosaic artifact (เส้นตามขอบเซลล์ผิวหนัง ไม่ข้ามเซลล์ ไม่มี septum) · เส้นใยผ้า · Candida pseudohyphae',
  sig:'Tinea (กลาก), เชื้อราที่เล็บ/เส้นผม — ใช้ KOH 10–20% (เล็บ 20–40%) อุ่นเล็กน้อย; ยืนยัน genus ด้วยการเพาะ SDA + cycloheximide',
  draw(){ let s=koDeb(); placer(6,()=>r(36,46),[],70).forEach(p=>s+=P(blob(p[0],p[1],p[2],p[2]*0.85,0.18,6,r(0,180)),'#ECECE4','#BDBFB3',0.9)+C(p[0],p[1],3,'#D2D3C8'));
    const h1=walk(10,70,0.35,9,20,0.25), h2=walk(60,200,-1.3,8,20,0.2), h3=walk(110,112,0.9,3,18,0.2);
    s+=tube(h1,5.6,KO,KF,17)+tube(h2,5.6,KO,KF,17)+tube(h3,5.6,KO,KF,17);
    const arth=walk(120,40,1.2,5,11,0.08); arth.forEach((p,i)=>{ if(i) s+=G((p[0]+arth[i-1][0])/2,(p[1]+arth[i-1][1])/2,Math.atan2(p[1]-arth[i-1][1],p[0]-arth[i-1][0])*57.3,1,P('M-5 -3.6H5V3.6H-5Z',KF,KO,1.1)); });
    return s; } });

add({ id:'f_asp', en:'Aspergillus fumigatus (LPCB)', th:'Aspergillus (ย้อม LPCB)', stain:'lpcb', um:4, size:'vesicle 20–30 µm, conidia 2–3 µm',
  key:['conidiophore ยาว ปลายพองเป็น vesicle รูปโดม/กระบอง','phialides เรียงชั้นเดียว (uniseriate) บนด้านบน 2/3 ของ vesicle ชี้ขึ้นขนานกัน','conidia กลมเล็กเรียงต่อกันเป็นสายยาว (columnar)','ในเนื้อเยื่อ: hyphae ใส กว้างสม่ำเสมอ มี septum แตกแขนงทำมุมแหลม 45° (dichotomous)'],
  diff:'A. niger (biseriate รอบ vesicle, conidia สีดำ) · A. flavus (radiate, สีเขียวเหลือง) · Penicillium (ไม่มี vesicle, แตกแขนงเป็นแปรง)',
  sig:'Invasive aspergillosis ในผู้ป่วย neutropenia, aspergilloma, ABPA — แยกเชื้อจากที่ปลอดเชื้อถือว่าสำคัญ',
  draw(){ let s=tube([[100,215],[100,170],[100,140]],6,LB,LF);
    const vx=100, vy=100; s+=P(`M${vx-5} ${vy+40}L${vx-5} ${vy+10}C${vx-20} ${vy+6} ${vx-22} ${vy-20} ${vx} ${vy-22}C${vx+22} ${vy-20} ${vx+20} ${vy+6} ${vx+5} ${vy+10}L${vx+5} ${vy+40}Z`,LF,LB,1.2);
    for(let a=-2.75;a<=-0.35;a+=0.2){ const bx=vx+Math.cos(a)*19, by=vy-6+Math.sin(a)*15; const dir=a*0.55+(-Math.PI/2)*0.45; const px=bx+Math.cos(dir)*8, py=by+Math.sin(dir)*8;
      s+=L(bx,by,px,py,LB,3.2); let cx=px, cy=py; for(let k=0;k<8;k++){ cx+=Math.cos(dir)*5.2; cy+=Math.sin(dir)*5.2; s+=C(cx,cy,2.4,'#6F8ED3',LB,0.6); } }
    const h=walk(10,170,-0.2,4,22,0.1); s+=tube(h,5,LB,LF,14); const hb=h[2]; s+=tube(walk(hb[0],hb[1],-1.0,2,22,0.05),5,LB,LF,14);
    return s; } });

add({ id:'f_muc', en:'Mucorales (Rhizopus / Mucor) — LPCB', th:'Mucorales (Rhizopus / Mucor)', stain:'lpcb', um:1.8, size:'hyphae กว้าง 6–25 µm; sporangium 50–300 µm',
  key:['hyphae กว้างมาก แบนเหมือนริบบิ้น แทบไม่มี septum (pauciseptate / aseptate) แตกแขนงทำมุมฉาก 90°','sporangiophore ปลายมี sporangium กลมใหญ่บรรจุ sporangiospores + columella','Rhizopus: มี rhizoids (รากฝอย) ตรงข้ามจุดกำเนิด sporangiophore; Mucor: ไม่มี rhizoid'],
  diff:'Aspergillus (hyphae แคบ มี septum มุม 45°)',
  sig:'⚠ Mucormycosis — รุนแรงเร็ว (rhino-orbital-cerebral ในเบาหวาน DKA) รายงานด่วน; ห้ามบดเนื้อเยื่อ (ให้หั่นชิ้นเล็ก) ก่อนเพาะ',
  draw(){ let s=tube([[-10,180],[40,172],[100,176],[160,170],[210,178]],11,LB,LF);
    s+=tube([[100,176],[100,140],[102,110],[100,90]],7,LB,LF)+C(100,70,30,'#3E5BA8',LB,1.4)+scatter(100,70,27,27,90,(x,y)=>C(x,y,r(1.2,2),'#1E3478'))+P('M84 92C84 76 116 76 116 92Z','#C3D0EE',LB,1);
    s+=tube([[40,172],[36,140],[40,120]],6,LB,LF)+C(40,108,14,'#3E5BA8',LB,1.2)+scatter(40,108,12,12,24,(x,y)=>C(x,y,1.3,'#1E3478'));
    for(let k=-2;k<=2;k++) s+=P(`M100 180q${k*6} 10 ${k*10} 22`,'none',LB,1.6);
    return s; } });

add({ id:'f_pen', en:'Penicillium (LPCB)', th:'Penicillium (แปรงทาสี)', stain:'lpcb', um:5, size:'conidia 2.5–5 µm',
  key:['conidiophore แตกแขนงเป็นชั้น (metulae → phialides) คล้ายแปรง/พู่กัน (penicillus)','ไม่มี vesicle ที่ปลาย','conidia กลมเรียงเป็นสายยาวจาก phialide','โคโลนีสีเขียวอมฟ้า ผงแป้ง'],
  diff:'Aspergillus (มี vesicle) · Paecilomyces (phialide ปลายเรียวแหลม) · Talaromyces marneffei (สร้างสีแดงแพร่ในอาหาร ที่ 25 °C)',
  sig:'ส่วนใหญ่เป็น contaminant ในห้องปฏิบัติการ',
  draw(){ let s=tube([[100,210],[100,150],[100,112]],5,LB,LF);
    const tips=[]; [-0.5,0,0.5].forEach(a=>{ const mx=100+Math.sin(a)*14, my=112-Math.cos(a)*14; s+=L(100,112,mx,my,LB,4.2); [-0.25,0.25].forEach(b=>{ const px=mx+Math.sin(a+b)*10, py=my-Math.cos(a+b)*10; s+=L(mx,my,px,py,LB,3); tips.push([px,py,a+b]); }); });
    tips.forEach(([x,y,a])=>{ for(let k=1;k<=9;k++) s+=C(x+Math.sin(a)*k*5.2,y-Math.cos(a)*k*5.2,2.4,'#6F8ED3',LB,0.6); });
    return s + tube(walk(10,120,0.3,4,22,0.15),4.4,LB,LF,13); } });

add({ id:'f_fus', en:'Fusarium (LPCB)', th:'Fusarium (สปอร์รูปเรือแคนู)', stain:'lpcb', um:4, size:'macroconidia 20–60 × 3–6 µm',
  key:['macroconidia รูปเคียว/เรือแคนู (sickle / canoe-shaped) หลายเซลล์ มีผนังกั้น 3–5 อัน','ปลายเซลล์ด้านหนึ่งมี “foot cell”','microconidia รูปไข่ เซลล์เดียว/สองเซลล์ อาจเกาะเป็นกลุ่ม','โคโลนีฟูสีขาว–ชมพู–ม่วง'],
  diff:'Macroconidia ของ Microsporum (ผนังหนาขรุขระ รูปกระสวย) · Curvularia (สีน้ำตาล โค้งที่เซลล์กลาง)',
  sig:'Keratitis (กระจกตาอักเสบจากเชื้อรา — พบในไทยหลังบาดเจ็บจากพืช), disseminated ในผู้ป่วยภูมิต่ำ',
  draw(){ let s=tube(walk(0,160,-0.1,10,22,0.1),4,LB,LF,16);
    const canoe=(x,y,rot)=>{ let t=P('M-30 4C-18 -10 18 -10 30 -2C18 -2 -18 -4 -26 8Z',LF,LB,1.2); for(const k of [-15,-5,5,15]) t+=L(k,-6.5+Math.abs(k)*0.12,k+1,2.5-Math.abs(k)*0.05,LB,0.9); return G(x,y,rot,1.15,t); };
    s+=canoe(80,70,-10)+canoe(130,104,20)+canoe(60,120,40)+canoe(140,50,-30);
    placer(8,5,[],85).forEach(p=>s+=E(p[0],p[1],5,3.2,r(0,180),LF,LB,0.9)); return s; } });

add({ id:'f_mcanis', en:'Microsporum canis (LPCB)', th:'Microsporum canis', stain:'lpcb', um:2.4, size:'macroconidia 35–110 × 12–25 µm',
  key:['macroconidia รูปกระสวย (spindle) ปลายไม่สมมาตร มีปุ่ม (knob) ที่ปลาย','ผนังหนา ผิวขรุขระมีหนามละเอียด (echinulate) มักมี ≥ 6 เซลล์','microconidia น้อย; โคโลนีด้านหลังสีเหลืองส้ม'],
  diff:'M. gypseum (macroconidia ผนังบาง ≤ 6 เซลล์ ปลายมน จำนวนมาก) · Fusarium (รูปเคียว ผนังบาง)',
  sig:'กลากที่หนังศีรษะ/ผิวหนังจากแมวสุนัข — Wood’s lamp เรืองแสงเขียวที่เส้นผม',
  draw(){ const mac=(x,y,rot,sc)=>{ let t=P('M-40 0C-30 -16 20 -18 36 -6C42 -2 44 2 38 6C22 18 -30 16 -40 0Z',LF,LB,2.6); for(const k of [-26,-15,-4,7,18,28]) t+=L(k,-12+Math.abs(k)*0.14,k,12-Math.abs(k)*0.14,LB,1.4);
      t+=scatter(0,0,38,14,40,(a,b)=>C(a,b,0.6,LB)); return G(x,y,rot,sc,t); };
    return tube(walk(-10,150,-0.3,10,24,0.1),5,LB,LF,18) + mac(84,76,-20,1) + mac(130,128,30,0.9) + mac(52,138,70,0.7); } });

add({ id:'f_trub', en:'Trichophyton rubrum (LPCB)', th:'Trichophyton rubrum', stain:'lpcb', um:5, size:'microconidia 2–3 × 3–5 µm',
  key:['microconidia รูปหยดน้ำ (tear-drop / clavate) เกาะเรียงตามข้างเส้นใย “นกเกาะรั้ว” (birds on a fence)','macroconidia (ถ้ามี) รูปดินสอ ผนังบางเรียบ','โคโลนีด้านหลังสีแดงไวน์; urease ลบ'],
  diff:'T. mentagrophytes / T. interdigitale (microconidia กลมเป็นพวงองุ่น, spiral hyphae, urease + ภายใน 2–7 วัน) · Epidermophyton (ไม่มี microconidia)',
  sig:'สาเหตุหลักของเชื้อราที่เล็บ (onychomycosis) และกลากที่เท้า/ขาหนีบ',
  draw(){ let s=''; const h=walk(-10,110,-0.05,11,22,0.08); s+=tube(h,4,LB,LF,20); along(h,9,6).forEach((p,i)=>{ const side=i%2?1:-1; const nx=-Math.sin(p[2])*side, ny=Math.cos(p[2])*side;
      s+=L(p[0]+nx*2,p[1]+ny*2,p[0]+nx*5,p[1]+ny*5,LB,1)+E(p[0]+nx*8.5,p[1]+ny*8.5,4.2,2.8,Math.atan2(ny,nx)*57.3,'#7F97D8',LB,0.7); });
    s+=tube(walk(40,190,-0.8,4,20,0.1),4,LB,LF,20);
    s+=G(128,160,-15,1,P('M-30 -4H26C32 -4 32 4 26 4H-30Z',LF,LB,1)+[-18,-6,6,18].map(k=>L(k,-4,k,4,LB,0.8)).join(''));
    return s; } });

add({ id:'f_epid', en:'Epidermophyton floccosum (LPCB)', th:'Epidermophyton floccosum', stain:'lpcb', um:4, size:'macroconidia 20–40 × 6–12 µm',
  key:['macroconidia รูปกระบอง/หางบีเวอร์ (club / beaver-tail) ผนังบางเรียบ 2–5 เซลล์','เกิดเป็นกลุ่ม 2–3 อัน จากจุดเดียวกันบนเส้นใย','ไม่สร้าง microconidia (สำคัญในการแยก)','โคโลนีสีเขียวอมเหลือง (khaki) คล้ายหนังกลับ'],
  diff:'Trichophyton (มี microconidia) · Microsporum (ผนังหนาขรุขระ)',
  sig:'กลากที่ขาหนีบ (tinea cruris) และเท้า — ไม่ก่อโรคที่เส้นผม',
  draw(){ let s=tube(walk(-10,160,-0.35,11,22,0.1),4.4,LB,LF,18);
    const club=(rot)=>{ let t=P('M0 0C-6 -10 -8 -26 -2 -36C4 -42 12 -42 14 -34C18 -22 10 -8 0 0Z',LF,LB,1.2); t+=L(-5,-14,9,-15,LB,0.9)+L(-5,-25,13,-26,LB,0.9); return G(0,0,rot,1,t); };
    [[70,125],[140,84]].forEach(([x,y])=>{ s+=G(x,y,0,1.25,club(-35)+club(0)+club(35)); }); return s; } });

add({ id:'f_chromo', en:'Sclerotic (muriform) bodies — Chromoblastomycosis', th:'Sclerotic body (Chromoblastomycosis)', um:4, size:'5–12 µm',
  key:['เซลล์กลม สีน้ำตาลทอง ผนังหนา (dematiaceous) คล้าย “เหรียญทองแดง” (copper pennies)','มีผนังกั้นแบ่งเซลล์ทั้งแนวตั้งและแนวนอน (muriform septation)','พบเดี่ยวหรือเป็นกลุ่มใน KOH ของขุย/เนื้อเยื่อ'],
  diff:'Phaeohyphomycosis (เป็นเส้นใยสีน้ำตาล) · Pigment/เม็ดเลือดแดงเก่า',
  sig:'Chromoblastomycosis (Fonsecaea, Cladophialophora) — แผลเรื้อรังคล้ายดอกกะหล่ำที่ขา เกษตรกรเดินเท้าเปล่า',
  draw(){ let s=koDeb()+skinCells(); const sb=(x,y,rr)=>C(x,y,rr,'#B4712C','#5E3510',2)+L(x-rr*0.9,y,x+rr*0.9,y,'#5E3510',1.3)+L(x,y-rr*0.9,x,y+rr*0.9,'#5E3510',1.3)+C(x-rr*0.35,y-rr*0.35,rr*0.2,'#D49A55');
    [[80,90,17],[104,100,16],[92,120,15],[146,60,14],[54,148,13],[140,146,17]].forEach(p=>s+=sb(...p)); return s; } });

add({ id:'f_tmarn', en:'Talaromyces (Penicillium) marneffei — yeast in macrophage', th:'Talaromyces marneffei ในเซลล์ macrophage', stain:'wright', um:6, size:'2–8 µm',
  key:['เซลล์รูปไข่/ยาวคล้ายไส้กรอก อยู่ภายใน macrophage (และนอกเซลล์)','มีผนังกั้นตามขวางตรงกลาง (central transverse septum) — แบ่งตัวแบบ fission ไม่แตกหน่อ','ติดสีม่วงอ่อน ตรงกลางมีแถบใส'],
  diff:'Histoplasma capsulatum (เล็กกว่า 2–4 µm แตกหน่อ ไม่มี septum) · Leishmania (มี kinetoplast) · Candida',
  sig:'⚠ Talaromycosis — การติดเชื้อฉวยโอกาสสำคัญในผู้ป่วย HIV ในไทย/เอเชียตะวันออกเฉียงใต้; เพาะเชื้อเป็น thermally dimorphic (25 °C เป็นรา + สีแดงแพร่, 37 °C เป็นยีสต์)',
  draw(){ let s=scatter(100,100,94,94,10,(x,y)=>C(x,y,17,'#E7B7BF','#D48E98',0.6,'opacity=".8"'));
    s+=P(blob(96,100,62,54,0.08,12),'#C8D2EA','#9EAED4',0.8)+P(blob(62,78,16,13,0.1,8),'#6A4C9C');
    const y=(x,yy,len,rot)=>G(x,yy,rot,1,P(`M${-len/2} -3.4H${len/2}A3.4 3.4 0 0 1 ${len/2} 3.4H${-len/2}A3.4 3.4 0 0 1 ${-len/2} -3.4Z`,'#B08AD0','#6F4A9C',0.8)+L(0,-3.4,0,3.4,'#F4EEF8',1.4));
    placer(16,9,[[62,78,20]],44).forEach(p=>s+=y(p[0]-100+100,p[1],r(10,16),r(0,180)));
    return s + y(170,150,22,30) + y(40,170,18,-20); } });

add({ id:'f_histo', en:'Histoplasma capsulatum — intracellular yeast', th:'Histoplasma capsulatum ในเซลล์', stain:'wright', um:7, size:'2–4 µm',
  key:['ยีสต์รูปไข่เล็กมาก 2–4 µm อัดแน่นใน macrophage/neutrophil','ไซโทพลาซึมของยีสต์ติดสีเป็นรูปจันทร์เสี้ยวที่ปลายหนึ่ง ล้อมด้วยวงใส (pseudocapsule artifact)','แตกหน่อฐานแคบ (narrow-based budding) — ไม่มี septum'],
  diff:'Talaromyces marneffei (มี septum ตรงกลาง) · Leishmania (มี kinetoplast) · Toxoplasma',
  sig:'Disseminated histoplasmosis ในผู้ป่วย HIV — พบใน buffy coat / ไขกระดูก',
  draw(){ let s=scatter(100,100,94,94,10,(x,y)=>C(x,y,20,'#E7B7BF','#D48E98',0.6,'opacity=".8"'));
    s+=P(blob(100,100,58,52,0.08,12),'#CBD3EA','#9EAED4',0.8)+P(blob(70,72,15,12,0.1,8),'#6A4C9C');
    placer(22,8.5,[[70,72,18]],42).forEach(p=>{ const rot=r(0,180); s+=E(p[0],p[1],8,6.4,rot,'#F1EEF6','#C7BBDB',0.6)+G(p[0],p[1],rot,1,P('M-5 0A5 4 0 0 1 3 -3.2A5 4 0 0 0 3 3.2A5 4 0 0 1 -5 0Z','#7B55B0')); });
    return s; } });
})();
/* ---------- กลุ่ม: สารน้ำ / อสุจิ / เซลล์วิทยา ---------- */
(function(){
const {C,E,P,L,G,T,blob,scatter,polar,smooth,openPath,along,curve,poly,grad,placer,rbc,r,ri,TAU,shade} = window.__ATLAS_H;
const add = o => window.__ATLAS_CORE.ITEMS.push(Object.assign({g:'fluid'}, o));

function sperm(x,y,rot,o){ o=o||{}; const sc=o.sc||1;
  let head = o.head || 'M0 -9C8 -9 13 -4 13 0C13 4 8 9 0 9C-4 9 -5 5 -5 0C-5 -5 -4 -9 0 -9Z';
  let t = '';
  const tail = o.coil ? 'M-5 0C-14 0 -22 -2 -26 -10C-30 -18 -20 -22 -16 -14C-12 -6 -24 0 -34 4' : `M-5 0L-20 0C-40 ${r(-4,4)} -60 ${r(-10,10)} -80 ${r(-4,4)}C-100 ${r(-12,12)} -120 ${r(-6,6)} -150 ${r(-12,12)}`;
  t += P(tail,'none','#8E6FA8',1.4);
  if(!o.coil) t += L(-5,0,o.bent?-12:-20,o.bent?-8:0,'#A97BBE',3.2);
  t += P(head,'#B98AC9','#6E3F85',0.9);
  if(!o.noAcro) t += P(o.acro || 'M4 -8.6C10 -8 13 -4 13 0C13 4 10 8 4 8.6C7 4 7 -4 4 -8.6Z','#E6D3EE','none');
  if(o.drop) t += C(-10,4,4,'#E3CFEA','#9E7FB4',0.6);
  return G(x,y,rot,sc,t); }

add({ id:'sp_norm', en:'Normal spermatozoon', th:'อสุจิรูปร่างปกติ', stain:'sperm', um:6, size:'หัว 4–5 × 2.5–3.5 µm, หาง ~45 µm',
  key:['หัวรูปไข่เรียบ (oval) ขอบเรียบ ความยาว/กว้าง ≈ 1.5–1.75','Acrosome ชัดเจน คลุม 40–70% ของหัว ไม่มี vacuole ใหญ่','Midpiece เรียว ต่อตรงแนวกับหัว ยาว ≈ ความยาวหัว ไม่มี cytoplasmic droplet เกิน 1/3 ของหัว','หางเส้นเดียว สม่ำเสมอ ไม่ขด'],
  diff:'Immature germ cells / leukocyte (ใช้ peroxidase stain แยก WBC)',
  sig:'WHO 6th ed.: Normal forms ≥ 4% (เกณฑ์เข้มงวด strict criteria) — นับอย่างน้อย 200 ตัว',
  draw(){ return sperm(128,86,-15,{sc:1.35}) + sperm(150,150,-160,{sc:1.2}); } });

add({ id:'sp_abn', en:'Abnormal sperm morphology', th:'อสุจิรูปร่างผิดปกติ', stain:'sperm', um:4, size:'—',
  key:['Head defects: หัวเรียว (tapered), รูปลูกแพร์ (pyriform), หัวกลมไม่มี acrosome (globozoospermia), หัวใหญ่/สองหัว, amorphous','Neck/midpiece defects: คองอ (bent neck), midpiece หนา/ไม่อยู่แนวเดียวกัน','Tail defects: หางขด (coiled), สั้น, สองหาง','Excess residual cytoplasm (> 1/3 ขนาดหัว)'],
  diff:'Pinhead (ไม่มีหัว) นับเป็นชิ้นส่วน ไม่ใช่อสุจิ · WBC/germ cell',
  sig:'Teratozoospermia (normal forms < 4%) — ประกอบการพิจารณา IUI / IVF / ICSI',
  draw(){ return sperm(60,52,20,{head:'M0 -6C10 -6 16 -3 18 0C16 3 10 6 0 6C-4 6 -5 3 -5 0C-5 -3 -4 -6 0 -6Z', acro:'M6 -5.6C12 -4 16 -2 17 0C16 2 12 4 6 5.6C8 2 8 -2 6 -5.6Z'}) +
      sperm(146,50,160,{head:'M0 -9C12 -9 14 -2 14 0C14 2 12 9 0 9C-2 9 -5 2 -5 0C-5 -2 -2 -9 0 -9Z'}) +
      sperm(56,120,-10,{head:'M-5 0C-5 -9 13 -10 13 0C13 10 -5 9 -5 0Z',noAcro:true}) +
      sperm(144,112,200,{bent:true}) + sperm(104,164,-20,{coil:true}) + sperm(150,166,190,{drop:true}); } });

add({ id:'clue', en:'Clue cell', th:'Clue cell', stain:'wet', um:3, size:'เซลล์ squamous 40–60 µm',
  key:['squamous epithelial cell ที่มีแบคทีเรียรูป coccobacilli เกาะเต็มผิว','ขอบเซลล์ขรุขระ ถูกบดบังจนไม่เห็นขอบชัด (ต้องปกคลุม > 75% ของขอบ)','พื้นหลังมีแบคทีเรียเล็กจำนวนมาก แต่มี lactobacilli/WBC น้อย'],
  diff:'Squamous cell ปกติ (ขอบเรียบคม) · เซลล์ที่มี lactobacilli เกาะบ้างเล็กน้อย',
  sig:'Bacterial vaginosis (Gardnerella) — Amsel criteria ≥ 3/4: clue cell > 20%, pH > 4.5, whiff test +, ตกขาวเนื้อเดียวบาง',
  draw(){ let s=scatter(100,100,94,94,220,(x,y)=>C(x,y,r(0.6,1.1),'#7F8378',null,0,'opacity=".6"'));
    const d=blob(92,96,62,52,0.12,9,20); s+=P(d,'#E4E4DA','#8D9085',0.8)+C(96,98,7,'#CFCFC2','#7D8076',0.9)+scatter(92,96,60,50,700,(x,y)=>C(x,y,r(0.6,1.1),'#5E625A'));
    for(let i=0;i<60;i++){ const a=r(0,TAU); s+=C(92+Math.cos(a)*r(56,66),96+Math.sin(a)*r(46,56),r(0.8,1.2),'#5E625A'); }
    s+=P(blob(170,170,34,30,0.1,8),'#EEEEE6','#8D9085',0.9)+C(166,166,4,'#CFCFC2');
    return s; } });

add({ id:'tzanck', en:'Tzanck smear — multinucleated giant cell', th:'Tzanck smear (Multinucleated giant cell)', stain:'wright', um:3, size:'40–80 µm',
  key:['เซลล์ยักษ์หลายนิวเคลียส (Multinucleation)','นิวเคลียสเบียดกันจนรูปร่างเข้ากัน (Molding)','โครมาทินถูกดันไปขอบนิวเคลียส ตรงกลางใสเหมือนกระจกฝ้า (Margination / ground-glass) — “3M”','อาจพบ Cowdry type A intranuclear inclusion'],
  diff:'Foreign body / Langhans giant cell (นิวเคลียสไม่ molding, โครมาทินปกติ) · Acantholytic cell ใน pemphigus',
  sig:'การติดเชื้อ Herpes simplex / Varicella-zoster (ขูดฐานตุ่มน้ำใหม่) — แยก HSV กับ VZV ไม่ได้ ต้องใช้ PCR/DFA',
  draw(){ let s=scatter(100,100,94,94,6,(x,y)=>C(x,y,8,'#E7B7BF','#D48E98',0.6,'opacity=".8"'));
    s+=P(blob(100,100,64,56,0.08,12),'#C9C3E0','#9E97C4',0.8);
    const nuc=[[80,86],[100,80],[120,88],[78,108],[98,104],[118,110],[96,126]];
    nuc.forEach(([x,y])=>s+=P(blob(x,y,12.5,11,0.12,7,r(0,180)),'#B8A7D8','#4A2E82',2.6)+C(x+r(-2,2),y+r(-2,2),2.4,'#8C6CC0','none',0,'opacity=".6"'));
    return s; } });

add({ id:'koilo', en:'Koilocyte (HPV effect)', th:'Koilocyte (การติดเชื้อ HPV)', stain:'pap', um:2.6, size:'เซลล์ squamous 40–60 µm',
  key:['ช่องใสรอบนิวเคลียสขนาดใหญ่ ขอบคมชัด (perinuclear cavitation / halo)','ไซโทพลาซึมรอบช่องใสหนาตัวขึ้นเป็นวงชัด','นิวเคลียสโต ติดสีเข้ม ขอบย่นคล้ายลูกเกด (raisinoid) พบ 2 นิวเคลียสได้บ่อย'],
  diff:'Perinuclear halo จากการอักเสบ (halo เล็ก ขอบไม่คม นิวเคลียสปกติ) · Glycogenated cell',
  sig:'LSIL (Low-grade squamous intraepithelial lesion) ตามระบบ Bethesda — แนะนำตรวจ HPV/colposcopy ตามแนวทาง',
  draw(){ let s=''; s+=P(blob(150,60,40,34,0.15,7,20),'#A9D2C8','#6FA597',0.8)+C(150,60,4,'#3E4E7A');
    s+=P(blob(96,110,62,52,0.14,7,-10),'#F0B7C4','#C98191',0.9)+P(blob(92,106,30,24,0.1,10),'#FAF3F3','#B8687C',2.2)+P(blob(84,104,9,7.5,0.3,9),'#2E2F66')+P(blob(100,108,8,7,0.3,9),'#2E2F66');
    return s; } });

add({ id:'msu', en:'Monosodium urate (MSU) crystals — gout', th:'ผลึก MSU (โรคเกาต์)', stain:'pol', um:4, size:'ยาว 2–30 µm',
  key:['รูปเข็ม (needle-shaped) ปลายแหลม มักอยู่ในเซลล์ neutrophil ระยะเฉียบพลัน','Birefringence แบบ ลบ อย่างแรง (strongly negative)','ใต้ red compensator: ผลึกขนานกับแกน slow ray (Z′) = สีเหลือง, ตั้งฉาก = สีน้ำเงิน'],
  diff:'CPPD (รูปสี่เหลี่ยม/ขนมเปียกปูน birefringence บวกอ่อน: ขนาน = น้ำเงิน) · Steroid crystals (หลังฉีดยาเข้าข้อ) · Cholesterol',
  sig:'วินิจฉัย Gout — ตรวจน้ำไขข้อสดโดยเร็ว; พบร่วมกับ WBC สูง อาจมีการติดเชื้อร่วม (ต้องเพาะเชื้อด้วย)',
  draw(){ let s=scatter(100,100,94,94,40,(x,y)=>C(x,y,r(1,3),'#A94476',null,0,'opacity=".5"'));
    s+=axis(); placer(12,12,[[36,36,24]],80).forEach((p,i)=>{ const par=i%2===0; const a=(par?0:90)+r(-8,8)-30; s+=G(p[0],p[1],a,1,P('M-18 0L-16 -1.4L16 -1.4L18 0L16 1.4L-16 1.4Z',par?'#F2D640':'#3C8BE0',par?'#A78E14':'#1A5AA8',0.6)); });
    return s; } });
function axis(){ return G(36,36,-30,1,L(-18,0,16,0,'#fff',1.6)+P('M16 -4L22 0L16 4Z','#fff'))+T(36,60,'Z′ (slow)',8,'#fff','middle','600'); }

add({ id:'cppd', en:'CPPD crystals — pseudogout', th:'ผลึก CPPD (โรคเกาต์เทียม)', stain:'pol', um:4, size:'2–20 µm',
  key:['รูปสี่เหลี่ยมผืนผ้า/ขนมเปียกปูน/แท่งปลายทู่ (rhomboid, rod-shaped)','Birefringence แบบ บวก อย่างอ่อน (weakly positive) — สีจางกว่า MSU','ใต้ red compensator: ผลึกขนานกับแกน Z′ = สีน้ำเงิน, ตั้งฉาก = สีเหลือง'],
  diff:'MSU (รูปเข็ม ลบแรง: ขนาน = เหลือง)',
  sig:'Calcium pyrophosphate deposition disease (pseudogout) — ผู้สูงอายุ ข้อเข่า; X-ray chondrocalcinosis',
  draw(){ let s=scatter(100,100,94,94,40,(x,y)=>C(x,y,r(1,3),'#A94476',null,0,'opacity=".5"'));
    s+=axis(); placer(9,14,[[36,36,26]],80).forEach((p,i)=>{ const par=i%2===0; const a=(par?0:90)+r(-6,6)-30; const w=r(8,14), h=r(4,6);
      s+=G(p[0],p[1],a,1,P(`M${-w} ${-h}L${w-3} ${-h}L${w} ${h}L${-w+3} ${h}Z`,par?'#7FB2EA':'#EFE08A',par?'#4F84C0':'#B9A844',0.6,'opacity=".9"')); });
    return s; } });

add({ id:'charcot', en:'Charcot–Leyden crystals', th:'ผลึก Charcot–Leyden', stain:'wet', um:3, size:'ยาว 20–40 µm',
  key:['ผลึกไม่มีสี รูปเข็มแหลมสองปลาย ยาวเรียว (bipyramidal / hexagonal)','เกิดจากการสลายของ eosinophil (galectin-10)','พบในเสมหะ อุจจาระ สารคัดหลั่ง — มักพบร่วมกับ eosinophil'],
  diff:'MSU crystal (มักอยู่ในน้ำไขข้อ, ใช้ polarized แยก) · เส้นใยพืช',
  sig:'บ่งชี้ภาวะ eosinophil สูงเฉพาะที่ — หอบหืด, ภูมิแพ้, การติดพยาธิ (เช่น ในอุจจาระ: amoebiasis, hookworm, Strongyloides)',
  draw(){ let s=scatter(100,100,94,94,20,(x,y)=>C(x,y,r(0.5,1.3),'#A7A99E',null,0,'opacity=".6"'));
    const cl=(x,y,len,rot)=>G(x,y,rot,1,P(`M${-len} 0L${-len*0.6} -4L${len*0.6} -4L${len} 0L${len*0.6} 4L${-len*0.6} 4Z`,'rgba(255,255,255,.5)','#5E635A',1)+L(-len,0,len,0,'#8D9187',0.6));
    s+=cl(90,80,40,-20)+cl(120,130,30,30)+cl(60,140,22,70)+cl(150,70,18,-60);
    [[40,70],[160,150]].forEach(([x,y])=>s+=C(x,y,14,'#E4E2D6','#6F7368',0.9)+scatter(x,y,10,10,24,(a,b)=>C(a,b,1.2,'#B99B52')));
    return s; } });
})();
/* ---------- กลุ่ม: เซลล์มะเร็งเม็ดเลือด & Cytochemistry ---------- */
(function(){
const CORE = window.__ATLAS_CORE;
Object.assign(CORE.STAINS, {
  mpo: { bg:'#EEEDE6', label:'Cytochemistry: MPO / SBB' },
  nse: { bg:'#EEEAE4', label:'Cytochemistry: NSE (α-naphthyl butyrate)' },
  pas: { bg:'#F1ECEC', label:'Cytochemistry: PAS' },
});
const {C,E,P,L,G,T,blob,scatter,polar,smooth,grad,rbcBg,rbc,lobes,granules,placer,r,ri,TAU,shade} = window.__ATLAS_H;
const add = o => CORE.ITEMS.push(Object.assign({g:'leuk', stain:'wright', um:4.5}, o));
const RBC_R = 17;
const cell = (cx,cy,rad,fill,irr,st) => P(blob(cx,cy,rad,rad*0.96,irr==null?0.04:irr,14,0), fill, st||'#9C8FB8', 0.7);
const chrom = (cx,cy,rx,ry,n,col) => scatter(cx,cy,rx,ry,n,(x,y)=>C(x,y,r(0.4,0.9),col||'#4E3585',null,0,'opacity=".55"'));
const nucleoli = (pts) => pts.map(p=>C(p[0],p[1],p[2]||3,'#B8C4E8','#8E9CD0',0.5)).join('');
function blastCells(n, R, fn){ const sp = placer(n, R*1.05, [], 60, 3000); return rbcBg(8, RBC_R, sp.map(p=>[p[0],p[1],p[2]+2])) + sp.map((p,i)=>fn(p[0],p[1],i)).join(''); }

add({ id:'l_lymphoblast', en:'Lymphoblasts (ALL)', th:'Lymphoblast (มะเร็งเม็ดเลือดขาวเฉียบพลันชนิดลิมฟอยด์)', size:'10–18 µm (1–2 เท่าของ small lymphocyte)', crit:true,
  key:['N:C ratio สูงมาก ไซโทพลาซึมน้อย สีฟ้า ไม่มีแกรนูล','โครมาทินละเอียดกว่า lymphocyte ปกติ nucleoli ไม่ชัด/เล็ก (L1) หรือเห็นชัดในเซลล์ใหญ่ (L2)','ไม่มี Auer rod; MPO/SBB ลบ; PAS อาจบวกเป็นก้อน'],
  diff:'Myeloblast (มี Auer rod, MPO+) · Reactive lymphocyte · Hematogone (B precursor ปกติ) · Small lymphocyte',
  sig:'⚠ ALL — ยืนยันด้วย flow cytometry (B: CD19/cCD79a/CD10, T: cCD3/CD7) + TdT; พบบ่อยในเด็ก 2–5 ปี',
  draw(){ return blastCells(4, 26, (x,y,i)=>{ const R=r(22,27); return cell(x,y,R,'#9EBCE3','',0.03)+P(blob(x+1,y,R-4,R-5,0.07,11),'#5B3F95')+chrom(x+1,y,R-8,R-8,50,'#3E2670')+(i%2?nucleoli([[x+4,y-3,2.2]]):''); }); } });

add({ id:'l_apl', en:'Abnormal promyelocytes & faggot cell (APL, AML-M3)', th:'Abnormal promyelocyte / Faggot cell (APL)', size:'15–25 µm', crit:true,
  key:['ไซโทพลาซึมเต็มไปด้วยแกรนูลหยาบสีแดงม่วง (hypergranular) บดบังขอบนิวเคลียส','นิวเคลียส 2 พู/รูปผีเสื้อ (bilobed, butterfly)','Faggot cell = มี Auer rods จำนวนมากเรียงเป็นมัดคล้ายฟืน','MPO/SBB บวกเข้มมาก (++++); HLA-DR−, CD34−'],
  diff:'Promyelocyte ปกติ (นิวเคลียสกลม มี Golgi zone, ไม่มี Auer rods) · Microgranular variant (M3v) แกรนูลมองไม่เห็นในกล้องธรรมดา',
  sig:'⚠ ภาวะฉุกเฉินทางโลหิตวิทยา — เสี่ยง DIC/เลือดออกในสมอง แจ้งแพทย์ทันที, ตรวจ PT/APTT/fibrinogen, ยืนยัน PML::RARA t(15;17) และเริ่ม ATRA ได้ทันทีที่สงสัย',
  draw(){ return blastCells(3, 30, (x,y,i)=>{ let s=cell(x,y,29,'#E8C3D2','',0.05)+P(`M${x-14} ${y-12}C${x-2} ${y-20} ${x-2} ${y-2} ${x-4} ${y}C${x-2} ${y+2} ${x-2} ${y+20} ${x-14} ${y+12}C${x-24} ${y+6} ${x-24} ${y-6} ${x-14} ${y-12}Z`,'#6E4AA6')+P(`M${x+2} ${y-12}C${x+16} ${y-18} ${x+22} ${y-2} ${x+14} ${y+6}C${x+10} ${y+12} ${x+2} ${y+10} ${x-2} ${y}Z`,'#6E4AA6');
      s+=granules(x,y,26,26,95,0.8,1.5,'#8E1F5E','.9');
      if(i===0){ for(let k=0;k<7;k++){ const a=0.5+k*0.08; s+=L(x+8+Math.cos(a)*2,y+8+k*1.4,x+8+Math.cos(a)*16,y-6+k*1.4,'#C2185B',1.1); } }
      else s+=L(x+10,y+10,x+20,y+2,'#C2185B',1.4);
      return s; }); } });

add({ id:'l_mono', en:'Monoblasts & promonocytes (AML-M5)', th:'Monoblast / Promonocyte (AML-M4/M5)', size:'15–25 µm', crit:true,
  key:['Monoblast: เซลล์ใหญ่ ไซโทพลาซึมมาก สีเทาอมฟ้า อาจมี pseudopod; นิวเคลียสกลม โครมาทินละเอียดเป็นลายลูกไม้ มี nucleolus ใหญ่ 1–2 อัน','Promonocyte: นิวเคลียสเริ่มพับ/บิดเป็นรอยย่น (convoluted) ไซโทพลาซึมมีแกรนูลฝุ่นละเอียด + vacuole','Auer rod พบได้น้อย; NSE บวกและถูกยับยั้งด้วย NaF'],
  diff:'Myeloblast (ไซโทพลาซึมน้อยกว่า, MPO+ เข้ม) · Monocyte ปกติ · Reactive lymphocyte',
  sig:'⚠ AML monocytic — มักมีเหงือกบวม (gingival hyperplasia), ผื่นผิวหนัง, CNS involvement; KMT2A rearrangement t(9;11); ระวัง DIC/leukostasis',
  draw(){ return blastCells(3, 32, (x,y,i)=>{ let s=P(blob(x,y,32,30,0.12,12),'#BFC4DB','#9D98B8',0.7)+granules(x,y,28,26,30,0.4,0.7,'#B195B8','.6')+C(x+18,y+12,3,'#EEF0F6','#B7B3CD',0.5);
      if(i===1){ s+=P(smooth([[x-16,y-6],[x-8,y-18],[x+8,y-16],[x+14,y-4],[x+6,y+2],[x+10,y+12],[x-4,y+14],[x-14,y+8],[x-6,y+2]],true),'#6A51A0')+chrom(x-2,y-2,12,10,30,'#8B76BF'); }
      else { s+=C(x-3,y-2,17,'#6A51A0')+chrom(x-3,y-2,14,14,45,'#8B76BF')+nucleoli([[x-6,y-6,4],[x+4,y+4,2.6]]); }
      return s; }); } });

add({ id:'l_megakb', en:'Megakaryoblasts (AML-M7)', th:'Megakaryoblast (AML-M7)', size:'10–30 µm (ขนาดหลากหลาย)', crit:true,
  key:['ไซโทพลาซึมสีน้ำเงินเข้ม ไม่มีแกรนูล มีตุ่ม/ติ่งยื่นออกคล้ายเกล็ดเลือด (cytoplasmic blebs/budding)','นิวเคลียสกลม โครมาทินหนาแน่นปานกลาง อาจเห็น nucleoli','อาจพบเกล็ดเลือดขนาดใหญ่/ชิ้นส่วน megakaryocyte ร่วม'],
  diff:'Lymphoblast (ไม่มีติ่ง) · Myeloblast · ยืนยันด้วย CD41/CD61 (MPO ลบ)',
  sig:'⚠ AML-M7 — มัก BM fibrosis (dry tap) ต้องใช้ biopsy; พบใน Down syndrome และทารก t(1;22)',
  draw(){ return blastCells(3, 28, (x,y,i)=>{ let s=''; for(let k=0;k<5;k++){ const a=r(0,TAU); s+=C(x+Math.cos(a)*24,y+Math.sin(a)*24,r(4,6),'#6C8AC6','#4A68A8',0.5); }
      return s+cell(x,y,24,'#5F7FC0','',0.06,'#4A68A8')+C(x-2,y,15,'#4B2F84')+chrom(x-2,y,12,12,30,'#35206A')+nucleoli([[x+2,y-4,2.4]]); }); } });

add({ id:'l_burkitt', en:'Burkitt cells (mature B-ALL / FAB L3)', th:'Burkitt cell (FAB L3)', size:'10–25 µm', crit:true,
  key:['ไซโทพลาซึมสีน้ำเงินเข้มมาก (deeply basophilic)','มี vacuole ใสจำนวนมาก (ไขมัน) ทั้งในไซโทพลาซึมและทับนิวเคลียส','นิวเคลียสกลม โครมาทินละเอียด nucleoli 2–5 อัน'],
  diff:'Lymphoblast L1/L2 (ไม่มี vacuole เด่น, TdT+) · Plasmablast',
  sig:'⚠ Burkitt lymphoma/leukemia — sIg+ CD10+ TdT−, MYC t(8;14); เติบโตเร็วมาก เสี่ยง tumor lysis syndrome',
  draw(){ return blastCells(4, 25, (x,y)=>{ const R=r(22,26); return cell(x,y,R,'#2E4F9E','',0.04,'#1E3A80')+P(blob(x,y,R-6,R-7,0.06,10),'#4D2F8A')+chrom(x,y,R-10,R-10,30,'#34206A')+nucleoli([[x-4,y-4,2.4],[x+5,y+3,2]])+scatter(x,y,R-2,R-2,10,(a,b)=>C(a,b,r(1.4,2.6),'#EEF2FA','#B8C6E4',0.4)); }); } });

add({ id:'l_cll', en:'CLL cells & smudge cells', th:'เซลล์ CLL และ smudge cell', size:'7–10 µm (small mature lymphocyte)',
  key:['ลิมโฟไซต์ขนาดเล็กจำนวนมาก ดูเหมือนเซลล์ปกติ','โครมาทินจับเป็นก้อนเป็นแผ่น ๆ คล้ายลูกฟุตบอล (soccer-ball / clumped chromatin)','พบ smudge cell จำนวนมาก','Prolymphocyte (มี nucleolus ชัด) < 55%'],
  diff:'Reactive lymphocytosis (เซลล์หลากหลาย) · Mantle cell (นิวเคลียสหยัก) · Hairy cell',
  sig:'CLL — ยืนยันด้วย flow (CD5+ CD23+ CD200+ FMC7− sIg dim, Matutes ≥ 4) และ clonal B ≥ 5 ×10⁹/L',
  draw(){ let s=rbcBg(6,RBC_R,[[100,100,70]]); placer(9,19,[],66,3000).forEach((p,i)=>{ const x=p[0],y=p[1];
      if(i%4===3){ s+=P(blob(x,y,16,13,0.35,10,30),'#9A82C2','none',0,'opacity=".7"'); for(let k=0;k<5;k++){ const a=r(0,TAU); s+=L(x,y,x+Math.cos(a)*18,y+Math.sin(a)*18,'#8A70B6',1,'opacity=".6"'); } }
      else { s+=C(x,y,17,'#AFCBEA','#8FB0D6',0.5)+C(x+1,y,14.5,'#3E2468'); for(let k=0;k<7;k++){ const a=k/7*TAU; s+=P(blob(x+1+Math.cos(a)*7,y+Math.sin(a)*7,3.4,2.8,0.2,6),'#28144C'); } s+=C(x+1,y,3,'#28144C'); } });
    return s; } });

add({ id:'l_hairy', en:'Hairy cells (Hairy cell leukemia)', th:'Hairy cell', size:'12–20 µm',
  key:['ขอบไซโทพลาซึมมีขนหรือติ่งบาง ๆ รอบเซลล์ (circumferential hairy projections)','ไซโทพลาซึมสีฟ้าเทาอ่อนปริมาณปานกลาง','นิวเคลียสรูปไข่/รูปถั่ว โครมาทินละเอียด ไม่มี nucleolus เด่น'],
  diff:'Splenic marginal zone lymphoma (villous lymphocyte — ขนอยู่ที่ขั้วเดียว) · Monocyte',
  sig:'Pancytopenia + monocytopenia + ม้ามโต; flow: CD11c/CD25/CD103/CD123+, BRAF V600E; TRAP+; มัก dry tap',
  draw(){ return blastCells(3, 30, (x,y)=>{ let s=''; for(let k=0;k<28;k++){ const a=k/28*TAU+r(0,.1); const r0=22; s+=P(`M${x+Math.cos(a)*r0} ${y+Math.sin(a)*r0}q${Math.cos(a+0.6)*4} ${Math.sin(a+0.6)*4} ${Math.cos(a)*r(6,10)} ${Math.sin(a)*r(6,10)}`,'none','#9DB6DA',1.3); }
      return s+cell(x,y,23,'#C4D4EC','',0.05,'#9DB6DA')+E(x-2,y+1,12,9,r(0,180),'#5C4596')+chrom(x-2,y+1,9,7,24,'#7E69B4'); }); } });

add({ id:'l_cml', en:'CML blood picture', th:'ภาพเลือด CML', size:'—',
  key:['WBC สูงมาก เห็นเซลล์ granulocyte ทุกระยะ (myeloblast → segmented) “myelocyte bulge”','Basophil และ eosinophil เพิ่มขึ้น (basophilia สำคัญ)','Blast < 10% ในระยะเรื้อรัง; เกล็ดเลือดปกติ/สูง'],
  diff:'Leukemoid reaction (มี toxic granulation, ไม่มี basophilia, LAP สูง) · CMML (monocytosis) · PMF',
  sig:'ยืนยันด้วย BCR::ABL1 / Ph chromosome t(9;22); LAP score ต่ำ; ติดตามการรักษาด้วย BCR::ABL1 %IS',
  draw(){ let s=rbcBg(4,RBC_R,[[100,100,90]]);
    const myel=(x,y)=>cell(x,y,24,'#E6CBD6')+granules(x,y,21,21,40,0.6,1,'#9C5A8C','.8')+C(x-6,y,11,'#5A3B90');
    const meta=(x,y)=>cell(x,y,22,'#EDD3DC')+granules(x,y,19,19,40,0.5,0.9,'#B97C9E','.8')+P(`M${x-10} ${y-8}C${x+6} ${y-14} ${x+10} ${y} ${x-2} ${y+2}C${x+8} ${y+6} ${x+4} ${y+14} ${x-10} ${y+8}C${x-16} ${y} ${x-16} ${y} ${x-10} ${y-8}Z`,'#4B2A7B');
    const seg=(x,y)=>cell(x,y,21,'#EDD3DC')+granules(x,y,18,18,40,0.5,0.9,'#B97C9E','.8')+lobes([[x-8,y-2,5.4],[x+2,y-9,5.2],[x+9,y+3,5.4]]);
    const baso=(x,y)=>cell(x,y,19,'#E4D4E8')+granules(x,y,16,16,26,1.6,2.6,'#2B1045');
    const eos=(x,y)=>cell(x,y,21,'#F3DCCB')+granules(x,y,18,18,55,1.5,1.9,'#E0643A')+lobes([[x-7,y,6.2],[x+7,y,6.2]]);
    const blast=(x,y)=>cell(x,y,22,'#8DB0DD','',0.03)+C(x-2,y,16,'#7253A6')+nucleoli([[x-4,y-4,2.4],[x+3,y+3,2]]);
    const fns=[myel,meta,seg,baso,myel,seg,eos,myel,meta,blast,seg,myel];
    placer(12,24,[],74,4000).forEach((p,i)=>s+=fns[i%fns.length](p[0],p[1]));
    return s; } });

add({ id:'l_myeloma', en:'Myeloma plasma cells (bone marrow)', th:'Plasma cell ในไขกระดูก (Multiple myeloma)', size:'10–20 µm',
  key:['plasma cell จำนวนมากเป็นกลุ่ม (clonal plasma cell ≥ 10% ในไขกระดูก)','นิวเคลียสอยู่ชิดขอบ, perinuclear hof, ไซโทพลาซึมน้ำเงินเข้ม','อาจพบ binucleate, nucleolus ชัด, Russell bodies / Mott cell, flame cell','PB: rouleaux ชัด'],
  diff:'Reactive plasmacytosis (polyclonal, มักไม่เกิน 10%) · Lymphoplasmacytic lymphoma',
  sig:'ร่วมกับ SPEP/IFE (M-protein), serum free light chain, CRAB/SLiM-CRAB; flow: CD38/CD138+, CD19−, CD56+, cytoplasmic light chain monotypic',
  draw(){ let s=rbcBg(4,RBC_R,[[100,100,88]]); placer(9,23,[],72,4000).forEach((p,i)=>{ const x=p[0],y=p[1],rot=r(0,360); let cl=''; for(let k=0;k<7;k++){ const a=k/7*TAU; cl+=C(Math.cos(a)*6,Math.sin(a)*6,2,'#241046'); }
      s+=G(x,y,rot,1,E(0,0,22,16,0,'#3E6CB3','#2D548F',0.8)+E(-1,0,6,8,0,'#A9C2E6','none',0,'opacity=".85"')+C(-12,0,10,'#6A4D9E')+cl+(i===4?C(10,4,4,'#E7A7C8','#B85C8F',0.6)+C(12,-5,3,'#E7A7C8','#B85C8F',0.6):'')+(i===2?C(10,0,8,'#6A4D9E'):'')); });
    return s; } });

add({ id:'l_mpo', en:'MPO stain: myeloblasts positive vs lymphoblasts negative', th:'การย้อม MPO (Myeloperoxidase)', stain:'mpo', size:'—',
  key:['ผลบวก = แกรนูลสีน้ำตาลดำ (DAB) หรือดำ (SBB) ในไซโทพลาซึม','Myeloblast/promyelocyte/neutrophil บวก; monocyte บวกอ่อน กระจาย','Lymphoblast และ lymphocyte ลบ (ใช้เป็น internal negative control)','Blast บวก ≥ 3% = myeloid lineage'],
  diff:'AML-M0 และ M7 ให้ผล < 3% · สไลด์เก่า/โดนแสง = ลบปลอม',
  sig:'ใช้แยก AML vs ALL อย่างรวดเร็วก่อนผล flow cytometry',
  draw(){ let s=rbcBg(7,RBC_R,[[100,100,60]],{col:'#E7C9B5',pale:'#F3E6DC',pallor:0.3});
    placer(6,25,[],62,4000).forEach((p,i)=>{ const x=p[0],y=p[1]; s+=cell(x,y,24,'#DCDDE6','',0.04,'#A9ABBE')+C(x-3,y,16,'#8C8FB0');
      if(i<4){ s+=granules(x,y,22,22,i===0?90:50,0.6,1.3,'#3A2410','.95')+(i===0?L(x+10,y-8,x+16,y+6,'#1E1208',1.6):''); } }); return s; } });

add({ id:'l_nse', en:'Non-specific esterase (NSE) — monocytic positive', th:'การย้อม NSE (Non-specific esterase)', stain:'nse', size:'—',
  key:['ผลบวก = สีน้ำตาลแดง/ส้มกระจายทั่วไซโทพลาซึม (diffuse)','Monoblast/monocyte บวกเข้ม และ ถูกยับยั้งเมื่อเติม NaF (fluoride)','Granulocyte ลบ (หรือบวกอ่อน)'],
  diff:'Megakaryoblast อาจบวกแบบเป็นจุดแต่ไม่ถูกยับยั้งด้วย NaF · CAE (specific esterase) บวกใน granulocyte',
  sig:'ช่วยจัด AML-M4 (NSE ≥ 20%) / M5 (monocytic ≥ 80%)',
  draw(){ let s=rbcBg(7,RBC_R,[[100,100,60]],{col:'#E2CFC0',pale:'#F2E8E0',pallor:0.3});
    placer(5,28,[],60,4000).forEach((p,i)=>{ const x=p[0],y=p[1]; const pos=i<3; s+=P(blob(x,y,27,25,0.1,12), pos?grad([[0,'#D98A4A'],[1,'#A8472A']]):'#DCDDE6', pos?'#8A3A20':'#A9ABBE',0.7)+C(x-3,y,15,pos?'#7C6A9C':'#8C8FB0','none',0,'opacity=".85"'); }); return s; } });

add({ id:'l_pas', en:'PAS block positivity in lymphoblasts', th:'การย้อม PAS (block positivity ใน ALL)', stain:'pas', size:'—',
  key:['สารสีม่วงแดง (magenta) รวมตัวเป็นก้อนหยาบ (block/coarse granules) ในไซโทพลาซึมของ lymphoblast','พื้นไซโทพลาซึมส่วนอื่นไม่ติดสี','Erythroblast ผิดปกติ (M6) บวกแบบกระจายหรือเป็นก้อน'],
  diff:'Neutrophil ปกติบวกแบบกระจายละเอียด (glycogen) · Megakaryoblast บวกเป็นเม็ด',
  sig:'สนับสนุน ALL (ไม่จำเพาะ) — ปัจจุบันใช้ flow cytometry ยืนยัน',
  draw(){ let s=rbcBg(8,RBC_R,[[100,100,60]],{col:'#E6C8CF',pale:'#F4E6E9',pallor:0.3});
    placer(5,24,[],60,4000).forEach((p,i)=>{ const x=p[0],y=p[1]; s+=cell(x,y,22,'#E4E0EA','',0.04,'#B7B0C6')+C(x,y,17,'#6F6C93'); if(i<4){ for(let k=0;k<ri(2,4);k++){ const a=r(0,TAU); s+=P(blob(x+Math.cos(a)*19,y+Math.sin(a)*19,r(2.4,3.6),r(2,3),0.3,6),'#B01E6E'); } } }); return s; } });
})();
/* ---------- UI ของแอตลาส: กริดภาพ, รายละเอียด, โหมดทบทวน/ควิซ ---------- */
(function(){
'use strict';
const CORE = window.__ATLAS_CORE, ITEMS = CORE.ITEMS, STAINS = CORE.STAINS;
const GROUPS = [
  { id:'all',   label:'ทั้งหมด' },
  { id:'wbc',   label:'เม็ดเลือดขาว/เกล็ดเลือด' },
  { id:'rbc',   label:'เม็ดเลือดแดง & Inclusion' },
  { id:'bpara', label:'ปรสิตในเลือด' },
  { id:'spara', label:'ไข่พยาธิ & โปรโตซัว' },
  { id:'urine', label:'ตะกอนปัสสาวะ' },
  { id:'bact',  label:'แบคทีเรีย' },
  { id:'fungi', label:'เชื้อรา' },
  { id:'fluid', label:'สารน้ำ/อสุจิ/เซลล์วิทยา' },
  { id:'leuk',  label:'มะเร็งเม็ดเลือด & Cytochem' },
];
const byId = {}; ITEMS.forEach((it,i)=>{ it._i=i; byId[it.id]=it; });
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LS = { get(k,d){ try{ const v=localStorage.getItem('mtq_atlas_'+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } },
             set(k,v){ try{ localStorage.setItem('mtq_atlas_'+k, JSON.stringify(v)); }catch(e){} } };

const st = { tab:'grid', group:LS.get('group','all'), q:'', hide:false, revealed:{}, quiz:null, score:LS.get('score',{ok:0,total:0}) };
let root = null, io = null;

function list(){
  const q = st.q.trim().toLowerCase();
  return ITEMS.filter(it => (st.group==='all' || it.g===st.group) &&
    (!q || (it.en+' '+it.th+' '+(it.key||[]).join(' ')+' '+(it.diff||'')).toLowerCase().includes(q)));
}
function countOf(g){ return g==='all' ? ITEMS.length : ITEMS.filter(i=>i.g===g).length; }

function header(){
  return `<div class="section-head"><h2>🔬 แอตลาสกล้องจุลทรรศน์</h2>
    <p>ภาพวาดประกอบ ${ITEMS.length} รายการ เน้น “จุดสังเกต” ที่ใช้ระบุชนิดเมื่อมองผ่านกล้อง · มีแถบสเกล µm ให้เทียบขนาด · ใช้คู่กับสไลด์จริงเสมอ</p></div>
    <div class="at-tabs" role="tablist">
      <button class="at-tab ${st.tab==='grid'?'on':''}" data-act="tab" data-v="grid">📖 ดูภาพ</button>
      <button class="at-tab ${st.tab==='quiz'?'on':''}" data-act="tab" data-v="quiz">🎯 ฝึกระบุ (Quiz)</button>
      <span class="at-score" title="คะแนนสะสมในเครื่องนี้">✔ ${st.score.ok}/${st.score.total}</span>
    </div>
    <div class="at-chips">${GROUPS.map(g=>`<button class="at-chip ${st.group===g.id?'on':''}" data-act="group" data-v="${g.id}">${esc(g.label)} <span>${countOf(g.id)}</span></button>`).join('')}</div>`;
}

function gridView(){
  const items = list();
  return `<div class="at-tools">
      <input type="search" class="at-search" placeholder="ค้นหาชื่อ/ลักษณะ เช่น Schüffner, envelope, capsule…" value="${esc(st.q)}" data-act="q">
      <label class="at-toggle"><input type="checkbox" data-act="hide" ${st.hide?'checked':''}> ซ่อนชื่อ (ทบทวนตัวเอง)</label>
    </div>
    <div class="at-grid">${items.map(it=>{
      const hidden = st.hide && !st.revealed[it.id];
      return `<button class="at-card ${it.crit?'crit':''}" data-act="open" data-v="${it.id}" aria-label="${hidden?'ภาพปริศนา':esc(it.en)}">
        <div class="at-img" data-svg="${it.id}"></div>
        <div class="at-name">${hidden?'<span class="at-q">? แตะดูชื่อในรายละเอียด</span>':`${it.crit?'<span class="at-crit">⚠</span> ':''}${esc(it.en)}`}</div>
        ${hidden?'':`<div class="at-th">${esc(it.th)}</div>`}
        <div class="at-stain">${esc((STAINS[it.stain]||{}).label||'')}</div>
      </button>`; }).join('') || '<p class="at-empty">ไม่พบรายการ ลองคำค้นอื่น</p>'}</div>`;
}

/* ---------------- quiz ---------------- */
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function newQuestion(){
  const pool = st.group==='all' ? ITEMS : ITEMS.filter(i=>i.g===st.group);
  if(pool.length<2) return null;
  const last = st.quiz && st.quiz.item;
  let item; do{ item = pool[Math.floor(Math.random()*pool.length)]; }while(pool.length>1 && item===last);
  const same = shuffle(ITEMS.filter(i=>i!==item && i.g===item.g));
  const other = shuffle(ITEMS.filter(i=>i!==item && i.g!==item.g));
  const opts = shuffle([item, ...same.concat(other).slice(0,3)]);
  st.quiz = { item, opts, picked:null };
}
function quizView(){
  if(!st.quiz || !st.quiz.item || (st.group!=='all' && st.quiz.item.g!==st.group)) newQuestion();
  const qz = st.quiz; if(!qz) return '<p class="at-empty">หมวดนี้มีภาพไม่พอสำหรับควิซ</p>';
  const it = qz.item, done = qz.picked!=null;
  return `<div class="at-quiz">
    <div class="at-quiz-img">${CORE.svgFor(it)}</div>
    <div class="at-quiz-side">
      <p class="at-quiz-q">ภาพนี้คืออะไร? <small>(${esc((STAINS[it.stain]||{}).label||'')})</small></p>
      <div class="at-opts">${qz.opts.map(o=>{
        let cls=''; if(done){ if(o===it) cls='ok'; else if(o.id===qz.picked) cls='bad'; }
        return `<button class="at-opt ${cls}" data-act="pick" data-v="${o.id}" ${done?'disabled':''}>${esc(o.en)}<small>${esc(o.th)}</small></button>`; }).join('')}</div>
      ${done ? `<div class="at-feedback ${qz.picked===it.id?'ok':'bad'}">${qz.picked===it.id?'✅ ถูกต้อง!':'❌ ยังไม่ถูก — คำตอบคือ <b>'+esc(it.en)+'</b>'}</div>
        <div class="at-keys"><h4>จุดสังเกต</h4><ul>${it.key.map(k=>`<li>${esc(k)}</li>`).join('')}</ul>${it.diff?`<p><b>แยกจาก:</b> ${esc(it.diff)}</p>`:''}</div>
        <button class="upload-btn at-next" data-act="next">ข้อต่อไป →</button>` : `<button class="at-link" data-act="skip">ข้าม ↻</button>`}
      <button class="at-link" data-act="reset">รีเซ็ตคะแนน</button>
    </div></div>`;
}

/* ---------------- detail modal ---------------- */
let modalId = null;
function modalHTML(it){
  const nav = list(); const idx = nav.indexOf(it);
  const prev = idx>0 ? nav[idx-1] : null, next = idx>=0 && idx<nav.length-1 ? nav[idx+1] : null;
  return `<div class="at-modal-bg" data-act="close"></div>
  <div class="at-modal" role="dialog" aria-modal="true" aria-label="${esc(it.en)}">
    <button class="at-x" data-act="close" aria-label="ปิด">✕</button>
    <div class="at-m-img">${CORE.svgFor(it)}</div>
    <div class="at-m-body">
      <h3>${it.crit?'<span class="at-crit">⚠</span> ':''}${esc(it.en)}</h3>
      <p class="at-m-th">${esc(it.th)}</p>
      <div class="at-m-meta"><span>🧫 ${esc((STAINS[it.stain]||{}).label||'')}</span>${it.size?`<span>📏 ${esc(it.size)}</span>`:''}</div>
      <h4>จุดสังเกตที่ใช้ระบุ</h4><ul>${(it.key||[]).map(k=>`<li>${esc(k)}</li>`).join('')}</ul>
      ${it.diff?`<h4>แยกจาก (look-alikes)</h4><p>${esc(it.diff)}</p>`:''}
      ${it.sig?`<h4>ความสำคัญ / การรายงาน</h4><p class="${it.crit?'at-sig-crit':''}">${esc(it.sig)}</p>`:''}
      <p class="at-note">ภาพวาดประกอบเพื่อการเรียนรู้ ไม่ใช่ภาพถ่ายจริง — สีและขนาดอาจต่างจากสไลด์จริงตามเทคนิคการย้อม</p>
      <div class="at-m-nav">${prev?`<button class="upload-btn upload-btn-cam" data-act="open" data-v="${prev.id}">← ก่อนหน้า</button>`:'<span></span>'}${next?`<button class="upload-btn upload-btn-cam" data-act="open" data-v="${next.id}">ถัดไป →</button>`:''}</div>
    </div></div>`;
}
function openModal(id){
  const it = byId[id]; if(!it) return;
  if(st.hide) st.revealed[id] = true;
  let m = document.getElementById('at-modal-wrap');
  if(!m){ m = document.createElement('div'); m.id='at-modal-wrap'; document.body.appendChild(m); m.addEventListener('click', onClick); }
  m.innerHTML = modalHTML(it); m.hidden = false; modalId = id;
  document.documentElement.classList.add('at-lock');
  const b = m.querySelector('.at-modal'); if(b) b.scrollTop = 0;
}
function closeModal(){
  const m = document.getElementById('at-modal-wrap'); if(m){ m.hidden = true; m.innerHTML=''; }
  modalId = null; document.documentElement.classList.remove('at-lock');
  if(st.hide && root) draw();
}
document.addEventListener('keydown', e=>{
  if(!modalId) return;
  if(e.key==='Escape') closeModal();
  if(e.key==='ArrowRight' || e.key==='ArrowLeft'){ const nav=list(); const i=nav.findIndex(x=>x.id===modalId); const n=nav[i+(e.key==='ArrowRight'?1:-1)]; if(n) openModal(n.id); }
});

/* ---------------- lazy SVG painting ---------------- */
function paintLazy(){
  const els = root.querySelectorAll('.at-img[data-svg]');
  if(!('IntersectionObserver' in window)){ els.forEach(el=>{ el.innerHTML = CORE.svgFor(byId[el.dataset.svg]); el.removeAttribute('data-svg'); }); return; }
  if(io) io.disconnect();
  io = new IntersectionObserver(ents=>{ ents.forEach(en=>{ if(en.isIntersecting){ const el=en.target; el.innerHTML = CORE.svgFor(byId[el.dataset.svg]); el.removeAttribute('data-svg'); io.unobserve(el); } }); }, { rootMargin:'300px 0px' });
  els.forEach(el=>io.observe(el));
}

function draw(){
  if(!root) return;
  root.innerHTML = header() + (st.tab==='quiz' ? quizView() : gridView());
  if(st.tab==='grid') paintLazy();
}

let qTimer;
function onClick(e){
  const t = e.target.closest('[data-act]'); if(!t) return;
  const act = t.dataset.act, v = t.dataset.v;
  if(act==='tab'){ st.tab=v; draw(); }
  else if(act==='group'){ st.group=v; LS.set('group',v); if(st.tab==='quiz') newQuestion(); draw(); }
  else if(act==='open'){ openModal(v); }
  else if(act==='close'){ if(e.target===t || t.classList.contains('at-x')) closeModal(); }
  else if(act==='pick'){ if(st.quiz.picked!=null) return; st.quiz.picked=v; st.score.total++; if(v===st.quiz.item.id) st.score.ok++; LS.set('score',st.score); draw(); }
  else if(act==='next' || act==='skip'){ newQuestion(); draw(); root.scrollIntoView({block:'start'}); }
  else if(act==='reset'){ st.score={ok:0,total:0}; LS.set('score',st.score); draw(); }
}
function onInput(e){
  const t = e.target;
  if(t.dataset.act==='q'){ st.q=t.value; clearTimeout(qTimer); qTimer=setTimeout(()=>{ const pos=t.selectionStart; draw(); const n=root.querySelector('.at-search'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(_){} } },160); }
  if(t.dataset.act==='hide'){ st.hide=t.checked; st.revealed={}; draw(); }
}

window.ATLAS = {
  items: ITEMS, groups: GROUPS, byId, svgFor: CORE.svgFor,
  mount(el, opts){
    root = el; opts = opts||{};
    if(opts.group && GROUPS.some(g=>g.id===opts.group)) st.group = opts.group;
    if(!el._atlasBound){ el.addEventListener('click', onClick); el.addEventListener('input', onInput); el.addEventListener('change', onInput); el._atlasBound = true; }
    draw();
  },
  open: openModal,
};
document.dispatchEvent(new Event('atlas-ready'));
})();
