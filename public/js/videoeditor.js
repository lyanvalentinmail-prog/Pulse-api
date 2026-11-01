// public/js/videoeditor.js — Editor de textos de video (canvas).
// Sube un video, pide a /canvas/videotext que detecte los textos (OCR local en
// el servidor), deja editar cada bloque sobre el video y exporta con
// /canvas/videotextrender. Todo lo que se ve acá es HTML + <video> + <div>.
(function () {
  'use strict';

  const state = {
    file: null,
    videoId: null,
    videoInfo: null,
    texts: [],
    selected: null,
    showAll: false,
    busy: false
  };

  const $ = id => document.getElementById(id);
  const els = {
    drop: $('drop'),
    file: $('file'),
    video: $('video'),
    overlay: $('overlay'),
    timeline: $('timeline'),
    segments: $('segments'),
    playhead: $('playhead'),
    detect: $('detect'),
    add: $('add'),
    showAll: $('showAll'),
    status: $('status'),
    exportBox: $('exportBox'),
    exportBtn: $('export'),
    download: $('download'),
    exportStatus: $('exportStatus'),
    preview: $('preview'),
    list: $('list'),
    count: $('count'),
    meta: $('videoMeta')
  };

  const fmt = seconds => {
    const s = Math.max(0, Number(seconds) || 0);
    const m = Math.floor(s / 60);
    const rest = (s - m * 60).toFixed(1);
    return `${m}:${rest.padStart(4, '0')}`;
  };

  function setStatus(text, kind) {
    els.status.textContent = text;
    els.status.className = `ve-status${kind ? ' ' + kind : ''}`;
  }

  async function readError(res) {
    try {
      const json = await res.json();
      return json.hint ? `${json.error} — ${json.hint}` : (json.error || `HTTP ${res.status}`);
    } catch (_) {
      return `HTTP ${res.status}`;
    }
  }

  // ------------------------------------------------------------------ video
  function loadFile(file) {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name)) {
      return setStatus('Ese archivo no parece un video (MP4, WebM o MOV)', 'bad');
    }
    if (file.size > 80 * 1024 * 1024) {
      return setStatus(`El video pesa ${(file.size / 1048576).toFixed(1)} MB (máximo 80 MB)`, 'bad');
    }

    state.file = file;
    state.videoId = null;
    state.texts = [];
    state.selected = null;

    const url = URL.createObjectURL(file);
    els.video.src = url;
    els.video.load();
    els.drop.classList.add('loaded');
    els.drop.querySelector('strong').textContent = file.name;
    els.drop.querySelector('span').textContent = `${(file.size / 1048576).toFixed(1)} MB · tocá "Detectar textos"`;
    els.detect.disabled = false;
    els.add.disabled = false;
    els.exportBox.hidden = true;
    setStatus('Video cargado. Tocá "Detectar textos".');
    renderList();
    renderSegments();
    renderOverlay();
  }

  async function detect() {
    if (!state.file || state.busy) return;
    state.busy = true;
    els.detect.disabled = true;
    setStatus('Analizando el video… (ffmpeg + OCR, puede tardar unos segundos)');
    const started = performance.now();
    try {
      const res = await fetch('/canvas/videotext', {
        method: 'POST',
        headers: { 'Content-Type': state.file.type || 'video/mp4', 'x-pulse-client': 'ui' },
        body: state.file
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = await res.json();
      const result = json.result || {};
      state.videoId = result.id;
      state.videoInfo = result.video;
      state.texts = (result.texts || []).map((item, index) => ({
        id: item.id || `t${index + 1}`,
        text: item.text,
        start: item.start,
        end: item.end,
        confidence: item.confidence,
        box: { ...item.box },
        color: 'ffffff',
        bgColor: '',
        font: 'sans',
        fontSizePct: 100,
        hideOriginal: true
      }));
      state.selected = state.texts.length ? 0 : null;
      const ms = Math.round(performance.now() - started);
      setStatus(state.texts.length
        ? `${state.texts.length} bloque(s) detectado(s) en ${(ms / 1000).toFixed(1)} s`
        : 'No se detectó texto. Probá con otro video o más luz/contraste.', state.texts.length ? 'ok' : 'bad');
      els.exportBox.hidden = !state.texts.length;
      renderList();
      renderSegments();
      renderOverlay();
      els.video.currentTime = state.texts.length ? Math.min(state.texts[0].start + 0.1, els.video.duration || 0) : 0;
    } catch (e) {
      setStatus(String(e.message || e), 'bad');
    } finally {
      state.busy = false;
      els.detect.disabled = false;
    }
  }

  // --------------------------------------------------------------- overlay
  /** Zona que ocupa el video dentro del elemento (object-fit: contain). */
  function displayedRect() {
    const el = els.video;
    const boxWidth = el.clientWidth;
    const boxHeight = el.clientHeight;
    const vw = el.videoWidth || 16;
    const vh = el.videoHeight || 9;
    const scale = Math.min(boxWidth / vw, boxHeight / vh);
    const width = vw * scale;
    const height = vh * scale;
    return { left: (boxWidth - width) / 2, top: (boxHeight - height) / 2, width, height };
  }

  const isActive = text => {
    const t = els.video.currentTime || 0;
    return t >= text.start - 0.05 && t <= text.end + 0.05;
  };

  function renderOverlay() {
    const rect = displayedRect();
    const current = els.video.currentTime || 0;
    els.overlay.innerHTML = '';
    state.texts.forEach((text, index) => {
      const visible = state.showAll || (current >= text.start - 0.05 && current <= text.end + 0.05);
      if (!visible) return;
      const node = document.createElement('div');
      node.className = 've-box';
      if (isActive(text)) node.classList.add('active');
      if (index === state.selected) node.classList.add('selected');
      node.dataset.index = String(index);
      node.title = 'Arrastrá para mover el texto';
      // Si el bloque tapa el original, se muestra el parche (como va a quedar
      // en el video exportado); si no, sólo el texto nuevo.
      if (text.hideOriginal !== false) {
        const mask = document.createElement('span');
        mask.className = 've-mask';
        mask.style.background = text.bgColor ? `#${String(text.bgColor).replace('#', '')}` : 'rgba(12, 18, 26, 0.92)';
        node.appendChild(mask);
      }
      const label = document.createElement('span');
      label.className = 've-label';
      label.textContent = text.text || '(vacío)';
      node.appendChild(label);
      const fontSize = Math.max(6, rect.height * text.box.h * (Number(text.fontSizePct) || 100) / 100);
      node.style.left = `${rect.left + text.box.x * rect.width}px`;
      node.style.top = `${rect.top + text.box.y * rect.height}px`;
      node.style.width = `${text.box.w * rect.width}px`;
      node.style.height = `${text.box.h * rect.height}px`;
      node.style.fontSize = `${fontSize}px`;
      node.style.color = `#${String(text.color || 'ffffff').replace('#', '')}`;
      node.style.fontFamily = fontFamily(text.font);
      node.addEventListener('pointerdown', event => startDrag(event, node, index));
      node.addEventListener('click', () => select(index));
      els.overlay.appendChild(node);
    });
  }

  const fontFamily = font => ({
    sans: "'JetBrains Mono', ui-monospace, monospace",
    serif: "'Playfair Display', Georgia, serif",
    mono: "'Share Tech Mono', ui-monospace, monospace",
    hand: "'Caveat Brush', 'Comic Sans MS', cursive"
  }[font] || "'JetBrains Mono', ui-monospace, monospace");

  function startDrag(event, node, index) {
    event.preventDefault();
    select(index);
    const rect = displayedRect();
    const text = state.texts[index];
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = text.box.x;
    const originY = text.box.y;
    node.setPointerCapture?.(event.pointerId);
    node.classList.add('dragging');

    const move = ev => {
      const dx = (ev.clientX - startX) / (rect.width || 1);
      const dy = (ev.clientY - startY) / (rect.height || 1);
      text.box.x = Math.min(1 - Math.min(text.box.w, 1), Math.max(0, originX + dx));
      text.box.y = Math.min(1 - Math.min(text.box.h, 1), Math.max(0, originY + dy));
      node.style.left = `${rect.left + text.box.x * rect.width}px`;
      node.style.top = `${rect.top + text.box.y * rect.height}px`;
    };
    const up = () => {
      node.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function select(index) {
    state.selected = index;
    [...els.list.querySelectorAll('.ve-card')].forEach((card, i) => card.classList.toggle('selected', i === index));
    renderOverlay();
  }

  // ---------------------------------------------------------------- lista
  function renderList() {
    els.count.textContent = String(state.texts.length);
    els.list.innerHTML = '';
    if (!state.texts.length) {
      els.list.innerHTML = '<p class="ve-empty">Todavía no hay textos. Subí un video y tocá <b>Detectar textos</b>.</p>';
      els.meta.textContent = '';
      return;
    }

    state.texts.forEach((text, index) => els.list.appendChild(card(text, index)));

    const info = state.videoInfo;
    els.meta.innerHTML = info
      ? `${info.width}×${info.height} · ${fmt(info.duration)} · ${info.fps || '?'} fps${info.hasAudio ? ' · con audio' : ' · sin audio'}`
      : '';
  }

  function card(text, index) {
    const node = document.createElement('div');
    node.className = `ve-card${index === state.selected ? ' selected' : ''}`;
    node.innerHTML = `
      <header>
        <span class="dot" style="background:#${String(text.color || 'ffffff').replace('#', '')}"></span>
        <span>${fmt(text.start)} → ${fmt(text.end)}</span>
        <span class="conf">${text.confidence ? text.confidence + '%' : 'manual'}</span>
      </header>
      <input type="text" data-field="text" value="${escapeAttr(text.text)}" aria-label="Texto del bloque ${index + 1}">
      <div class="row">
        <label>Inicio (s)<input type="number" data-field="start" min="0" step="0.1" value="${text.start}"></label>
        <label>Fin (s)<input type="number" data-field="end" min="0" step="0.1" value="${text.end}"></label>
      </div>
      <div class="row three">
        <label>Color<input type="color" data-field="color" value="#${String(text.color || 'ffffff').replace('#', '')}"></label>
        <label>Tamaño %<input type="number" data-field="fontSizePct" min="30" max="200" step="5" value="${text.fontSizePct}"></label>
        <label>Ir<button type="button" data-action="seek" class="ve-mini" title="Ir a este bloque">▶</button></label>
      </div>
      <div class="row">
        <label>Tipografía
          <select data-field="font">
            ${['sans', 'serif', 'mono', 'hand'].map(f => `<option value="${f}"${f === text.font ? ' selected' : ''}>${f}</option>`).join('')}
          </select>
        </label>
        <label>Fondo
          <input type="color" data-field="bgColor" value="#${String(text.bgColor || '000000').replace('#', '')}">
        </label>
      </div>
      <div class="actions">
        <label class="ve-check" style="font-size:10px">
          <input type="checkbox" data-field="hideOriginal"${text.hideOriginal ? ' checked' : ''}> Tapar original
        </label>
        <button type="button" data-action="auto" class="ve-mini" title="Usar el color del fondo (lo calcula el servidor)">Auto</button>
        <button type="button" data-action="delete" class="ve-mini del" title="Quitar este bloque">Quitar</button>
      </div>`;

    node.addEventListener('pointerdown', () => select(index), true);
    node.querySelectorAll('[data-field]').forEach(input => {
      const field = input.dataset.field;
      const eventName = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        if (field === 'start' || field === 'end' || field === 'fontSizePct') {
          text[field] = Math.max(0, Number(input.value) || 0);
          if (text.end <= text.start) text.end = text.start + 0.5;
        } else if (field === 'hideOriginal') {
          text.hideOriginal = input.checked;
        } else if (field === 'color' || field === 'bgColor') {
          text[field] = input.value.replace('#', '');
        } else if (field === 'text') {
          text.text = input.value;
        } else {
          text[field] = input.value;
        }
        renderOverlay();
        renderSegments();
        const header = node.querySelector('header span:nth-child(2)');
        if (header) header.textContent = `${fmt(text.start)} → ${fmt(text.end)}`;
      });
    });

    node.querySelector('[data-action="seek"]').addEventListener('click', () => {
      els.video.currentTime = Math.max(0, text.start + 0.05);
      renderOverlay();
    });
    node.querySelector('[data-action="auto"]').addEventListener('click', () => {
      // Vacío = el servidor toma el color del fotograma original.
      text.bgColor = '';
      text.hideOriginal = true;
      const input = node.querySelector('[data-field="bgColor"]');
      const check = node.querySelector('[data-field="hideOriginal"]');
      if (input) input.value = '#000000';
      if (check) check.checked = true;
      renderOverlay();
    });
    node.querySelector('[data-action="delete"]').addEventListener('click', () => {
      state.texts.splice(index, 1);
      state.selected = null;
      renderList();
      renderSegments();
      renderOverlay();
    });
    return node;
  }

  const escapeAttr = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ------------------------------------------------------------- timeline
  function renderSegments() {
    const duration = els.video.duration || (state.videoInfo && state.videoInfo.duration) || 1;
    els.segments.innerHTML = '';
    state.texts.forEach((text, index) => {
      const seg = document.createElement('div');
      seg.className = 've-seg';
      seg.style.left = `${(text.start / duration) * 100}%`;
      seg.style.width = `${Math.max(0.8, ((text.end - text.start) / duration) * 100)}%`;
      seg.style.background = index === state.selected ? '#d92d20' : '#0a0a0a';
      seg.title = `${fmt(text.start)} → ${fmt(text.end)} · ${text.text}`;
      seg.textContent = text.text;
      seg.addEventListener('click', event => {
        event.stopPropagation();
        select(index);
        els.video.currentTime = Math.max(0, text.start + 0.05);
      });
      els.segments.appendChild(seg);
    });
  }

  function syncPlayhead() {
    const duration = els.video.duration || (state.videoInfo && state.videoInfo.duration) || 1;
    const ratio = Math.min(1, Math.max(0, (els.video.currentTime || 0) / duration));
    els.playhead.style.left = `${ratio * 100}%`;
    els.timeline.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }

  els.timeline.addEventListener('click', event => {
    const rect = els.timeline.getBoundingClientRect();
    const duration = els.video.duration || (state.videoInfo && state.videoInfo.duration) || 0;
    if (!duration) return;
    els.video.currentTime = Math.min(duration, Math.max(0, ((event.clientX - rect.left) / rect.width) * duration));
  });

  // --------------------------------------------------------------- export
  async function exportVideo() {
    if (!state.videoId || state.busy) return;
    const textos = state.texts
      .filter(text => String(text.text || '').trim())
      .map(text => ({
        text: text.text,
        start: Number(text.start),
        end: Number(text.end),
        box: { x: text.box.x, y: text.box.y, w: text.box.w, h: text.box.h },
        color: text.color,
        bgColor: text.bgColor,
        font: text.font,
        fontSizePct: text.fontSizePct,
        hideOriginal: text.hideOriginal !== false
      }));
    if (!textos.length) return;

    state.busy = true;
    els.exportBtn.disabled = true;
    els.download.hidden = true;
    els.exportStatus.className = 've-status';
    els.exportStatus.textContent = 'Renderizando con ffmpeg…';
    const started = performance.now();
    try {
      const res = await fetch('/canvas/videotextrender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pulse-client': 'ui' },
        body: JSON.stringify({ id: state.videoId, texts: textos })
      });
      if (!res.ok) throw new Error(await readError(res));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      els.preview.src = url;
      els.preview.hidden = false;
      els.download.href = url;
      els.download.download = 'pulse-videotext.mp4';
      els.download.hidden = false;
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      els.exportStatus.className = 've-status ok';
      els.exportStatus.textContent = `Listo: ${(blob.size / 1048576).toFixed(2)} MB en ${seconds} s`;
    } catch (e) {
      els.exportStatus.className = 've-status bad';
      els.exportStatus.textContent = String(e.message || e);
    } finally {
      state.busy = false;
      els.exportBtn.disabled = false;
    }
  }

  // ---------------------------------------------------------------- eventos
  els.drop.addEventListener('click', () => els.file.click());
  els.drop.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); els.file.click(); }
  });
  els.file.addEventListener('change', () => loadFile(els.file.files && els.file.files[0]));

  ['dragenter', 'dragover'].forEach(name => els.drop.addEventListener(name, event => {
    event.preventDefault();
    els.drop.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(name => els.drop.addEventListener(name, event => {
    event.preventDefault();
    els.drop.classList.remove('over');
  }));
  els.drop.addEventListener('drop', event => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) loadFile(file);
  });
  // Soltar sobre el reproductor también sirve.
  els.video.addEventListener('dragover', event => event.preventDefault());
  els.video.addEventListener('drop', event => {
    event.preventDefault();
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  els.detect.addEventListener('click', detect);
  els.exportBtn.addEventListener('click', exportVideo);
  els.add.addEventListener('click', () => {
    const duration = els.video.duration || (state.videoInfo && state.videoInfo.duration) || 5;
    const start = Math.min(Math.max(0, els.video.currentTime || 0), Math.max(0, duration - 0.5));
    state.texts.push({
      id: `m${state.texts.length + 1}`,
      text: 'Texto nuevo',
      start: Number(start.toFixed(2)),
      end: Number(Math.min(duration, start + 2).toFixed(2)),
      confidence: 0,
      box: { x: 0.1, y: 0.7, w: 0.4, h: 0.1 },
      color: 'ffffff',
      bgColor: '000000',
      font: 'sans',
      fontSizePct: 100,
      hideOriginal: false
    });
    state.selected = state.texts.length - 1;
    els.exportBox.hidden = false;
    renderList();
    renderSegments();
    renderOverlay();
    setStatus('Bloque agregado: movelo arrastrando sobre el video.', 'ok');
  });

  els.showAll.addEventListener('change', () => {
    state.showAll = els.showAll.checked;
    renderOverlay();
  });

  els.video.addEventListener('timeupdate', () => { syncPlayhead(); renderOverlay(); });
  els.video.addEventListener('loadedmetadata', () => { syncPlayhead(); renderSegments(); renderOverlay(); });
  els.video.addEventListener('seeked', () => renderOverlay());
  new ResizeObserver(() => renderOverlay()).observe(els.video);

  renderOverlay();
  syncPlayhead();
})();
