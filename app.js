/* ===== Money (local-first Mac dashboard) ===== */
const KEY = 'money.v1';
const $ = id => document.getElementById(id);

/* Light theme (2026-08-19). Same six named hues as day zero, deepened so they
   hold their own on white. Pastels vanished against the light background. */
const CATS = [
  { key:'foodout',   name:'Food Out',        color:'#ef5350' },
  { key:'groceries', name:'Groceries',       color:'#0d9488' },
  { key:'car',       name:'Car and Transit', color:'#2563eb' },
  { key:'fun',       name:'Fun',             color:'#7c3aed' },
  { key:'subs',      name:'Subscriptions',   color:'#db2777' },
  { key:'other',     name:'Other',           color:'#475569' },
];
const SRCS = [
  { key:'sts',    name:'SitesThatSell', color:'#15a34a' },
  { key:'colin',  name:'Colin',         color:'#7c3aed' },
  { key:'oddjob', name:'Odd job',       color:'#0d9488' },
  { key:'gift',   name:'Gift',          color:'#db2777' },
  { key:'other',  name:'One-off',       color:'#475569' },
];
const GREEN = '#15a34a', RED = '#dc2626', BLUE = '#2563eb';
const INK = '#000000', TRACK = '#e2e2e9';

/* Black or white text on a given swatch, whichever actually reads.
   Hardcoding one or the other broke as soon as the palette deepened. */
function inkOn(hex){
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  const lin = c => { c /= 255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const L = 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
  return L > 0.45 ? '#000000' : '#ffffff';
}

const DEFAULTS = {
  start: todayStr(),
  tx: [],            // {id, date, kind: spend|income|invest, amount, cat, src, note}
  budgets: {},       // catKey -> monthly cap
  seedKilled: [],    // seed ids deleted by hand, never re-added
  tfsa: 0,           // TFSA balance, a holding not a flow, updated by hand
  tfsaAt: '',        // date the balance was last entered, drives the Friday due flag
  goals: {},         // income, ceiling, invest, investFrom, kept. See renderGoals.
};

let DB = load();
let form = { kind:'spend', cat:'foodout', src:'sts', editing:null };
let ledgerFilter = 'month';
/* Every month-scoped view reads viewMonth, so the arrows on the hero move all of
   them at once. It only ever holds a real month between DB.start and today. */
let viewMonth = monthKey(todayStr());
function isThisMonth(){ return viewMonth === monthKey(todayStr()); }
function shiftMonth(step){
  const all = monthsSinceStart();
  const i = all.indexOf(viewMonth);
  const next = all[(i < 0 ? all.length - 1 : i) + step];
  if(!next) return;
  viewMonth = next;
  renderAll();
}

/* ---------- storage ---------- */
function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(raw){ return Object.assign(structuredClone(DEFAULTS), JSON.parse(raw)); }
  }catch(e){}
  return structuredClone(DEFAULTS);
}
function save(){ localStorage.setItem(KEY, JSON.stringify(DB)); ledgerPush(); }
/* Ledger hook (2026-08-16): post today's totals to Andrew's local Ledger review app when it is running. Silent if it is not. */
let ledgerT;
function ledgerPush(){
  clearTimeout(ledgerT);
  ledgerT=setTimeout(()=>{
    try{
      const date=todayStr(); const list=(DB.tx||[]).filter(t=>t.date===date);
      const sum=k=>Math.round(list.filter(t=>t.kind===k).reduce((a,t)=>a+t.amount,0)*100)/100;
      const money={spent:sum('spend'),income:sum('income'),invested:sum('invest'),items:list.length};
      fetch('http://localhost:3232/api/tracker/'+date,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({money}),keepalive:true}).catch(()=>{});
    }catch(e){}
  },800);
}

/* ---------- seed (entries written from chat, see seed.js) ---------- */
function applySeed(){
  const seed = window.MONEY_SEED;
  if(!seed) return;
  let touched = false;
  const killed = DB.seedKilled || (DB.seedKilled = []);
  const have = new Set(DB.tx.map(t=>t.id));
  (seed.tx || []).forEach(t=>{
    if(have.has(t.id) || killed.includes(t.id)) return;
    DB.tx.push(Object.assign({}, t));
    touched = true;
  });
  if(seed.tfsa && !DB.tfsa){ DB.tfsa = seed.tfsa; touched = true; }
  Object.keys(seed.budgets || {}).forEach(k=>{
    if(DB.budgets[k]) return;
    DB.budgets[k] = seed.budgets[k];
    touched = true;
  });
  const earliest = DB.tx.reduce((a,t)=> t.date < a ? t.date : a, DB.start);
  if(earliest < DB.start){ DB.start = earliest; touched = true; }
  if(touched) save();
}

/* ---------- date helpers ---------- */
function todayStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function monthKey(dateStr){ return dateStr.slice(0,7); }
function monthName(mk){
  const [y,m] = mk.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleString('en-CA', { month:'long', year:'numeric' });
}
function monthShort(mk){
  const [y,m] = mk.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleString('en-CA', { month:'short' });
}
function monthsSinceStart(){
  const out = [];
  let [y,m] = monthKey(DB.start).split('-').map(Number);
  const [cy,cm] = monthKey(todayStr()).split('-').map(Number);
  while(y < cy || (y === cy && m <= cm)){
    out.push(y + '-' + String(m).padStart(2,'0'));
    m++; if(m > 12){ m = 1; y++; }
  }
  return out;
}

/* ---------- money helpers ---------- */
function fmt(n){
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const frac = Math.round(abs * 100) % 100 !== 0;
  return sign + '$' + abs.toLocaleString('en-CA', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
}
function txInMonth(mk){ return DB.tx.filter(t => monthKey(t.date) === mk); }
function sums(mk){
  const list = txInMonth(mk);
  const income = list.filter(t=>t.kind==='income').reduce((a,t)=>a+t.amount,0);
  const spend  = list.filter(t=>t.kind==='spend').reduce((a,t)=>a+t.amount,0);
  const invest = list.filter(t=>t.kind==='invest').reduce((a,t)=>a+t.amount,0);
  return { income, spend, invest, net: income - spend - invest };
}
function catName(k){ const c = CATS.find(c=>c.key===k); return c ? c.name : k; }
function catColor(k){ const c = CATS.find(c=>c.key===k); return c ? c.color : '#475569'; }
function srcName(k){ const s = SRCS.find(s=>s.key===k); return s ? s.name : k; }

/* ================= HERO ================= */
function renderHero(){
  const mk = viewMonth;
  const s = sums(mk);
  $('moLabel').textContent = 'Net in ' + monthName(mk);
  const all = monthsSinceStart(), i = all.indexOf(mk);
  $('moPrev').disabled = i <= 0;
  $('moNext').disabled = i >= all.length - 1;
  const net = $('heroNet');
  net.textContent = (s.net >= 0 ? '+' : '') + fmt(s.net);
  net.className = 'val ' + (s.net >= 0 ? 'pos' : 'neg');
  $('heroIn').textContent = fmt(s.income);
  $('heroOut').textContent = fmt(s.spend);
  $('heroInv').textContent = fmt(s.invest);
  $('heroRate').textContent = s.income > 0 ? Math.round(s.invest / s.income * 100) + '%' : '0%';
  $('heroTfsa').textContent = fmt(DB.tfsa || 0);
  $('heroTfsa').className = 'v tfsa' + (tfsaDue() ? ' due' : '');
  $('tfsaLbl').textContent = tfsaDue() ? 'TFSA due' : 'TFSA';
  $('tfsaLbl').className = 'lbl2 inv' + (tfsaDue() ? ' dueLbl' : '');
  renderVerdict(s);
  renderToday();
}

/* ================= VERDICT ================= */
function renderVerdict(s){
  const el = $('verdict');
  const now = new Date();
  const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysIn - now.getDate();

  /* Andrew killed the pace projection on 2026-08-19. The hero already shows the
     net in 88px type, so restating it was noise. What is left is the one thing
     Home cannot show any other way: a cap in trouble. No cap in trouble, no line. */
  let worst = null;
  CATS.forEach(c=>{
    const cap = DB.budgets[c.key];
    if(!cap) return;
    const spent = txInMonth(viewMonth).filter(t=>t.kind==='spend' && t.cat===c.key).reduce((a,t)=>a+t.amount,0);
    const ratio = spent / cap;
    if(ratio >= 0.7 && (!worst || ratio > worst.ratio)) worst = { name:c.name, ratio, spent, cap };
  });

  if(!worst){ el.textContent = ''; return; }

  if(worst.ratio > 1){
    el.textContent = worst.name + (isThisMonth() ? ' is ' : ' ended ') +
      fmt(Math.round(worst.spent - worst.cap)) + ' past its cap.';
  } else if(isThisMonth()){
    el.textContent = worst.name + ' sits at ' + Math.round(worst.ratio * 100) + '% of its cap with ' +
      daysLeft + (daysLeft === 1 ? ' day' : ' days') + ' left.';
  } else {
    el.textContent = worst.name + ' ended at ' + Math.round(worst.ratio * 100) + '% of its cap.';
  }
}

function renderToday(){
  const t = todayStr();
  const el = $('todayline');
  if(!isThisMonth()){ el.textContent = ''; return; }
  const list = DB.tx.filter(x=>x.date === t);
  if(list.length === 0){ el.textContent = ''; return; }
  const inc = list.filter(x=>x.kind==='income').reduce((a,x)=>a+x.amount,0);
  const sp  = list.filter(x=>x.kind==='spend').reduce((a,x)=>a+x.amount,0);
  const inv = list.filter(x=>x.kind==='invest').reduce((a,x)=>a+x.amount,0);
  const bits = [];
  if(inc > 0) bits.push(fmt(inc) + ' in');
  if(sp  > 0) bits.push(fmt(sp) + ' burned');
  if(inv > 0) bits.push(fmt(inv) + ' built');
  el.textContent = 'Today ' + bits.join(', ') + '.';
}

/* ================= QUICK ADD ================= */
function renderForm(){
  ['Spend','Income','Invest'].forEach(k=>{
    const b = $('t'+k);
    b.className = form.kind === k.toLowerCase() ? 'on-' + k.toLowerCase() : '';
  });
  const row = $('chipRow');
  row.innerHTML = '';
  if(form.kind === 'spend'){
    CATS.forEach(c=>{
      const b = document.createElement('button');
      b.textContent = c.name;
      if(form.cat === c.key){ b.className = 'on'; b.style.background = c.color; b.style.borderColor = c.color; b.style.color = inkOn(c.color); }
      b.onclick = ()=>{ form.cat = c.key; renderForm(); };
      row.appendChild(b);
    });
  } else if(form.kind === 'income'){
    SRCS.forEach(s=>{
      const b = document.createElement('button');
      b.textContent = s.name;
      if(form.src === s.key){ b.className = 'on'; b.style.background = s.color; b.style.borderColor = s.color; b.style.color = inkOn(s.color); }
      b.onclick = ()=>{ form.src = s.key; renderForm(); };
      row.appendChild(b);
    });
  }
}
function setKind(k){ form.kind = k; renderForm(); }

function addTx(){
  const amount = parseFloat($('amount').value);
  if(!amount || amount <= 0){ $('amount').focus(); return; }
  const date = $('txDate').value || todayStr();
  const note = $('txNote').value.trim();
  if(form.editing){
    const t = DB.tx.find(t=>t.id===form.editing);
    if(t){ t.kind = form.kind; t.amount = amount; t.date = date; t.note = note;
      t.cat = form.kind==='spend' ? form.cat : undefined;
      t.src = form.kind==='income' ? form.src : undefined; }
    form.editing = null;
  } else {
    DB.tx.push({
      id: Date.now() + '' + Math.floor(Math.random()*1000),
      date, kind: form.kind, amount, note,
      cat: form.kind==='spend' ? form.cat : undefined,
      src: form.kind==='income' ? form.src : undefined,
    });
  }
  save();
  $('amount').value = ''; $('txNote').value = ''; $('txDate').value = todayStr();
  $('addBtn').textContent = 'Add'; $('cancelBtn').style.display = 'none';
  renderAll();
  $('amount').focus();
}
function startEdit(id){
  const t = DB.tx.find(t=>t.id===id);
  if(!t) return;
  form.editing = id; form.kind = t.kind;
  if(t.cat) form.cat = t.cat;
  if(t.src) form.src = t.src;
  $('amount').value = t.amount; $('txDate').value = t.date; $('txNote').value = t.note || '';
  $('addBtn').textContent = 'Save'; $('cancelBtn').style.display = 'block';
  renderForm();
  showTab('home');
  window.scrollTo({ top:0, behavior:'smooth' });
  $('amount').focus();
}
function cancelEdit(){
  form.editing = null;
  $('amount').value = ''; $('txNote').value = ''; $('txDate').value = todayStr();
  $('addBtn').textContent = 'Add'; $('cancelBtn').style.display = 'none';
  renderForm();
}
function delTx(id){
  const t = DB.tx.find(t=>t.id===id);
  if(!t) return;
  if(!confirm('Delete this ' + fmt(t.amount) + ' entry?')) return;
  DB.tx = DB.tx.filter(x=>x.id!==id);
  if(String(id).startsWith('s-')){ (DB.seedKilled || (DB.seedKilled = [])).push(id); }
  save(); renderAll();
}

/* ================= PIE ================= */
function arcPath(cx, cy, r, a0, a1){
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const big = (a1 - a0) > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${big} 1 ${x1} ${y1}`;
}
function renderPie(){
  const mk = viewMonth;
  const byCat = CATS.map(c=>({
    ...c,
    total: txInMonth(mk).filter(t=>t.kind==='spend' && t.cat===c.key).reduce((a,t)=>a+t.amount,0)
  })).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
  const total = byCat.reduce((a,c)=>a+c.total,0);
  const svg = $('pie'); svg.innerHTML = '';
  const legend = $('legend'); legend.innerHTML = '';

  if(total === 0){
    svg.innerHTML = `<circle cx="95" cy="95" r="72" fill="none" stroke="${TRACK}" stroke-width="26"/>
      <text x="95" y="100" text-anchor="middle" fill="${INK}" font-size="16" font-weight="800">$0</text>`;
    return;
  }

  let a = -Math.PI / 2;
  const parts = byCat.map(c=>{
    const sweep = c.total / total * Math.PI * 2;
    const p = { ...c, a0:a, a1:a + Math.min(sweep, Math.PI * 2 - 0.0001) };
    a += sweep;
    return p;
  });
  parts.forEach(p=>{
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', arcPath(95, 95, 72, p.a0 + 0.015, p.a1 - 0.015));
    path.setAttribute('stroke', p.color);
    path.setAttribute('stroke-width', '26');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'butt');
    svg.appendChild(path);
  });
  const mid = document.createElementNS('http://www.w3.org/2000/svg','text');
  mid.setAttribute('x','95'); mid.setAttribute('y','92'); mid.setAttribute('text-anchor','middle');
  mid.setAttribute('fill',INK); mid.setAttribute('font-size','19'); mid.setAttribute('font-weight','800');
  mid.textContent = fmt(total);
  svg.appendChild(mid);
  const sub = document.createElementNS('http://www.w3.org/2000/svg','text');
  sub.setAttribute('x','95'); sub.setAttribute('y','110'); sub.setAttribute('text-anchor','middle');
  sub.setAttribute('fill',INK); sub.setAttribute('font-size','11'); sub.setAttribute('font-weight','700');
  sub.textContent = 'burned';
  svg.appendChild(sub);

  byCat.forEach(c=>{
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span class="dot" style="background:${c.color}"></span>
      <span class="nm">${c.name}</span>
      <span class="amt2">${fmt(c.total)}</span>
      <span class="pct">${Math.round(c.total/total*100)}%</span>`;
    legend.appendChild(row);
  });
}

/* ================= GOALS =================
   Andrew's targets, 2026-08-19. Two of them need saying out loud:

   "Up this month" is income minus what he burned. It deliberately does NOT
   subtract investing, because money moved into investments is money he kept.
   The hero's net stat does subtract it, so the two numbers differ on purpose.

   The spending ceiling covers everything EXCEPT groceries. Groceries have their
   own cap in the budgets panel, which is where that $300 lives. */
const GOALS = [
  { key:'income',  name:'Income',            hint:'a month' },
  { key:'ceiling', name:'Spending ceiling',  hint:'a month, groceries excluded', ceiling:true },
  { key:'invest',  name:'Invested',          hint:'a month' },
  { key:'kept',    name:'Up this month',     hint:'income minus what you burned' },
];

function goalActual(key, mk){
  const list = txInMonth(mk);
  const inc = list.filter(t=>t.kind==='income').reduce((a,t)=>a+t.amount,0);
  if(key === 'income') return inc;
  if(key === 'invest') return list.filter(t=>t.kind==='invest').reduce((a,t)=>a+t.amount,0);
  const burned = list.filter(t=>t.kind==='spend').reduce((a,t)=>a+t.amount,0);
  if(key === 'kept') return inc - burned;
  return list.filter(t=>t.kind==='spend' && t.cat !== 'groceries').reduce((a,t)=>a+t.amount,0);
}

/* A goal can be set to start later, which is how the $1,000 a month invest
   target waits for November instead of marking him short every month until then. */
function goalLive(key, mk){
  const from = (DB.goals || {})[key + 'From'];
  return !from || mk >= from;
}

function renderGoals(){
  const box = $('goals'); box.innerHTML = '';
  const mk = viewMonth;
  const g = DB.goals || (DB.goals = {});

  GOALS.forEach(def=>{
    const target = g[def.key] || 0;
    const live = goalLive(def.key, mk);
    const actual = goalActual(def.key, mk);
    const pct = target > 0 ? Math.min(Math.abs(actual) / target * 100, 100) : 0;

    /* Honesty rule: a ceiling can be blown mid month, but a target you could
       still reach is never marked missed while the month is running. */
    let state = '';
    if(target > 0 && live){
      if(def.ceiling) state = actual > target ? 'miss' : (isThisMonth() ? '' : 'hit');
      else state = actual >= target ? 'hit' : (isThisMonth() ? '' : 'miss');
    }

    const from = g[def.key + 'From'];
    const note = !live && from ? 'starts ' + monthName(from) : def.hint;

    const row = document.createElement('div');
    row.className = 'grow' + (state ? ' ' + state : '');
    row.innerHTML = `
      <div class="top">
        <span class="nm">${def.name}</span>
        <span class="act">${fmt(actual)}</span>
        <span class="of">of</span>
        <input type="number" min="0" step="1" inputmode="numeric" data-goal="${def.key}"
          value="${target || ''}" placeholder="set" aria-label="${def.name} target">
      </div>
      <div class="bbar"><div class="fill" style="width:${live ? pct : 0}%;background:${
        state === 'miss' ? RED : (state === 'hit' ? GREEN : BLUE)}"></div></div>
      <div class="ghint">${note}</div>`;
    box.appendChild(row);
  });

  box.querySelectorAll('input[data-goal]').forEach(inp=>{
    inp.onchange = ()=>{
      const v = parseFloat(inp.value);
      if(v > 0) DB.goals[inp.dataset.goal] = v; else delete DB.goals[inp.dataset.goal];
      save(); renderGoals(); renderHero();
    };
  });
}

/* ================= INCOME =================
   Where the money came from, for the viewed month and across every month. */
function renderIncome(){
  const mk = viewMonth;
  const list = txInMonth(mk).filter(t=>t.kind==='income');
  const bySrc = SRCS.map(sr=>({
    name: sr.name, color: sr.color,
    total: list.filter(t=>t.src === sr.key).reduce((a,t)=>a+t.amount,0),
  })).filter(x=>x.total > 0).sort((a,b)=>b.total-a.total);

  const total = bySrc.reduce((a,x)=>a+x.total,0);
  const svg = $('incomePie'); svg.innerHTML = '';
  const legend = $('incomeLegend'); legend.innerHTML = '';

  if(total === 0){
    svg.innerHTML = `<circle cx="95" cy="95" r="72" fill="none" stroke="${TRACK}" stroke-width="26"/>
      <text x="95" y="100" text-anchor="middle" fill="${INK}" font-size="16" font-weight="800">$0</text>`;
  } else {
    let a = -Math.PI / 2;
    bySrc.forEach(p=>{
      const slice = p.total / total * Math.PI * 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', arcPath(95, 95, 72, a, a + slice - 0.02));
      path.setAttribute('stroke', p.color);
      path.setAttribute('stroke-width', '26');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'butt');
      svg.appendChild(path);
      a += slice;
    });
    const mid = document.createElementNS('http://www.w3.org/2000/svg','text');
    mid.setAttribute('x','95'); mid.setAttribute('y','92'); mid.setAttribute('text-anchor','middle');
    mid.setAttribute('fill', INK); mid.setAttribute('font-size','19'); mid.setAttribute('font-weight','800');
    mid.textContent = fmt(total);
    svg.appendChild(mid);
    const sub = document.createElementNS('http://www.w3.org/2000/svg','text');
    sub.setAttribute('x','95'); sub.setAttribute('y','110'); sub.setAttribute('text-anchor','middle');
    sub.setAttribute('fill', INK); sub.setAttribute('font-size','11'); sub.setAttribute('font-weight','700');
    sub.textContent = 'in';
    svg.appendChild(sub);

    bySrc.forEach(p=>{
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="dot" style="background:${p.color}"></span>
        <span class="nm">${p.name}</span>
        <span class="amt2">${fmt(p.total)}</span>
        <span class="pct">${Math.round(p.total/total*100)}%</span>`;
      legend.appendChild(row);
    });
  }
  renderStreams();
}

/* One stacked bar per month, split by where the income came from. */
function renderStreams(){
  const svg = $('streams');
  const months = monthsSinceStart();
  const W = svg.clientWidth || svg.parentNode.clientWidth || 340, H = 210;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';

  const totals = months.map(mk=>
    txInMonth(mk).filter(t=>t.kind==='income').reduce((a,t)=>a+t.amount,0));
  const max = Math.max(...totals, 1);
  const pad = 28, base = H - 26;
  const slot = (W - pad*2) / months.length;
  const bw = Math.min(46, slot * 0.55);

  months.forEach((mk, i)=>{
    const cx = pad + slot*i + slot/2;
    let y = base;
    SRCS.forEach(sr=>{
      const amt = txInMonth(mk).filter(t=>t.kind==='income' && t.src === sr.key)
        .reduce((a,t)=>a+t.amount,0);
      if(amt <= 0) return;
      const h = amt / max * (base - 26);
      y -= h;
      const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
      r.setAttribute('x', cx - bw/2); r.setAttribute('y', y);
      r.setAttribute('width', bw); r.setAttribute('height', Math.max(h, 1));
      r.setAttribute('fill', sr.color);
      svg.appendChild(r);
    });
    if(totals[i] > 0){
      const v = document.createElementNS('http://www.w3.org/2000/svg','text');
      v.setAttribute('x', cx); v.setAttribute('y', y - 6);
      v.setAttribute('text-anchor','middle'); v.setAttribute('fill', INK);
      v.setAttribute('font-size','11'); v.setAttribute('font-weight','800');
      v.textContent = fmt(Math.round(totals[i]));
      svg.appendChild(v);
    }
    const t = document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x', cx); t.setAttribute('y', base + 16);
    t.setAttribute('text-anchor','middle'); t.setAttribute('fill', INK);
    t.setAttribute('font-size','11'); t.setAttribute('font-weight','700');
    t.textContent = monthShort(mk);
    svg.appendChild(t);
  });
}

/* ================= BUDGETS ================= */
function renderBudgets(){
  const mk = viewMonth;
  const box = $('budgets'); box.innerHTML = '';
  CATS.forEach(c=>{
    const spent = txInMonth(mk).filter(t=>t.kind==='spend' && t.cat===c.key).reduce((a,t)=>a+t.amount,0);
    const cap = DB.budgets[c.key] || 0;
    const over = cap > 0 && spent > cap;
    const pct = cap > 0 ? Math.min(spent / cap * 100, 100) : (spent > 0 ? 100 : 0);
    const row = document.createElement('div');
    row.className = 'brow';
    row.innerHTML = `
      <div class="top">
        <span class="dot" style="width:10px;height:10px;border-radius:50%;background:${c.color}"></span>
        <span class="nm">${c.name}</span>
        <span style="font-variant-numeric:tabular-nums;${over ? 'color:'+RED : ''}">${fmt(spent)}</span>
        <input type="number" min="0" step="10" value="${cap || ''}" placeholder="cap" data-cat="${c.key}">
      </div>
      <div class="bbar"><div class="fill" style="width:${pct}%;background:${over ? RED : (cap>0 ? c.color : TRACK)}"></div></div>`;
    box.appendChild(row);
  });
  box.querySelectorAll('input').forEach(inp=>{
    inp.onchange = ()=>{
      const v = parseFloat(inp.value);
      if(v > 0) DB.budgets[inp.dataset.cat] = v; else delete DB.budgets[inp.dataset.cat];
      save(); renderBudgets();
    };
  });
}

/* ================= MONTH BARS ================= */
function renderMonths(){
  const svg = $('months');
  const W = svg.clientWidth || 420, H = 210, padB = 26, padT = 14;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  const mks = monthsSinceStart();
  const data = mks.map(mk=>({ mk, ...sums(mk) }));
  const max = Math.max(...data.map(d=>Math.max(d.income, d.spend, d.invest)), 1);
  const groupW = W / data.length;
  const barW = Math.min(20, groupW / 4.2);
  data.forEach((d,i)=>{
    const cx = groupW * i + groupW / 2;
    const bars = [ [d.income, GREEN], [d.spend, RED], [d.invest, BLUE] ];
    bars.forEach(([v,color],j)=>{
      const h = v / max * (H - padB - padT);
      const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
      r.setAttribute('x', cx + (j - 1.5) * (barW + 3));
      r.setAttribute('y', H - padB - h);
      r.setAttribute('width', barW);
      r.setAttribute('height', Math.max(h, v > 0 ? 2 : 0));
      r.setAttribute('rx', 3);
      r.setAttribute('fill', color);
      svg.appendChild(r);
    });
    const t = document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x', cx); t.setAttribute('y', H - 8);
    t.setAttribute('text-anchor','middle'); t.setAttribute('fill',INK);
    t.setAttribute('font-size','11.5'); t.setAttribute('font-weight','700');
    t.textContent = monthShort(d.mk);
    svg.appendChild(t);
  });
}

/* ================= INVEST RATE ================= */
function renderInvest(){
  const svg = $('investChart');
  const W = svg.clientWidth || 420, H = 210, padB = 26, padT = 20, padX = 26;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  const mks = monthsSinceStart();
  const pts = mks.map(mk=>{
    const s = sums(mk);
    return { mk, rate: s.income > 0 ? s.invest / s.income * 100 : 0 };
  });
  const max = Math.max(...pts.map(p=>p.rate), 25);
  const x = i => pts.length === 1 ? W / 2 : padX + i * (W - padX * 2) / (pts.length - 1);
  const y = r => H - padB - (r / max) * (H - padB - padT);

  if(pts.length > 1){
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', pts.map((p,i)=>(i===0?'M':'L') + x(i) + ' ' + y(p.rate)).join(' '));
    path.setAttribute('stroke', BLUE); path.setAttribute('stroke-width','2.5'); path.setAttribute('fill','none');
    svg.appendChild(path);
  }
  pts.forEach((p,i)=>{
    const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx', x(i)); c.setAttribute('cy', y(p.rate)); c.setAttribute('r','4.5');
    c.setAttribute('fill', BLUE);
    svg.appendChild(c);
    const v = document.createElementNS('http://www.w3.org/2000/svg','text');
    v.setAttribute('x', x(i)); v.setAttribute('y', y(p.rate) - 10);
    v.setAttribute('text-anchor','middle'); v.setAttribute('fill',INK);
    v.setAttribute('font-size','12'); v.setAttribute('font-weight','800');
    v.textContent = Math.round(p.rate) + '%';
    svg.appendChild(v);
    const t = document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x', x(i)); t.setAttribute('y', H - 8);
    t.setAttribute('text-anchor','middle'); t.setAttribute('fill',INK);
    t.setAttribute('font-size','11.5'); t.setAttribute('font-weight','700');
    t.textContent = monthShort(p.mk);
    svg.appendChild(t);
  });
}

/* ================= LEDGER ================= */
function renderLedger(){
  const box = $('ledger'); box.innerHTML = '';
  $('fMonth').className = ledgerFilter === 'month' ? 'on' : '';
  $('fAll').className = ledgerFilter === 'all' ? 'on' : '';
  let list = [...DB.tx].sort((a,b)=> b.date === a.date ? (b.id > a.id ? 1 : -1) : (b.date > a.date ? 1 : -1));
  if(ledgerFilter === 'month') list = list.filter(t=>monthKey(t.date) === viewMonth);
  if(list.length === 0) return;
  list.forEach(t=>{
    const row = document.createElement('div');
    row.className = 'lrow';
    let tag, tagColor, amtHtml;
    if(t.kind === 'spend'){ tag = catName(t.cat); tagColor = catColor(t.cat); amtHtml = `<span class="amt3 neg">-${fmt(t.amount)}</span>`; }
    else if(t.kind === 'income'){ const s = SRCS.find(s=>s.key===t.src); tag = srcName(t.src); tagColor = s ? s.color : GREEN; amtHtml = `<span class="amt3 pos">+${fmt(t.amount)}</span>`; }
    else { tag = 'Invested'; tagColor = BLUE; amtHtml = `<span class="amt3 inv">${fmt(t.amount)}</span>`; }
    row.innerHTML = `
      <span class="d">${t.date.slice(5)}</span>
      <span class="tag" style="background:${tagColor};color:${inkOn(tagColor)}">${tag}</span>
      <span class="note">${t.note ? t.note.replace(/</g,'&lt;') : ''}</span>
      ${amtHtml}
      <span class="act"><button data-e="${t.id}">Edit</button><button data-x="${t.id}">Delete</button></span>`;
    box.appendChild(row);
  });
  box.querySelectorAll('[data-e]').forEach(b=> b.onclick = ()=>startEdit(b.dataset.e));
  box.querySelectorAll('[data-x]').forEach(b=> b.onclick = ()=>delTx(b.dataset.x));
}

/* ================= EXPORT ================= */
function exportCSV(){
  const rows = [['date','type','category','source','amount','note']];
  [...DB.tx].sort((a,b)=>a.date > b.date ? 1 : -1).forEach(t=>{
    rows.push([t.date, t.kind, t.cat ? catName(t.cat) : '', t.src ? srcName(t.src) : '', t.amount.toFixed(2), (t.note||'').replace(/"/g,'""')]);
  });
  const csv = rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
  a.download = 'money-' + todayStr() + '.csv';
  a.click();
}

/* ================= TFSA BALANCE =================
   A holding, not a flow. It never touches net, burned, built or the invest rate,
   it just sits on the hero so the number is visible. Andrew updates it by hand. */
/* Andrew updates the balance every Friday after the markets close, 1pm Vancouver.
   Due from that moment until he enters a number, and it stays due all weekend
   and into the next week rather than quietly resetting. */
function lastCloseStr(){
  const d = new Date();
  const past = d.getDay() > 5 || (d.getDay() === 5 && d.getHours() >= 13);
  const back = past ? (d.getDay() - 5) : (d.getDay() + 2);
  d.setDate(d.getDate() - back);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function tfsaDue(){ return !DB.tfsaAt || DB.tfsaAt < lastCloseStr(); }

function editTfsa(){
  const cell = $('heroTfsa');
  if(cell.dataset.editing) return;
  cell.dataset.editing = '1';
  const inp = document.createElement('input');
  inp.type = 'number'; inp.step = '0.01'; inp.min = '0';
  inp.className = 'tfsaIn';
  inp.value = DB.tfsa || '';
  const done = commit => {
    if(commit){
      const v = parseFloat(inp.value);
      DB.tfsa = isNaN(v) || v < 0 ? 0 : v;
      DB.tfsaAt = todayStr();
      save();
    }
    inp.replaceWith(cell);
    delete cell.dataset.editing;
    renderHero();
  };
  inp.addEventListener('keydown', e=>{
    if(e.key === 'Enter') done(true);
    if(e.key === 'Escape') done(false);
  });
  inp.addEventListener('blur', ()=>done(true));
  cell.replaceWith(inp);
  inp.focus(); inp.select();
}

/* ================= BACKUP / RESTORE =================
   The hosted copy ships with no numbers in it, so this is how a real ledger
   gets onto the phone: back up on one device, AirDrop the file, restore here.
   Restore merges by id, so running it twice changes nothing. */
function dataMsg(text){ $('dataMsg').textContent = text; }

function backupJSON(){
  const blob = new Blob([JSON.stringify(DB, null, 1)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'money-backup-' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  dataMsg('Backed up ' + DB.tx.length + ' entries.');
}

function restoreJSON(file){
  const r = new FileReader();
  r.onload = () => {
    let inc;
    try{ inc = JSON.parse(r.result); }
    catch(e){ dataMsg('That file is not valid JSON.'); return; }
    if(!inc || !Array.isArray(inc.tx)){ dataMsg('That file has no ledger in it.'); return; }

    const byId = new Map(DB.tx.map(t=>[t.id, t]));
    let added = 0, fixed = 0;
    inc.tx.forEach(t=>{
      if(!t || !t.id) return;
      const mine = byId.get(t.id);
      if(!mine){ DB.tx.push(t); byId.set(t.id, t); added++; return; }
      /* Same entry, recategorized upstream. Only the label moves, never a
         date or an amount, so a restore can never quietly rewrite money. */
      if(t.src && mine.src !== t.src){ mine.src = t.src; fixed++; }
      if(t.cat && mine.cat !== t.cat){ mine.cat = t.cat; fixed++; }
    });
    Object.keys(inc.budgets || {}).forEach(k=>{ if(!DB.budgets[k]) DB.budgets[k] = inc.budgets[k]; });
    DB.goals = DB.goals || {};
    Object.keys(inc.goals || {}).forEach(k=>{ if(!DB.goals[k]) DB.goals[k] = inc.goals[k]; });
    if(inc.tfsa && !DB.tfsa){ DB.tfsa = inc.tfsa; DB.tfsaAt = inc.tfsaAt || ''; }
    (inc.seedKilled || []).forEach(id=>{ if(!DB.seedKilled.includes(id)) DB.seedKilled.push(id); });
    if(inc.start && inc.start < DB.start) DB.start = inc.start;

    save(); renderAll();
    const bits = [];
    if(added) bits.push('restored ' + added);
    if(fixed) bits.push('recategorized ' + fixed);
    dataMsg(bits.length ? bits.join(', ') + '.' : 'Nothing new in that file.');
  };
  r.onerror = () => dataMsg('Could not read that file.');
  r.readAsText(file);
}

/* ================= TABS ================= */
function showTab(name){
  ['home','charts','ledger'].forEach(n=>{
    $('tab-' + n).className = 'tab' + (n === name ? ' on' : '');
    const nav = $('nav' + n.charAt(0).toUpperCase() + n.slice(1));
    nav.className = n === name ? 'on' : '';
  });
  if(name === 'charts'){ renderGoals(); renderPie(); renderIncome(); renderBudgets(); renderMonths(); renderInvest(); }
  if(name === 'ledger'){ renderLedger(); }
}

/* ================= INIT ================= */
function renderAll(){
  renderHero(); renderForm(); renderGoals(); renderPie(); renderIncome(); renderBudgets(); renderMonths(); renderInvest(); renderLedger();
}
$('navHome').onclick   = ()=>showTab('home');
$('navCharts').onclick = ()=>showTab('charts');
$('navLedger').onclick = ()=>showTab('ledger');
$('tSpend').onclick  = ()=>setKind('spend');
$('tIncome').onclick = ()=>setKind('income');
$('tInvest').onclick = ()=>setKind('invest');
$('addBtn').onclick = addTx;
$('cancelBtn').onclick = cancelEdit;
$('amount').addEventListener('keydown', e=>{ if(e.key === 'Enter') addTx(); });
$('txNote').addEventListener('keydown', e=>{ if(e.key === 'Enter') addTx(); });
$('fMonth').onclick = ()=>{ ledgerFilter = 'month'; renderLedger(); };
$('fAll').onclick = ()=>{ ledgerFilter = 'all'; renderLedger(); };
$('moPrev').onclick = ()=>shiftMonth(-1);
$('moNext').onclick = ()=>shiftMonth(1);
$('exportBtn').onclick = exportCSV;
$('backupBtn').onclick = backupJSON;
$('restoreBtn').onclick = ()=>$('restoreFile').click();
$('restoreFile').onchange = e=>{ const f = e.target.files[0]; if(f) restoreJSON(f); e.target.value = ''; };
$('heroTfsa').onclick = editTfsa;
$('txDate').value = todayStr();
window.addEventListener('resize', ()=>{ renderMonths(); renderInvest(); renderStreams(); });
applySeed();
renderAll();

/* Home screen install and offline. Silent on file:// where it cannot register. */
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
