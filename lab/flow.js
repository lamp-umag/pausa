import { db } from '../js/firebaseClient.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const phoneInner = document.getElementById('phoneInner');
const metaTitle = document.getElementById('metaTitle');
const metaDesc = document.getElementById('metaDesc');
const stepPill = document.getElementById('stepPill');
const dots = document.getElementById('dots');
const card = document.getElementById('card');
const qLabel = document.getElementById('qLabel');
const qMain = document.getElementById('qMain');
const qHelp = document.getElementById('qHelp');
const options = document.getElementById('options');
const btnBack = document.getElementById('btnBack');
const btnNext = document.getElementById('btnNext');
const hint = document.getElementById('hint');

let survey = null;
let items = [];
let index = 0;
let answers = {};
let itemTimes = {};
let startTime = null;
let itemStart = null;

// --- Data loading ---

async function loadSurveyIndex() {
  const res = await fetch('../surveys/index.json?_=' + Date.now());
  const data = await res.json();
  return data.surveys || [];
}

function qsParam(name) {
  const url = new URL(location.href);
  return url.searchParams.get(name);
}

async function startSurveyById(id) {
  const idx = await loadSurveyIndex();
  const meta = idx.find((s) => s.id === id) || idx[0];
  if (!meta) {
    metaTitle.textContent = 'No hay encuestas definidas';
    qMain.textContent = 'Revisa surveys/index.json para definir al menos una.';
    btnBack.disabled = true;
    btnNext.disabled = true;
    return;
  }
  const res = await fetch(`../surveys/${meta.file}?_=${Date.now()}`);
  const data = await res.json();
  survey = data;
  items = survey.items || [];
  index = 0;
  answers = {};
  itemTimes = {};
  startTime = Date.now();
  metaTitle.textContent = survey.title || 'Encuesta';
  metaDesc.textContent = survey.description || '';
  buildDots();
  renderCard('enter');
}

// --- UI helpers ---

function buildDots() {
  dots.innerHTML = '';
  items.forEach((_, i) => {
    const el = document.createElement('div');
    el.className = 'dot';
    if (i === 0) el.dataset.active = 'true';
    dots.appendChild(el);
  });
}

function updateDots() {
  const total = items.length;
  dots.querySelectorAll('.dot').forEach((dot, i) => {
    dot.dataset.active = i === Math.min(index, total - 1) ? 'true' : 'false';
  });
}

function setCardState(state) {
  card.setAttribute('data-state', state);
}

function renderCard(direction) {
  const total = items.length;
  stepPill.textContent = total ? `${Math.min(index + 1, total)}/${total}` : '0/0';
  updateDots();

  if (!items.length) {
    qLabel.textContent = 'Sin ítems';
    qMain.textContent = 'Esta encuesta no contiene preguntas.';
    qHelp.textContent = '';
    options.innerHTML = '';
    btnBack.disabled = true;
    btnNext.disabled = true;
    return;
  }

  if (index >= total) {
    // Pantalla de envío
    qLabel.textContent = 'Revisión';
    qMain.textContent = '¿Todo listo para enviar?';
    qHelp.textContent =
      'Puedes retroceder si quieres ajustar alguna respuesta antes de enviar.';
    options.innerHTML = '';
    hint.textContent = 'Toca “Enviar” para guardar las respuestas.';
    btnBack.disabled = false;
    btnNext.disabled = false;
    btnNext.textContent = 'Enviar';
    btnNext.onclick = handleSubmitTap;
    btnBack.onclick = () => {
      index = Math.max(0, total - 1);
      renderCard('back');
    };
    setCardState('active');
    return;
  }

  const item = items[index];
  itemStart = Date.now();

  // Animación de salida / entrada según dirección
  requestAnimationFrame(() => {
    if (direction === 'next') {
      setCardState('exit-left');
    } else if (direction === 'back') {
      setCardState('exit-right');
    } else {
      setCardState('active');
    }
    setTimeout(() => {
      paintItem(item);
      requestAnimationFrame(() => setCardState('active'));
    }, direction === 'enter' ? 0 : 160);
  });
}

function paintItem(item) {
  qLabel.textContent = item.help ? 'Instrucción' : 'Pregunta';
  qHelp.textContent = item.help || '';
  options.innerHTML = '';
  btnNext.textContent = 'Siguiente';
  btnBack.disabled = index === 0;
  btnNext.disabled = false;

  if (item.type === 'text' && item.maxLength === 1) {
    // Página informativa
    if (item.prompt.includes('SECCIÓN')) {
      const lines = item.prompt.split('\n');
      const header = lines[0];
      const content = lines.slice(1).join('\n').trim();
      qMain.innerHTML = `<strong>${header}</strong><br>${content.replace(
        /\n/g,
        '<br>'
      )}`;
    } else {
      qMain.innerHTML = item.prompt.replace(/\n/g, '<br>');
    }
    hint.textContent = 'Toca “Siguiente” para continuar.';
    btnNext.onclick = () => step('next');
    btnBack.onclick = () => step('back');
    return;
  }

  qMain.textContent = item.prompt;

  const goNext = () => step('next');
  const goBack = () => step('back');
  btnBack.onclick = goBack;

  if (item.type === 'single_choice' || item.type === 'likert') {
    renderSingleChoice(item, goNext);
    hint.textContent = 'Toca una opción para avanzar.';
    btnNext.onclick = goNext;
  } else if (item.type === 'multi_choice') {
    renderMultiChoice(item);
    hint.textContent = 'Puedes marcar varias opciones. Usa “Siguiente” cuando estés listo.';
    btnNext.onclick = goNext;
  } else if (item.type === 'number') {
    renderNumber(item);
    hint.textContent = 'Introduce un número y toca “Siguiente”.';
    btnNext.onclick = goNext;
  } else {
    // text y otros
    renderText(item);
    hint.textContent = 'Escribe tu respuesta y toca “Siguiente”.';
    btnNext.onclick = goNext;
  }
}

function step(direction) {
  const current = items[index];
  if (current && itemStart) {
    itemTimes[current.id] = Date.now() - itemStart;
  }
  if (direction === 'next') {
    index = Math.min(items.length, index + 1);
  } else {
    index = Math.max(0, index - 1);
  }
  renderCard(direction);
}

function renderSingleChoice(item, goNext) {
  const opts = normalizeOptions(item);
  const current = answers[item.id] ?? null;
  opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill-opt';
    if (current === opt.code) btn.dataset.selected = 'true';
    btn.innerHTML = `
      <span class="pill-opt-main">
        <span class="pill-badge">${i + 1}</span>
        <span>${opt.label}</span>
      </span>
    `;
    btn.addEventListener('click', () => {
      answers[item.id] = opt.code;
      options.querySelectorAll('.pill-opt').forEach((el) => {
        el.dataset.selected = 'false';
      });
      btn.dataset.selected = 'true';
      // auto avance suave
      setTimeout(goNext, 140);
    });
    options.appendChild(btn);
  });
}

function renderMultiChoice(item) {
  const opts = normalizeOptions(item);
  const current = new Set(
    Array.isArray(answers[item.id]) ? answers[item.id] : []
  );
  opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill-opt';
    if (current.has(opt.code)) btn.dataset.selected = 'true';
    btn.innerHTML = `
      <span class="pill-opt-main">
        <span class="pill-badge">${i + 1}</span>
        <span>${opt.label}</span>
      </span>
    `;
    btn.addEventListener('click', () => {
      if (current.has(opt.code)) {
        current.delete(opt.code);
        btn.dataset.selected = 'false';
      } else {
        current.add(opt.code);
        btn.dataset.selected = 'true';
      }
      answers[item.id] = Array.from(current);
    });
    options.appendChild(btn);
  });
}

function renderNumber(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const lab = document.createElement('div');
  lab.className = 'field-label';
  lab.textContent = item.label || 'Número';
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'field-input';
  input.placeholder = item.placeholder || '';
  if (typeof item.min === 'number') input.min = String(item.min);
  if (typeof item.max === 'number') input.max = String(item.max);
  if (answers[item.id] != null) input.value = answers[item.id];
  input.addEventListener('input', () => {
    answers[item.id] = input.value;
  });
  wrapper.appendChild(lab);
  wrapper.appendChild(input);
  options.appendChild(wrapper);
}

function renderText(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const lab = document.createElement('div');
  lab.className = 'field-label';
  lab.textContent = item.label || 'Respuesta';
  const input = document.createElement(item.long ? 'textarea' : 'input');
  if (!item.long) input.type = 'text';
  input.className = item.long ? 'field-textarea' : 'field-input';
  input.placeholder = item.placeholder || '';
  if (item.maxLength) input.maxLength = item.maxLength;
  if (answers[item.id] != null) input.value = answers[item.id];
  input.addEventListener('input', () => {
    answers[item.id] = input.value;
  });
  wrapper.appendChild(lab);
  wrapper.appendChild(input);
  options.appendChild(wrapper);
}

function normalizeOptions(item) {
  if (!Array.isArray(item.options)) return [];
  return item.options.map((opt, idx) => {
    if (typeof opt === 'string') return { label: opt, code: idx + 1 };
    const label = opt.label ?? String(opt.code ?? opt.value ?? opt);
    const code = opt.code ?? opt.value ?? idx + 1;
    return { label, code };
  });
}

// --- Submit / Firebase ---

async function handleSubmitTap() {
  if (!survey) return;
  const totalTime = startTime ? Date.now() - startTime : null;
  const urlParams = new URLSearchParams(location.search);
  const serverCode = urlParams.get('srv') || urlParams.get('iden') || null;

  const browserData = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    screenWidth: screen.width,
    screenHeight: screen.height,
    screenColorDepth: screen.colorDepth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
    referrer: document.referrer,
    url: location.href
  };

  const payload = {
    surveyId: survey.id,
    answers,
    serverCode,
    totalTime,
    itemTimes,
    browserData,
    createdAt: serverTimestamp(),
    ua: navigator.userAgent,
    path: location.pathname + location.search
  };

  btnNext.disabled = true;
  btnBack.disabled = true;
  btnNext.textContent = 'Enviando…';
  hint.textContent = 'Guardando en Firestore…';

  try {
    const col = collection(db, `responses/${survey.id}/entries`);
    await addDoc(col, payload);
    qLabel.textContent = 'Listo';
    qMain.textContent = '¡Gracias por participar!';
    qHelp.textContent =
      'Esta es una versión experimental centrada en la experiencia táctil.';
    options.innerHTML = '';
    hint.textContent = 'Puedes cerrar esta ventana con seguridad.';
    btnNext.textContent = 'Listo';
  } catch (e) {
    console.error(e);
    btnNext.textContent = 'Reintentar';
    btnNext.disabled = false;
    btnBack.disabled = false;
    hint.textContent = 'Ocurrió un error al enviar. Intenta de nuevo.';
  }
}

// --- Themes ---

document.querySelectorAll('.theme-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    const theme = btn.getAttribute('data-theme');
    document.querySelectorAll('.theme-pill').forEach((b) => {
      b.dataset.active = 'false';
    });
    btn.dataset.active = 'true';

    if (theme === 'deep') {
      phoneInner.style.setProperty(
        'background',
        'radial-gradient(circle at top, #082f49, #020617)'
      );
    } else if (theme === 'soft') {
      phoneInner.style.setProperty(
        'background',
        'radial-gradient(circle at top, #e0f2fe, #1e293b)'
      );
    } else if (theme === 'sunset') {
      phoneInner.style.setProperty(
        'background',
        'radial-gradient(circle at top, #fb923c, #0f172a)'
      );
    }
  });
});

// --- Boot ---

const initialId = qsParam('survey') || 'pausa_sample';
startSurveyById(initialId);

