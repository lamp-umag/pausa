import { db } from '../js/firebaseClient.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const shell = document.getElementById('shell');
const metaTitle = document.getElementById('metaTitle');
const metaDesc = document.getElementById('metaDesc');
const metaStep = document.getElementById('metaStep');
const progressFill = document.getElementById('progressFill');
const qShell = document.getElementById('qShell');
const qIndexLabel = document.getElementById('qIndexLabel');
const qText = document.getElementById('qText');
const qHelp = document.getElementById('qHelp');
const $options = document.getElementById('options');
const btnBack = document.getElementById('btnBack');
const btnNext = document.getElementById('btnNext');

let survey = null;
let items = [];
let index = 0;
let answers = {};
let startTime = null;
let itemStart = null;
let itemTimes = {};

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
    qText.textContent = 'Revisa el archivo surveys/index.json';
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
  render();
}

function render() {
  const total = items.length;
  metaStep.textContent = `${Math.min(index + 1, total)}/${total}`;
  const pct = total ? Math.round(((index) / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;

  if (!items.length) {
    qShell.dataset.active = 'true';
    qText.textContent = 'Esta encuesta no tiene ítems.';
    qHelp.textContent = '';
    $options.innerHTML = '';
    btnBack.disabled = true;
    btnNext.disabled = true;
    return;
  }

  if (index >= total) {
    // pantalla de envío
    qShell.dataset.active = 'true';
    qIndexLabel.textContent = 'Finalizar';
    qText.textContent = '¿Listo para enviar tus respuestas?';
    qHelp.textContent = 'Puedes retroceder si quieres revisar algo antes de enviar.';
    $options.innerHTML = '';
    btnBack.disabled = false;
    btnNext.disabled = false;
    btnNext.textContent = 'Enviar';
    btnNext.onclick = submit;
    btnBack.onclick = () => {
      index = Math.max(0, total - 1);
      render();
    };
    return;
  }

  const item = items[index];
  qShell.dataset.active = 'true';
  qIndexLabel.textContent = `Pregunta ${index + 1} de ${total}`;
  qHelp.textContent = item.help || '';
  $options.innerHTML = '';
  btnBack.disabled = index === 0;
  btnNext.disabled = false;
  btnNext.textContent = 'Siguiente →';

  itemStart = Date.now();

  if (item.type === 'text' && item.maxLength === 1) {
    // página informativa
    if (item.prompt.includes('SECCIÓN')) {
      const lines = item.prompt.split('\n');
      const header = lines[0];
      const content = lines.slice(1).join('\n').trim();
      qText.innerHTML = `<strong>${header}</strong><br>${content.replace(/\n/g, '<br>')}`;
    } else {
      qText.innerHTML = item.prompt.replace(/\n/g, '<br>');
    }
    const goNext = () => step('next');
    btnNext.onclick = goNext;
    btnBack.onclick = () => step('back');
    return;
  }

  qText.textContent = item.prompt;

  const goNext = () => step('next');
  const goBack = () => step('back');

  btnBack.onclick = goBack;

  if (item.type === 'single_choice' || item.type === 'likert') {
    renderSingleChoice(item, goNext);
    btnNext.onclick = goNext;
  } else if (item.type === 'multi_choice') {
    renderMultiChoice(item, goNext);
    btnNext.onclick = goNext;
  } else if (item.type === 'number') {
    renderNumber(item, goNext);
    btnNext.onclick = goNext;
  } else if (item.type === 'text') {
    renderText(item, goNext);
    btnNext.onclick = goNext;
  } else {
    // fallback simple
    renderText({ ...item, type: 'text' }, goNext);
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
  render();
}

function renderSingleChoice(item, goNext) {
  const opts = normalizeOptions(item);
  const current = answers[item.id] ?? null;
  opts.forEach((opt, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'opt-pill';
    if (current === opt.code) el.dataset.selected = 'true';

    el.innerHTML = `
      <span class="opt-pill-main">
        <span class="opt-pill-badge">${i + 1}</span>
        <span class="opt-pill-label">${opt.label}</span>
      </span>
    `;
    el.onclick = () => {
      answers[item.id] = opt.code;
      $options.querySelectorAll('.opt-pill').forEach((b) => {
        b.dataset.selected = 'false';
      });
      el.dataset.selected = 'true';
      setTimeout(goNext, 160);
    };
    $options.appendChild(el);
  });
}

function renderMultiChoice(item, goNext) {
  const opts = normalizeOptions(item);
  const current = new Set(
    Array.isArray(answers[item.id]) ? answers[item.id] : []
  );
  opts.forEach((opt, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'opt-pill';
    if (current.has(opt.code)) el.dataset.selected = 'true';

    el.innerHTML = `
      <span class="opt-pill-main">
        <span class="opt-pill-badge">${i + 1}</span>
        <span class="opt-pill-label">${opt.label}</span>
      </span>
    `;
    el.onclick = () => {
      if (current.has(opt.code)) {
        current.delete(opt.code);
        el.dataset.selected = 'false';
      } else {
        current.add(opt.code);
        el.dataset.selected = 'true';
      }
      answers[item.id] = Array.from(current);
    };
    $options.appendChild(el);
  });
}

function renderNumber(item, goNext) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field-shell';
  const label = document.createElement('div');
  label.className = 'field-label';
  label.textContent = item.label || 'Respuesta numérica';
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
  wrapper.appendChild(label);
  wrapper.appendChild(input);
  $options.appendChild(wrapper);
}

function renderText(item, goNext) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field-shell';
  const label = document.createElement('div');
  label.className = 'field-label';
  label.textContent = item.label || 'Respuesta';
  const input = document.createElement(
    item.long ? 'textarea' : 'input'
  );
  if (!item.long) input.type = 'text';
  input.className = item.long ? 'field-textarea' : 'field-input';
  input.placeholder = item.placeholder || '';
  if (item.maxLength) input.maxLength = item.maxLength;
  if (answers[item.id] != null) input.value = answers[item.id];
  input.addEventListener('input', () => {
    answers[item.id] = input.value;
  });
  wrapper.appendChild(label);
  wrapper.appendChild(input);
  $options.appendChild(wrapper);
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

async function submit() {
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

  try {
    const col = collection(db, `responses/${survey.id}/entries`);
    await addDoc(col, payload);
    qText.textContent = '¡Gracias por participar!';
    qHelp.textContent =
      'Esta es solo una demo visual del laboratorio de encuestas Pausa.';
    $options.innerHTML = '';
    btnNext.textContent = 'Listo';
  } catch (e) {
    console.error(e);
    btnNext.textContent = 'Reintentar';
    btnNext.disabled = false;
  }
}

// Theme controls
document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const theme = btn.getAttribute('data-theme-btn');
    shell.setAttribute('data-theme', theme);
    document
      .querySelectorAll('[data-theme-btn]')
      .forEach((b) => b.setAttribute('data-active', 'false'));
    btn.setAttribute('data-active', 'true');
  });
});

// Boot
const initialId = qsParam('survey') || 'pausa_sample';
startSurveyById(initialId);

