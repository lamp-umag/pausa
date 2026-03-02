// Tailwind-based modern survey runner
// Uses same Firebase and survey JSON structure as the main app

import { db } from '../js/firebaseClient.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

let survey = null;
let currentIndex = 0;
let answers = {};
let startTime = null;
let itemStartTime = null;
let itemTimes = {};

const questionContainer = document.getElementById('questionContainer');
const themeLabBtn = document.getElementById('themeLabBtn');
const themePanel = document.getElementById('themePanel');
const backdrop = document.getElementById('backdrop');
const closeThemeBtn = document.getElementById('closeThemeBtn');

// Theme management
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButtons(theme);
  localStorage.setItem('pausa-theme', theme);
}

function setFont(font) {
  document.documentElement.setAttribute('data-font-theme', font);
  updateFontButtons(font);
  localStorage.setItem('pausa-font', font);
}

function updateThemeButtons(activeTheme) {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    const theme = btn.getAttribute('data-theme');
    if (theme === activeTheme) {
      btn.classList.add('border-primary', 'bg-primary/5');
      btn.classList.remove('border-transparent');
    } else {
      btn.classList.remove('border-primary', 'bg-primary/5');
      btn.classList.add('border-transparent');
    }
  });
}

function updateFontButtons(activeFont) {
  document.querySelectorAll('.font-btn').forEach(btn => {
    const font = btn.getAttribute('data-font');
    const dot = btn.querySelector('.h-2');
    if (font === activeFont) {
      btn.classList.add('border-primary', 'bg-primary/5');
      btn.classList.remove('border-transparent');
      if (!dot) {
        const indicator = document.createElement('div');
        indicator.className = 'h-2 w-2 rounded-full bg-primary shrink-0 ml-3';
        btn.appendChild(indicator);
      }
    } else {
      btn.classList.remove('border-primary', 'bg-primary/5');
      btn.classList.add('border-transparent');
      if (dot) dot.remove();
    }
  });
}

// Theme panel controls
themeLabBtn.addEventListener('click', () => {
  themePanel.classList.add('open');
  backdrop.classList.remove('opacity-0', 'pointer-events-none');
  backdrop.classList.add('opacity-100');
});

function closeThemePanel() {
  themePanel.classList.remove('open');
  backdrop.classList.add('opacity-0', 'pointer-events-none');
  backdrop.classList.remove('opacity-100');
}

closeThemeBtn.addEventListener('click', closeThemePanel);
backdrop.addEventListener('click', closeThemePanel);

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('bg-surface', 'text-foreground', 'shadow-sm');
      b.classList.add('text-muted');
    });
    btn.classList.add('bg-surface', 'text-foreground', 'shadow-sm');
    btn.classList.remove('text-muted');

    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.add('hidden');
    });
    document.getElementById(`${tab}Tab`).classList.remove('hidden');
  });
});

// Theme buttons
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const theme = btn.getAttribute('data-theme');
    setTheme(theme);
  });
});

// Font buttons
document.querySelectorAll('.font-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const font = btn.getAttribute('data-font');
    setFont(font);
  });
});

// Load saved preferences
const savedTheme = localStorage.getItem('pausa-theme') || 'calm';
const savedFont = localStorage.getItem('pausa-font') || 'swiss';
setTheme(savedTheme);
setFont(savedFont);

// Survey loading
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
  const index = await loadSurveyIndex();
  const meta = index.find(s => s.id === id);
  if (!meta) {
    alert('Encuesta no encontrada');
    return;
  }
  const res = await fetch(`../surveys/${meta.file}?_=${Date.now()}`);
  const data = await res.json();
  startSurvey(data);
}

function startSurvey(data) {
  survey = data;
  currentIndex = 0;
  answers = {};
  startTime = Date.now();
  itemTimes = {};
  renderStep();
}

function renderStep() {
  const total = survey.items.length;
  const step = Math.min(currentIndex, total);

  if (currentIndex >= total) {
    // Submit screen
    questionContainer.innerHTML = `
      <div class="text-center space-y-6 fade-in">
        <h2 class="text-2xl font-semibold">¿Listo para enviar?</h2>
        <p class="text-muted">Revisa tus respuestas antes de continuar.</p>
        <div class="flex gap-3 pt-4">
          <button onclick="goBack()" class="flex-1 px-6 py-3 rounded-xl border border-color bg-surface text-foreground hover:bg-primary/5 transition-colors font-medium">
            Volver
          </button>
          <button onclick="submitResponses()" class="flex-1 px-6 py-3 rounded-xl btn-primary font-medium hover:scale-[1.02] active:scale-[0.98] transition-transform">
            Enviar respuestas
          </button>
        </div>
      </div>
    `;
    return;
  }

  const item = survey.items[currentIndex];
  itemStartTime = Date.now();

  let html = '';

  // Progress indicator
  html += `
    <div class="mb-6">
      <div class="flex items-center justify-between text-xs text-muted mb-2">
        <span>Pregunta ${step} de ${total}</span>
        <span>${Math.round((step / total) * 100)}%</span>
      </div>
      <div class="h-1.5 bg-primary/10 rounded-full overflow-hidden">
        <div class="h-full bg-primary rounded-full transition-all duration-500 ease-out" style="width: ${(step / total) * 100}%"></div>
      </div>
    </div>
  `;

  // Question prompt
  if (item.type === 'text' && item.maxLength === 1) {
    // Info page
    if (item.prompt.includes('SECCIÓN')) {
      const lines = item.prompt.split('\n');
      const header = lines[0];
      const content = lines.slice(1).join('\n').trim();
      html += `
        <div class="text-center space-y-4 mb-8">
          <h1 class="text-3xl font-bold text-primary">${header}</h1>
          <p class="text-muted leading-relaxed whitespace-pre-line">${content}</p>
        </div>
      `;
    } else {
      html += `<p class="text-lg text-muted leading-relaxed whitespace-pre-line mb-8">${item.prompt}</p>`;
    }
  } else {
    html += `<h1 class="text-2xl sm:text-3xl font-semibold leading-tight mb-8">${item.prompt}</h1>`;
  }

  // Options/inputs
  if (item.type === 'likert' || item.type === 'single_choice') {
    const options = normalizeOptions(item);
    const selectedCode = answers[item.id] ?? null;
    html += '<div class="space-y-3 mb-8">';
    options.forEach(opt => {
      const isSelected = selectedCode === opt.code;
      html += `
        <button
          onclick="selectOption('${item.id}', ${opt.code})"
          class="w-full p-4 rounded-xl border-2 text-left transition-all duration-200 ${isSelected ? 'option-selected' : 'border-color bg-surface hover:bg-primary/5'} font-medium"
        >
          ${opt.label}
        </button>
      `;
    });
    html += '</div>';
  } else if (item.type === 'multi_choice') {
    const options = normalizeOptions(item);
    const prev = Array.isArray(answers[item.id]) ? new Set(answers[item.id]) : new Set();
    html += '<div class="space-y-3 mb-8">';
    options.forEach(opt => {
      const isSelected = prev.has(opt.code);
      html += `
        <button
          onclick="toggleMultiOption('${item.id}', ${opt.code})"
          class="w-full p-4 rounded-xl border-2 text-left transition-all duration-200 ${isSelected ? 'option-selected' : 'border-color bg-surface hover:bg-primary/5'} font-medium"
        >
          ${opt.label}
        </button>
      `;
    });
    html += '</div>';
  } else if (item.type === 'text') {
    const value = answers[item.id] || '';
    html += `
      <div class="mb-8">
        <${item.long ? 'textarea' : 'input'}
          type="text"
          id="input-${item.id}"
          value="${value}"
          placeholder="${item.placeholder || ''}"
          maxlength="${item.maxLength || 500}"
          class="w-full p-4 rounded-xl border border-color bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
          ${item.long ? `rows="6"` : ''}
        >${item.long ? value : ''}</${item.long ? 'textarea' : 'input'}>
      </div>
    `;
  } else if (item.type === 'number') {
    const value = answers[item.id] || '';
    html += `
      <div class="mb-8">
        <input
          type="number"
          id="input-${item.id}"
          value="${value}"
          placeholder="${item.placeholder || ''}"
          min="${item.min || ''}"
          max="${item.max || ''}"
          class="w-full p-4 rounded-xl border border-color bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
        >
      </div>
    `;
  }

  // Navigation
  html += `
    <div class="flex gap-3 pt-4">
      <button
        onclick="goBack()"
        class="flex-1 px-6 py-3 rounded-xl border border-color bg-surface text-foreground hover:bg-primary/5 transition-colors font-medium ${currentIndex === 0 ? 'opacity-50 pointer-events-none' : ''}"
      >
        ← Atrás
      </button>
      <button
        onclick="goNext()"
        class="flex-1 px-6 py-3 rounded-xl btn-primary font-medium hover:scale-[1.02] active:scale-[0.98] transition-transform"
      >
        Siguiente →
      </button>
    </div>
  `;

  // Help text
  if (item.help) {
    html += `<p class="text-xs text-muted mt-4">${item.help}</p>`;
  }

  questionContainer.innerHTML = html;
  questionContainer.classList.add('fade-in');

  // Auto-focus inputs
  const input = document.getElementById(`input-${item.id}`);
  if (input) {
    input.addEventListener('input', (e) => {
      answers[item.id] = e.target.value;
    });
    if (input.value) answers[item.id] = input.value;
  }
}

function normalizeOptions(item) {
  if (!Array.isArray(item.options)) return [];
  return item.options.map((opt, idx) => {
    if (typeof opt === 'string') return { label: opt, code: idx + 1 };
    const label = opt.label ?? String(opt.code ?? opt.value ?? opt);
    const code = opt.code ?? opt.value ?? (idx + 1);
    return { label, code };
  });
}

// Global functions for onclick handlers
window.selectOption = (itemId, code) => {
  answers[itemId] = code;
  setTimeout(() => {
    goNext();
  }, 150);
};

window.toggleMultiOption = (itemId, code) => {
  const prev = Array.isArray(answers[itemId]) ? new Set(answers[itemId]) : new Set();
  if (prev.has(code)) prev.delete(code);
  else prev.add(code);
  answers[itemId] = Array.from(prev);
  renderStep();
};

window.goNext = () => {
  if (itemStartTime && survey.items[currentIndex]) {
    itemTimes[survey.items[currentIndex].id] = Date.now() - itemStartTime;
  }
  currentIndex += 1;
  questionContainer.classList.remove('fade-in');
  questionContainer.classList.add('slide-out-left');
  setTimeout(() => {
    questionContainer.classList.remove('slide-out-left');
    questionContainer.classList.add('slide-in-right');
    renderStep();
    setTimeout(() => {
      questionContainer.classList.remove('slide-in-right');
    }, 400);
  }, 300);
};

window.goBack = () => {
  if (currentIndex === 0) return;
  if (itemStartTime && survey.items[currentIndex]) {
    itemTimes[survey.items[currentIndex].id] = Date.now() - itemStartTime;
  }
  currentIndex = Math.max(0, currentIndex - 1);
  questionContainer.classList.remove('fade-in');
  questionContainer.classList.add('slide-in-right');
  renderStep();
  setTimeout(() => {
    questionContainer.classList.remove('slide-in-right');
  }, 400);
};

async function submitResponses() {
  const urlParams = new URLSearchParams(location.search);
  const serverCode = urlParams.get('srv') || urlParams.get('iden') || null;
  const totalTime = startTime ? Date.now() - startTime : null;

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

  try {
    const col = collection(db, `responses/${survey.id}/entries`);
    await addDoc(col, payload);
    questionContainer.innerHTML = `
      <div class="text-center space-y-6 fade-in">
        <div class="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary">
            <path d="M20 6 9 17l-5-5"></path>
          </svg>
        </div>
        <h2 class="text-2xl font-semibold">¡Muchas gracias!</h2>
        <p class="text-muted leading-relaxed">Tus respuestas contribuirán a este proyecto en Pausa.</p>
      </div>
    `;
  } catch (e) {
    alert('Error al enviar. Intenta de nuevo.');
    console.error(e);
  }
}

// Boot
const initialId = qsParam('survey') || 'pausa_sample';
startSurveyById(initialId);
