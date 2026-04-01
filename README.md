# Proyecto PAUSA (UMAG)

![PAUSA loading](imgs/pautr.png)

Repositorio del **Proyecto PAUSA** (Universidad de Magallanes) donde se ejecutan encuestas de un estudio longitudinal sobre **adaptación/experiencia universitaria y bienestar estudiantil**.

## Qué hace este repo
- Las encuestas (formularios) están definidas en `surveys/` como archivos JSON.
- El sitio público corre la encuesta en `index.html` y `js/surveyRunner.js`.
- Se guarda el resultado en **Firestore (Firebase)** bajo `responses/<surveyId>/entries`.
- Hay un panel de exportación en `admin.html` que descarga los datos en CSV (respuestas y paradata), con soporte para:
  - deduplicación de casos para export,
  - exclusión manual de casos (sin borrar respuestas),
  - exportación ordenada de más reciente a más antigua.

## Notas rápidas para administración de datos
- Exclusiones de export no se guardan dentro de `responses/...`; se guardan en:
  - `response_export_meta/<surveyId>/flags/<responseId>`
- Si usas el panel admin, las reglas de Firestore deben permitir lectura/escritura de esa ruta para admins.
- Hay un snippet de referencia en: `firestore.rules.export-meta.snippet`.

## Contacto
Para dudas del estudio o de la encuesta:

- `pausa@umag.cl`

## Documentación para quienes editen encuestas
- Convenciones y “contrato” del JSON: `docs/SURVEY_JSON_CONVENTIONS.md`
- Arquitectura: `docs/ARCHITECTURE.md`
- Ideas de mejora: `docs/IMPROVEMENT_QUESTIONS.md`
- Registro de cambios: `docs/CHANGELOG.md`
