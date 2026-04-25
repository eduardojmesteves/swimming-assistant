# SwimCoach PWA

SwimCoach is a local-first Progressive Web App for swimming coaches. It imports weekly training plans from Excel, lets coaches select exercise rows, runs a group-start stopwatch with swimmer switching, stores split results, supports timing corrections, tracks training zones, and exports results to CSV.

The app is designed primarily for **tablet use in landscape mode** at poolside.

## Current status

This README describes the application after the completed work through:

- Initial PWA/static app setup
- Excel plan parser and plan viewer
- Stopwatch/results workflow
- Athlete management
- Zone tracking
- Plan management

The app is still local-first. It does **not** currently include cloud sync, real user accounts, authentication, server-side storage, or multi-device collaboration.

## Core concept

The app is built around this coaching workflow:

```text
Import weekly plan
Select day and session
Select exact exercise row
Run a Live Training session
Switch swimmers while one global stopwatch runs
Take splits for each swimmer
Correct mistakes
Finish exercise
Review/export results
Track zone completion
```

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
├── TESTING_PHASE3.md       # Split-intelligence testing checklist
├── TESTING_PHASE4.md       # Corrections/editing testing checklist
└── README.md               # Project documentation
```

## PWA installation

### Android / Chrome

1. Open the deployed app URL.
2. Open Chrome menu.
3. Select **Adicionar ao ecrã inicial** or **Instalar app**.
4. Launch the installed app.
5. Use the tablet in landscape mode.
6. Load the plan before poolside use.

### Important PWA note

The app currently loads the XLSX parser from a CDN:

```html
https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
```

That means the first plan import requires internet access unless the library has already been cached by the browser. For true offline-first poolside use, vendor this file locally and update `index.html` and `sw.js` to cache it.

## Browser storage model

All app data is stored locally in the browser using `localStorage`.

Stored data includes:

- athletes;
- imported weekly plan;
- selected exercise;
- active Live session;
- saved results;
- zone logs;
- plan metadata.

This means:

- data is private to the browser/device;
- data does not automatically sync between tablets;
- clearing browser data can delete the app state;
- reinstalling the PWA or changing browser profile may lose local data;
- exporting CSV is the current backup mechanism.

## Excel import format

The parser expects the SwimCoach training-plan spreadsheet layout.

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

Supported day headers:

```text
SEGUNDA-FEIRA
TERÇA-FEIRA / TERCA-FEIRA
QUARTA-FEIRA
QUINTA-FEIRA
SEXTA-FEIRA
SÁBADO / SABADO
DOMINGO
```

Supported zones:

```text
TT, A1, A2, A3, M.AER, LAN, M.ANA, VEL, PML, TL
```

Supported block headers:

```text
AQUECIMENTO
TAREFA 1
TAREFA 2
TAREFA 3
RECUPERAÇÃO / RECUPERACAO
FOLGA
```

## Screens

### Plano

The Plan screen is used to inspect and manage the imported training plan.

It supports:

- importing `.xlsx` / `.xls` weekly plans;
- switching between days;
- switching between **Manhã** and **Tarde**;
- viewing exercise blocks and exact exercise rows;
- selecting an exact exercise row;
- displaying the selected-exercise banner;
- manually adding blocks/exercises;
- opening **Gerir plano**.

Selecting an exercise row makes it the active exercise for **Cronómetro** and **Live**.

### Live

The Live screen is the main poolside workflow.

It supports:

- two-column tablet-landscape layout;
- plan/exercise list on the left;
- selected exercise and timing tools on the right;
- exact exercise selection;
- one global stopwatch per exercise;
- swimmer chips;
- swimmer switching while the stopwatch keeps running;
- swimmer-specific split button, for example `Split João`;
- per-swimmer split lists;
- active-session autosave;
- finishing an exercise and saving all swimmers with splits.

The Live screen is designed for the common case where swimmers start together, but the coach times one swimmer at a time.

### Cronómetro

The Cronómetro screen is a simpler stopwatch workflow connected to the selected exercise.

It is useful for simple timing, but the Live screen should be treated as the main coaching interface for group-start training.

### Zonas

The Zonas screen compares planned vs completed training volume by zone.

It supports:

- planned meters from the imported plan;
- completed meters from manual entry;
- automatic completed-zone logging when a Live exercise is finished;
- progress bars by zone;
- total planned/completed meters;
- clearing individual zone logs.

Important behaviour:

```text
When a Live exercise is finished, the exercise meters are added to Zonas once.
```

Example:

```text
Exercise: A2, 800m
Timed swimmers: João, Marta, Rui
Zone log: A2 +800m
```

It does **not** add `800m` per swimmer. Zonas represent training-plan completion, not total athlete-volume.

### Atletas

The Athletes screen supports:

- adding swimmers;
- assigning an optional group label;
- removing swimmers;
- using swimmer names as chips in Live Training;
- attaching saved results to swimmers.

### Resultados

The Results screen supports reviewing, correcting, deleting, and exporting saved results.

It includes:

- result cards grouped by saved result/session;
- athlete, exercise, day/session, block, zone, pool, split distance, and target metadata;
- split rows with cumulative time, lap time, repetition/distance marker, and target delta;
- correction indicators for edited splits;
- CSV export.

## Plan management

The app includes a **Gerir plano** flow.

### Carregar/substituir plano

Use this when the wrong plan was imported or a corrected weekly plan is available.

Keeps:

- athletes;
- saved results.

Replaces or updates:

- weekly plan;
- zone plan;
- selected exercise;
- plan-related state.

### Limpar plano atual

Use this when the week ends or when the current plan should be removed.

Clears:

- weekly plan;
- planned zones;
- logged zones;
- selected exercise;
- inactive Live session state;
- week label.

Keeps:

- athletes;
- saved results.

### Apagar todos os dados

Dangerous full reset.

Clears:

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

- exercise snapshot;
- active swimmer;
- global cumulative timestamp;
- swimmer-specific lap time;
- split distance;
- calculated split number;
- repetition and distance marker when possible;
- target comparison when possible.

Swimmer split sequences are independent.

Example:

```text
João has 3 splits
Marta has 1 split
Marta's next split is still her own split 2, not the global split 4
```

Lap time is calculated per swimmer:

```text
lap = current cumulative time - previous cumulative time for the same swimmer
```
