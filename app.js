// ============================================================
// SwimCoach PWA — app.js
// Cleaned project version: fixed parser, stopwatch targets, safer rendering
// ============================================================

const ZONAS = ['TT', 'A1', 'A2', 'A3', 'M.AER', 'LAN', 'M.ANA', 'VEL', 'PML', 'TL'];
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const DIAS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const STORE_KEY = 'swim_coach_v3';
const OLD_STORE_KEYS = ['swim_coach_v2', 'swimcoach_v2'];

const COL = {
  day: 0,
  pool: 1,
  M_zona: 2,
  M_desc: 3,
  M_ciclo: 11,
  M_metros: 14, // Excel O
  T_zona: 18,
  T_desc: 19,
  T_ciclo: 27,
  T_metros: 30, // Excel AE
};

const DAY_MAP = {
  'SEGUNDA': 0,
  'SEGUNDA-FEIRA': 0,
  'TERCA': 1,
  'TERCA-FEIRA': 1,
  'QUARTA': 2,
  'QUARTA-FEIRA': 2,
  'QUINTA': 3,
  'QUINTA-FEIRA': 3,
  'SEXTA': 4,
  'SEXTA-FEIRA': 4,
  'SABADO': 5,
  'DOMINGO': 6,
};

const HEADER_NAMES = ['AQUECIMENTO', 'TAREFA', 'RECUPERACAO', 'FOLGA'];

let S = defaultState();
let toastTimer = null;
let wakeLock = null;

function defaultState() {
  return {
    tab: 'plano',
    sessao: 'manha',
    dayIdx: ((new Date().getDay() + 6) % 7), // Monday = 0
    weekPlan: {},
    zonePlan: {},
    athletes: [],
    results: [],
    zoneLog: {},
    cronoAthleteId: '',
    cronoBlockIdx: '0',
    sw: { running: false, start: 0, elapsed: 0, splits: [], lastSplit: 0, iv: null },
  };
}

function $(id) {
  return document.getElementById(id);
}

function esc(v) {
  return String(v ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[ch]));
}

function norm(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function zkey(z) {
  return String(z || 'TT').replace(/[.\s/]/g, '');
}

function zoneTotals() {
  return Object.fromEntries(ZONAS.map((z) => [z, 0]));
}

function parseMeters(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const cleaned = String(v ?? '')
    .replace(/\s+/g, '')
    .replace(/m$/i, '')
    .replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function fmtTime(ms) {
  const safe = Math.max(0, Math.round(ms || 0));
  const t = Math.floor(safe / 10);
  const cs = t % 100;
  const s = Math.floor(t / 100) % 60;
  const m = Math.floor(t / 6000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function parseTargetTime(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return 0;

  // Examples accepted: 1:23, 1:23.45, 1'23", 1'23"45, 83.45
  let m = s.match(/^(\d+)\s*[:']\s*(\d{1,2})(?:\s*(?:[".]|,)?\s*(\d{1,3}))?$/);
  if (m) {
    const minutes = Number(m[1]);
    const seconds = Number(m[2]);
    const fracRaw = m[3] || '';
    let ms = 0;
    if (fracRaw.length === 1) ms = Number(fracRaw) * 100;
    else if (fracRaw.length === 2) ms = Number(fracRaw) * 10;
    else if (fracRaw.length >= 3) ms = Number(fracRaw.slice(0, 3));
    return ((minutes * 60) + seconds) * 1000 + ms;
  }

  m = s.match(/^(\d+(?:[.,]\d+)?)\s*s?$/);
  if (m) return Number.parseFloat(m[1].replace(',', '.')) * 1000;

  return 0;
}

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
}

function loadState() {
  for (const key of [STORE_KEY, ...OLD_STORE_KEYS]) {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) continue;
      const d = JSON.parse(saved);
      S = {
        ...defaultState(),
        athletes: Array.isArray(d.athletes) ? d.athletes : [],
        results: Array.isArray(d.results) ? d.results : [],
        zoneLog: d.zoneLog || {},
        weekPlan: d.weekPlan || {},
        zonePlan: d.zonePlan || {},
      };
      return;
    } catch (err) {
      console.warn('Ignoring broken saved state:', err);
    }
  }
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      athletes: S.athletes,
      results: S.results,
      zoneLog: S.zoneLog,
      weekPlan: S.weekPlan,
      zonePlan: S.zonePlan,
    }));
  } catch (err) {
    console.warn('Save failed:', err);
    toast('Não foi possível guardar localmente.');
  }
}

// ============================================================
// INIT / NAVIGATION
// ============================================================
window.addEventListener('load', () => {
  loadState();
  const d = new Date();
  $('hdrSub').textContent = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  syncSessionButtons();
  renderTab();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed:', err));
  }
});

function showTab(t) {
  S.tab = t;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  $(`nav-${t}`)?.classList.add('active');
  renderTab();
}

function setSessao(s) {
  S.sessao = s;
  S.cronoBlockIdx = '0';
  syncSessionButtons();
  renderTab();
}

function syncSessionButtons() {
  $('btnManha')?.classList.toggle('active', S.sessao === 'manha');
  $('btnTarde')?.classList.toggle('active', S.sessao === 'tarde');
}

function setDay(i) {
  S.dayIdx = i;
  S.cronoBlockIdx = '0';
  renderTab();
}

function renderTab() {
  const c = $('content');
  if (!c) return;
  if (S.tab === 'plano') c.innerHTML = renderPlano();
  else if (S.tab === 'cronometro') c.innerHTML = renderCrono();
  else if (S.tab === 'zonas') c.innerHTML = renderZonas();
  else if (S.tab === 'atletas') c.innerHTML = renderAtletas();
  else if (S.tab === 'resultados') c.innerHTML = renderResultados();

  if (S.tab === 'cronometro' && S.sw.running) {
    clearInterval(S.sw.iv);
    S.sw.iv = setInterval(updateSWDisplay, 37);
  }
}

function dayTabsHTML() {
  const today = ((new Date().getDay() + 6) % 7);
  return `<div class="day-tabs">${DIAS_SHORT.map((d, i) => {
    let cls = 'day-tab';
    if (i === today) cls += ' today-marker';
    if (i === S.dayIdx) cls += ' active';
    return `<button class="${cls}" onclick="setDay(${i})">${esc(d)}${i === today ? '<br><span style="font-size:8px;opacity:.7">hoje</span>' : ''}</button>`;
  }).join('')}</div>`;
}

// ============================================================
// PLANO
// ============================================================
function renderPlano() {
  const day = S.weekPlan[S.dayIdx] || {};
  const blocks = day[S.sessao] || [];
  const totalP = blocks.filter((b) => !b.isHeader).reduce((a, b) => a + (parseMeters(b.metros) || 0), 0);
  const piscina = day.piscina || '';

  let html = dayTabsHTML();
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;">
    <div>
      <span style="font-size:15px;font-weight:700;color:#a8c0e0;">${esc(DIAS[S.dayIdx])} — ${S.sessao === 'manha' ? 'Manhã' : 'Tarde'}</span>
      ${piscina ? `<span class="tag" style="margin-left:6px;">${esc(piscina)}</span>` : ''}
    </div>
    <div style="font-size:12px;color:#4a6490;white-space:nowrap;">Total: <strong style="color:#4d9fff">${totalP}m</strong></div>
  </div>`;

  html += `<div class="card" style="margin-bottom:10px;">
    <label class="upload-zone" style="padding:16px;display:block;">
      <div class="upload-icon">📋</div>
      <div class="upload-title">Carregar plano semanal (.xlsx)</div>
      <div style="font-size:11px;color:#4a6490;">Substituir ou acumular com o plano existente</div>
      <input type="file" id="xlsxInput" accept=".xlsx,.xls" style="display:none" onchange="loadXlsx(event)">
    </label>
  </div>`;

  if (!blocks.length) {
    html += `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h6"/></svg>
      <div>Sem blocos para este dia/sessão.</div>
      <div style="margin-top:4px;">Carregue o Excel ou adicione manualmente.</div>
    </div>`;
  } else {
    let sections = [];
    let cur = null;
    blocks.forEach((b) => {
      if (b.isHeader) {
        if (cur) sections.push(cur);
        cur = { header: b, items: [] };
      } else {
        if (!cur) cur = { header: null, items: [] };
        cur.items.push(b);
      }
    });
    if (cur) sections.push(cur);

    html += sections.map((sec) => {
      const hdr = sec.header;
      const tipo = hdr ? hdr.tipo : 'tarefa';
      const nome = hdr ? (hdr.nome || 'Bloco') : 'Bloco';
      const hdMetros = hdr ? parseMeters(hdr.metros) : 0;
      return `<div class="block-section">
        ${hdr ? `<div class="block-header ${esc(tipo)}"><span>${esc(nome)}</span>${hdMetros ? `<span style="font-size:11px;opacity:.7;">${hdMetros}m</span>` : ''}</div>` : ''}
        <div class="block-body">
          ${sec.items.map((ex) => `<div class="ex-row${ex.target ? ' has-target' : ''}">
            <span class="zbadge z-${zkey(ex.zona)}">${esc(ex.zona || '—')}</span>
            <div>
              <div style="color:#c8d8f0;line-height:1.4;">${esc(ex.desc || '—')}</div>
              ${ex.ciclo ? `<div style="font-size:11px;color:#4a6490;margin-top:2px;">${esc(ex.ciclo)}</div>` : ''}
              ${ex.target ? `<div style="font-size:11px;color:#f0a500;margin-top:2px;">Alvo: ${esc(ex.target)}</div>` : ''}
            </div>
            <div style="text-align:right;color:#4a6490;font-size:12px;">${parseMeters(ex.metros) || ''}</div>
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  html += `<button class="btn btn-secondary" style="width:100%;margin-top:6px;" onclick="showAddBlockModal()">+ Adicionar bloco manualmente</button>`;
  return html;
}

// ============================================================
// XLSX PARSER
// ============================================================
function loadXlsx(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      if (!window.XLSX) throw new Error('Biblioteca XLSX não carregada. Verifique a ligação à internet no primeiro carregamento.');
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      const parsed = parseWeekRows(rows);
      showLoadModal(parsed, file.name);
    } catch (err) {
      console.error(err);
      toast(`Erro ao ler ficheiro: ${err.message}`);
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

function parseWeekRows(rows) {
  const plan = {};
  const zonePl = {};
  let curDay = null;

  rows.forEach((row) => {
    const c0 = norm(row[COL.day]);
    if (DAY_MAP[c0] !== undefined) {
      curDay = DAY_MAP[c0];
      plan[curDay] = { manha: [], tarde: [], piscina: String(row[COL.pool] || '').trim() };
    }
    if (curDay === null || !plan[curDay]) return;

    parseExerciseRow(row, curDay, 'manha', plan, zonePl, {
      cZona: COL.M_zona,
      cDesc: COL.M_desc,
      cMetros: COL.M_metros,
      cCiclo: COL.M_ciclo,
    });

    parseExerciseRow(row, curDay, 'tarde', plan, zonePl, {
      cZona: COL.T_zona,
      cDesc: COL.T_desc,
      cMetros: COL.T_metros,
      cCiclo: COL.T_ciclo,
    });
  });

  return { plan, zonePl };
}

function parseExerciseRow(row, dayIdx, sess, plan, zonePl, { cZona, cDesc, cMetros, cCiclo }) {
  const rawZona = norm(row[cZona]);
  const label = String(row[cZona] || '').trim();
  const rawDesc = String(row[cDesc] || '').trim();
  const metros = parseMeters(row[cMetros]);

  if (!rawZona && !rawDesc && !metros) return;

  if (rawZona === 'FOLGA' || norm(rawDesc) === 'FOLGA') {
    plan[dayIdx][sess].push({ tipo: 'folga', nome: 'Folga', desc: 'Dia de folga', zona: '', metros: 0, isHeader: true });
    return;
  }

  const isHeader = HEADER_NAMES.some((h) => rawZona === h || rawZona.startsWith(`${h} `)) || rawZona.startsWith('TAREFA');
  if (isHeader) {
    const tipo = rawZona.includes('AQUEC') ? 'aquec' : rawZona.includes('RECUP') ? 'rec' : 'tarefa';
    plan[dayIdx][sess].push({ tipo, nome: label || rawZona, desc: '', zona: '', metros, isHeader: true });
    return;
  }

  const validZona = ZONAS.includes(rawZona) ? rawZona : '';
  if (!validZona && !rawDesc && !metros) return;

  let fullDesc = rawDesc;
  for (let c = cDesc + 1; c < cDesc + 8 && c < row.length; c++) {
    const extra = String(row[c] || '').trim();
    const extraNorm = norm(extra);
    if (!extra || extra === '0') continue;
    if (ZONAS.includes(extraNorm) || HEADER_NAMES.some((h) => extraNorm.startsWith(h))) continue;
    if (/^\d+(?:[.,]\d+)?$/.test(extra)) continue;
    if (c === cMetros || c === cCiclo) continue;
    fullDesc += (fullDesc ? ' ' : '') + extra;
  }

  let ciclo = String(row[cCiclo] || '').trim();
  if (!ciclo || ciclo === '0') {
    for (let c = cCiclo; c < cCiclo + 4 && c < row.length; c++) {
      const v = String(row[c] || '').trim();
      if (v && v !== '0' && /(['":]|\bcd\b|\bch\b)/i.test(v)) {
        ciclo = v;
        break;
      }
    }
  }

  if (!fullDesc && !metros) return;

  plan[dayIdx][sess].push({ tipo: 'ex', nome: '', desc: fullDesc, zona: validZona, metros, ciclo, target: '', isHeader: false });

  const key = `${dayIdx}_${sess}`;
  if (!zonePl[key]) zonePl[key] = zoneTotals();
  if (validZona && metros) zonePl[key][validZona] = (zonePl[key][validZona] || 0) + metros;
}

function showLoadModal(parsed, filename) {
  const hasExisting = Object.keys(S.weekPlan).length > 0;
  const dayCount = Object.keys(parsed.plan).length;
  const exCount = Object.values(parsed.plan).reduce((sum, day) => (
    sum + (day.manha || []).filter((b) => !b.isHeader).length + (day.tarde || []).filter((b) => !b.isHeader).length
  ), 0);

  showModal('Carregar plano',
    `<div style="font-size:13px;color:#6b85a8;">Ficheiro: <strong style="color:#a8c0e0">${esc(filename)}</strong></div>
     <div style="font-size:13px;color:#6b85a8;margin-top:6px;">Dias: <strong style="color:#a8c0e0">${dayCount}</strong> · Exercícios: <strong style="color:#a8c0e0">${exCount}</strong></div>
     ${hasExisting ? '<div class="info-bar" style="margin-top:10px;">⚠️ Já existe um plano carregado. Escolha com cuidado.</div>' : ''}`,
    hasExisting ? [
      { label: 'Substituir plano', cls: 'btn-primary', fn: () => applyPlan(parsed, false) },
      { label: 'Acumular com o plano existente', cls: 'btn-secondary', fn: () => applyPlan(parsed, true) },
      { label: 'Cancelar', cls: 'btn-danger', fn: closeModal },
    ] : [
      { label: 'Carregar plano', cls: 'btn-primary', fn: () => applyPlan(parsed, false) },
      { label: 'Cancelar', cls: 'btn-secondary', fn: closeModal },
    ]);
}

function applyPlan(parsed, merge) {
  if (merge) {
    Object.keys(parsed.plan).forEach((k) => {
      if (!S.weekPlan[k]) S.weekPlan[k] = parsed.plan[k];
      else {
        S.weekPlan[k].manha = [...(S.weekPlan[k].manha || []), ...(parsed.plan[k].manha || [])];
        S.weekPlan[k].tarde = [...(S.weekPlan[k].tarde || []), ...(parsed.plan[k].tarde || [])];
        S.weekPlan[k].piscina ||= parsed.plan[k].piscina || '';
      }
    });
    Object.keys(parsed.zonePl).forEach((k) => {
      if (!S.zonePlan[k]) S.zonePlan[k] = zoneTotals();
      ZONAS.forEach((z) => { S.zonePlan[k][z] = (S.zonePlan[k][z] || 0) + (parsed.zonePl[k][z] || 0); });
    });
  } else {
    S.weekPlan = parsed.plan;
    S.zonePlan = parsed.zonePl;
    S.zoneLog = {};
  }
  saveState();
  closeModal();
  renderTab();
  toast('Plano carregado com sucesso!');
}

// ============================================================
// ADD BLOCK
// ============================================================
function showAddBlockModal() {
  showModal('Novo bloco',
    `<div class="form-row">
      <select class="sel" id="mTipo" style="flex:1;"><option value="aquec">Aquecimento</option><option value="tarefa" selected>Tarefa</option><option value="rec">Recuperação</option></select>
      <input class="inp" id="mNome" placeholder="Nome do bloco" style="flex:2;">
    </div>
    <div class="form-row">
      <select class="sel" id="mZona" style="flex:1;">${ZONAS.map((z) => `<option>${esc(z)}</option>`).join('')}</select>
      <input class="inp" id="mDesc" placeholder="Descrição (ex: 10 x 100 CROL c/palas)" style="flex:3;">
    </div>
    <div class="form-row">
      <input class="inp" id="mMetros" type="number" placeholder="Metros" style="flex:1;">
      <input class="inp" id="mCiclo" placeholder="Ciclo (ex: cd 1'45)" style="flex:1;">
      <input class="inp" id="mTarget" placeholder="Tempo alvo" style="flex:1;">
    </div>`,
    [
      { label: 'Adicionar bloco', cls: 'btn-primary', fn: saveBlockModal },
      { label: 'Cancelar', cls: 'btn-secondary', fn: closeModal },
    ]);
}

function saveBlockModal() {
  const tipo = $('mTipo').value;
  const nomeRaw = $('mNome').value.trim();
  const nome = nomeRaw || (tipo === 'aquec' ? 'Aquecimento' : tipo === 'rec' ? 'Recuperação' : 'Tarefa');
  const zona = $('mZona').value;
  const desc = $('mDesc').value.trim();
  const metros = parseMeters($('mMetros').value);
  const ciclo = $('mCiclo').value.trim();
  const target = $('mTarget').value.trim();

  if (!desc && !nomeRaw) {
    toast('Preencha o nome ou descrição.');
    return;
  }

  if (!S.weekPlan[S.dayIdx]) S.weekPlan[S.dayIdx] = { manha: [], tarde: [], piscina: '' };
  if (!S.weekPlan[S.dayIdx][S.sessao]) S.weekPlan[S.dayIdx][S.sessao] = [];

  const arr = S.weekPlan[S.dayIdx][S.sessao];
  const lastHeader = [...arr].reverse().find((b) => b.isHeader);
  if (!lastHeader || lastHeader.tipo !== tipo || lastHeader.nome !== nome) {
    arr.push({ tipo, nome, metros: 0, zona: '', desc: '', ciclo: '', target: '', isHeader: true });
  }
  arr.push({ tipo: 'ex', nome: '', desc, zona, metros, ciclo, target, isHeader: false });

  if (zona && metros) {
    const key = `${S.dayIdx}_${S.sessao}`;
    if (!S.zonePlan[key]) S.zonePlan[key] = zoneTotals();
    S.zonePlan[key][zona] = (S.zonePlan[key][zona] || 0) + metros;
  }

  saveState();
  closeModal();
  renderTab();
  toast('Bloco adicionado!');
}

// ============================================================
// CRONÓMETRO
// ============================================================
function namedBlocks() {
  const blocks = (S.weekPlan[S.dayIdx] || {})[S.sessao] || [];
  const named = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.isHeader && b.nome && b.nome !== 'Folga') {
      let end = blocks.length;
      for (let j = i + 1; j < blocks.length; j++) {
        if (blocks[j].isHeader) { end = j; break; }
      }
      named.push({ header: b, start: i, end, blocks });
    }
  }
  return named;
}

function targetForBlock(idx) {
  const item = namedBlocks()[Number(idx) || 0];
  if (!item) return '';
  if (item.header.target) return item.header.target;
  for (let i = item.start + 1; i < item.end; i++) {
    if (item.blocks[i]?.target) return item.blocks[i].target;
  }
  return '';
}

function setCronoAthlete(value) {
  S.cronoAthleteId = value;
}

function setCronoBlock(value) {
  S.cronoBlockIdx = value;
  renderTab();
}

function renderCrono() {
  const sw = S.sw;
  const elapsed = sw.running ? sw.elapsed + (Date.now() - sw.start) : sw.elapsed;
  const currentAthleteId = S.cronoAthleteId || (S.athletes[0]?.id ? String(S.athletes[0].id) : '');
  S.cronoAthleteId = currentAthleteId;

  const athleteOpts = S.athletes.length
    ? S.athletes.map((a) => `<option value="${esc(a.id)}" ${String(a.id) === String(currentAthleteId) ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')
    : '<option value="">— Adicione atletas —</option>';

  const blocks = namedBlocks();
  if (Number(S.cronoBlockIdx) >= blocks.length) S.cronoBlockIdx = '0';
  const blockOpts = blocks.length
    ? blocks.map((b, i) => `<option value="${i}" ${String(i) === String(S.cronoBlockIdx) ? 'selected' : ''}>${esc(b.header.nome || `Bloco ${i + 1}`)}</option>`).join('')
    : '<option value="">— Sem blocos —</option>';

  const target = targetForBlock(S.cronoBlockIdx);
  const targetMs = parseTargetTime(target);
  const splits = sw.splits;
  const avg = splits.length ? splits.reduce((a, s) => a + s.lap, 0) / splits.length : 0;

  let html = dayTabsHTML();
  html += `<div class="form-row" style="margin-bottom:10px;">
    <div style="flex:1;"><div class="section-label">Atleta</div><select class="sel" id="cAtleta" onchange="setCronoAthlete(this.value)">${athleteOpts}</select></div>
    <div style="flex:1;"><div class="section-label">Bloco</div><select class="sel" id="cBloco" onchange="setCronoBlock(this.value)">${blockOpts}</select></div>
  </div>`;

  html += `<div class="card">
    <div class="sw-display" id="swDisp">${fmtTime(elapsed)}</div>
    <div class="sw-info" id="swInfo">${splits.length ? `${splits.length} parcial${splits.length !== 1 ? 'is' : ''}` : 'Sem parciais'}${target ? ` · Alvo ${esc(target)}` : ''}</div>
    <div class="sw-controls">
      <button class="sw-btn start" id="btnSS" onclick="toggleSW()">${sw.running ? 'Parar' : sw.elapsed > 0 ? 'Retomar' : 'Iniciar'}</button>
      <button class="sw-btn split" id="btnSplit" onclick="takeSplit()" ${!sw.running ? 'disabled' : ''}>Parcial</button>
      <button class="sw-btn reset" onclick="resetSW()">Reset</button>
    </div>
  </div>`;

  if (splits.length) {
    html += `<div class="card"><div class="card-title">Parciais</div>
      ${splits.map((s, i) => {
        const dAvg = s.lap - avg;
        const avgTxt = (dAvg >= 0 ? '+' : '') + fmtTime(Math.abs(dAvg));
        const targetDiff = targetMs ? s.lap - targetMs : 0;
        const targetTxt = targetMs ? `${targetDiff >= 0 ? '+' : ''}${fmtTime(Math.abs(targetDiff))}` : '';
        const cls = i === 0 ? '' : dAvg > 0 ? 'lap-slow' : 'lap-fast';
        return `<div class="split-row" style="grid-template-columns:32px 80px 80px 1fr ${targetMs ? '70px' : ''};">
          <span class="split-num">#${i + 1}</span>
          <span style="font-weight:600;color:#a8c0e0;">${fmtTime(s.cum)}</span>
          <span style="color:#6b85a8;">${fmtTime(s.lap)}</span>
          <span class="${cls}">${i > 0 ? avgTxt : '—'}</span>
          ${targetMs ? `<span class="target-compare ${targetDiff > 0 ? 'tc-over' : 'tc-good'}">${targetTxt}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  html += `<button class="btn btn-success" style="width:100%;margin-top:6px;" onclick="saveSplits()">Guardar parciais para este atleta</button>`;
  return html;
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) {}
}

async function releaseWakeLock() {
  try {
    if (wakeLock) await wakeLock.release();
  } catch (_) {}
  wakeLock = null;
}

function toggleSW() {
  const sw = S.sw;
  if (sw.running) {
    clearInterval(sw.iv);
    sw.elapsed += Date.now() - sw.start;
    sw.running = false;
    releaseWakeLock();
  } else {
    sw.start = Date.now();
    sw.running = true;
    sw.iv = setInterval(updateSWDisplay, 37);
    requestWakeLock();
  }
  renderTab();
}

function updateSWDisplay() {
  const el = $('swDisp');
  if (el && S.sw.running) el.textContent = fmtTime(S.sw.elapsed + (Date.now() - S.sw.start));
}

function takeSplit() {
  const sw = S.sw;
  if (!sw.running) return;
  const now = sw.elapsed + (Date.now() - sw.start);
  sw.splits.push({ cum: now, lap: now - sw.lastSplit });
  sw.lastSplit = now;
  renderTab();
}

function resetSW() {
  clearInterval(S.sw.iv);
  S.sw = { running: false, start: 0, elapsed: 0, splits: [], lastSplit: 0, iv: null };
  releaseWakeLock();
  renderTab();
}

function saveSplits() {
  const sw = S.sw;
  if (!sw.splits.length) { toast('Sem parciais para guardar.'); return; }

  const athlete = S.athletes.find((a) => String(a.id) === String(S.cronoAthleteId));
  if (!athlete) { toast('Selecione um atleta.'); return; }

  const block = namedBlocks()[Number(S.cronoBlockIdx) || 0];
  const target = targetForBlock(S.cronoBlockIdx);

  S.results.push({
    id: Date.now(),
    date: new Date().toLocaleDateString('pt-PT'),
    dia: DIAS[S.dayIdx],
    sessao: S.sessao,
    athlete: athlete.nome,
    bloco: block?.header?.nome || '—',
    targetTime: target,
    splits: sw.splits.map((s) => ({ cum: s.cum, lap: s.lap })),
  });

  saveState();
  resetSW();
  toast('Parciais guardados!');
}

// ============================================================
// ZONAS
// ============================================================
function renderZonas() {
  const key = `${S.dayIdx}_${S.sessao}`;
  const plan = { ...zoneTotals(), ...(S.zonePlan[key] || {}) };
  const log = { ...zoneTotals(), ...(S.zoneLog[key] || {}) };
  const totalP = ZONAS.reduce((a, z) => a + (plan[z] || 0), 0);
  const totalL = ZONAS.reduce((a, z) => a + (log[z] || 0), 0);
  const pct = totalP ? Math.round((totalL / totalP) * 100) : 0;

  let html = dayTabsHTML();
  html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
    <div class="zone-metric"><div class="lbl">Planeado</div><div class="val">${totalP}m</div></div>
    <div class="zone-metric"><div class="lbl">Realizado</div><div class="val">${totalL}m</div></div>
    <div class="zone-metric"><div class="lbl">Cumprimento</div><div class="val" style="color:${pct >= 100 ? '#2ecc71' : pct >= 70 ? '#f0a500' : '#e74c3c'}">${pct}%</div></div>
  </div>`;

  const zoneRows = ZONAS.map((z) => {
    const p = plan[z] || 0;
    const l = log[z] || 0;
    if (!p && !l) return '';
    const pctZ = p ? Math.round((l / p) * 100) : 0;
    const fillCls = pctZ > 100 ? 'over' : pctZ >= 75 ? 'ok' : 'warn';
    return `<div class="zone-row">
      <span class="zbadge z-${zkey(z)}">${esc(z)}</span>
      <span style="text-align:right;color:#6b85a8;">${p || '—'}</span>
      <span style="text-align:right;color:#a8c0e0;font-weight:600;">${l || '—'}</span>
      <div>
        <div style="font-size:10px;color:#4a6490;text-align:right;margin-bottom:2px;">${p ? `${pctZ}%` : ''}</div>
        <div class="prog-bar"><div class="prog-fill ${fillCls}" style="width:${Math.min(100, pctZ)}%"></div></div>
      </div>
      <button onclick="clearZoneLog('${esc(z)}')" style="color:#4a6490;font-size:14px;padding:2px;">✕</button>
    </div>`;
  }).filter(Boolean).join('');

  html += `<div class="card" style="padding:10px 0;">
    <div style="padding:0 10px 8px;"><span class="card-title">Plano vs Escrito</span></div>
    <div style="display:grid;grid-template-columns:62px 70px 70px 1fr 32px;gap:6px;padding:6px 10px;border-bottom:1px solid #111d33;">
      <span style="font-size:10px;color:#4a6490;font-weight:600;">ZONA</span>
      <span style="font-size:10px;color:#4a6490;font-weight:600;text-align:right;">PLANO</span>
      <span style="font-size:10px;color:#4a6490;font-weight:600;text-align:right;">ESCRITO</span>
      <span style="font-size:10px;color:#4a6490;font-weight:600;">PROGRESSO</span><span></span>
    </div>
    ${zoneRows || '<div class="empty-state">Sem dados de zonas para este dia/sessão.</div>'}
    <div class="zone-row" style="border-top:1px solid #1e3358;margin-top:4px;">
      <span style="font-size:12px;font-weight:700;color:#a8c0e0;">Total</span>
      <span style="text-align:right;font-weight:700;color:#6b85a8;">${totalP}</span>
      <span style="text-align:right;font-weight:700;color:#4d9fff;">${totalL}</span>
      <span class="${pct >= 100 ? 'pill-ok' : 'pill-warn'}">${pct}%</span><span></span>
    </div>
  </div>`;

  html += `<div class="card">
    <div class="card-title">Registar metros realizados</div>
    <div class="form-row">
      <select class="sel" id="zZona" style="flex:1;">${ZONAS.map((z) => `<option>${esc(z)}</option>`).join('')}</select>
      <input class="inp" id="zMetros" type="number" placeholder="Metros" style="flex:2;">
      <button class="btn btn-primary" onclick="registerZone()">Registar</button>
    </div>
    <div style="font-size:11px;color:#4a6490;">${esc(DIAS[S.dayIdx])} — ${S.sessao === 'manha' ? 'Manhã' : 'Tarde'}</div>
  </div>`;

  return html;
}

function registerZone() {
  const zona = $('zZona').value;
  const metros = parseMeters($('zMetros').value);
  if (!metros) { toast('Introduza os metros.'); return; }
  const key = `${S.dayIdx}_${S.sessao}`;
  if (!S.zoneLog[key]) S.zoneLog[key] = zoneTotals();
  S.zoneLog[key][zona] = (S.zoneLog[key][zona] || 0) + metros;
  saveState();
  renderTab();
  toast(`+${metros}m na zona ${zona}`);
}

function clearZoneLog(zona) {
  const key = `${S.dayIdx}_${S.sessao}`;
  if (S.zoneLog[key]) S.zoneLog[key][zona] = 0;
  saveState();
  renderTab();
}

// ============================================================
// ATLETAS
// ============================================================
function renderAtletas() {
  let html = `<div class="card">
    <div class="card-title">Adicionar atleta</div>
    <div class="form-row">
      <input class="inp" id="nomeAtleta" placeholder="Nome do atleta" style="flex:2;">
      <input class="inp" id="grupoAtleta" placeholder="Grupo / pista" style="flex:1;">
    </div>
    <button class="btn btn-primary" style="width:100%;" onclick="addAthlete()">Adicionar</button>
  </div>`;

  if (!S.athletes.length) {
    html += `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4"/></svg><div>Sem atletas registados.</div></div>`;
  } else {
    html += `<div class="card">${S.athletes.map((a) => `<div class="athlete-row">
      <div class="athlete-avatar">${esc(initials(a.nome))}</div>
      <div style="flex:1;"><div style="font-weight:600;color:#a8c0e0;">${esc(a.nome)}</div>${a.grupo ? `<div style="font-size:11px;color:#4a6490;">${esc(a.grupo)}</div>` : ''}</div>
      <button class="btn btn-danger btn-sm" onclick="removeAthlete(${Number(a.id)})">Remover</button>
    </div>`).join('')}</div>`;
  }
  return html;
}

function addAthlete() {
  const nome = $('nomeAtleta').value.trim();
  const grupo = $('grupoAtleta').value.trim();
  if (!nome) { toast('Introduza o nome.'); return; }
  const athlete = { id: Date.now(), nome, grupo };
  S.athletes.push(athlete);
  if (!S.cronoAthleteId) S.cronoAthleteId = String(athlete.id);
  saveState();
  renderTab();
  toast(`${nome} adicionado!`);
}

function removeAthlete(id) {
  showModal('Remover atleta', '<div style="font-size:13px;color:#6b85a8;">Tem a certeza? Os resultados deste atleta serão mantidos.</div>', [
    { label: 'Remover', cls: 'btn-danger', fn: () => confirmRemoveAthlete(id) },
    { label: 'Cancelar', cls: 'btn-secondary', fn: closeModal },
  ]);
}

function confirmRemoveAthlete(id) {
  S.athletes = S.athletes.filter((a) => a.id !== id);
  if (String(S.cronoAthleteId) === String(id)) S.cronoAthleteId = '';
  saveState();
  closeModal();
  renderTab();
  toast('Atleta removido.');
}

// ============================================================
// RESULTADOS
// ============================================================
function renderResultados() {
  const athletes = [...new Set(S.results.map((r) => r.athlete))].sort();
  const dias = [...new Set(S.results.map((r) => r.dia))];

  const fa = $('rFiltA')?.value || '';
  const fd = $('rFiltD')?.value || '';
  let data = S.results;
  if (fa) data = data.filter((r) => r.athlete === fa);
  if (fd) data = data.filter((r) => r.dia === fd);

  let html = `<div class="form-row" style="margin-bottom:10px;">
    <select class="sel" id="rFiltA" style="flex:1;" onchange="renderTab()"><option value="">Todos os atletas</option>${athletes.map((a) => `<option ${fa === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <select class="sel" id="rFiltD" style="flex:1;" onchange="renderTab()"><option value="">Todos os dias</option>${dias.map((d) => `<option ${fd === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
    <button class="btn btn-secondary btn-sm" onclick="exportCSV()">CSV</button>
  </div>`;

  if (!data.length) {
    html += `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v5"/><path d="M9 11l3 3L22 4"/></svg><div>Sem resultados guardados.</div></div>`;
  } else {
    html += data.slice().reverse().map((r) => {
      const avg = r.splits.reduce((a, s) => a + s.lap, 0) / (r.splits.length || 1);
      const targetMs = parseTargetTime(r.targetTime);
      return `<div class="result-card"><div class="result-header">
        <div><div class="result-name">${esc(r.athlete)}</div><div class="result-meta">${esc(r.dia)} · ${r.sessao === 'manha' ? 'Manhã' : 'Tarde'} · ${esc(r.date)} · ${esc(r.bloco)}${r.targetTime ? ` · Alvo ${esc(r.targetTime)}` : ''}</div></div>
        <button class="btn btn-danger btn-sm" onclick="deleteResult(${Number(r.id)})">✕</button>
      </div><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;">
        <thead><tr style="color:#4a6490;"><th style="text-align:left;padding:4px 6px;">Parcial</th><th style="text-align:right;padding:4px 6px;">Acum.</th><th style="text-align:right;padding:4px 6px;">Volta</th><th style="text-align:right;padding:4px 6px;">vs Média</th>${targetMs ? '<th style="text-align:right;padding:4px 6px;">vs Alvo</th>' : ''}</tr></thead>
        <tbody>${r.splits.map((s, i) => {
          const d = s.lap - avg;
          const targetDiff = targetMs ? s.lap - targetMs : 0;
          return `<tr style="border-top:1px solid #111d33;"><td style="padding:5px 6px;color:#4a6490;">#${i + 1}</td><td style="text-align:right;padding:5px 6px;color:#a8c0e0;font-weight:600;">${fmtTime(s.cum)}</td><td style="text-align:right;padding:5px 6px;color:#6b85a8;">${fmtTime(s.lap)}</td><td style="text-align:right;padding:5px 6px;" class="${i > 0 ? (d > 0 ? 'lap-slow' : 'lap-fast') : ''}">${i > 0 ? `${d >= 0 ? '+' : ''}${fmtTime(Math.abs(d))}` : '—'}</td>${targetMs ? `<td style="text-align:right;padding:5px 6px;" class="${targetDiff > 0 ? 'lap-slow' : 'lap-fast'}">${targetDiff >= 0 ? '+' : ''}${fmtTime(Math.abs(targetDiff))}</td>` : ''}</tr>`;
        }).join('')}</tbody></table></div></div>`;
    }).join('');
  }
  return html;
}

function deleteResult(id) {
  S.results = S.results.filter((r) => r.id !== id);
  saveState();
  renderTab();
  toast('Resultado apagado.');
}

function exportCSV() {
  if (!S.results.length) { toast('Sem resultados para exportar.'); return; }
  const rows = [['Data', 'Dia', 'Sessão', 'Atleta', 'Bloco', 'Alvo', 'Parcial', 'Acumulado', 'Volta']];
  S.results.forEach((r) => r.splits.forEach((s, i) => rows.push([
    r.date,
    r.dia,
    r.sessao === 'manha' ? 'Manhã' : 'Tarde',
    r.athlete,
    r.bloco,
    r.targetTime || '',
    i + 1,
    fmtTime(s.cum),
    fmtTime(s.lap),
  ])));
  const csv = rows.map((r) => r.map((v) => JSON.stringify(String(v))).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `treinos_${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('CSV exportado!');
}

// ============================================================
// MODAL / TOAST / CONNECTIVITY
// ============================================================
function showModal(title, body, btns) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = body;
  const btnWrap = $('modalBtns');
  btnWrap.innerHTML = '';
  btns.forEach((b) => {
    const btn = document.createElement('button');
    btn.className = `btn ${b.cls}`;
    btn.style.width = '100%';
    btn.textContent = b.label;
    btn.addEventListener('click', b.fn);
    btnWrap.appendChild(btn);
  });
  $('modal').style.display = 'flex';
}

function closeModal() {
  $('modal').style.display = 'none';
}

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

window.addEventListener('online', () => toast('Ligação restaurada.'));
window.addEventListener('offline', () => toast('Modo offline ativado.'));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.sw.running) requestWakeLock();
});
