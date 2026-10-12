const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, startSession } = require('./helpers.cjs');

test('CSV uses doubled quotes, literal newlines and CRLF record separators', () => {
  const h = createApp();
  h.app.rows = [['João, "rápido"', 'linha 1\nlinha 2', 'path\\name', ''], ['A', 25, null, 'fim']];
  assert.equal(h.run('serializeCSV(rows)'), '"João, ""rápido""","linha 1\nlinha 2","path\\name",""\r\n"A","25","","fim"');
});

test('CSV neutralizes formula-leading text including whitespace and control prefixes', () => {
  const h = createApp();
  for (const value of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1', '\t=1', '\r1', '\n1']) {
    h.app.value = value;
    assert.equal(h.run('serializeCSV([[value]])'), `"'${value}"`);
  }
  assert.equal(h.run(`serializeCSV([['João', '4 x 25', 100]])`), '"João","4 x 25","100"');
});

test('CSV exports original time and correction timestamp after finishing and editing a result', () => {
  const h = createApp(); startSession(h);
  h.run(`$('editSplitTime').value='8'; saveEditedLiveSplitTime('1',S.activeSession.splitsByAthlete['1'][0].id); finishLiveSession();
    $('editResultSplitTime').value='7';saveEditedResultSplitTime(S.results[0].id,S.results[0].splits[0].id)`);
  const csv = h.run('resultsCSV(S.results)');
  assert.match(csv, /"Corrigido","OriginalAcumulado","CorrigidoEm"/);
  assert.ok(csv.includes(`"sim","${h.run('fmtTime(S.results[0].splits[0].originalCum)')}","${h.run('S.results[0].splits[0].correctedAt')}"`));
  assert.ok(csv.includes('"00:07.00"'));
});
