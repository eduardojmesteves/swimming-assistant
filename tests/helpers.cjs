const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function createApp(saved) {
  const elements = new Map();
  const storage = new Map(saved ? [['swim_coach_v6_phase4', JSON.stringify(saved)]] : []);
  const app = vm.createContext({
    console: { warn() {} }, Date, Math, Blob, URL,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    navigator: {}, window: { addEventListener() {} },
    document: {
      addEventListener() {}, querySelectorAll: () => [],
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', hidden: true, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} });
        return elements.get(id);
      },
      createElement: () => ({ style: {}, addEventListener() {}, click() {} }),
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), app);
  return { app, elements, storage, run: code => vm.runInContext(code, app), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, app)) };
}

function startSession(h) {
  h.run(`
    S.athletes = [{id: 1, nome: 'João'}, {id: 2, nome: 'Marta'}];
    S.activeAthleteId = '1';
    S.weekPlan = {0: {piscina: 'P25', manha: [{desc: '4 x 25 livre', zona: 'A2', metros: 100, isHeader: false}], tarde: []}};
    selectExerciseByIndex(0, 'manha', 0);
    toggleLiveSW();
    S.activeSession.start = Date.now() - 10000;
    takeLiveSplit();
    toggleLiveSW();
  `);
}
module.exports = { createApp, startSession };
