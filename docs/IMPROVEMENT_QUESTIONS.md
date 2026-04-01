# Open questions & improvement ideas

This file lists the main things that might need improvement next, and why.

## Survey picker / home screen consistency

Current code paths:
- `js/surveyRunner.js` only starts a survey automatically if `?survey=...` exists.
- `index.html` references a `surveyList` element in `js/main.js`, but `index.html` doesn’t define it.

Why this matters:
- it’s easy to break the “home list” later
- new team members may not understand why the list doesn’t appear

Question:
- Should we make the home page always show the survey list when `?survey` is missing?

## JSON validation

Today:
- surveys are fetched and used directly (no schema validation).

Why this matters:
- a single typo can break rendering and waste time.

Question:
- Do we want a JSON Schema + a small “validate surveys” script that runs in CI?

## Required slider limitation

In `type: "slider"`:
- the UI shows a default value (`slider.value = answers[item.id] || slider.min`)
- but the stored answer (`answers[item.id]`) only gets set on `input` events
- required validation checks `answers[item.id] == null`

Why this matters:
- a required slider might block submission if the user never drags the slider.

Question:
- Should slider required validation accept the default value, or should the runner set `answers[item.id]` initially?

## Derived surveys implemented at runtime

Derived surveys (`extends`) are resolved in-browser in:
- `js/surveyRunner.js`
- `js/admin.js`

Why this matters:
- more complexity and more room for subtle differences between runtime rendering and export

Question:
- Would it be better to “compile”/resolve derived surveys once on the server (or at build time)?

## Export ordering vs presentation ordering

Export CSV currently uses:
- the definition’s `surveyDef.items` order for header ordering
- while rows are exported newest -> oldest by `createdAt`
- while the runner may randomize item presentation order.

Why this matters:
- for analyses you may want to know both:
  - original item order
  - actual presentation order per response

Question:
- Should the CSV include both (or should the header follow `_presentationOrder`)?

## Dedupe strategy calibration

Today:
- Admin export supports dedupe mode with confidence buckets (`high`, `medium`, `low`).
- Signals combine server code, answer fingerprint, time proximity, and browser hints.

Why this matters:
- Different studies may prefer stricter vs looser dedupe thresholds.

Question:
- Should dedupe thresholds become configurable per survey (e.g., time window)?

## Manual exclusion metadata path

Today:
- Exclusion flags are stored outside response docs in:
  - `response_export_meta/{surveyId}/flags/{responseId}`

Why this matters:
- Safer than mutating raw response docs.
- Requires explicit Firestore rules for admin writes.

Question:
- Do we want a permanent deploy workflow for Firestore rules in this repo?

## Extended paradata growth controls

Today:
- Runner stores `answerChangeEvents` with a cap and `answerChangeEventsTruncated`.
- Also stores global and per-item change counters.

Why this matters:
- Prevents large documents while preserving useful behavior traces.

Question:
- Is current event cap (`maxAnswerChangeEvents`) the right default for production?

## Security / permissions notes (Firestore)

Current admin panel:
- restricts access using a hardcoded list of allowed emails in `js/admin.js`.

Question:
- Should these rules be moved to Firebase Security Rules or environment config?

