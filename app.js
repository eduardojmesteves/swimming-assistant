// ============================================================
//  SwimCoach PWA — app.js  (parser v2 — exact column mapping)
// ============================================================

const DIAS_PT  = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const DIA_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const ZONAS    = ['TT','A1','A2','A3','M.AER','LAN','M.ANA','VEL','PML','TL'];
const ZONA_SET = new Set(ZONAS);
const ZK = z => z.replace('.','').replace('/','');

// Exact column indices from spreadsheet analysis
const COL = {
  day:0, pool:1,
  M_zona:2, M_desc:3, M_ciclo:11, M_metros:14,
  T_zona:18, T_desc:19, T_ciclo:27, T_metros:30
};

const BLOCK_NAMES = new Set(['AQUECIMENTO','TAREFA 1','TAREFA 2','TAREFA 3','RECUPERAÇÃO','RECUPERACAO']);
const DAY_MAP = {
  'SEGUNDA-FEIRA':1,'TERCA-FEIRA':2,'TERÇA-FEIRA':2,
  'QUARTA-FEIRA':3,'QUINTA-FEIRA':4,'SEXTA-FEIRA':5,
  'SABADO':6,'SÁBADO':6,'DOMINGO':0
};

// ---- STATE & PERSISTENCE ----
function defaultState() {
  return {
    sessao:'manha', activeDayIdx: new Date().getDay(),
    athletes:[], weekPlan:{}, zonePlan:{}, zoneLog:{},
    results:[], weekLabel:'',
    sw:{running:false,start:0,elapsed:0,splits:[],lastSplit:0}
  };
}

function loadState() {
  try {
    const s = localStorage.getItem('swimcoach_v2');
    if (s) { const p=JSON.parse(s); p.sw=defaultState().sw; return p; }
  } catch(e) {}
  return defaultState();
}

let S = loadState();

function save() {
  try {
    const copy = {...S, sw: defaultState().sw};
    localStorage.setItem('swimcoach_v2', JSON.stringify(copy));
  } catch(e) { console.warn('Save failed:', e); }
}

// ---- UTILS ----
function norm(v) {
  return String(v||'').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function fmtTime(ms) {
  const t=Math.floor(ms/10), cs=t%100, s=Math.floor(t/100)%60, m=Math.floor(t/6000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}
function initials(name) {
  return name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');
}
function toast(msg, dur=2400) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'), dur);
}
function get(id) { return document.getElementById(id); }

// ---- XLSX PARSER (v2 — exact column mapping) ----
function parseWeek(rows) {
  const plan     = {};
  const zonePlan = {};
  let curDay = null;

  for (let r=0; r<rows.length; r++) {
    const row = rows[r];
    const c0  = norm(row[COL.day]  || '');
    const c1  = norm(row[COL.pool] || '');

    // ── Day header ──
    if (DAY_MAP[c0] !== undefined) {
      curDay = DAY_MAP[c0];
      if (!plan[curDay]) plan[curDay] = {manha:[], tarde:[], pool: c1||'P25'};
    }
    if (curDay === null) continue;

    // ── Manhã side ──
    const mZona = norm(row[COL.M_zona] || '');
    const mDesc = String(row[COL.M_desc] || '').trim();
    const mCiclo= String(row[COL.M_ciclo]|| '').trim();
    const mRaw  = row[COL.M_metros];
    const mM    = (typeof mRaw === 'number') ? Math.round(mRaw) : 0;

    if (BLOCK_NAMES.has(mZona) || (mZona.startsWith('TAREFA') && !ZONA_SET.has(mZona))) {
      const tipo = mZona.includes('AQUEC')?'aquec': mZona.includes('RECUP')?'rec':'tarefa';
      plan[curDay].manha.push({isHeader:true, tipo, nome:String(row[COL.M_zona]||'').trim(), metros:0, zona:'', desc:'', ciclo:''});
    } else if (ZONA_SET.has(mZona)) {
      plan[curDay].manha.push({isHeader:false, tipo:'ex', zona:mZona, desc:mDesc, ciclo:mCiclo, metros:mM});
      const key=`${curDay}_manha`;
      if (!zonePlan[key]) zonePlan[key]=Object.fromEntries(ZONAS.map(z=>[z,0]));
      if (mM) zonePlan[key][mZona]=(zonePlan[key][mZona]||0)+mM;
    }

    // ── Tarde side ──
    if (row.length <= COL.T_zona) continue;
    const tZona = norm(row[COL.T_zona] || '');
    const tDesc = String(row[COL.T_desc] || '').trim();
    const tCiclo= String(row[COL.T_ciclo]|| '').trim();
    const tRaw  = row[COL.T_metros];
    const tM    = (typeof tRaw === 'number') ? Math.round(tRaw) : 0;

    if (BLOCK_NAMES.has(tZona) || (tZona.startsWith('TAREFA') && !ZONA_SET.has(tZona))) {
      const tipo = tZona.includes('AQUEC')?'aquec': tZona.includes('RECUP')?'rec':'tarefa';
      plan[curDay].tarde.push({isHeader:true, tipo, nome:String(row[COL.T_zona]||'').trim(), metros:0, zona:'', desc:'', ciclo:''});
    } else if (ZONA_SET.has(tZona)) {
      plan[curDay].tarde.push({isHeader:false, tipo:'ex', zona:tZona, desc:tDesc, ciclo:tCiclo, metros:tM});
      const key=`${curDay}_tarde`;
      if (!zonePlan[key]) zonePlan[key]=Object.fromEntries(ZONAS.map(z=>[z,0]));
      if (tM) zonePlan[key][tZona]=(zonePlan[key][tZona]||0)+tM;
    }
  }
  return {plan, zonePlan};
}

// ---- FILE LOAD ----
function loadXlsx(e) {
  const file = e.target.files[0]; if (!file) return;
  const hasPlan = Object.keys(S.weekPlan).length > 0;
  if (hasPlan) { get('importModalFile').textContent=file.name; get('importModal').classList.add('open'); window._pendingFile=file; }
  else readXlsx(file,'keep');
  // Reset input so same file can be reloaded
  e.target.value='';
}

function confirmImport(mode) {
  get('importModal').classList.remove('open');
  if (mode==='cancel') return;
  readXlsx(window._pendingFile, mode);
}

function readXlsx(file, mode) {
  const msg = get('loadMsg');
  msg.style.display=''; msg.className='info-box'; msg.textContent='A ler '+file.name+'…';

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb   = XLSX.read(ev.target.result, {type:'binary'});
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:true});
      const {plan, zonePlan} = parseWeek(rows);

      const dayCount = Object.keys(plan).length;
      const exCount  = Object.values(plan).reduce((a,d)=>a+d.manha.filter(b=>!b.isHeader).length+d.tarde.filter(b=>!b.isHeader).length,0);

      if (mode==='replace') { S.weekPlan=plan; S.zonePlan=zonePlan; S.zoneLog={}; }
      else { S.weekPlan=plan; S.zonePlan=zonePlan; }

      S.weekLabel = file.name.replace(/\.[^.]+$/,'');
      save();
      renderDayStrip();
      renderPlan();
      if (document.getElementById('screen-zonas').classList.contains('active')) renderZones();

      msg.className='success-box';
      msg.textContent=`✓ Carregado: ${dayCount} dias, ${exCount} exercícios encontrados.`;
      toast('Plano carregado com sucesso! ✓');
    } catch(err) {
      msg.className='warn-box';
      msg.textContent='Erro ao ler ficheiro: '+err.message;
      console.error(err);
    }
  };
  reader.readAsBinaryString(file);
}

// ---- NAV ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  get('screen-'+id).classList.add('active');
  get('nav-'+id).classList.add('active');
  if (id==='cronometro') populateCrono();
  if (id==='zonas')      renderZones();
  if (id==='resultados') renderResults();
  if (id==='atletas')    renderAthletes();
  if (id==='plano')      renderPlan();
}

function setSessao(s) {
  S.sessao=s;
  get('btnManha').classList.toggle('active',s==='manha');
  get('btnTarde').classList.toggle('active',s==='tarde');
  renderPlan(); renderZones(); save();
}

// ---- DAY STRIP ----
function renderDayStrip() {
  const today = new Date().getDay();
  get('dayStrip').innerHTML = DIA_SHORT.map((d,i)=>`
    <button class="day-chip${i===S.activeDayIdx?' active':''}${i===today&&i!==S.activeDayIdx?' today':''}"
      onclick="setDay(${i})">${d}${i===today?'·':''}</button>`).join('');
}

function setDay(i) {
  S.activeDayIdx=i; save();
  renderDayStrip(); renderPlan();
}

// ---- RENDER PLAN ----
function renderPlan() {
  const dayData  = S.weekPlan[S.activeDayIdx];
  const blocks   = dayData ? dayData[S.sessao] : [];
  const pool     = dayData?.pool || 'P25';
  const sessName = S.sessao==='manha'?'Manhã':'Tarde';
  const today    = new Date().getDay();
  const isToday  = S.activeDayIdx===today;
  const dateStr  = isToday ? new Date().toLocaleDateString('pt-PT',{day:'numeric',month:'long'}) : '';
  const totalM   = blocks.filter(b=>!b.isHeader).reduce((a,b)=>a+(b.metros||0),0);

  get('poolHeader').innerHTML = `
    <div class="ph-left">
      <div class="day">${DIAS_PT[S.activeDayIdx]}</div>
      <div class="date-sub">${dateStr||S.weekLabel||''}
        <span class="piscina-badge" style="margin-left:6px;">${pool}</span>
        <span style="font-size:11px;opacity:.8;margin-left:6px;">${sessName}</span>
      </div>
    </div>
    <div class="ph-right">
      <div class="total">${totalM||'—'}</div>
      <div class="total-lbl">metros</div>
    </div>`;

  const el = get('planBlocks');
  if (!blocks.length) {
    el.innerHTML=`<div class="empty"><div class="icon">🏊</div>Sem sessão registada.<br>Carregue o Excel ou adicione um bloco manualmente.</div>`;
    return;
  }

  let html='', open=false;
  blocks.forEach(b=>{
    if (b.isHeader) {
      if (open) html+=`</div></div>`;
      const label = b.nome || (b.tipo==='aquec'?'Aquecimento':b.tipo==='rec'?'Recuperação':'Tarefa');
      html+=`<div class="block ${b.tipo}"><div class="block-header"><span>${label}</span></div><div class="ex-list">`;
      open=true;
    } else {
      const zbCls = `z-${ZK(b.zona)||'TT'}`;
      html+=`<div class="ex-row">
        <div><span class="zbadge ${zbCls}">${b.zona||'—'}</span></div>
        <div class="ex-desc">${b.desc||'—'}${b.ciclo?`<div class="ex-ciclo">${b.ciclo}</div>`:''}</div>
        <div class="ex-meta">
          <div class="ex-dist">${b.metros?b.metros+'m':''}</div>
          ${b.target?`<div class="ex-target">⏱ ${b.target}</div>`:''}
        </div>
      </div>`;
    }
  });
  if (open) html+=`</div></div>`;
  el.innerHTML=html;
}

// ---- ADD BLOCK MANUALLY ----
function openAddBlock()  { get('addBlockModal').classList.add('open'); }
function closeAddBlock() { get('addBlockModal').classList.remove('open'); }

function saveBlock() {
  const tipo   = get('bTipo').value;
  const nomeRaw= get('bNome').value.trim();
  const nome   = nomeRaw || (tipo==='aquec'?'Aquecimento':tipo==='rec'?'Recuperação':'Tarefa');
  const zona   = get('bZona').value;
  const desc   = get('bDesc').value.trim();
  const metros = parseInt(get('bMetros').value)||0;
  const ciclo  = get('bCiclo').value.trim();
  const target = get('bTarget').value.trim();

  if (!S.weekPlan[S.activeDayIdx]) S.weekPlan[S.activeDayIdx]={manha:[],tarde:[],pool:'P25'};
  const arr = S.weekPlan[S.activeDayIdx][S.sessao];

  // Add section header if needed
  const lastHdr = [...arr].reverse().find(b=>b.isHeader);
  if (!lastHdr || lastHdr.tipo!==tipo) {
    arr.push({isHeader:true,tipo,nome,metros:0,zona:'',desc:'',ciclo:''});
  }
  arr.push({isHeader:false,tipo:'ex',zona,desc,ciclo,metros,target});

  // Update zonePlan
  if (zona && metros) {
    const key=`${S.activeDayIdx}_${S.sessao}`;
    if (!S.zonePlan[key]) S.zonePlan[key]=Object.fromEntries(ZONAS.map(z=>[z,0]));
    S.zonePlan[key][zona]=(S.zonePlan[key][zona]||0)+metros;
  }
  ['bNome','bDesc','bMetros','bCiclo','bTarget'].forEach(id=>get(id).value='');
  closeAddBlock(); save(); renderPlan();
  toast('Bloco adicionado!');
}

// ---- ATHLETES ----
function addAthlete() {
  const nome = get('nomeAtleta').value.trim(); if (!nome) return;
  S.athletes.push({id:Date.now(), nome, grupo:get('grupoAtleta').value.trim()});
  get('nomeAtleta').value=''; get('grupoAtleta').value='';
  save(); renderAthletes(); toast(nome+' adicionado(a)!');
}
function removeAthlete(id) {
  if (!confirm('Remover atleta?')) return;
  S.athletes=S.athletes.filter(a=>a.id!==id); save(); renderAthletes();
}
function renderAthletes() {
  const el=get('atletaList');
  if (!S.athletes.length) { el.innerHTML=`<div class="empty"><div class="icon">👤</div>Sem atletas. Adicione acima.</div>`; return; }
  el.innerHTML=S.athletes.map(a=>`
    <div class="athlete-row">
      <div class="ath-avatar">${initials(a.nome)}</div>
      <div class="ath-info"><div class="ath-name">${a.nome}</div><div class="ath-group">${a.grupo||'Sem grupo'}</div></div>
      <button class="btn sm danger" onclick="removeAthlete(${a.id})">Remover</button>
    </div>`).join('');
}

// ---- CRONÓMETRO ----
let _swInt=null;

function populateCrono() {
  get('cAtleta').innerHTML = S.athletes.length
    ? S.athletes.map(a=>`<option value="${a.id}">${a.nome}</option>`).join('')
    : '<option value="">— Adicione atletas primeiro —</option>';

  const blocks = (S.weekPlan[S.activeDayIdx]||{})[S.sessao]||[];
  const headers = blocks.filter(b=>b.isHeader);
  get('cBloco').innerHTML = headers.length
    ? headers.map((b,i)=>`<option value="${i}">${b.nome||'Bloco '+(i+1)}</option>`).join('')
    : '<option value="">— Sem blocos —</option>';
  renderSplits();
}

function toggleSW() {
  const sw=S.sw, btn=get('btnSS');
  if (sw.running) {
    clearInterval(_swInt); sw.elapsed+=Date.now()-sw.start; sw.running=false;
    btn.textContent='Retomar'; btn.className='btn lg';
  } else {
    sw.start=Date.now(); sw.running=true;
    _swInt=setInterval(()=>{ get('swDisp').textContent=fmtTime(sw.elapsed+(Date.now()-sw.start)); },37);
    btn.textContent='Parar'; btn.className='btn primary lg';
    get('btnParcial').disabled=false;
  }
}

function takeSplit() {
  const sw=S.sw, now=sw.elapsed+(sw.running?Date.now()-sw.start:0);
  sw.splits.push({cum:now, lap:now-sw.lastSplit}); sw.lastSplit=now;
  renderSplits();
  get('swInfo').textContent=`${sw.splits.length} parcial${sw.splits.length!==1?'is':''}`;
}

function parseTargetTime(s) {
  if (!s) return 0;
  const m=s.match(/(\d+)[:'"](\d+)(?:[.,](\d+))?/);
  if (m) return (parseInt(m[1])*60+parseInt(m[2]))*1000+(parseInt(m[3]||0)*100);
  const n=parseFloat(s.replace(',','.')); return isNaN(n)?0:n*1000;
}

function renderSplits() {
  const el=get('splitList'), splits=S.sw.splits;
  if (!splits.length) { el.innerHTML=`<div style="font-size:12px;color:var(--text-3);padding:10px 0;text-align:center;">Sem parciais ainda</div>`; return; }
  const avg=splits.reduce((a,s)=>a+s.lap,0)/splits.length;
  const headers=(S.weekPlan[S.activeDayIdx]||{})[S.sessao]?.filter(b=>b.isHeader)||[];
  const selHdr=headers[get('cBloco')?.value];
  const tMs=parseTargetTime(selHdr?.target||'');
  const best=splits.reduce((a,s)=>s.lap<a?s.lap:a,Infinity);

  el.innerHTML=`<table class="split-table">
    <thead><tr><th>#</th><th>Acumulado</th><th>Volta</th><th>vs Média</th>${tMs?'<th>vs Alvo</th>':''}</tr></thead>
    <tbody>${splits.map((s,i)=>{
      const d=s.lap-avg, ds=(d>=0?'+':'')+fmtTime(Math.abs(d));
      const isBest=s.lap===best&&splits.length>1;
      let tc='';
      if (tMs) { const td2=s.lap-tMs; tc=`<td class="${td2>0?'dp':'dn'}">${(td2>=0?'+':'')+fmtTime(Math.abs(td2))}</td>`; }
      return `<tr${isBest?' style="background:#EAFFEA"':''}>
        <td style="color:var(--text-3)">#${i+1}</td>
        <td>${fmtTime(s.cum)}</td><td>${fmtTime(s.lap)}${isBest?' 🏆':''}</td>
        <td>${i>0?`<span class="${d>0?'dp':'dn'}">${ds}</span>`:'—'}</td>${tc}
      </tr>`;}).join('')}
    </tbody></table>`;
}

function resetSW() {
  clearInterval(_swInt);
  S.sw={running:false,start:0,elapsed:0,splits:[],lastSplit:0};
  get('swDisp').textContent='00:00.00'; get('swInfo').textContent='Sem parciais';
  get('btnSS').textContent='Iniciar'; get('btnSS').className='btn primary lg';
  get('btnParcial').disabled=true; renderSplits();
}

function saveSplits() {
  if (!S.sw.splits.length) { toast('Sem parciais para guardar.'); return; }
  const aid=get('cAtleta').value;
  const bidx=get('cBloco').value;
  const athlete=S.athletes.find(a=>a.id==aid);
  if (!athlete) { toast('Selecione um atleta.'); return; }
  const headers=(S.weekPlan[S.activeDayIdx]||{})[S.sessao]?.filter(b=>b.isHeader)||[];
  const bloco=headers[bidx];
  S.results.push({
    id:Date.now(), date:new Date().toLocaleDateString('pt-PT'),
    dia:DIAS_PT[S.activeDayIdx], diaIdx:S.activeDayIdx, sessao:S.sessao,
    athlete:athlete.nome, bloco:bloco?.nome||'—', targetTime:bloco?.target||'',
    splits:[...S.sw.splits]
  });
  save(); resetSW(); toast('Parciais guardados para '+athlete.nome+'! ✓');
}

// ---- ZONES ----
function registerZone() {
  const zona=get('zZona').value, metros=parseInt(get('zMetros').value)||0;
  if (!metros) { toast('Introduza os metros realizados.'); return; }
  const key=`${S.activeDayIdx}_${S.sessao}`;
  if (!S.zoneLog[key]) S.zoneLog[key]=Object.fromEntries(ZONAS.map(z=>[z,0]));
  S.zoneLog[key][zona]=(S.zoneLog[key][zona]||0)+metros;
  get('zMetros').value=''; save(); renderZones(); toast(zona+' +'+metros+'m ✓');
}

function clearZone(z) {
  const key=`${S.activeDayIdx}_${S.sessao}`;
  if (S.zoneLog[key]) { S.zoneLog[key][z]=0; save(); renderZones(); }
}

function renderZones() {
  const key=`${S.activeDayIdx}_${S.sessao}`;
  const plan=S.zonePlan[key]||Object.fromEntries(ZONAS.map(z=>[z,0]));
  const log =S.zoneLog[key] ||Object.fromEntries(ZONAS.map(z=>[z,0]));
  const totalP=ZONAS.reduce((a,z)=>a+(plan[z]||0),0);
  const totalL=ZONAS.reduce((a,z)=>a+(log[z]||0),0);
  const pct=totalP?Math.round(totalL/totalP*100):0;

  get('zoneMetrics').innerHTML=`
    <div class="metric"><div class="lbl">Planeado</div><div class="val">${totalP}</div><div class="unit">metros</div></div>
    <div class="metric"><div class="lbl">Realizado</div><div class="val">${totalL}</div><div class="unit">metros</div></div>
    <div class="metric"><div class="lbl">Cumprimento</div><div class="val">${pct}<span style="font-size:14px">%</span></div></div>`;
  get('zSessaoLabel').textContent=`${DIAS_PT[S.activeDayIdx]} — ${S.sessao==='manha'?'Manhã':'Tarde'}`;

  const rows=ZONAS.map(z=>{
    const p=plan[z]||0, l=log[z]||0; if (!p&&!l) return '';
    const barW=p?Math.min(100,Math.round(l/p*100)):0, over=l>p&&p>0;
    return `<tr>
      <td><span class="zbadge z-${ZK(z)}">${z}</span></td>
      <td class="num">${p||'—'}</td><td class="num">${l||'—'}</td>
      <td><div style="font-size:10px;text-align:right;color:var(--text-3);">${p?Math.round(l/p*100)+'%':''}</div>
        <div class="prog-bar${over?' pct-over':''}"><div class="prog-fill" style="width:${barW}%"></div></div></td>
      <td><button class="btn sm" onclick="clearZone('${z}')" style="padding:2px 6px;font-size:10px;">✕</button></td>
    </tr>`;}).filter(Boolean).join('');

  get('zoneTableWrap').innerHTML=rows
    ? `<table class="zone-table"><thead><tr><th>Zona</th><th class="num">Plano</th><th class="num">Escrito</th><th>Progresso</th><th></th></tr></thead>
       <tbody>${rows}<tr><td><strong>Total</strong></td><td class="num"><strong>${totalP}</strong></td><td class="num"><strong>${totalL}</strong></td><td></td><td></td></tr></tbody></table>`
    : `<div class="empty"><div class="icon">📊</div>Carregue o Excel para ver os dados de zonas.</div>`;
}

// ---- RESULTS ----
function renderResults() {
  const fa=get('rFiltAtleta').value, fd=get('rFiltDia').value;
  const athletes=[...new Set(S.results.map(r=>r.athlete))].sort();
  const dias=[...new Set(S.results.map(r=>r.dia))];
  get('rFiltAtleta').innerHTML='<option value="">Todos os atletas</option>'+athletes.map(a=>`<option${fa===a?' selected':''}>${a}</option>`).join('');
  get('rFiltDia').innerHTML='<option value="">Todos os dias</option>'+dias.map(d=>`<option${fd===d?' selected':''}>${d}</option>`).join('');

  let data=S.results; if (fa) data=data.filter(r=>r.athlete===fa); if (fd) data=data.filter(r=>r.dia===fd);
  const el=get('resultsWrap');
  if (!data.length) { el.innerHTML=`<div class="empty"><div class="icon">📋</div>Sem resultados guardados ainda.</div>`; return; }

  el.innerHTML=data.slice().reverse().map(r=>{
    const avg=r.splits.reduce((a,s)=>a+s.lap,0)/(r.splits.length||1);
    const tMs=parseTargetTime(r.targetTime||'');
    const best=r.splits.reduce((a,s)=>s.lap<a?s.lap:a,Infinity);
    return `<div class="result-card">
      <div class="result-header">
        <div>
          <div class="result-athlete">${r.athlete}</div>
          <div class="result-meta">${r.bloco} · ${r.dia} ${r.sessao==='manha'?'Manhã':'Tarde'} · ${r.date}
            ${r.targetTime?`<span class="tag">Alvo: ${r.targetTime}</span>`:''}</div>
        </div>
        <button class="btn sm danger" onclick="deleteResult(${r.id})">Apagar</button>
      </div>
      <div class="result-body"><table class="split-table">
        <thead><tr><th>#</th><th>Acumulado</th><th>Volta</th><th>vs Média</th>${tMs?'<th>vs Alvo</th>':''}</tr></thead>
        <tbody>${r.splits.map((s,i)=>{
          const d=s.lap-avg, isBest=s.lap===best&&r.splits.length>1;
          let tc=''; if(tMs){const td2=s.lap-tMs;tc=`<td class="${td2>0?'dp':'dn'}">${(td2>=0?'+':'')+fmtTime(Math.abs(td2))}</td>`;}
          return `<tr${isBest?' style="background:#EAFFEA"':''}>
            <td style="color:var(--text-3)">#${i+1}</td><td>${fmtTime(s.cum)}</td>
            <td>${fmtTime(s.lap)}${isBest?' 🏆':''}</td>
            <td>${i>0?`<span class="${d>0?'dp':'dn'}">${(d>=0?'+':'')+fmtTime(Math.abs(d))}</span>`:'—'}</td>${tc}
          </tr>`;}).join('')}</tbody>
      </table></div>
    </div>`;}).join('');
}

function deleteResult(id) {
  if (!confirm('Apagar este resultado?')) return;
  S.results=S.results.filter(r=>r.id!==id); save(); renderResults();
}

function exportCSV() {
  if (!S.results.length) { toast('Sem resultados para exportar.'); return; }
  const rows=[['Data','Dia','Sessão','Atleta','Bloco','Alvo','Parcial #','Acumulado','Volta']];
  S.results.forEach(r=>r.splits.forEach((s,i)=>
    rows.push([r.date,r.dia,r.sessao==='manha'?'Manhã':'Tarde',r.athlete,r.bloco,r.targetTime||'',i+1,fmtTime(s.cum),fmtTime(s.lap)])));
  const csv=rows.map(r=>r.map(v=>JSON.stringify(String(v))).join(',')).join('\n');
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),
    download:`swimcoach_${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click(); URL.revokeObjectURL(a.href); toast('CSV exportado!');
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', ()=>{
  get('topbarDate').textContent=new Date().toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  renderDayStrip(); renderPlan(); renderAthletes(); renderZones();
  showScreen('plano');

  // Service Worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

  // Wake lock — keep screen on while stopwatch running
  let wakeLock=null;
  async function requestWake() {
    try { if ('wakeLock' in navigator && !wakeLock) wakeLock=await navigator.wakeLock.request('screen'); } catch(e){}
  }
  get('btnSS').addEventListener('click', requestWake);
  document.addEventListener('visibilitychange', async ()=>{ if (document.visibilityState==='visible') requestWake(); });
});
