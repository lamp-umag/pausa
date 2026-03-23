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
- while the runner may randomize item presentation order.

Why this matters:
- for analyses you may want to know both:
  - original item order
  - actual presentation order per response

Question:
- Should the CSV include both (or should the header follow `_presentationOrder`)?

## Security / permissions notes (Firestore)

Current admin panel:
- restricts access using a hardcoded list of allowed emails in `js/admin.js`.

Question:
- Should these rules be moved to Firebase Security Rules or environment config?

