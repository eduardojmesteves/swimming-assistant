const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, startSession } = require('./helpers.cjs');

test('Live corrections retain their original time and timestamp through finish and reload', () => {
  const h = createApp(); startSession(h);
  const original = h.run(`S.activeSession.splitsByAthlete['1'][0].cum`);
  h.run(`$('editSplitTime').value = '9'; saveEditedLiveSplitTime('1', S.activeSession.splitsByAthlete['1'][0].id)`);
  const timestamp = h.run(`S.activeSession.splitsByAthlete['1'][0].correctedAt`);
  h.run(`$('editSplitTime').value = '8'; saveEditedLiveSplitTime('1', S.activeSession.splitsByAthlete['1'][0].id); finishLiveSession(); loadState()`);
  const split = h.json('S.results[0].splits[0]');
  assert.equal(split.cum, 8000);
  assert.equal(split.originalCum, original);
  assert.equal(split.corrected, true);
  assert.ok(split.correctedAt >= timestamp);
});

test('finished Live sessions reject stale mutation handlers and cannot overwrite Results', () => {
  const h = createApp(); startSession(h); h.run('finishLiveSession()');
  h.run(`globalThis.splitId = S.activeSession.splitsByAthlete['1'][0].id; globalThis.resultId = S.results[0].id;
    $('editResultSplitTime').value = '7'; saveEditedResultSplitTime(resultId, splitId)`);
  const before = h.json('({session:S.activeSession,results:S.results})');
  h.run(`$('editSplitTime').value = '3'; $('moveSplitAthlete').value = '2';
    saveEditedLiveSplitTime('1',splitId); saveMoveLiveSplit('1',splitId);
    deleteLiveSplit('1',splitId); undoLastLiveSplit(); finishLiveSession();
    toggleLiveSW(); takeLiveSplit(); setSplitDistance(50); saveExerciseStructureFromModal()`);
  assert.deepEqual(h.json('({session:S.activeSession,results:S.results})'), before);
  assert.doesNotMatch(h.run('renderLiveSplits()'), /showEditLiveSplitModal|deleteLiveSplit|showMoveLiveSplitModal/);
  assert.match(h.run('renderLiveSplits()'), /resultados/);
});

test('athlete split sequences remain independent and a finished group logs its zone once', () => {
  const h = createApp(); startSession(h);
  h.run(`setActiveAthlete('2'); toggleLiveSW(); S.activeSession.start=Date.now()-2000; takeLiveSplit();
    setActiveAthlete('1'); S.activeSession.start=Date.now()-4000; takeLiveSplit(); toggleLiveSW()`);
  const lists = h.json('S.activeSession.splitsByAthlete');
  assert.deepEqual(lists['1'].map(s=>s.splitNo), [1,2]);
  assert.deepEqual(lists['2'].map(s=>s.splitNo), [1]);
  assert.equal(lists['1'][1].lap, lists['1'][1].cum-lists['1'][0].cum);
  assert.equal(lists['2'][0].lap, lists['2'][0].cum);
  h.run('finishLiveSession(); finishLiveSession()');
  assert.equal(h.run('S.results.length'), 2);
  assert.equal(h.run(`S.zoneLog['0_manha'].A2`), 100);
});

test('moving and undoing active splits still recomputes laps and preserves correction metadata', () => {
  const h = createApp(); startSession(h);
  h.run(`globalThis.splitId=S.activeSession.splitsByAthlete['1'][0].id;
    $('editSplitTime').value='0'; saveEditedLiveSplitTime('1',splitId);
    $('editSplitTime').value='5'; saveEditedLiveSplitTime('1',splitId);
    $('moveSplitAthlete').value='2'; saveMoveLiveSplit('1',splitId)`);
  assert.equal(h.run(`S.activeSession.splitsByAthlete['1'].length`), 0);
  assert.equal(h.run(`S.activeSession.splitsByAthlete['2'][0].lap`), 5000);
  assert.equal(h.run(`S.activeSession.splitsByAthlete['2'][0].corrected`), true);
  h.run(`undoLastLiveSplit()`);
  assert.equal(h.run('totalSplitCount()'), 0);
});
