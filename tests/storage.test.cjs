const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, startSession } = require('./helpers.cjs');

test('failed finish keeps results in memory, exposes a persistent warning and retries without duplicates', () => {
  const h = createApp(); startSession(h);
  const storedBefore = h.storage.get('swim_coach_v6_phase4');
  const setItem = h.app.localStorage.setItem;
  h.app.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  h.run('finishLiveSession()');
  assert.equal(h.run('S.results.length'), 1);
  assert.equal(h.storage.get('swim_coach_v6_phase4'), storedBefore);
  assert.equal(h.elements.get('saveWarning').hidden, false);
  assert.doesNotMatch(h.elements.get('toast').textContent, /resultados guardados/);
  h.run(`showTab('atletas'); toast('Outra mensagem')`);
  assert.equal(h.elements.get('saveWarning').hidden, false);
  assert.equal(h.run('saveState()'), false);
  h.app.localStorage.setItem = setItem;
  assert.equal(h.run('saveState()'), true);
  assert.equal(h.elements.get('saveWarning').hidden, true);
  h.run('loadState()');
  assert.equal(h.run('S.results.length'), 1);
  assert.equal(h.run(`S.zoneLog['0_manha'].A2`), 100);
});

test('failed result correction retains recoverable state and does not announce success', () => {
  const h = createApp(); startSession(h); h.run('finishLiveSession()');
  h.app.localStorage.setItem = () => { throw new Error('SecurityError'); };
  h.run(`$('editResultSplitTime').value='6'; saveEditedResultSplitTime(S.results[0].id,S.results[0].splits[0].id)`);
  assert.equal(h.run('S.results[0].splits[0].cum'), 6000);
  assert.equal(h.elements.get('saveWarning').hidden, false);
  assert.doesNotMatch(h.elements.get('toast').textContent, /Tempo corrigido/);
});
