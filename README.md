# SwimCoach PWA

SwimCoach is a browser-based Progressive Web App for swimming coaches to import weekly training plans, select exercises, time swimmers during group-start sets, and save/export split results.

The app is designed primarily for **tablet use in landscape mode** at poolside.

## Current build status

This build includes:

- Weekly plan import from `.xlsx` / `.xls` files.
- Day and session navigation: **Manhã** / **Tarde**.
- Exact exercise-row selection from the imported plan.
- Persistent selected-exercise banner.
- **Live Training** screen with:
  - plan on the left;
  - stopwatch and swimmer timing on the right;
  - one global stopwatch;
  - swimmer chips;
  - swimmer switching while the stopwatch continues running;
  - per-swimmer split lists;
  - split distance selection: `25m` or `50m`;
  - split distance locking after the first split;
  - undo last split;
  - delete individual split;
  - finish exercise and save all swimmers with splits.
- Athlete management.
- Zone tracking: planned vs completed meters.
- Results history and CSV export.
- Plan management tools:
  - replace/import plan;
  - clear current plan while keeping athletes and results;
  - full data wipe with typed confirmation.
- Local persistence through `localStorage`.
- PWA manifest and Service Worker for app-style installation.

## Project structure

```text
.
├── index.html              # Main HTML shell
├── style.css               # Application styles
├── app.js                  # Main application logic
├── manifest.json           # PWA metadata
├── sw.js                   # Service Worker cache logic
├── vercel.json             # Vercel headers for Service Worker/app updates
├── GUIA_INSTALACAO.md      # Portuguese installation guide
└── README.md               # Project documentation
```

## Recommended usage

Do **not** open the app directly with `file://index.html`. That may render the page, but it breaks the normal PWA/Service Worker behaviour.

Use a simple local server:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

For deployment, host the folder as static files. Vercel works well for this project.

## PWA installation

On Android / Chrome:

1. Open the deployed app URL.
2. Open the Chrome menu.
3. Choose **Adicionar ao ecrã inicial** or **Instalar app**.
4. Open the installed app in landscape mode.
5. Load a plan once before poolside use.

## Excel import format

The parser expects the usual SwimCoach spreadsheet layout:

| Field | Column | Notes |
|---|---:|---|
| Day header | A | Example: `SEGUNDA-FEIRA`, `TERÇA-FEIRA` |
| Pool | B | Example: `P25` or `P50` |
| Morning zone/block | C | Zone or block header |
| Morning description | D | Exercise description |
| Morning cycle/rest | L | Cycle / rest interval |
| Morning meters | O | Exercise meters |
| Afternoon zone/block | S | Zone or block header |
| Afternoon description | T | Exercise description |
| Afternoon cycle/rest | AB | Cycle / rest interval |
| Afternoon meters | AE | Exercise meters |

Supported zones:

```text
TT, A1, A2, A3, M.AER, LAN, M.ANA, VEL, PML, TL
```

Supported block headers include:

```text
AQUECIMENTO, TAREFA, RECUPERAÇÃO, RECUPERACAO, FOLGA
```

## Main screens

### Plano

Use this screen to:

- import a weekly plan;
- inspect the plan by day/session;
- select an exact exercise row;
- add manual blocks/exercises;
- open **Gerir plano**.

Selecting an exercise row stores it as the active exercise for Cronómetro and Live Training.

### Live

This is the main tablet-landscape workflow.

Use this screen to:

1. Select an exact exercise row on the left.
2. Select the split distance: `25m` or `50m`.
3. Select the active swimmer chip.
4. Start the global stopwatch.
5. Tap the swimmer-specific split button, for example `Split João`.
6. Switch swimmer chips as needed while the stopwatch keeps running.
7. Finish the exercise to save all swimmer results.

### Cronómetro

A simpler single-screen stopwatch workflow connected to the selected exercise.

### Zonas

Tracks planned vs completed meters per training zone.

### Atletas

Add and remove swimmers.

### Resultados

View saved split results and export them to CSV.

## Plan management

The app has three plan/data actions.

### Carregar/substituir plano

Use when a corrected or new plan is imported.

Keeps:

- athletes;
- saved results.

Replaces or updates:

- weekly plan;
- zone plan;
- selected exercise;
- plan-related state.

### Limpar plano atual

Use when the wrong plan was imported or the week has ended.

Clears:

- weekly plan;
- planned zones;
- logged zones;
- selected exercise;
- inactive Live session state.

Keeps:

- athletes;
- saved results.

### Apagar todos os dados

Dangerous reset action.

Clears everything:

- plan;
- athletes;
- results;
- zones;
- selected exercise;
- active session.

Requires typing:

```text
APAGAR
```

## Timing model

The Live Training screen uses one global stopwatch per selected exercise.

Each split is attached to:

- the selected exercise snapshot;
- the active swimmer;
- the global cumulative timestamp;
- the swimmer lap time;
- the selected split distance;
- the calculated distance marker;
- repetition metadata when the exercise pattern can be detected.

The app saves swimmer results under the selected exercise when **Terminar exercício** is pressed.

## Data persistence

Data is stored locally in the browser using `localStorage`.

This means:

- data stays on the same device/browser;
- there is no backend database;
- clearing browser storage will delete app data;
- uninstalling the PWA may delete local data depending on the platform/browser.

## Offline behaviour

The app includes a Service Worker and caches the core local files.

Important limitation: the XLSX parser is currently loaded from the CDN:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
```

So the app shell can work offline after caching, but Excel import is not fully bulletproof offline unless the XLSX library is vendored locally.

For true poolside/offline reliability, download `xlsx.full.min.js`, store it locally, reference it from `index.html`, and add it to the Service Worker cache list.

## Deployment notes

### Vercel

The included `vercel.json` disables stale caching for `sw.js` and `app.js`, which helps browsers pick up new deployments.

After deployment, if changes do not appear immediately:

1. refresh the app;
2. close/reopen the installed PWA;
3. clear site data if the Service Worker remains stale.

### Static hosting

Any static file host should work as long as it serves:

- `index.html`;
- `app.js`;
- `style.css`;
- `manifest.json`;
- `sw.js`;
- icons, if present.

## Testing checklist

Before using in training, test:

- import a valid plan;
- replace an existing plan;
- clear current plan and confirm athletes/results remain;
- add athletes;
- select an exercise row;
- open Live Training;
- start the stopwatch;
- select swimmer A and record splits;
- switch to swimmer B and record splits;
- undo last split;
- delete a split;
- finish the exercise;
- verify saved results;
- export CSV;
- reload the page and confirm data persists.

## Known limitations before Phase 3 / Phase 4

- Post-save editing is not fully implemented yet.
- Moving a saved result to another swimmer/exercise is planned but not complete.
- Manual correction of recorded split times is planned but not complete.
- Automatic exercise parsing supports simple patterns best, such as `8 x 100`.
- Complex exercise descriptions may require future manual override fields.
- XLSX import still depends on the CDN-hosted SheetJS library unless vendored locally.

## Planned next phases

### Phase 3 — split intelligence

Planned work:

- improve split-distance handling;
- improve automatic detection of `NxM` exercise patterns;
- calculate repetition and distance markers more robustly;
- add manual override for repetitions and repetition distance when parsing fails.

### Phase 4 — correction/editing tools

Planned work:

- edit saved split times;
- move splits between swimmers;
- move saved results to another swimmer;
- move saved results to another exercise;
- reopen or correct finished sessions.

## Development validation

Basic JavaScript validation:

```bash
node --check app.js
node --check sw.js
```

These checks confirm syntax validity, but they do not replace manual browser testing with a real Excel file and real tablet workflow.
