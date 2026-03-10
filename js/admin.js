import { app, db } from './firebaseClient.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  collection,
  getDocs
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const ALLOWED_EMAILS = new Set([
  'hermanelgueta@gmail.com',
  'herman.elgueta@umag.cl'
]);

const auth = getAuth(app);

const loginBtn = document.getElementById('loginBtn');
const authCard = document.getElementById('authCard');
const contentCard = document.getElementById('contentCard');
const authError = document.getElementById('authError');
const userChip = document.getElementById('userChip');
const userEmailEl = document.getElementById('userEmail');
const userStatusDot = document.getElementById('userStatusDot');
const surveyTableBody = document.getElementById('surveyTableBody');
const surveyCountChip = document.getElementById('surveyCountChip');
const surveyCountLabel = document.getElementById('surveyCountLabel');
const refreshBtn = document.getElementById('refreshBtn');
const refreshSpinner = document.getElementById('refreshSpinner');

function setLoading(isLoading) {
  refreshBtn.disabled = isLoading;
  refreshSpinner.classList.toggle('hidden', !isLoading);
}

function requireAuthorized(user) {
  if (!user) return false;
  const email = user.email || '';
  const ok = ALLOWED_EMAILS.has(email.toLowerCase());
  if (!ok) {
    authError.textContent = 'Tu cuenta de Google no está autorizada para ver datos de Proyecto PAUSA.';
    authError.classList.remove('hidden');
    userChip.classList.remove('hidden');
    userEmailEl.textContent = email || '(sin correo)';
    userStatusDot.classList.add('warn');
    authCard.classList.remove('hidden');
    contentCard.classList.add('hidden');
  }
  return ok;
}

async function fetchSurveyIndex() {
  const res = await fetch('surveys/index.json?_=' + Date.now());
  const data = await res.json();
  return data.surveys || [];
}

async function fetchSurveyDefinition(surveyMeta) {
  if (!surveyMeta || !surveyMeta.file) {
    return null;
  }
  try {
    const res = await fetch(`surveys/${surveyMeta.file}?_=${Date.now()}`);
    return await res.json();
  } catch (e) {
    console.warn('No se pudo leer la definición de la encuesta desde surveys/', surveyMeta.file, e);
    return null;
  }
}

async function countResponsesForSurvey(surveyId) {
  const colRef = collection(db, `responses/${surveyId}/entries`);
  const snap = await getDocs(colRef);
  return snap.size;
}

function buildCsv(rows, delimiter = ',') {
  return rows.map(row =>
    row.map(value => {
      if (value == null) return '';
      const s = String(value);
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }).join(delimiter)
  ).join('\r\n');
}

function downloadCsv(filename, rows) {
  const csvText = buildCsv(rows);
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportSurveyCsv({ surveyMeta, includeParadata }) {
  setLoading(true);
  try {
    const surveyDef = await fetchSurveyDefinition(surveyMeta);
    const itemOrder = Array.isArray(surveyDef?.items)
      ? surveyDef.items
          .map(it => it && it.id)
          .filter(Boolean)
      : [];

    const colRef = collection(db, `responses/${surveyMeta.id}/entries`);
    const snap = await getDocs(colRef);

    const docs = [];
    snap.forEach(d => {
      const data = d.data();
      docs.push({ id: d.id, data });
    });

    if (!docs.length) {
      alert('No hay respuestas para esta encuesta todavía.');
      return;
    }

    const allAnswerKeys = new Set();
    docs.forEach(({ data }) => {
      if (data.answers && typeof data.answers === 'object') {
        Object.keys(data.answers).forEach(k => allAnswerKeys.add(k));
      }
    });

    const answerKeyList = Array.from(allAnswerKeys);
    const orderedKeys = itemOrder.length
      ? itemOrder.filter(id => answerKeyList.includes(id))
      : [];
    const extraKeys = itemOrder.length
      ? answerKeyList.filter(id => !itemOrder.includes(id)).sort()
      : answerKeyList.sort();
    const finalAnswerKeys = [...orderedKeys, ...extraKeys];

    const baseHeaders = ['responseId', 'surveyId', 'serverCode', 'createdAt'];
    const answerHeaders = finalAnswerKeys.map(k => `ans_${k}`);
    const paradataHeaders = [];

    if (includeParadata) {
      const coreParadata = [
        'totalTime_ms',
        'presentationOrder',
        'ua',
        'path',
        'browser_language',
        'browser_platform',
        'browser_timezone',
        'browser_userAgent',
        'browser_screen',
        'browser_referrer'
      ];
      const perItemTimeHeaders = itemOrder.map(id => `${id}_TIME`);
      paradataHeaders.push(
        ...coreParadata,
        ...perItemTimeHeaders,
        'raw_itemTimes',
        'raw_responseTimestamps'
      );
    }

    const headerRow = [...baseHeaders, ...answerHeaders, ...paradataHeaders];
    const rows = [headerRow];

    for (const { id, data } of docs) {
      const answers = data.answers || {};
      const row = [];

      row.push(id);
      row.push(data.surveyId || surveyMeta.id);
      row.push(data.serverCode || '');
      const createdAt = data.createdAt && data.createdAt.toDate
        ? data.createdAt.toDate().toISOString()
        : data.browserData?.timestamp || '';
      row.push(createdAt);

      for (const key of answerHeaders) {
        const itemId = key.replace(/^ans_/, '');
        const value = answers[itemId];
        if (Array.isArray(value)) {
          row.push(value.join('|'));
        } else {
          row.push(value != null ? value : '');
        }
      }

      if (includeParadata) {
        const itemTimes = data.itemTimes || {};

        row.push(data.totalTime != null ? data.totalTime : '');
        row.push(data.presentationOrder ? JSON.stringify(data.presentationOrder) : '');
        row.push(data.ua || '');
        row.push(data.path || '');

        const b = data.browserData || {};
        row.push(b.language || '');
        row.push(b.platform || '');
        row.push(b.timezone || '');
        row.push(b.userAgent || '');
        row.push(
          b.screenWidth != null && b.screenHeight != null
            ? `${b.screenWidth}x${b.screenHeight} (${b.screenColorDepth || ''} bits)`
            : ''
        );
        row.push(b.referrer || '');

        for (const itemId of itemOrder) {
          const t = itemTimes[itemId];
          row.push(t != null ? t : '');
        }

        row.push(data.itemTimes ? JSON.stringify(data.itemTimes) : '');
        row.push(data.responseTimestamps ? JSON.stringify(data.responseTimestamps) : '');
      }

      rows.push(row);
    }

    const suffix = includeParadata ? 'datos_paradata' : 'datos';
    const filename = `${surveyMeta.id}_${suffix}.csv`;
    downloadCsv(filename, rows);
  } catch (err) {
    console.error(err);
    alert('Ocurrió un error al armar el CSV. Revisa la consola para más detalles.');
  } finally {
    setLoading(false);
  }
}

async function renderTable() {
  setLoading(true);
  surveyTableBody.innerHTML = `
    <tr>
      <td colspan="4" class="small muted">Cargando encuestas desde surveys/index.json…</td>
    </tr>
  `;

  try {
    const surveys = await fetchSurveyIndex();
    if (!surveys.length) {
      surveyTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="small muted">No se encontraron encuestas definidas en surveys/index.json.</td>
        </tr>
      `;
      surveyCountChip.classList.add('hidden');
      return;
    }

    surveyCountChip.classList.remove('hidden');
    surveyCountLabel.textContent = `${surveys.length} encuesta${surveys.length === 1 ? '' : 's'}`;

    const countsMap = new Map();
    for (const s of surveys) {
      const n = await countResponsesForSurvey(s.id);
      countsMap.set(s.id, n);
    }

    surveyTableBody.innerHTML = '';

    for (const s of surveys) {
      const tr = document.createElement('tr');

      const tdId = document.createElement('td');
      tdId.innerHTML = `<code>${s.id}</code>`;

      const tdTitle = document.createElement('td');
      const desc = s.description ? `<div class="small muted">${s.description}</div>` : '';
      tdTitle.innerHTML = `
        <div>${s.title || '(sin título)'}</div>
        ${desc}
      `;

      const tdCount = document.createElement('td');
      tdCount.className = 'text-right';
      const count = countsMap.get(s.id) ?? 0;
      tdCount.innerHTML = `<span class="badge">${count}</span>`;

      const tdActions = document.createElement('td');
      tdActions.style.whiteSpace = 'nowrap';
      const btnData = document.createElement('button');
      btnData.className = 'btn btn-outline btn-sm';
      btnData.textContent = 'CSV datos';
      btnData.addEventListener('click', () =>
        exportSurveyCsv({ surveyMeta: s, includeParadata: false })
      );
      const btnFull = document.createElement('button');
      btnFull.className = 'btn btn-outline btn-sm';
      btnFull.style.marginLeft = '8px';
      btnFull.textContent = 'CSV datos + paradata';
      btnFull.addEventListener('click', () =>
        exportSurveyCsv({ surveyMeta: s, includeParadata: true })
      );
      tdActions.appendChild(btnData);
      tdActions.appendChild(btnFull);

      tr.appendChild(tdId);
      tr.appendChild(tdTitle);
      tr.appendChild(tdCount);
      tr.appendChild(tdActions);
      surveyTableBody.appendChild(tr);
    }
  } catch (err) {
    console.error(err);
    surveyTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="small danger">
          Error al leer surveys/index.json o Firestore. Revisa la consola del navegador.
        </td>
      </tr>
    `;
  } finally {
    setLoading(false);
  }
}

loginBtn?.addEventListener('click', async () => {
  authError.classList.add('hidden');
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    authError.textContent = 'No se pudo completar el inicio de sesión con Google.';
    authError.classList.remove('hidden');
  }
});

refreshBtn?.addEventListener('click', () => {
  renderTable();
});

userChip?.addEventListener('click', async () => {
  // Permite cerrar sesión con un clic en el chip de usuario.
  try {
    await signOut(auth);
  } catch (_) {
    // Ignorar errores de signOut.
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    authCard.classList.remove('hidden');
    contentCard.classList.add('hidden');
    userChip.classList.add('hidden');
    authError.classList.add('hidden');
    return;
  }

  const email = user.email || '';
  userChip.classList.remove('hidden');
  userEmailEl.textContent = email;
  userStatusDot.classList.remove('warn');

  if (!requireAuthorized(user)) {
    return;
  }

  authError.classList.add('hidden');
  authCard.classList.add('hidden');
  contentCard.classList.remove('hidden');
  await renderTable();
});

