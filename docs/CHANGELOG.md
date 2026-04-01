# Changelog

This file keeps a lightweight human-readable record of meaningful project changes.
For full technical history, use Git (`git log`).

## 2026-04

### 2026-04-01
- Added admin case review workflow with persistent exclusion flags and notes.
- Added smart dedupe export mode and dedupe confidence signals.
- Ensured CSV exports are ordered newest -> oldest.
- Added extended paradata in runner:
  - `navBackCount`
  - `answerChangeCount`
  - `answerChangeEvents` (capped) + `answerChangeEventsTruncated`
  - cumulative `itemTimes` across revisits
- Added per-item change counters:
  - `itemAnswerChangeCount` in response docs
  - `<itemId>_CHANGE_COUNT` columns in paradata CSV
- Stabilized CSV schema generation:
  - always include all form-defined answer columns, even if sparse early data.
- Refined T1A consent intro wording.
- Added Firestore rules snippet for export metadata path:
  - `response_export_meta/{surveyId}/flags/{responseId}`

## 2026-03 and earlier (high-level)
- Introduced admin panel with Google auth gating and CSV export.
- Added T1A and T1B surveys, including derived-survey transforms (`extends` flow).
- Added survey randomization modes and per-survey splash image support.
- Improved survey UI/UX and metadata capture for analysis workflows.
