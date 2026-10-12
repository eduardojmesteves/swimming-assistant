const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, startSession } = require('./helpers.cjs');

function replacePlan(h) {
  h.run(`applyPlan({plan:{0:{piscina:'P50',manha:[{desc:'New week',zona:'A3',metros:200,isHeader:false}],tarde:[]}},zonePl:{},filename:'new.xlsx'},false)`);
}

test('replacing a plan cannot reattach an old result when editing only its athlete', () => {
  const h = createApp(); startSession(h); h.run('finishLiveSession()');
  const before = h.json('S.results[0]'); replacePlan(h);
  assert.notEqual(h.run(`getExerciseEntries(0,'manha')[0].id`), before.exerciseId);
  h.run(`showEditResultModal(S.results[0].id)`);
  assert.doesNotMatch(h.run(`$('modalBody').innerHTML`), /value="[^\"]+" selected>Segunda/);
  h.run(`$('editResultAthlete').value='2'; $('editResultExercise').value=''; saveResultEdit(S.results[0].id)`);
  assert.equal(h.run('S.results[0].exerciseDesc'), before.exerciseDesc);
  assert.equal(h.run('S.results[0].exerciseId'), before.exerciseId);
  assert.equal(h.run('S.results[0].athlete'), 'Marta');
  h.run(`$('editResultExercise').value=getExerciseEntries(0,'manha')[0].id; saveResultEdit(S.results[0].id)`);
  assert.equal(h.run('S.results[0].exerciseDesc'), 'New week');
});

test('exercise identities survive reload, row insertion and plan accumulation', () => {
  const h = createApp(); startSession(h); h.run('finishLiveSession(); clearFinishedSession()');
  const id = h.run('S.selectedExerciseId'); const planId = h.run('S.planId');
  h.run(`S.weekPlan[0].manha.unshift({desc:'Inserted',isHeader:false}); saveState(); loadState()`);
  assert.equal(h.run('getSelectedExercise().id'), id);
  assert.equal(h.run('getSelectedExercise().desc'), '4 x 25 livre');
  h.run(`applyPlan({plan:{0:{manha:[{desc:'Extra',isHeader:false}],tarde:[]}},zonePl:{}},true);saveState();loadState()`);
  assert.equal(h.run('S.planId'), planId);
  assert.equal(h.run(`getExerciseEntries(0,'manha')[1].id`), id);
  assert.equal(new Set(h.json(`getExerciseEntries(0,'manha').map(e=>e.id)`)).size, 3);
});

test('legacy migration preserves active timing and historical snapshots without guessing result links', () => {
  const h = createApp(); startSession(h); h.run('finishLiveSession()');
  const legacy = h.json('S');
  delete legacy.planId;
  delete legacy.weekPlan[0].manha[0].id;
  legacy.selectedExerciseId = legacy.selectedExercise.id = '0_manha_0';
  legacy.activeSession.status = 'active';
  legacy.activeSession.exerciseId = legacy.activeSession.exerciseSnapshot.id = '0_manha_0';
  legacy.results[0].exerciseId = '0_manha_0';
  legacy.results[0].exerciseDesc = 'Previous week snapshot';
  const migrated = createApp(legacy); migrated.run('loadState()');
  assert.equal(migrated.run('S.results[0].exerciseDesc'), 'Previous week snapshot');
  assert.equal(migrated.run(`snapshotFromExerciseId(S.results[0].exerciseId)`), null);
  assert.equal(migrated.run('ensureLiveSession().id'), legacy.activeSession.id);
  const state = migrated.json('S'); migrated.run('saveState();loadState()');
  assert.equal(migrated.run('S.results[0].exerciseId'), state.results[0].exerciseId);
  assert.equal(migrated.run('S.planId'), state.planId);
});
