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
  thankYou: '<div class="q center">¡Muchas gracias por tu participación!</div><div class="info-text center">Tus respuestas contribuirán a este proyecto en Pausa.\n\nAnte cualquier duda o consulta, puedes contactarte con pausa@umag.cl.</div>'
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
  let responseTimestamps = {};
  let presentationOrder = null;

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

  /** Fisher–Yates shuffle (no mutates; returns new array). */
  function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** True si el ítem es cabecera de sección (info con "SECCIÓN"). */
  function isSectionHeader(item) {
    return item && item.type === 'info' && typeof item.prompt === 'string' && item.prompt.startsWith('SECCIÓN');
  }

  /**
   * Reordena ítems según settings.randomizeItems.
   * Valores: "within_scale" | "within_section" | "between_scales" | "between_dimensions" | false.
   * Devuelve el survey con items reordenados y survey._presentationOrder = [ids en orden mostrado].
   */
  function applyRandomization(surveyCopy) {
    const mode = surveyCopy.settings && surveyCopy.settings.randomizeItems;
    if (!mode || mode === false) {
      surveyCopy._presentationOrder = surveyCopy.items.map(it => it.id);
      return surveyCopy;
    }

    const items = surveyCopy.items;

    if (mode === 'within_scale') {
      const result = [];
      let i = 0;
      while (i < items.length) {
        const it = items[i];
        if (!it.scale) {
          result.push(it);
          i++;
          continue;
        }
        const scale = it.scale;
        const block = [];
        while (i < items.length && items[i].scale === scale) {
          block.push(items[i]);
          i++;
        }
        result.push(...shuffle(block));
      }
      surveyCopy.items = result;
    } else if (mode === 'within_section') {
      const sections = [];
      let section = [];
      for (let k = 0; k < items.length; k++) {
        if (isSectionHeader(items[k]) && section.length > 0) {
          sections.push(section);
          section = [];
        }
        section.push(items[k]);
      }
      if (section.length) sections.push(section);
      const result = [];
      for (const sec of sections) {
        const headers = [];
        const rest = [];
        for (const it of sec) {
          if (it.type === 'info') headers.push(it);
          else rest.push(it);
        }
        result.push(...headers, ...shuffle(rest));
      }
      surveyCopy.items = result;
    } else if (mode === 'between_scales') {
      const scaleBlocks = [];
      const noScaleItems = [];
      let i = 0;
      while (i < items.length) {
        const it = items[i];
        if (!it.scale) {
          noScaleItems.push(it);
          i++;
          continue;
        }
        const scale = it.scale;
        const block = [];
        while (i < items.length && items[i].scale === scale) {
          block.push(items[i]);
          i++;
        }
        scaleBlocks.push(block);
      }
      surveyCopy.items = noScaleItems.concat(...shuffle(scaleBlocks));
    } else if (mode === 'between_dimensions') {
      const dimBlocks = [];
      const noDimItems = [];
      let i = 0;
      while (i < items.length) {
        const it = items[i];
        if (!it.dimension) {
          noDimItems.push(it);
          i++;
          continue;
        }
        const dim = it.dimension;
        const block = [];
        while (i < items.length && items[i].dimension === dim) {
          block.push(items[i]);
          i++;
        }
        dimBlocks.push(block);
      }
      surveyCopy.items = noDimItems.concat(...shuffle(dimBlocks));
    }

    surveyCopy._presentationOrder = surveyCopy.items.map(it => it.id);
    return surveyCopy;
  }

  // Hook para transformaciones del cuestionario: randomización, paradata de orden, etc.
  function prepareSurvey(rawSurvey) {
    const surveyCopy = structuredClone(rawSurvey);
    return applyRandomization(surveyCopy);
  }

  function startSurvey(data) {
    survey = data;
    currentIndex = 0;
    answers = {};
    startTime = Date.now();
    itemTimes = {};
    responseTimestamps = {};
    presentationOrder = Array.isArray(survey._presentationOrder) ? survey._presentationOrder : survey.items.map(it => it.id);
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
    metaContainer.innerHTML = '';
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
    const isLastItem = currentIndex === survey.items.length - 1;
    itemStartTime = Date.now();

    // Tipo 'info': solo muestra texto informativo (sin input)
    if (item.type === 'info') {
      const lines = item.prompt.split('\n');
      const headerText = lines[0];
      const content = lines.slice(1).join('\n').trim();
      const isSectionHeader =
        headerText.startsWith('SECCIÓN') ||
        headerText === 'Proyecto PAUSA';

      if (isSectionHeader) {
        questionContainer.innerHTML = `
          <div class="section-header">${headerText}</div>
          <div class="info-text">${content}</div>
        `;
      } else {
        questionContainer.innerHTML = `<div class="info-text">${item.prompt}</div>`;
      }
    } else {
      // Preguntas normales: instruction opcional arriba, luego prompt
      const instruction = item.instruction ? `<div class="item-instruction">${item.instruction}</div>` : '';
      questionContainer.innerHTML = instruction + `<div class="q">${item.prompt}</div>`;
    }

    const goNext = () => {
      if (APP_CONFIG.enableParadata && item) {
        if (itemStartTime) itemTimes[item.id] = Date.now() - itemStartTime;
        responseTimestamps[item.id] = new Date().toISOString();
      }
      currentIndex += 1;
      renderStep();
    };

    const goPrev = () => {
      if (APP_CONFIG.enableParadata && item) {
        if (itemStartTime) itemTimes[item.id] = Date.now() - itemStartTime;
        responseTimestamps[item.id] = new Date().toISOString();
      }
      currentIndex = Math.max(0, currentIndex - 1);
      renderStep();
    };

    renderControlsForItem({ item, goNext, goPrev, isLastItem });

    if (item.help) {
      footnoteContainer.innerText = item.help;
    }
  }

  function filterByAllowedChars(value, allowedChars) {
    if (!allowedChars || typeof allowedChars !== 'string') return value;
    const set = new Set(allowedChars.split(''));
    let out = '';
    for (const ch of value) {
      if (set.has(ch)) out += ch;
    }
    return out;
  }

  function renderControlsForItem({ item, goNext, goPrev, isLastItem }) {
    if (isSingleChoiceItem(item)) {
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
      input.addEventListener('input', () => {
        let v = input.value;
        if (item.allowedChars) {
          const filtered = filterByAllowedChars(v, item.allowedChars);
          if (filtered !== v) {
            v = filtered;
            input.value = v;
          }
        }
        answers[item.id] = v;
      });
      optionsContainer.appendChild(input);
      const back = button('← Atrás', 'secondary');
      back.onclick = goPrev;
      const primaryLabel = isLastItem && item.id === 'comentario_final' ? 'Enviar' : 'Siguiente →';
      const next = button(primaryLabel, 'primary');
      next.onclick = () => {
        if (item.required && (!answers[item.id] || String(answers[item.id]).trim() === '')) return;
        if (isLastItem && item.id === 'comentario_final') {
          submitResponses();
        } else {
          goNext();
        }
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

  /** Opciones para un ítem: desde survey.optionSets[item.type] o item.options. */
  function getItemOptions(item) {
    const raw = (survey && survey.optionSets && survey.optionSets[item.type]) || item.options;
    if (!Array.isArray(raw)) return [];
    return raw;
  }

  function normalizeOptions(item) {
    const raw = getItemOptions(item);
    if (!raw.length) return [];
    return raw.map((opt, idx) => {
      if (typeof opt === 'string') return { label: opt, code: idx + 1 };
      const label = opt.label ?? String(opt.code ?? opt.value ?? opt);
      const code = opt.code ?? opt.value ?? (idx + 1);
      return { label, code };
    });
  }

  /** True si el ítem se muestra como botones de opción única (likert, frequency, single_choice, multiple_choice con una sola selección, etc.). */
  function isSingleChoiceItem(item) {
    if (item.type === 'multi_choice') return false;
    const opts = getItemOptions(item);
    return opts.length > 0;
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
      ...(presentationOrder && { presentationOrder }),
      ...(Object.keys(responseTimestamps).length > 0 && { responseTimestamps }),
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
    const selected = qsParam('survey');
    if (selected) {
      const items = await loadSurveyIndex();
      await startSurveyById(selected, items);
    }
    document.body.style.paddingBottom = '24px';
  }

  return {
    init
  };
}

