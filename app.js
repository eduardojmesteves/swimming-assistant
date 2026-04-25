// ============================================================
// SwimCoach PWA — app.js
// Live Training build: exact exercise selection + group-start timing
// ============================================================

const ZONAS = ['TT', 'A1', 'A2', 'A3', 'M.AER', 'LAN', 'M.ANA', 'VEL', 'PML', 'TL'];
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const DIAS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const STORE_KEY = 'swim_coach_v4_live';
const OLD_STORE_KEYS = ['swim_coach_v3', 'swim_coach_v2', 'swimcoach_v2'];

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
  SEGUNDA: 0,
  'SEGUNDA-FEIRA': 0,
  TERCA: 1,
  'TERCA-FEIRA': 1,
  QUARTA: 2,
  'QUARTA-FEIRA': 2,
  QUINTA: 3,
  'QUINTA-FEIRA': 3,
  SEXTA: 4,
  'SEXTA-FEIRA': 4,
  SABADO: 5,
  DOMINGO: 6,
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
    weekLabel: '',
    selectedExerciseId: '',
    selectedExercise: null,
    activeAthleteId: '',
    liveSplitDistance: 25,
    activeSession: null,
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

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function hasSplits(session = S.activeSession) {
  if (!session?.splitsByAthlete) return false;
  return Object.values(session.splitsByAthlete).some((arr) => Array.isArray(arr) && arr.length);
}

function totalSplitCount(session = S.activeSession) {
  if (!session?.splitsByAthlete) return 0;
  return Object.values(session.splitsByAthlete).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
}

function safeSessionForSave(session) {
  if (!session) return null;
  const copy = { ...session };
  delete copy.iv;
  return copy;
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
        weekLabel: d.weekLabel || '',
        selectedExerciseId: d.selectedExerciseId || '',
        selectedExercise: d.selectedExercise || null,
        activeAthleteId: d.activeAthleteId || d.cronoAthleteId || '',
        liveSplitDistance: Number(d.liveSplitDistance) || 25,
        activeSession: d.activeSession || null,
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
      weekLabel: S.weekLabel,
      selectedExerciseId: S.selectedExerciseId,
      selectedExercise: S.selectedExercise,
      activeAthleteId: S.activeAthleteId,
      liveSplitDistance: S.liveSplitDistance,
      activeSession: safeSessionForSave(S.activeSession),
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
  if (!S.activeAthleteId && S.athletes[0]) S.activeAthleteId = String(S.athletes[0].id);
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
  if (S.activeSession?.status === 'active' && S.activeSession.running) {
    toast('Cronómetro ativo: pause ou termine antes de mudar sessão.');
    return;
  }
  S.sessao = s;
  syncSessionButtons();
  renderTab();
}

function syncSessionButtons() {
  $('btnManha')?.classList.toggle('active', S.sessao === 'manha');
  $('btnTarde')?.classList.toggle('active', S.sessao === 'tarde');
}

function setDay(i) {
  if (S.activeSession?.status === 'active' && S.activeSession.running) {
    toast('Cronómetro ativo: pause ou termine antes de mudar dia.');
    return;
  }
  S.dayIdx = i;
  renderTab();
}

function renderTab() {
  const c = $('content');
  if (!c) return;
  if (S.tab === 'plano') c.innerHTML = renderPlano();
  else if (S.tab === 'live') c.innerHTML = renderLive();
  else if (S.tab === 'cronometro') c.innerHTML = renderCrono();
  else if (S.tab === 'zonas') c.innerHTML = renderZonas();
  else if (S.tab === 'atletas') c.innerHTML = renderAtletas();
  else if (S.tab === 'resultados') c.innerHTML = renderResultados();

  if ((S.tab === 'live' || S.tab === 'cronometro') && S.activeSession?.running) {
    clearInterval(S.activeSession.iv);
    S.activeSession.iv = setInterval(updateSWDisplay, 37);
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
// EXERCISE SELECTION
// ============================================================
function getBlocks(dayIdx = S.dayIdx, sess = S.sessao) {
  return (S.weekPlan[dayIdx] || {})[sess] || [];
}

function getPool(dayIdx = S.dayIdx) {
  return (S.weekPlan[dayIdx] || {}).piscina || '';
}

function getExerciseEntries(dayIdx = S.dayIdx, sess = S.sessao) {
  const blocks = getBlocks(dayIdx, sess);
  const entries = [];
  let blockName = 'Sem bloco';
  let blockTipo = 'tarefa';
  blocks.forEach((b, idx) => {
    if (b.isHeader) {
      blockName = b.nome || 'Bloco';
      blockTipo = b.tipo || 'tarefa';
    } else {
      entries.push({
        id: `${dayIdx}_${sess}_${idx}`,
        dayIdx,
        sess,
        idx,
        ex: b,
        blockName,
        blockTipo,
      });
    }
  });
  return entries;
}

function buildExerciseSnapshot(dayIdx, sess, idx) {
  const entry = getExerciseEntries(dayIdx, sess).find((e) => e.idx === Number(idx));
  if (!entry) return null;
  const ex = entry.ex;
  return {
    id: entry.id,
    dayIdx,
    sess,
    day: DIAS[dayIdx],
    sessionLabel: sess === 'manha' ? 'Manhã' : 'Tarde',
    blockName: entry.blockName,
    blockTipo: entry.blockTipo,
    index: Number(idx),
    zona: ex.zona || '',
    desc: ex.desc || '',
    metros: parseMeters(ex.metros),
    ciclo: ex.ciclo || '',
    target: ex.target || '',
    pool: getPool(dayIdx),
  };
}

function getSelectedExercise() {
  if (!S.selectedExerciseId) return null;
  const parts = S.selectedExerciseId.split('_');
  if (parts.length >= 3) {
    const idx = Number(parts[2]);
    const fresh = buildExerciseSnapshot(Number(parts[0]), parts[1], idx);
    if (fresh) {
      S.selectedExercise = fresh;
      return fresh;
    }
  }
  return S.selectedExercise || null;
}

function defaultSplitDistance(pool) {
  return String(pool || '').toUpperCase().includes('50') ? 50 : 25;
}

function selectExerciseByIndex(dayIdx, sess, idx, goLive = false) {
  const snap = buildExerciseSnapshot(dayIdx, sess, idx);
  if (!snap) {
    toast('Exercício não encontrado.');
    return;
  }

  if (S.activeSession?.status === 'active' && S.activeSession.exerciseSnapshot?.id !== snap.id && (S.activeSession.running || hasSplits(S.activeSession))) {
    showModal('Sessão ativa em curso',
      '<div style="font-size:13px;color:#6b85a8;line-height:1.5;">Já existe uma cronometragem ativa. Termine ou descarte essa sessão antes de escolher outro exercício. Isto evita misturar tempos em exercícios errados.</div>',
      [
        { label: 'Ir para Live', cls: 'btn-primary', fn: () => { closeModal(); showTab('live'); } },
        { label: 'Cancelar', cls: 'btn-secondary', fn: closeModal },
      ]);
    return;
  }

  S.dayIdx = dayIdx;
  S.sessao = sess;
  S.selectedExerciseId = snap.id;
  S.selectedExercise = snap;
  if (!S.activeSession || S.activeSession.status === 'finished' || S.activeSession.exerciseSnapshot?.id !== snap.id) {
    S.liveSplitDistance = defaultSplitDistance(snap.pool);
  }
  syncSessionButtons();
  saveState();
  toast('Exercício selecionado.');
  if (goLive) S.tab = 'live';
  renderTab();
}

function selectedExerciseBannerHTML() {
  const ex = getTimingExercise();
  if (!ex) {
    return `<div class="selected-banner muted"><strong>Nenhum exercício selecionado.</strong> Toque numa linha do plano para cronometrar.</div>`;
  }
  return `<div class="selected-banner">
    <div>
      <div class="selected-kicker">Exercício selecionado</div>
      <div class="selected-main">${esc(ex.blockName)} — ${esc(ex.zona || '—')} · ${esc(ex.desc || '—')}</div>
      <div class="selected-meta">${esc(ex.day)} · ${esc(ex.sessionLabel)} · ${esc(ex.pool || 'Piscina?')} · ${ex.metros ? `${ex.metros}m` : 'metros?'}${ex.ciclo ? ` · ${esc(ex.ciclo)}` : ''}${ex.target ? ` · Alvo ${esc(ex.target)}` : ''}</div>
    </div>
    <button class="btn btn-secondary btn-sm" onclick="showTab('live')">Live</button>
  </div>`;
}

function getTimingExercise() {
  if (S.activeSession?.status === 'active' || S.activeSession?.status === 'finished') return S.activeSession.exerciseSnapshot;
  return getSelectedExercise();
}

function exercisePattern(snapshot) {
  if (!snapshot) return null;
  const txt = `${snapshot.desc || ''} ${snapshot.metros || ''}`;
  const m = txt.match(/(\d{1,2})\s*(?:x|×)\s*(\d{2,4})/i);
  if (m) {
    const reps = Number(m[1]);
    const repDistance = Number(m[2]);
    if (reps > 0 && repDistance > 0) return { reps, repDistance, source: 'auto' };
  }
  const meters = parseMeters(snapshot.metros);
  if (meters > 0) return { reps: 1, repDistance: meters, source: 'meters' };
  return null;
}

function splitMeta(splitNo, splitDistance, snapshot) {
  const pattern = exercisePattern(snapshot);
  const totalDistance = splitNo * splitDistance;
  if (!pattern) return { label: `${totalDistance}m`, repetition: '', distanceMarker: totalDistance, totalDistance };
  const repetition = Math.floor((totalDistance - 1) / pattern.repDistance) + 1;
  const distanceMarker = ((totalDistance - 1) % pattern.repDistance) + 1;
  const label = pattern.reps > 1 ? `Rep ${repetition} — ${distanceMarker}m` : `${distanceMarker}m`;
  return { label, repetition, distanceMarker, totalDistance, repDistance: pattern.repDistance, reps: pattern.reps };
}

// ============================================================
// PLANO
// ============================================================
function renderExerciseSections(dayIdx, sess, opts = {}) {
  const blocks = getBlocks(dayIdx, sess);
  if (!blocks.length) {
    return `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h6"/></svg>
      <div>Sem blocos para este dia/sessão.</div>
      <div style="margin-top:4px;">Carregue o Excel ou adicione manualmente.</div>
    </div>`;
  }

  let html = '';
  let open = false;
  let blockName = 'Sem bloco';
  blocks.forEach((b, idx) => {
    if (b.isHeader) {
      if (open) html += '</div></div>';
      blockName = b.nome || 'Bloco';
      const tipo = b.tipo || 'tarefa';
      const meters = parseMeters(b.metros);
      html += `<div class="block-section"><div class="block-header ${esc(tipo)}"><span>${esc(blockName)}</span>${meters ? `<span style="font-size:11px;opacity:.7;">${meters}m</span>` : ''}</div><div class="block-body">`;
      open = true;
      return;
    }

    if (!open) {
      html += '<div class="block-section"><div class="block-body">';
      open = true;
    }

    const snap = buildExerciseSnapshot(dayIdx, sess, idx);
    const selected = snap && S.selectedExerciseId === snap.id;
    const locked = S.activeSession?.status === 'active' && S.activeSession.exerciseSnapshot?.id === snap?.id;
    html += `<button class="ex-row ex-clickable${b.target ? ' has-target' : ''}${selected ? ' selected' : ''}${locked ? ' locked' : ''}" onclick="selectExerciseByIndex(${dayIdx}, '${sess}', ${idx}, ${opts.goLive ? 'true' : 'false'})">
      <span class="zbadge z-${zkey(b.zona)}">${esc(b.zona || '—')}</span>
      <span>
        <span style="color:#c8d8f0;line-height:1.4;display:block;">${esc(b.desc || '—')}</span>
        ${b.ciclo ? `<span style="font-size:11px;color:#4a6490;margin-top:2px;display:block;">${esc(b.ciclo)}</span>` : ''}
        ${b.target ? `<span style="font-size:11px;color:#f0a500;margin-top:2px;display:block;">Alvo: ${esc(b.target)}</span>` : ''}
      </span>
      <span style="text-align:right;color:#4a6490;font-size:12px;">${parseMeters(b.metros) || ''}</span>
    </button>`;
  });
  if (open) html += '</div></div>';
  return html;
}

function renderPlano() {
  const day = S.weekPlan[S.dayIdx] || {};
  const blocks = day[S.sessao] || [];
  const totalP = blocks.filter((b) => !b.isHeader).reduce((a, b) => a + (parseMeters(b.metros) || 0), 0);
  const piscina = day.piscina || '';

  let html = dayTabsHTML();
  html += selectedExerciseBannerHTML();
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;">
    <div>
      <span style="font-size:15px;font-weight:700;color:#a8c0e0;">${esc(DIAS[S.dayIdx])} — ${S.sessao === 'manha' ? 'Manhã' : 'Tarde'}</span>
      ${piscina ? `<span class="tag" style="margin-left:6px;">${esc(piscina)}</span>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="font-size:12px;color:#4a6490;white-space:nowrap;">Total: <strong style="color:#4d9fff">${totalP}m</strong></div>
      <button class="btn btn-secondary btn-sm" onclick="showPlanManager()">Gerir plano</button>
    </div>
  </div>`;

  html += `<div class="card" style="margin-bottom:10px;">
    <label class="upload-zone" style="padding:16px;display:block;">
      <div class="upload-icon">📋</div>
      <div class="upload-title">Carregar plano semanal (.xlsx)</div>
      <div style="font-size:11px;color:#4a6490;">Substituir ou acumular com o plano existente</div>
      <input type="file" id="xlsxInput" accept=".xlsx,.xls" style="display:none" onchange="loadXlsx(event)">
    </label>
  </div>`;

  html += renderExerciseSections(S.dayIdx, S.sessao, { goLive: false });
  html += `<button class="btn btn-secondary" style="width:100%;margin-top:6px;" onclick="showAddBlockModal()">+ Adicionar bloco manualmente</button>`;
  return html;
}

// ============================================================
// PLAN MANAGEMENT
// ============================================================
function planStats() {
  const days = Object.keys(S.weekPlan || {}).length;
  let exercises = 0;
  let meters = 0;
  Object.values(S.weekPlan || {}).forEach((day) => {
    ['manha', 'tarde'].forEach((sess) => {
      (day?.[sess] || []).forEach((b) => {
        if (!b.isHeader) {
          exercises += 1;
          meters += parseMeters(b.metros);
        }
      });
    });
  });
  return { days, exercises, meters };
}

function hasBlockingActiveSession() {
  return S.activeSession?.status === 'active' && (S.activeSession.running || hasSplits(S.activeSession));
}

function triggerPlanImport() {
  if (hasBlockingActiveSession()) {
    toast('Termine ou descarte a sessão ativa antes de substituir o plano.');
    return;
  }
  closeModal();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.style.display = 'none';
  input.addEventListener('change', loadXlsx);
  document.body.appendChild(input);
  input.click();
  setTimeout(() => input.remove(), 30000);
}

function showPlanManager() {
  const st = planStats();
  const hasPlan = st.days > 0;
  const activeWarning = hasBlockingActiveSession()
    ? '<div class="info-bar" style="margin-top:10px;color:#e74c3c;border-color:#4a1818;background:#2a0808;">⚠️ Existe uma sessão Live ativa com tempos. Termine ou descarte a sessão antes de limpar/substituir o plano.</div>'
    : '';

  showModal('Gerir plano',
    `<div class="plan-summary">
      <div><span>Plano atual</span><strong>${hasPlan ? esc(S.weekLabel || 'Plano carregado') : 'Nenhum plano carregado'}</strong></div>
      <div><span>Dias</span><strong>${st.days}</strong></div>
      <div><span>Exercícios</span><strong>${st.exercises}</strong></div>
      <div><span>Metros</span><strong>${st.meters}</strong></div>
    </div>
    <div style="font-size:12px;color:#6b85a8;line-height:1.5;margin-top:10px;">
      <strong>Limpar plano atual</strong> remove o plano, zonas planeadas/registadas e exercício selecionado. Mantém atletas e resultados.
    </div>
    ${activeWarning}`,
    [
      { label: 'Carregar/substituir plano', cls: 'btn-primary', fn: triggerPlanImport },
      { label: 'Limpar plano atual', cls: 'btn-secondary', fn: showClearPlanConfirm },
      { label: 'Apagar todos os dados', cls: 'btn-danger', fn: showClearAllConfirm },
      { label: 'Cancelar', cls: 'btn-secondary', fn: closeModal },
    ]);
}

function showClearPlanConfirm() {
  if (hasBlockingActiveSession()) {
    toast('Termine ou descarte a sessão ativa antes de limpar o plano.');
    return;
  }
  const st = planStats();
  if (!st.days) {
    toast('Não existe plano para limpar.');
    closeModal();
    return;
  }
  showModal('Limpar plano atual',
    `<div style="font-size:13px;color:#6b85a8;line-height:1.5;">
      Isto remove apenas os dados ligados ao plano atual: plano semanal, zonas planeadas/registadas, exercício selecionado e sessão Live ativa sem tempos.
      <br><br><strong style="color:#a8c0e0;">Atletas e resultados guardados serão mantidos.</strong>
    </div>`,
    [
      { label: 'Limpar plano', cls: 'btn-danger', fn: clearCurrentPlan },
      { label: 'Cancelar', cls: 'btn-secondary', fn: showPlanManager },
    ]);
}

function clearCurrentPlan() {
  if (hasBlockingActiveSession()) {
    toast('Termine ou descarte a sessão ativa antes de limpar o plano.');
    return;
  }
  S.weekPlan = {};
  S.zonePlan = {};
  S.zoneLog = {};
  S.weekLabel = '';
  S.selectedExerciseId = '';
  S.selectedExercise = null;
  S.activeSession = null;
  S.liveSplitDistance = 25;
  saveState();
  closeModal();
  renderTab();
  toast('Plano atual limpo. Atletas e resultados foram mantidos.');
}

function showClearAllConfirm() {
  showModal('Apagar todos os dados',
    `<div style="font-size:13px;color:#6b85a8;line-height:1.5;">
      Isto remove <strong style="color:#e74c3c;">planos, atletas, resultados, zonas e sessões</strong>. Esta ação não pode ser anulada.
      <br><br>Escreva <strong style="color:#a8c0e0;">APAGAR</strong> para confirmar.
    </div>
    <input class="inp" id="wipeConfirm" autocomplete="off" placeholder="Escreva APAGAR" style="margin-top:12px;">`,
    [
      { label: 'Apagar tudo', cls: 'btn-danger', fn: clearAllData },
      { label: 'Cancelar', cls: 'btn-secondary', fn: showPlanManager },
    ]);
}

function clearAllData() {
  const txt = $('wipeConfirm')?.value?.trim().toUpperCase();
  if (txt !== 'APAGAR') {
    toast('Confirmação incorreta. Escreva APAGAR.');
    return;
  }
  if (S.activeSession?.running) {
    clearInterval(S.activeSession.iv);
    releaseWakeLock();
  }
  S = defaultState();
  try {
    localStorage.removeItem(STORE_KEY);
    OLD_STORE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (_) {}
  saveState();
  closeModal();
  syncSessionButtons();
  renderTab();
  toast('Todos os dados foram apagados.');
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
      parsed.filename = file.name;
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
    if (S.activeSession?.status === 'active' && (S.activeSession.running || hasSplits(S.activeSession))) {
      toast('Termine a sessão ativa antes de substituir o plano.');
      closeModal();
      return;
    }
    S.weekPlan = parsed.plan;
    S.zonePlan = parsed.zonePl;
    S.zoneLog = {};
    S.selectedExerciseId = '';
    S.selectedExercise = null;
    S.activeSession = null;
    S.weekLabel = String(parsed.filename || '').replace(/\.[^.]+$/, '') || 'Plano carregado';
  }
  if (merge && parsed.filename && !S.weekLabel) S.weekLabel = String(parsed.filename).replace(/\.[^.]+$/, '');
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
      <input class="inp" id="mTarget" placeholder="Tempo alvo total" style="flex:1;">
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
// LIVE TRAINING / CRONÓMETRO
// ============================================================
function currentSplitDistance() {
  if (S.activeSession?.status === 'active' || S.activeSession?.status === 'finished') return Number(S.activeSession.splitDistance) || 25;
  const ex = getSelectedExercise();
  return Number(S.liveSplitDistance) || defaultSplitDistance(ex?.pool);
}

function setSplitDistance(value) {
  const dist = Number(value);
  if (![25, 50].includes(dist)) return;
  if (S.activeSession?.status === 'active' && hasSplits(S.activeSession)) {
    toast('A distância do parcial fica bloqueada após o primeiro parcial.');
    renderTab();
    return;
  }
  S.liveSplitDistance = dist;
  if (S.activeSession?.status === 'active') S.activeSession.splitDistance = dist;
  saveState();
  renderTab();
}

function setActiveAthlete(id) {
  S.activeAthleteId = String(id || '');
  if (S.activeSession?.status === 'active') S.activeSession.activeAthleteId = S.activeAthleteId;
  saveState();
  renderTab();
}

function createLiveSession(snapshot) {
  const splitDistance = Number(S.liveSplitDistance) || defaultSplitDistance(snapshot.pool);
  return {
    id: uid('session'),
    status: 'active',
    date: new Date().toLocaleDateString('pt-PT'),
    createdAt: new Date().toISOString(),
    exerciseId: snapshot.id,
    exerciseSnapshot: snapshot,
    pool: snapshot.pool,
    splitDistance,
    running: false,
    start: 0,
    elapsed: 0,
    splitsByAthlete: {},
    history: [],
    activeAthleteId: S.activeAthleteId || '',
  };
}

function ensureLiveSession() {
  const snapshot = getSelectedExercise();
  if (!snapshot) {
    toast('Selecione primeiro um exercício no plano.');
    return null;
  }
  if (!S.activeSession || S.activeSession.status === 'finished') {
    S.activeSession = createLiveSession(snapshot);
    saveState();
    return S.activeSession;
  }
  if (S.activeSession.exerciseSnapshot?.id !== snapshot.id) {
    if (S.activeSession.running || hasSplits(S.activeSession)) {
      toast('Existe uma sessão ativa para outro exercício. Termine-a primeiro.');
      return null;
    }
    S.activeSession = createLiveSession(snapshot);
    saveState();
  }
  return S.activeSession;
}

function getLiveElapsed(session = S.activeSession) {
  if (!session) return 0;
  return session.elapsed + (session.running ? Date.now() - session.start : 0);
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

function toggleLiveSW() {
  const session = ensureLiveSession();
  if (!session) return;
  if (session.running) {
    clearInterval(session.iv);
    session.elapsed += Date.now() - session.start;
    session.running = false;
    releaseWakeLock();
  } else {
    session.start = Date.now();
    session.running = true;
    session.status = 'active';
    session.iv = setInterval(updateSWDisplay, 37);
    requestWakeLock();
  }
  saveState();
  renderTab();
}

function updateSWDisplay() {
  const el = $('swDisp');
  if (el && S.activeSession?.running) el.textContent = fmtTime(getLiveElapsed());
}

function nextSplitInfoForAthlete(athleteId) {
  const session = S.activeSession;
  const snapshot = getTimingExercise();
  const list = session?.splitsByAthlete?.[athleteId] || [];
  return splitMeta(list.length + 1, currentSplitDistance(), snapshot);
}

function takeLiveSplit() {
  const session = ensureLiveSession();
  if (!session) return;
  if (!session.running) {
    toast('Inicie o cronómetro antes de registar parciais.');
    return;
  }
  const athlete = S.athletes.find((a) => String(a.id) === String(S.activeAthleteId));
  if (!athlete) {
    toast('Selecione um atleta antes de registar o parcial.');
    return;
  }

  const aid = String(athlete.id);
  if (!session.splitsByAthlete[aid]) session.splitsByAthlete[aid] = [];
  const list = session.splitsByAthlete[aid];
  const cum = getLiveElapsed(session);
  const prevCum = list.length ? list[list.length - 1].cum : 0;
  const meta = splitMeta(list.length + 1, session.splitDistance, session.exerciseSnapshot);
  const targetMs = parseTargetTime(session.exerciseSnapshot?.target);
  const totalMeters = parseMeters(session.exerciseSnapshot?.metros);
  const targetDiffMs = targetMs && totalMeters && meta.totalDistance >= totalMeters ? cum - targetMs : null;
  const split = {
    id: uid('split'),
    athleteId: aid,
    athleteName: athlete.nome,
    splitNo: list.length + 1,
    cum,
    lap: cum - prevCum,
    distanceMarker: meta.distanceMarker,
    totalDistance: meta.totalDistance,
    repetition: meta.repetition,
    repDistance: meta.repDistance,
    label: meta.label,
    targetDiffMs,
    createdAt: new Date().toISOString(),
  };
  list.push(split);
  session.history.push({ athleteId: aid, splitId: split.id });
  session.activeAthleteId = aid;
  saveState();
  renderTab();
}

function recomputeAthleteSplits(athleteId) {
  const session = S.activeSession;
  const list = session?.splitsByAthlete?.[athleteId];
  if (!Array.isArray(list)) return;
  const targetMs = parseTargetTime(session.exerciseSnapshot?.target);
  const totalMeters = parseMeters(session.exerciseSnapshot?.metros);
  list.sort((a, b) => a.cum - b.cum);
  list.forEach((s, idx) => {
    const meta = splitMeta(idx + 1, session.splitDistance, session.exerciseSnapshot);
    const prevCum = idx ? list[idx - 1].cum : 0;
    s.splitNo = idx + 1;
    s.lap = s.cum - prevCum;
    s.distanceMarker = meta.distanceMarker;
    s.totalDistance = meta.totalDistance;
    s.repetition = meta.repetition;
    s.repDistance = meta.repDistance;
    s.label = meta.label;
    s.targetDiffMs = targetMs && totalMeters && meta.totalDistance >= totalMeters ? s.cum - targetMs : null;
  });
}

function undoLastLiveSplit() {
  const session = S.activeSession;
  if (!session?.history?.length) {
    toast('Sem parciais para anular.');
    return;
  }
  const last = session.history.pop();
  const list = session.splitsByAthlete[last.athleteId] || [];
  session.splitsByAthlete[last.athleteId] = list.filter((s) => s.id !== last.splitId);
  recomputeAthleteSplits(last.athleteId);
  saveState();
  renderTab();
  toast('Último parcial anulado.');
}

function deleteLiveSplit(athleteId, splitId) {
  const session = S.activeSession;
  if (!session?.splitsByAthlete?.[athleteId]) return;
  session.splitsByAthlete[athleteId] = session.splitsByAthlete[athleteId].filter((s) => s.id !== splitId);
  session.history = (session.history || []).filter((h) => h.splitId !== splitId);
  recomputeAthleteSplits(athleteId);
  saveState();
  renderTab();
  toast('Parcial removido.');
}

function finishLiveSession() {
  const session = S.activeSession;
  if (!session || !hasSplits(session)) {
    toast('Sem parciais para terminar.');
    return;
  }
  if (session.running) {
    session.elapsed += Date.now() - session.start;
    session.running = false;
    clearInterval(session.iv);
    releaseWakeLock();
  }
  session.status = 'finished';
  session.finishedAt = new Date().toISOString();

  S.results = S.results.filter((r) => r.sessionId !== session.id);
  Object.entries(session.splitsByAthlete).forEach(([athleteId, splits]) => {
    if (!splits.length) return;
    const athlete = S.athletes.find((a) => String(a.id) === String(athleteId));
    const ex = session.exerciseSnapshot;
    S.results.push({
      id: uid('result'),
      sessionId: session.id,
      date: session.date || new Date().toLocaleDateString('pt-PT'),
      dia: ex.day,
      diaIdx: ex.dayIdx,
      sessao: ex.sess,
      athleteId,
      athlete: athlete?.nome || splits[0]?.athleteName || 'Atleta',
      bloco: ex.blockName || '—',
      exerciseId: ex.id,
      exerciseDesc: ex.desc || '',
      zone: ex.zona || '',
      meters: ex.metros || 0,
      ciclo: ex.ciclo || '',
      pool: ex.pool || '',
      splitDistance: session.splitDistance,
      targetTime: ex.target || '',
      splits: splits.map((s) => ({
        id: s.id,
        splitNo: s.splitNo,
        cum: s.cum,
        lap: s.lap,
        label: s.label,
        repetition: s.repetition,
        distanceMarker: s.distanceMarker,
        totalDistance: s.totalDistance,
        targetDiffMs: s.targetDiffMs,
      })),
    });
  });
  saveState();
  renderTab();
  toast('Sessão terminada e resultados guardados.');
}

function clearFinishedSession() {
  if (S.activeSession?.running) {
    toast('Pause o cronómetro primeiro.');
    return;
  }
  S.activeSession = null;
  saveState();
  renderTab();
}

function discardActiveSession() {
  const session = S.activeSession;
  if (!session) return;
  showModal('Descartar sessão',
    '<div style="font-size:13px;color:#6b85a8;line-height:1.5;">Isto remove a sessão ativa do ecrã. Resultados já finalizados ficam guardados; parciais não terminados serão perdidos.</div>',
    [
      { label: 'Descartar', cls: 'btn-danger', fn: () => { if (S.activeSession?.running) releaseWakeLock(); S.activeSession = null; saveState(); closeModal(); renderTab(); } },
      { label: 'Cancelar', cls: 'btn-secondary', fn: closeModal },
    ]);
}

function renderAthleteChips() {
  if (!S.athletes.length) return '<div class="info-bar">Adicione atletas antes de registar tempos.</div>';
  if (!S.activeAthleteId) S.activeAthleteId = String(S.athletes[0].id);
  return `<div class="athlete-chips">${S.athletes.map((a) => {
    const active = String(a.id) === String(S.activeAthleteId);
    const count = S.activeSession?.splitsByAthlete?.[String(a.id)]?.length || 0;
    return `<button class="ath-chip${active ? ' active' : ''}" onclick="setActiveAthlete('${esc(a.id)}')">
      <span class="ath-chip-avatar">${esc(initials(a.nome))}</span>
      <span>${esc(a.nome)}</span>
      ${count ? `<span class="ath-chip-count">${count}</span>` : ''}
    </button>`;
  }).join('')}</div>`;
}

function renderSplitDistanceSelector() {
  const locked = S.activeSession?.status === 'active' && hasSplits(S.activeSession);
  const dist = currentSplitDistance();
  return `<div class="split-distance">
    <span>Parcial:</span>
    <button class="dist-btn${dist === 25 ? ' active' : ''}" ${locked ? 'disabled' : ''} onclick="setSplitDistance(25)">25m</button>
    <button class="dist-btn${dist === 50 ? ' active' : ''}" ${locked ? 'disabled' : ''} onclick="setSplitDistance(50)">50m</button>
    ${locked ? '<span class="locked-note">bloqueado</span>' : ''}
  </div>`;
}

function renderLiveSplits() {
  const session = S.activeSession;
  if (!session || !hasSplits(session)) return '<div class="empty-state" style="padding:18px 8px;">Sem parciais registados nesta sessão.</div>';

  const athleteIds = Object.keys(session.splitsByAthlete).filter((aid) => session.splitsByAthlete[aid]?.length);
  return `<div class="live-split-groups">${athleteIds.map((aid) => {
    const athlete = S.athletes.find((a) => String(a.id) === String(aid));
    const name = athlete?.nome || session.splitsByAthlete[aid][0]?.athleteName || 'Atleta';
    return `<div class="live-split-group">
      <div class="live-split-title">${esc(name)} <span>${session.splitsByAthlete[aid].length} parcial${session.splitsByAthlete[aid].length !== 1 ? 'is' : ''}</span></div>
      <div class="live-split-table">${session.splitsByAthlete[aid].map((s) => `<div class="live-split-row">
        <span>${esc(s.label || `#${s.splitNo}`)}</span>
        <strong>${fmtTime(s.cum)}</strong>
        <span>${fmtTime(s.lap)}</span>
        ${s.targetDiffMs !== null && s.targetDiffMs !== undefined ? `<span class="${s.targetDiffMs > 0 ? 'lap-slow' : 'lap-fast'}">${s.targetDiffMs >= 0 ? '+' : ''}${fmtTime(Math.abs(s.targetDiffMs))}</span>` : '<span></span>'}
        <button onclick="deleteLiveSplit('${esc(aid)}','${esc(s.id)}')">✕</button>
      </div>`).join('')}</div>
    </div>`;
  }).join('')}</div>`;
}

function renderLiveTimingPanel() {
  const ex = getTimingExercise();
  const session = S.activeSession;
  const elapsed = getLiveElapsed(session);
  const activeAthlete = S.athletes.find((a) => String(a.id) === String(S.activeAthleteId));
  const next = activeAthlete ? nextSplitInfoForAthlete(String(activeAthlete.id)) : null;
  const canSplit = !!session?.running && !!activeAthlete;
  const finished = session?.status === 'finished';

  if (!ex) {
    return `<div class="card live-panel"><div class="empty-state"><div style="font-size:32px;margin-bottom:8px;">🏊</div><div>Selecione um exercício no plano.</div><div style="margin-top:4px;">A cronometragem só fica útil quando está ligada a uma linha exata do treino.</div></div></div>`;
  }

  return `<div class="live-panel">
    <div class="live-ex-card">
      <div class="selected-kicker">A cronometrar</div>
      <div class="live-ex-title">${esc(ex.blockName)} — ${esc(ex.zona || '—')}</div>
      <div class="live-ex-desc">${esc(ex.desc || '—')}</div>
      <div class="live-ex-meta">${esc(ex.day)} · ${esc(ex.sessionLabel)} · ${esc(ex.pool || 'Piscina?')} · ${ex.metros ? `${ex.metros}m` : 'metros?'}${ex.ciclo ? ` · ${esc(ex.ciclo)}` : ''}${ex.target ? ` · Alvo total ${esc(ex.target)}` : ''}</div>
    </div>

    <div class="card">
      <div class="card-title">Atleta ativo</div>
      ${renderAthleteChips()}
    </div>

    <div class="card">
      <div class="live-controls-head">
        ${renderSplitDistanceSelector()}
        <div class="next-split">${next ? `Próximo: <strong>${esc(next.label)}</strong>` : 'Selecione atleta'}</div>
      </div>
      <div class="sw-display" id="swDisp">${fmtTime(elapsed)}</div>
      <div class="sw-info">${totalSplitCount(session)} parcial${totalSplitCount(session) !== 1 ? 'is' : ''}${finished ? ' · sessão terminada' : ''}</div>
      <div class="sw-controls live-controls">
        <button class="sw-btn start" onclick="toggleLiveSW()" ${finished ? 'disabled' : ''}>${session?.running ? 'Parar' : session?.elapsed ? 'Retomar' : 'Iniciar'}</button>
        <button class="sw-btn split" onclick="takeLiveSplit()" ${!canSplit || finished ? 'disabled' : ''}>${activeAthlete ? `Split ${esc(activeAthlete.nome)}` : 'Split'}</button>
        <button class="sw-btn split" onclick="undoLastLiveSplit()" ${!session?.history?.length || finished ? 'disabled' : ''}>Undo</button>
      </div>
      <div class="finish-row">
        ${finished ? '<button class="btn btn-secondary" onclick="clearFinishedSession()">Iniciar próximo exercício</button><button class="btn btn-primary" onclick="showTab(\'resultados\')">Ver resultados</button>' : `<button class="btn btn-success" onclick="finishLiveSession()" ${!hasSplits(session) ? 'disabled' : ''}>Terminar exercício</button><button class="btn btn-danger" onclick="discardActiveSession()">Descartar</button>`}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Parciais por atleta</div>
      ${renderLiveSplits()}
    </div>
  </div>`;
}

function renderLive() {
  const day = S.weekPlan[S.dayIdx] || {};
  const blocks = day[S.sessao] || [];
  const totalP = blocks.filter((b) => !b.isHeader).reduce((a, b) => a + (parseMeters(b.metros) || 0), 0);
  const piscina = day.piscina || '';
  return `<div class="live-layout">
    <aside class="live-left">
      ${dayTabsHTML()}
      <div class="live-left-head">
        <div><strong>${esc(DIAS[S.dayIdx])} — ${S.sessao === 'manha' ? 'Manhã' : 'Tarde'}</strong>${piscina ? `<span class="tag">${esc(piscina)}</span>` : ''}</div>
        <div style="display:flex;align-items:center;gap:8px;"><span>${totalP}m</span><button class="btn btn-secondary btn-sm" onclick="showPlanManager()">Gerir plano</button></div>
      </div>
      ${renderExerciseSections(S.dayIdx, S.sessao, { goLive: true })}
    </aside>
    <section class="live-right">
      ${renderLiveTimingPanel()}
    </section>
  </div>`;
}

function renderCrono() {
  return `${dayTabsHTML()}${selectedExerciseBannerHTML()}${renderLiveTimingPanel()}`;
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
  html += selectedExerciseBannerHTML();
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
  if (!S.activeAthleteId) S.activeAthleteId = String(athlete.id);
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
  if (String(S.activeAthleteId) === String(id)) S.activeAthleteId = '';
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
      return `<div class="result-card"><div class="result-header">
        <div><div class="result-name">${esc(r.athlete)}</div><div class="result-meta">${esc(r.dia)} · ${r.sessao === 'manha' ? 'Manhã' : 'Tarde'} · ${esc(r.date)} · ${esc(r.bloco)}${r.exerciseDesc ? ` · ${esc(r.exerciseDesc)}` : ''}${r.zone ? ` · ${esc(r.zone)}` : ''}${r.targetTime ? ` · Alvo total ${esc(r.targetTime)}` : ''}</div></div>
        <button class="btn btn-danger btn-sm" onclick="deleteResult('${esc(r.id)}')">✕</button>
      </div><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;">
        <thead><tr style="color:#4a6490;"><th style="text-align:left;padding:4px 6px;">Parcial</th><th style="text-align:right;padding:4px 6px;">Acum.</th><th style="text-align:right;padding:4px 6px;">Volta</th><th style="text-align:right;padding:4px 6px;">vs Média</th><th style="text-align:right;padding:4px 6px;">vs Alvo</th></tr></thead>
        <tbody>${r.splits.map((s, i) => {
          const d = s.lap - avg;
          const td = s.targetDiffMs;
          return `<tr style="border-top:1px solid #111d33;"><td style="padding:5px 6px;color:#4a6490;">${esc(s.label || `#${i + 1}`)}</td><td style="text-align:right;padding:5px 6px;color:#a8c0e0;font-weight:600;">${fmtTime(s.cum)}</td><td style="text-align:right;padding:5px 6px;color:#6b85a8;">${fmtTime(s.lap)}</td><td style="text-align:right;padding:5px 6px;" class="${i > 0 ? (d > 0 ? 'lap-slow' : 'lap-fast') : ''}">${i > 0 ? `${d >= 0 ? '+' : ''}${fmtTime(Math.abs(d))}` : '—'}</td><td style="text-align:right;padding:5px 6px;" class="${td > 0 ? 'lap-slow' : 'lap-fast'}">${td === null || td === undefined ? '—' : `${td >= 0 ? '+' : ''}${fmtTime(Math.abs(td))}`}</td></tr>`;
        }).join('')}</tbody></table></div></div>`;
    }).join('');
  }
  return html;
}

function deleteResult(id) {
  S.results = S.results.filter((r) => String(r.id) !== String(id));
  saveState();
  renderTab();
  toast('Resultado apagado.');
}

function exportCSV() {
  if (!S.results.length) { toast('Sem resultados para exportar.'); return; }
  const rows = [[
    'SessionID', 'Data', 'Dia', 'Sessão', 'Atleta', 'Bloco', 'Exercício', 'Zona', 'Metros', 'Piscina', 'SplitDistance', 'AlvoTotal', 'Parcial', 'Repetição', 'DistânciaParcial', 'DistânciaTotal', 'Acumulado', 'Volta', 'DeltaAlvoFinal'
  ]];
  S.results.forEach((r) => r.splits.forEach((s, i) => rows.push([
    r.sessionId || '',
    r.date,
    r.dia,
    r.sessao === 'manha' ? 'Manhã' : 'Tarde',
    r.athlete,
    r.bloco,
    r.exerciseDesc || '',
    r.zone || '',
    r.meters || '',
    r.pool || '',
    r.splitDistance || '',
    r.targetTime || '',
    s.label || i + 1,
    s.repetition || '',
    s.distanceMarker || '',
    s.totalDistance || '',
    fmtTime(s.cum),
    fmtTime(s.lap),
    s.targetDiffMs === null || s.targetDiffMs === undefined ? '' : `${s.targetDiffMs >= 0 ? '+' : '-'}${fmtTime(Math.abs(s.targetDiffMs))}`,
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
  if (document.visibilityState === 'visible' && S.activeSession?.running) requestWakeLock();
});
