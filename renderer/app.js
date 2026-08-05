'use strict';

const IS_WIN = window.termAPI.platform === 'win32';
const DEFAULT_SHELL = 'cmd';
const MAX_PANES = 8;

const XTERM_THEMES = {
  dark: {
    background: '#1a1b26', foreground: '#c0caf5',
    cursor: '#c0caf5', cursorAccent: '#1a1b26',
    selectionBackground: 'rgba(122,162,247,0.30)',
    black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
    blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
    brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a',
    brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff', brightWhite: '#c0caf5'
  },
  light: {
    background: '#ffffff', foreground: '#343b58',
    cursor: '#343b58', cursorAccent: '#ffffff',
    selectionBackground: 'rgba(46,92,197,0.25)',
    black: '#0f0f14', red: '#8c4351', green: '#485e30', yellow: '#8f5e15',
    blue: '#2e5cc5', magenta: '#5a4a78', cyan: '#0f4b6e', white: '#828bb8',
    brightBlack: '#4c505e', brightRed: '#8c4351', brightGreen: '#485e30',
    brightYellow: '#8f5e15', brightBlue: '#2e5cc5', brightMagenta: '#5a4a78',
    brightCyan: '#0f4b6e', brightWhite: '#343b58'
  }
};

const sessions = new Map();
let order = [];
let panes = [];
let focusedPane = 0;
let layoutBias = 'v';
let theme = 'dark';
let draggingId = null;
let renamingId = null;

const $tabs = document.getElementById('tabs');
const $panes = document.getElementById('panes');
const $park = document.getElementById('park');
const $welcome = document.getElementById('welcome');
const $newMenu = document.getElementById('new-menu');
const $helpOverlay = document.getElementById('help-overlay');
const $btnUnsplit = document.getElementById('btn-unsplit');
const $updateBanner = document.getElementById('update-banner');

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const activeId = currentSessionId();
    window.termAPI.saveState({
      theme,
      activeIndex: Math.max(0, order.indexOf(activeId)),
      tabs: order.map((id) => {
        const s = sessions.get(id);
        return { title: s.title, shell: s.shell, custom: s.custom };
      })
    });
  }, 250);
}

function makeId() {
  return 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function defaultTitle(shell) {
  return shell === 'powershell' ? 'PowerShell' : 'CMD';
}

function currentSessionId() {
  const p = panes[focusedPane];
  return p ? p.sessionId : null;
}

function newPaneEl() {
  const el = document.createElement('section');
  el.className = 'pane';
  el.addEventListener('mousedown', () => {
    const i = panes.findIndex((p) => p.el === el);
    if (i >= 0) {
      setFocusedPane(i);
      renderTabs();
    }
  });
  return el;
}

function setFocusedPane(i) {
  focusedPane = Math.max(0, Math.min(i, panes.length - 1));
  panes.forEach((p, idx) => {
    p.el.classList.toggle('focused', idx === focusedPane && panes.length > 1);
  });
}

function layoutPanes() {
  const n = panes.length;
  let cols = Math.ceil(Math.sqrt(n));
  let rows = Math.ceil(n / cols);
  if (layoutBias === 'h') { const t = cols; cols = rows; rows = t; }
  while (cols * rows < n) cols++;
  $panes.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
  $panes.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
  panes.forEach((p) => { p.el.style.gridColumn = ''; });
  const r = n % cols;
  if (n > cols && r !== 0) {
    panes[n - 1].el.style.gridColumn = 'span ' + (cols - r + 1);
  }
  $btnUnsplit.classList.toggle('hidden', n < 2);
  refitVisible();
}

function parkSession(id) {
  const s = sessions.get(id);
  if (s) {
    s.el.classList.remove('visible');
    $park.appendChild(s.el);
  }
}

function showInPane(id, paneIdx) {
  const s = sessions.get(id);
  if (!s) return;
  if (paneIdx === undefined || paneIdx === null) paneIdx = focusedPane;
  const already = panes.findIndex((p) => p.sessionId === id);
  if (already >= 0 && already !== paneIdx) {
    setFocusedPane(already);
    s.term.focus();
    renderTabs();
    return;
  }
  const pane = panes[paneIdx];
  if (!pane) return;
  if (pane.sessionId && pane.sessionId !== id) parkSession(pane.sessionId);
  pane.sessionId = id;
  pane.el.appendChild(s.el);
  s.el.classList.add('visible');
  setFocusedPane(paneIdx);
  requestAnimationFrame(() => {
    try { s.fit.fit(); } catch (_) {}
    s.term.focus();
  });
  renderTabs();
  saveState();
}

async function addPane(bias) {
  if (panes.length >= MAX_PANES || order.length === 0) return;
  if (bias) layoutBias = bias;
  const active = sessions.get(currentSessionId());
  const shell = active ? active.shell : DEFAULT_SHELL;
  const p = { el: newPaneEl(), sessionId: null };
  panes.push(p);
  $panes.appendChild(p.el);
  layoutPanes();
  const idx = panes.length - 1;
  setFocusedPane(idx);
  await createTerminal(shell, { paneIdx: idx });
}

function closePane(idx) {
  if (panes.length <= 1) return;
  const p = panes[idx];
  if (!p) return;
  if (p.sessionId) parkSession(p.sessionId);
  p.el.remove();
  panes.splice(idx, 1);
  layoutPanes();
  setFocusedPane(Math.min(idx, panes.length - 1));
  renderTabs();
  saveState();
  focusActive();
}

function unsplitAll() {
  if (panes.length <= 1) return;
  const keep = currentSessionId();
  for (const p of panes) {
    if (p.sessionId !== keep || keep === null) {
      if (p.sessionId) parkSession(p.sessionId);
      p.el.remove();
    }
  }
  panes = panes.filter((p) => p.sessionId === keep && keep !== null);
  if (panes.length === 0) {
    const p = { el: newPaneEl(), sessionId: null };
    panes.push(p);
    $panes.appendChild(p.el);
    if (keep) showInPane(keep, 0);
  }
  focusedPane = 0;
  layoutPanes();
  setFocusedPane(0);
  renderTabs();
  saveState();
  focusActive();
}

async function createTerminal(shell, opts = {}) {
  const id = makeId();
  const el = document.createElement('div');
  el.className = 'term-holder';
  el.dataset.id = id;

  const term = new Terminal({
    fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace',
    fontSize: 14,
    lineHeight: 1.15,
    cursorBlink: true,
    scrollback: 8000,
    windowsMode: IS_WIN,
    theme: XTERM_THEMES[theme]
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  try { term.loadAddon(new WebLinksAddon.WebLinksAddon()); } catch (_) {}

  const s = {
    id, term, fit, el, shell,
    title: opts.title || defaultTitle(shell),
    custom: !!opts.custom,
    closed: false
  };
  sessions.set(id, s);
  order.push(id);

  term.onData((data) => window.termAPI.write(id, data));
  term.onResize(({ cols, rows }) => window.termAPI.resize(id, cols, rows));
  term.onTitleChange((t) => {
    if (!s.custom && t && t.trim()) {
      s.title = t.trim();
      renderTabs();
      saveState();
    }
  });

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    if (isAppShortcut(e)) return false;
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') { copySelection(term); return false; }
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyV') { pasteInto(term); return false; }
    if (e.ctrlKey && !e.shiftKey && e.code === 'KeyC' && term.hasSelection()) {
      copySelection(term);
      return false;
    }
    return true;
  });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (term.hasSelection()) copySelection(term);
    else pasteInto(term);
  });

  $park.appendChild(el);
  term.open(el);

  if (!opts.background) {
    showInPane(id, opts.paneIdx !== undefined ? opts.paneIdx : focusedPane);
  }

  requestAnimationFrame(async () => {
    try { fit.fit(); } catch (_) {}
    const res = await window.termAPI.create({
      id, shellKind: shell, cols: term.cols, rows: term.rows,
      cwd: opts.cwd, command: opts.command
    });
    if (!res || !res.ok) {
      term.write('\x1b[31m No se pudo iniciar el shell (' + shell + ').\r\n ' +
        ((res && res.error) || 'Error desconocido') + '\x1b[0m\r\n');
    }
    if (!opts.background) term.focus();
  });

  renderTabs();
  updateWelcome();
  saveState();
  return id;
}

function closeTerminal(id, { fromExit = false } = {}) {
  const s = sessions.get(id);
  if (!s || s.closed) return;
  s.closed = true;

  if (!fromExit) window.termAPI.kill(id);

  const idx = order.indexOf(id);
  order = order.filter((x) => x !== id);

  const paneIdx = panes.findIndex((p) => p.sessionId === id);
  if (paneIdx >= 0) {
    panes[paneIdx].sessionId = null;
    if (panes.length > 1) {
      closePane(paneIdx);
    } else if (order.length > 0) {
      const inPane = (x) => panes.some((p) => p.sessionId === x);
      const fallback = order[Math.min(idx, order.length - 1)];
      const candidate = fallback && !inPane(fallback) ? fallback : order.find((x) => !inPane(x));
      if (candidate) showInPane(candidate, paneIdx);
    }
  }

  try { s.term.dispose(); } catch (_) {}
  s.el.remove();
  sessions.delete(id);

  renderTabs();
  updateWelcome();
  saveState();
  focusActive();
}

function renderTabs() {
  $tabs.innerHTML = '';
  const activeId = currentSessionId();
  const visibleIds = new Set(panes.map((p) => p.sessionId).filter(Boolean));
  for (const id of order) {
    const s = sessions.get(id);
    if (!s) continue;

    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.id = id;
    tab.draggable = renamingId !== id;
    if (id === activeId) tab.classList.add('active');
    else if (visibleIds.has(id)) tab.classList.add('visible-elsewhere');

    const badge = document.createElement('span');
    badge.className = 'shell-badge' + (s.shell === 'powershell' ? ' ps' : '');
    badge.textContent = s.shell === 'powershell' ? 'PS' : '>_';
    tab.appendChild(badge);

    if (renamingId === id) {
      const input = document.createElement('input');
      input.className = 'rename';
      input.value = s.title;
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commitRename(id, input.value);
        else if (e.key === 'Escape') { renamingId = null; renderTabs(); focusActive(); }
      });
      input.addEventListener('blur', () => {
        if (renamingId === id) commitRename(id, input.value);
      });
      tab.appendChild(input);
      requestAnimationFrame(() => { input.focus(); input.select(); });
    } else {
      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = s.title;
      title.title = s.title;
      tab.appendChild(title);

      const close = document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '×';
      close.title = 'Cerrar (Ctrl+W)';
      close.addEventListener('click', (e) => { e.stopPropagation(); closeTerminal(id); });
      tab.appendChild(close);

      tab.addEventListener('click', () => showInPane(id, focusedPane));
      tab.addEventListener('dblclick', (e) => {
        if (e.target === close) return;
        startRename(id);
      });
      tab.addEventListener('auxclick', (e) => { if (e.button === 1) closeTerminal(id); });
    }

    tab.addEventListener('dragstart', (e) => {
      draggingId = id;
      tab.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', id); } catch (_) {}
    });
    tab.addEventListener('dragend', () => {
      draggingId = null;
      renderTabs();
      saveState();
    });
    tab.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggingId || draggingId === id) return;
      const from = order.indexOf(draggingId);
      const to = order.indexOf(id);
      if (from < 0 || to < 0) return;
      const rect = tab.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      let target = after ? to + 1 : to;
      if (from < target) target--;
      if (target !== from) {
        order.splice(from, 1);
        order.splice(target, 0, draggingId);
        renderTabs();
      }
    });

    $tabs.appendChild(tab);
  }

  const activeTab = $tabs.querySelector('.tab.active');
  if (activeTab) activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function startRename(id) {
  renamingId = id;
  renderTabs();
}

function commitRename(id, value) {
  const s = sessions.get(id);
  renamingId = null;
  if (s) {
    const v = value.trim();
    if (v) { s.title = v; s.custom = true; }
    saveState();
  }
  renderTabs();
  focusActive();
}

function updateWelcome() {
  $welcome.classList.toggle('hidden', order.length > 0);
}

function focusActive() {
  const s = sessions.get(currentSessionId());
  if (s && renamingId === null) s.term.focus();
}

function cycle(delta) {
  if (order.length < 2) return;
  const current = currentSessionId();
  const idx = order.indexOf(current);
  const next = order[(idx + delta + order.length) % order.length];
  showInPane(next, focusedPane);
}

function refitVisible() {
  requestAnimationFrame(() => {
    for (const p of panes) {
      if (!p.sessionId) continue;
      const s = sessions.get(p.sessionId);
      if (s) { try { s.fit.fit(); } catch (_) {} }
    }
  });
}

function copySelection(term) {
  const sel = term.getSelection();
  if (sel) navigator.clipboard.writeText(sel).catch(() => {});
  term.clearSelection();
}

function pasteInto(term) {
  navigator.clipboard.readText().then((t) => { if (t) term.paste(t); }).catch(() => {});
}

function isAppShortcut(e) {
  const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
  if (!ctrl && e.key !== 'F2' && e.key !== 'Escape') return false;
  if (ctrl && e.code === 'KeyT') return true;
  if (ctrl && e.code === 'KeyW') return true;
  if (ctrl && e.code === 'Tab') return true;
  if (ctrl && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) return true;
  if (ctrl && e.shiftKey && (e.code === 'KeyE' || e.code === 'KeyO')) return true;
  if (e.key === 'F2') return true;
  return false;
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$helpOverlay.classList.contains('hidden')) {
    $helpOverlay.classList.add('hidden');
    focusActive();
    e.preventDefault();
    return;
  }
  if (!isAppShortcut(e)) return;
  e.preventDefault();
  e.stopPropagation();

  const ctrl = e.ctrlKey;
  if (ctrl && e.code === 'KeyT') {
    createTerminal(e.shiftKey ? 'powershell' : DEFAULT_SHELL);
  } else if (ctrl && e.code === 'KeyW') {
    if (e.shiftKey) {
      closePane(focusedPane);
    } else {
      const id = currentSessionId();
      if (id) closeTerminal(id);
    }
  } else if (ctrl && e.code === 'Tab') {
    cycle(e.shiftKey ? -1 : 1);
  } else if (ctrl && /^Digit[1-9]$/.test(e.code)) {
    const n = parseInt(e.code.slice(5), 10) - 1;
    if (order[n]) showInPane(order[n], focusedPane);
  } else if (ctrl && e.shiftKey && e.code === 'KeyE') {
    addPane('v');
  } else if (ctrl && e.shiftKey && e.code === 'KeyO') {
    addPane('h');
  } else if (e.key === 'F2') {
    const id = currentSessionId();
    if (id) startRename(id);
  }
}, true);

function applyTheme(t) {
  theme = t;
  document.body.dataset.theme = t;
  for (const [, s] of sessions) s.term.options.theme = XTERM_THEMES[t];
  saveState();
}

document.getElementById('btn-new').addEventListener('click', (e) => {
  e.stopPropagation();
  $newMenu.classList.toggle('hidden');
});
$newMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-shell]');
  if (!btn) return;
  $newMenu.classList.add('hidden');
  createTerminal(btn.dataset.shell);
});
document.addEventListener('click', () => $newMenu.classList.add('hidden'));

document.getElementById('btn-split-v').addEventListener('click', () => addPane('v'));
document.getElementById('btn-split-h').addEventListener('click', () => addPane('h'));
$btnUnsplit.addEventListener('click', () => unsplitAll());
document.getElementById('btn-theme').addEventListener('click', () => {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
});
document.getElementById('btn-help').addEventListener('click', () => {
  $helpOverlay.classList.remove('hidden');
});
$helpOverlay.addEventListener('click', (e) => {
  if (e.target === $helpOverlay) { $helpOverlay.classList.add('hidden'); focusActive(); }
});
document.getElementById('welcome-cmd').addEventListener('click', () => createTerminal('cmd'));
document.getElementById('welcome-ps').addEventListener('click', () => createTerminal('powershell'));

document.getElementById('update-close').addEventListener('click', () => {
  $updateBanner.classList.add('hidden');
});
document.getElementById('update-download').addEventListener('click', () => {
  const url = $updateBanner.dataset.url;
  if (url) window.termAPI.openUrl(url);
});

window.termAPI.onUpdate(({ version, url }) => {
  document.getElementById('update-text').textContent =
    'Nueva versión v' + version + ' disponible';
  $updateBanner.dataset.url = url;
  $updateBanner.classList.remove('hidden');
});

window.termAPI.onData(({ id, data }) => {
  const s = sessions.get(id);
  if (s && !s.closed) s.term.write(data);
});

window.termAPI.onExit(({ id }) => {
  closeTerminal(id, { fromExit: true });
});

$tabs.addEventListener('wheel', (e) => {
  if (e.deltaY) {
    e.preventDefault();
    $tabs.scrollLeft += e.deltaY;
  }
}, { passive: false });

const resizeObserver = new ResizeObserver(() => refitVisible());
resizeObserver.observe($panes);
window.addEventListener('resize', refitVisible);

(async function init() {
  const p = { el: newPaneEl(), sessionId: null };
  panes.push(p);
  $panes.appendChild(p.el);
  layoutPanes();

  const state = await window.termAPI.loadState();
  if (state && state.theme) applyTheme(state.theme);
  else applyTheme('dark');

  const startup = await window.termAPI.loadStartup();
  if (startup) {
    for (const t of startup.tabs) {
      if (!t || typeof t !== 'object') continue;
      const shell = t.shell === 'powershell' ? 'powershell' : 'cmd';
      await createTerminal(shell, {
        title: t.title || undefined,
        custom: !!t.title,
        background: true,
        cwd: t.cwd || startup.cwd,
        command: t.command
      });
    }
    if (order.length > 0) {
      showInPane(order[0], 0);
      return;
    }
  }

  const tabs = (state && Array.isArray(state.tabs)) ? state.tabs : null;
  if (tabs && tabs.length > 0) {
    for (const t of tabs) {
      const shell = t.shell === 'powershell' ? 'powershell' : 'cmd';
      await createTerminal(shell, {
        title: t.title,
        custom: !!t.custom,
        background: true
      });
    }
    const idx = Math.min(Math.max(0, state.activeIndex || 0), order.length - 1);
    showInPane(order[idx], 0);
  } else {
    await createTerminal(DEFAULT_SHELL);
  }
})();
