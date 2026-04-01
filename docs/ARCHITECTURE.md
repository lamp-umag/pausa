# Pausa: architecture (now) + architecture (future)

This repo is a small web app that renders survey “forms” and writes responses to Firestore.
For maintainability, the runtime behavior is implemented in JS, while the survey content is defined in `surveys/*.json`.

## What exists today (high level)

### UI / boot
- `index.html`
  - Provides the splash overlay (`#splashOverlay`) and the runner containers (`#runner`, `#question`, `#options`, etc).
  - Loads `./js/main.js`.
- `js/main.js`
  - Creates the survey runner via `createSurveyApp({ db, elements })`.
  - Calls `app.init()`.

### Survey registry + definitions
- `surveys/index.json`
  - A small registry of available surveys:
    - `id` (used in `?survey=...`)
    - `file` (which JSON file to fetch)
    - `title`, `description` (used in the admin UI / potential home UI)
- `surveys/*.json`
  - The survey definition (the “form”) used by the runner.
  - Supports derived surveys via a custom `extends` mechanism (see below).

### Runtime runner
- `js/surveyRunner.js` is the core.
  - Loads the registry from `surveys/index.json`.
  - Loads the selected survey JSON from `surveys/<file>`.
  - Applies derived-survey transforms (`extends` + small patch directives).
  - Optionally randomizes item order depending on `settings.randomizeItems`.
  - Renders each item based on `item.type` and item fields (`prompt`, `required`, `options`, etc).
  - On submit, writes responses to Firestore at:
    - `responses/<surveyId>/entries/<doc>`

### Admin/export
- `admin.html` loads `./js/admin.js`.
- `js/admin.js`
  - Lists surveys from `surveys/index.json`.
  - For each survey, counts Firestore response docs in `responses/<surveyId>/entries`.
  - Supports case review table per survey:
    - mark/unmark exclusion from exports (`excludedFromExport`)
    - set exclusion reason and note
  - Stores export metadata in a separate collection:
    - `response_export_meta/<surveyId>/flags/<responseId>`
  - Exports CSV in different modes:
    - data raw
    - data dedupe
    - data + paradata (dedupe)
  - CSV rows are exported newest -> oldest.

## How a response flows (today)

### 1) Selecting which survey to run
The runner selects the survey by URL query param:
- `?survey=<surveyId>`

It also reads optional tracking params:
- `srv=<serverCode>` or `iden=<serverCode>`

### 2) Fetch survey definition
The runner fetches:
- `surveys/index.json` to map `surveyId -> file`
- then `surveys/<file>` for the JSON definition

### 3) Derived surveys (`extends`)
If the survey JSON contains:
- `extends: "pausa_t1a.json"` (or `{ "file": ... }`)
the runner fetches the base survey JSON, clones it, then applies:
- overrides for `id`, `title`, `description`, `settings`, `optionSets`, `items` (if present)
- transforms controlled by custom directive fields (see JSON conventions doc)

### 4) Randomization
If `settings.randomizeItems` is set, the runner reorders `items` before presenting them.
The randomization modes currently supported are:
- `"within_scale"`
- `"within_section"`
- `"between_scales"`
- `"between_dimensions"`
- `false` or missing (no randomization)

### 5) Rendering items
Each element in `items[]` is rendered sequentially.
The runner uses the item fields and `item.type` to decide the UI control.

### 6) Submission + data stored in Firestore
On submit, payload includes:
- `surveyId`
- `answers` (keyed by `item.id`)
- `serverCode` (from URL: `srv` or `iden`)
- paradata if enabled in code, including:
  - `totalTime`
  - `itemTimes` (accumulated per item across revisits)
  - `responseTimestamps`
  - `presentationOrder`
  - `navBackCount`
  - `answerChangeCount`
  - `itemAnswerChangeCount`
  - `answerChangeEvents` (capped event list with `{ itemId, from, to, at }`)
  - `answerChangeEventsTruncated` (boolean when event cap is reached)
  - browser metadata (`browserData`, `ua`)
- `path` = `location.pathname + location.search` (full query string), which is helpful for linking campaigns/invites.

### 7) Export shaping behavior
In `js/admin.js`, export currently:
- includes all survey-defined answer columns from `surveyDef.items` even if some were never answered in data yet
- appends extra answer keys found in data but not in form definition
- includes per-item paradata columns for all form items (`<itemId>_TIME`, `<itemId>_CHANGE_COUNT`)
- includes raw JSON backup columns (`raw_itemTimes`, `raw_responseTimestamps`, `raw_itemAnswerChangeCount`, `answer_change_events_json`)

## Notes specific to this repo

### Loader/splash image can be per survey
Surveys can define:
- `settings.splash.image`

The runner uses that when the survey starts (if `settings.splash.enabled` is true).

### “Home” survey list is not currently used
In `js/surveyRunner.js`, the app only starts the survey automatically if `?survey=...` is present.
If `?survey` is missing, it does not call the home/list rendering path.
Also, `index.html` currently does not define a `#surveyList` element, even though `js/main.js` references it.

This is not a problem if you always open direct links, but it’s a maintainability trap.

## Intended architecture (future)

The future direction you hinted at (form builder) is a natural evolution:

1. **Form builder UI**
   - Admin UI creates/edits a form interactively.
2. **Store form definitions outside Git**
   - Store definitions in Firestore (and optionally keep Git JSON for backups/versioned releases).
   - Store “published forms” separately from drafts.
3. **Runtime loader reads published definitions**
   - The runner fetches form definitions from Firestore instead of `surveys/*.json`.
4. **Versioning**
   - Each published form has a stable version.
   - Responses store `formVersion` (or at least a form `version` identifier), so exported CSVs are reproducible.

### Data model idea (recommended)
- `forms/{formId}` document
  - metadata: `title`, `status`, `createdAt`, `updatedAt`, etc.
  - `publishedVersion` pointer
- `forms/{formId}/versions/{version}`
  - immutable snapshot of the JSON definition used for that version
- `responses/<formId>/entries/<doc>`
  - store `answers` + `formVersion`

This reduces “responses don’t match exported definition anymore” problems.

## Questions / possible improvements

- Add a formal schema validator for survey JSON (so mistakes fail fast).
- Improve “home survey picker” flow so the list is visible without direct `?survey=...` links.
- Consider moving derived-survey transforms from runtime into a build/compile step (less complexity at runtime).

