# Survey JSON conventions (how to write new / updated forms)

This document describes the “contract” between your survey JSON files (`surveys/*.json`) and the runtime renderer (`js/surveyRunner.js`).

## Where surveys live

- Registry: `surveys/index.json`
  - Each entry defines a survey you can open with `?survey=<id>`
  - Fields: `id`, `title`, `description`, `file`
- Survey definitions: `surveys/<file>.json`
  - Defines `items[]`, optional `settings`, optional `optionSets`, etc.

## Top-level fields you should know

### `id` (string)
Used as:
- the survey id stored in Firestore as `surveyId`
- the base key for response collection: `responses/<surveyId>/entries`

### `title`, `description` (string, optional in JSON)
Used mainly in the admin/export UI and (potentially) in the survey list.

### `settings` (object, optional)
Supported settings (today):

1. `settings.randomizeItems`
   - Controls item order randomization before rendering.
   - Supported values:
     - `"within_scale"`
     - `"within_section"`
     - `"between_scales"`
     - `"between_dimensions"`
     - `false` or missing (no randomization)
   - How it works:
     - It looks for `item.scale`, `item.dimension`
     - It detects section headers using `items[].type === "info"` and `prompt` starting with `SECCIÓN`

2. `settings.splash`
   - Controls the splash/loader overlay.
   - Fields:
     - `enabled` (boolean)
     - `durationMs` (number, optional; default: `1000`)
     - `image` (string path like `"imgs/pautr.png"`, optional)

### `optionSets` (object, optional)
Used by the renderer to generate button options for “single choice” style items.

The renderer does:
- For an item, it first tries `survey.optionSets[item.type]`
- If that doesn’t exist, it tries `item.options`

Common optionSet types in the repo:
- `likert_agreement`: array of strings
- `frequency`: array of strings

### `items` (array, required)
Each item is an object describing what to show and how to collect the answer.

Every item should include:
- `id` (string, used as the answer key: `answers[item.id]`)
- `type` (string, controls how it is rendered)

## Item types and required fields

### `type: "info"`
Purpose: show non-interactive content.

Fields:
- `prompt` (string)
Special formatting:
- The renderer splits `prompt` by `\n`.
- The first line is treated as a header if it starts with `SECCIÓN` or equals `Proyecto PAUSA`.

Example:
- `"SECCIÓN 1 — ...\n\nContenido del bloque ..."`

### `type: "text"`
Purpose: free text input (single-line or multi-line).

Fields:
- `prompt` (string)
- `required` (boolean, optional)
- `placeholder` (string, optional)
- `maxLength` (number, optional; default depends on code but usually 500)
- `long` (boolean; if true it becomes a `textarea`)
- `allowedChars` (string; if set, characters outside this set are stripped)
- `help` (string; used as a footnote for invalid characters)

### `type: "email"`
Purpose: email input.

Fields:
- `prompt`, `required` (optional)
- `placeholder`, `maxLength` (optional)

### `type: "url"`
Purpose: URL input.

Fields:
- `prompt`, `required` (optional)
- `placeholder`, `maxLength` (optional)

### `type: "phone"`
Purpose: telephone input with numeric-ish filtering only via UI constraints (no deep validation).

Fields:
- `prompt`, `required`
- `placeholder`, `maxLength` (optional)

### `type: "number"`
Purpose: numeric input.

Fields:
- `prompt`, `required` (optional)
- `placeholder` (optional)
- `min`, `max` (optional, numbers)

### `type: "date"` and `type: "time"`
Purpose: native date/time input.

Fields:
- `prompt`, `required` (optional)

### `type: "slider"`
Purpose: range slider.

Fields:
- `prompt`, `required` (optional)
- `min`, `max`, `step` (optional)

Note: required validation in the runner checks `answers[item.id] == null`.
So if you make a slider required, ensure the user actually moves/sets the value (this is a known limitation in the current code).

### `type: "file"`
Purpose: file upload.

Fields:
- `prompt`, `required` (optional)
- `accept` (optional, default `*/*`)
- `multiple` (boolean, optional)

Stored value:
- the answer becomes an array of file names (strings)

### `type: "multi_choice"`
Purpose: multiple selections.

Fields:
- `prompt`, `required` (optional)
- `options` (optional) or `optionSets[type]` (see below)

Stored value:
- an array of selected option codes

### Any other `type` that has options
The runner will treat it as “single choice buttons” if it can find options.

To do that, you need:
- either `survey.optionSets[item.type] = [ ... ]`
- or `item.options = [ ... ]`

`item.options` format:
- array of strings, OR
- array of objects like `{ label: "...", code: ... }` (code optional; if absent, codes are derived)

## Derived surveys: `extends` and transforms (advanced)

Your app supports a custom way to derive a new survey from an existing one (used by `pausa_t1b`).

### `extends`
At top-level of the derived survey JSON:
- `extends: "pausa_t1a.json"`

Runtime behavior:
- the base JSON is fetched
- then the derived JSON can override:
  - `id`, `title`, `description`, `settings`, `optionSets`, `items`

Then derived transforms may apply:

### `removeRutQuestions` (boolean, optional)
If true, the runner removes items that look like they are the RUT question.

Current logic is heuristic:
- removes items whose `prompt` matches a loose `R U T` regex
- also removes items whose `id` contains `rut`

### `removeItemIds` (array of strings, optional)
Removes items by exact `item.id`.

Used in `pausa_t1b` to remove the phone question (`contacto_telefono`).

### `contactEmailRelocation` (object, optional)
Relocates the email question by:
- removing the item with `sourceId`
- inserting a (cloned) version before `insertBeforeId`

Fields:
- `sourceId` (string, default: `correo_contacto`)
- `insertBeforeId` (string, default: `comentario_final`)
- `required` (boolean)
- `prompt` (string new prompt to show)

### `introConsentPdfReplace` (object, optional)
Replaces a substring inside the `intro_pausa` item’s prompt:
- `from`: old PDF file name (string)
- `to`: new PDF file name (string)

## Checklist for “new survey works”

Before shipping:
- Ensure `surveys/index.json` includes your new survey `id` and correct `file`.
- Ensure every interactive item has:
  - unique `id`
  - `type` supported by the renderer
  - `prompt`
- Ensure option-based items provide options via:
  - `optionSets[item.type]`, OR
  - `item.options`
- Ensure “final submission” item exists:
  - the runner assumes the last item is your final screen
  - in current code, it uses `item.id === "comentario_final"` to label the submit button as “Enviar”.

