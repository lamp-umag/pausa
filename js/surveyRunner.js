// Lógica principal del "runner" de encuestas de Pausa.
// Aquí vive todo lo que es flujo de preguntas, tipos de ítem, paradata básica, etc.

import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Config global pensada para futuras extensiones:
// - randomización
// - control de tipos permitidos
// - textos de cierre, etc.
export const APP_CONFIG = {
  enableParadata: true,
  // En el futuro podríamos leer esto desde el JSON de la encuesta
  // por sección, algo tipo: section.randomize: true.
  randomization: {
    enabled: false
  },
  messages: {
    thankYou: '<div class="q center">¡Muchas gracias por tu participación!</div><div class="info-text center">Tus respuestas contribuirán a este proyecto en Pausa.\n\nAnte cualquier duda o consulta, puedes contactarte con el responsable.</div>'
  }
};

/**
 * Punto de entrada principal: conecta DOM + Firestore + configuración.
 */
export function createSurveyApp({ db, elements }) {
  const {
    header,
    homeSection,
    listContainer,
    runnerSection,
    metaContainer,
    bar,
    questionContainer,
    optionsContainer,
    controlsContainer,
    footnoteContainer
  } = elements;

  let survey = null;
  let currentIndex = 0;
  let answers = {};
  let startTime = null;
  let itemStartTime = null;
  let itemTimes = {};

  async function loadSurveyIndex() {
    const res = await fetch('surveys/index.json?_=' + Date.now());
    const data = await res.json();
    return data.surveys || [];
  }

  function qsParam(name) {
    const url = new URL(location.href);
    return url.searchParams.get(name);
  }

  function showHome(items) {
    header.style.display = 'flex';
    homeSection.style.display = 'block';
    runnerSection.style.display = 'none';
    listContainer.innerHTML = '';

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'survey-item';
      row.innerHTML = `
        <div>
          <h3>${item.title}</h3>
          <p>${item.description || ''}</p>
        </div>
        <div>
          <button data-id="${item.id}">Comenzar</button>
        </div>
      `;
      row.querySelector('button').addEventListener('click', () => {
        const url = new URL(location.href);
        url.searchParams.set('survey', item.id);
        history.pushState({}, '', url);
        startSurveyById(item.id, items);
      });
      listContainer.appendChild(row);
    });
  }

  async function startSurveyById(id, indexData) {
    const meta = (indexData || await loadSurveyIndex()).find(s => s.id === id);
    if (!meta) {
      alert('Encuesta no encontrada');
      return;
    }
    const res = await fetch(`surveys/${meta.file}?_=${Date.now()}`);
    const data = await res.json();
    const prepared = prepareSurvey(data);
    startSurvey(prepared);
  }

  // Hook para futuras transformaciones del cuestionario:
  // - randomizar orden de ítems dentro de secciones
  // - filtrar tipos no permitidos
  // - inyectar metadatos, etc.
  function prepareSurvey(rawSurvey) {
    const surveyCopy = structuredClone(rawSurvey);
    // Ejemplo de sitio donde más adelante podríamos aplicar randomización:
    // if (APP_CONFIG.randomization.enabled) {
    //   surveyCopy.items = shuffleWithinBlocks(surveyCopy.items);
    // }
    return surveyCopy;
  }

  function startSurvey(data) {
    survey = data;
    currentIndex = 0;
    answers = {};
    startTime = Date.now();
    itemTimes = {};
    homeSection.style.display = 'none';
    runnerSection.style.display = 'block';
    header.style.display = 'none';
    renderStep();
  }

  function renderStep() {
    const total = survey.items.length;
    const step = Math.min(currentIndex, total);
    const percent = Math.round((step / total) * 100);
    bar.style.width = `${percent}%`;
    metaContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--muted); margin-bottom: 8px;">
        <span>Pregunta ${step} de ${total}</span>
        <span>${percent}%</span>
      </div>
    `;
    optionsContainer.innerHTML = '';
    controlsContainer.innerHTML = '';
    footnoteContainer.innerHTML = '';

    if (currentIndex >= total) {
      questionContainer.innerHTML = '<div class="q center">¿Listo para enviar?</div>';
      const back = button('Volver', 'secondary');
      back.onclick = () => { currentIndex = total - 1; renderStep(); };
      const send = button('Enviar respuestas', 'primary');
      send.onclick = submitResponses;
      controlsContainer.append(back, send);
      return;
    }

    const item = survey.items[currentIndex];
    itemStartTime = Date.now();

    // Tipo 'info': solo muestra texto informativo (sin input)
    if (item.type === 'info') {
      if (item.prompt.includes('SECCIÓN')) {
        const lines = item.prompt.split('\n');
        const headerText = lines[0];
        const content = lines.slice(1).join('\n').trim();
        questionContainer.innerHTML = `
          <div class="section-header">${headerText}</div>
          <div class="info-text">${content}</div>
        `;
      } else {
        questionContainer.innerHTML = `<div class="info-text">${item.prompt}</div>`;
      }
    } else {
      // Preguntas normales
      questionContainer.innerHTML = `<div class="q">${item.prompt}</div>`;
    }

    const goNext = () => {
      if (APP_CONFIG.enableParadata && itemStartTime && item) {
        itemTimes[item.id] = Date.now() - itemStartTime;
      }
      currentIndex += 1;
      renderStep();
    };

    const goPrev = () => {
      if (APP_CONFIG.enableParadata && itemStartTime && item) {
        itemTimes[item.id] = Date.now() - itemStartTime;
      }
      currentIndex = Math.max(0, currentIndex - 1);
      renderStep();
    };

    renderControlsForItem({ item, goNext, goPrev });

    if (item.help) {
      footnoteContainer.innerText = item.help;
    }
  }

  function renderControlsForItem({ item, goNext, goPrev }) {
    if (item.type === 'likert' || item.type === 'single_choice') {
      const options = normalizeOptions(item);
      const selectedCode = answers[item.id] ?? null;
      options.forEach(opt => {
        const el = document.createElement('button');
        el.className = 'opt' + (selectedCode === opt.code ? ' selected' : '');
        el.textContent = opt.label;
        el.onclick = () => {
          answers[item.id] = opt.code;
          el.classList.add('selected');
          setTimeout(goNext, 120);
        };
        optionsContainer.appendChild(el);
      });
      const back = button('← Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente →', 'primary');
      next.onclick = goNext;
      controlsContainer.append(back, next);
      return;
    }

    if (item.type === 'multi_choice') {
      const options = normalizeOptions(item);
      const prev = Array.isArray(answers[item.id]) ? new Set(answers[item.id]) : new Set();
      options.forEach(opt => {
        const el = document.createElement('button');
        const isSel = prev.has(opt.code);
        el.className = 'opt' + (isSel ? ' selected' : '');
        el.textContent = opt.label;
        el.onclick = () => {
          if (prev.has(opt.code)) prev.delete(opt.code); else prev.add(opt.code);
          el.classList.toggle('selected');
        };
        optionsContainer.appendChild(el);
      });
      const back = button('← Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente →', 'primary');
      next.onclick = () => {
        const arr = Array.from(prev);
        if (item.required && arr.length === 0) return;
        answers[item.id] = arr;
        goNext();
      };
      controlsContainer.append(back, next);
      return;
    }

    if (item.type === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      input.inputMode = 'numeric';
      input.placeholder = item.placeholder || '';
      if (typeof item.min === 'number') input.min = String(item.min);
      if (typeof item.max === 'number') input.max = String(item.max);
      if (answers[item.id] != null) input.value = answers[item.id];
      input.addEventListener('input', () => { answers[item.id] = input.value; });
      optionsContainer.appendChild(input);
      const back = button('← Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente →', 'primary');
      next.onclick = () => {
        if (item.required && (input.value === '' || isNaN(Number(input.value)))) return;
        answers[item.id] = input.value === '' ? null : Number(input.value);
        goNext();
      };
      controlsContainer.append(back, next);
      return;
    }

    // Tipo 'info': solo muestra texto, no requiere input
    if (item.type === 'info') {
      const back = button('← Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente →', 'primary');
      next.onclick = goNext;
      controlsContainer.append(back, next);
      return;
    }

    // Tipo 'text': input de texto para respuestas del usuario
    if (item.type === 'text') {
      const input = document.createElement(item.long ? 'textarea' : 'input');
      if (input.tagName.toLowerCase() === 'input') input.type = 'text';
      input.placeholder = item.placeholder || '';
      input.maxLength = item.maxLength || 500;
      if (answers[item.id] != null) input.value = answers[item.id];
      input.addEventListener('input', () => { answers[item.id] = input.value; });
      optionsContainer.appendChild(input);
      const back = button('← Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente →', 'primary');
      next.onclick = () => {
        if (item.required && (!answers[item.id] || String(answers[item.id]).trim() === '')) return;
        goNext();
      };
      controlsContainer.append(back, next);
      return;
    }

    if (item.type === 'email') {
      const input = document.createElement('input');
      input.type = 'email';
      input.placeholder = item.placeholder || 'ejemplo@correo.com';
      input.maxLength = item.maxLength || 100;
      if (answers[item.id] != null) input.value = answers[item.id];
      input.addEventListener('input', () => { answers[item.id] = input.value; });
      optionsContainer.appendChild(input);
      const back = button('← Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente →', 'primary');
      next.onclick = () => {
        if (item.required && (!answers[item.id] || String(answers[item.id]).trim() === '')) return;
        goNext();
      };
      controlsContainer.append(back, next);
      return;
    }

    if (item.type === 'url') {
      const input = document.createElement('input');
      input.type = 'url';
      input.placeholder = item.placeholder || 'https://ejemplo.com';
      input.maxLength = item.maxLength || 200;
      if (answers[item.id] != null) input.value = answers[item.id];
      input.addEventListener('input', () => { answers[item.id] = input.value; });
      optionsContainer.appendChild(input);
      const back = button('← Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente →', 'primary');
      next.onclick = () => {
        if (item.required && (!answers[item.id] || String(answers[item.id]).trim() === '')) return;
        goNext();
      };
      controlsContainer.append(back, next);
      return;
    }

    if (item.type === 'date') {
      const input = document.createElement('input');
      input.type = 'date';
      if (answers[item.id] != null) input.value = answers[item.id];
      input.addEventListener('change', () => { answers[item.id] = input.value; });
      optionsContainer.appendChild(input);
      const back = button('← Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente →', 'primary');
      next.onclick = () => {
        if (item.required && (!answers[item.id] || String(answers[item.id]).trim() === '')) return;
        goNext();
      };
      controlsContainer.append(back, next);
      return;
    }

    if (item.type === 'time') {
      const input = document.createElement('input');
      input.type = 'time';
      if (answers[item.id] != null) input.value = answers[item.id];
      input.addEventListener('change', () => { answers[item.id] = input.value; });
      optionsContainer.appendChild(input);
      const back = button('← Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente →', 'primary');
      next.onclick = () => {
        if (item.required && (!answers[item.id] || String(answers[item.id]).trim() === '')) return;
        goNext();
      };
      controlsContainer.append(back, next);
      return;
    }

    if (item.type === 'slider') {
      const container = document.createElement('div');
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = item.min || 0;
      slider.max = item.max || 100;
      slider.step = item.step || 1;
      slider.value = answers[item.id] || slider.min;
      const valueDisplay = document.createElement('div');
      valueDisplay.style.textAlign = 'center';
      valueDisplay.style.fontSize = '18px';
      valueDisplay.style.fontWeight = '700';
      valueDisplay.style.marginTop = '8px';
      valueDisplay.textContent = slider.value;

      slider.addEventListener('input', () => {
        answers[item.id] = Number(slider.value);
        valueDisplay.textContent = slider.value;
      });

      container.appendChild(slider);
      container.appendChild(valueDisplay);
      optionsContainer.appendChild(container);
      const back = button('← Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente', 'primary');
      next.onclick = () => {
        if (item.required && answers[item.id] == null) return;
        goNext();
      };
      controlsContainer.append(back, next);
      return;
    }

    if (item.type === 'yes_no') {
      const options = [
        { label: 'Sí', code: 'yes' },
        { label: 'No', code: 'no' }
      ];
      const selectedCode = answers[item.id] ?? null;
      options.forEach(opt => {
        const el = document.createElement('button');
        el.className = 'opt' + (selectedCode === opt.code ? ' selected' : '');
        el.textContent = opt.label;
        el.onclick = () => {
          answers[item.id] = opt.code;
          el.classList.add('selected');
          setTimeout(goNext, 120);
        };
        optionsContainer.appendChild(el);
      });
      const back = button('Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente', 'primary');
      next.onclick = goNext;
      controlsContainer.append(back, next);
      return;
    }

    if (item.type === 'phone') {
      const input = document.createElement('input');
      input.type = 'tel';
      input.placeholder = item.placeholder || '+34 123 456 789';
      input.maxLength = item.maxLength || 20;
      if (answers[item.id] != null) input.value = answers[item.id];
      input.addEventListener('input', () => { answers[item.id] = input.value; });
      optionsContainer.appendChild(input);
      const back = button('Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente', 'primary');
      next.onclick = () => {
        if (item.required && (!answers[item.id] || String(answers[item.id]).trim() === '')) return;
        goNext();
      };
      controlsContainer.append(back, next);
      return;
    }

    if (item.type === 'file') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = item.accept || '*/*';
      input.multiple = item.multiple || false;
      input.addEventListener('change', () => {
        if (input.files.length > 0) {
          const files = Array.from(input.files).map(f => f.name);
          answers[item.id] = files;
        } else {
          answers[item.id] = null;
        }
      });
      optionsContainer.appendChild(input);
      const back = button('Atrás', 'secondary');
      back.onclick = goPrev;
      const next = button('Siguiente', 'primary');
      next.onclick = () => {
        if (item.required && !answers[item.id]) return;
        goNext();
      };
      controlsContainer.append(back, next);
      return;
    }

    optionsContainer.innerHTML = '<div class="tiny">Tipo de ítem no soportado: ' + item.type + '</div>';
  }

  function button(label, kind) {
    const b = document.createElement('button');
    b.className = `btn ${kind}`;
    b.textContent = label;
    return b;
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

  async function submitResponses() {
    const urlParams = new URLSearchParams(location.search);
    const serverCode = urlParams.get('srv') || urlParams.get('iden') || null;

    const totalTime = APP_CONFIG.enableParadata && startTime ? Date.now() - startTime : null;

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
      questionContainer.innerHTML = APP_CONFIG.messages.thankYou;
      optionsContainer.innerHTML = '';
      controlsContainer.innerHTML = '';
      footnoteContainer.innerHTML = '';
    } catch (e) {
      alert('Error al enviar. Intenta de nuevo.');
      console.error(e);
    }
  }

  // Init público: devuelve helpers por si más adelante quieres usarlos
  // desde la consola del navegador.
  async function init() {
    const items = await loadSurveyIndex();
    const selected = qsParam('survey');
    if (selected) {
      await startSurveyById(selected, items);
    } else {
      showHome(items);
    }
    document.body.style.paddingBottom = '24px';
  }

  return {
    init
  };
}

