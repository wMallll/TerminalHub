'use strict';

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const REPO_URL = 'https://github.com/wMallll/TerminalHub';

const pty = require('@lydell/node-pty');

let win = null;
const sessions = new Map();

const stateFile = () => path.join(app.getPath('userData'), 'terminalhub-state.json');

function resolveShell(kind) {
  if (process.platform === 'win32') {
    if (kind === 'powershell') {
      return { file: 'powershell.exe', args: ['-NoLogo'] };
    }
    return { file: process.env.ComSpec || 'cmd.exe', args: [] };
  }
  return { file: process.env.SHELL || 'bash', args: [] };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: '#14141b',
    title: 'TerminalHub',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) { try { shell.openExternal(url); } catch (_) {} }
    return { action: 'deny' };
  });

  win.on('closed', () => { win = null; });
}

function isNewerVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function checkForUpdates() {
  const req = https.get({
    hostname: 'api.github.com',
    path: '/repos/wMallll/TerminalHub/releases/latest',
    headers: { 'User-Agent': 'TerminalHub', 'Accept': 'application/vnd.github+json' }
  }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
      try {
        const info = JSON.parse(body);
        const latest = String(info.tag_name || '').replace(/^v/, '');
        if (latest && isNewerVersion(latest, app.getVersion()) && win && !win.isDestroyed()) {
          win.webContents.send('update-available', {
            version: latest,
            url: info.html_url || (REPO_URL + '/releases/latest')
          });
        }
      } catch (_) {}
    });
  });
  req.on('error', () => {});
  req.setTimeout(10000, () => req.destroy());
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();
  setTimeout(checkForUpdates, 3000);
});

app.on('window-all-closed', () => {
  for (const [, p] of sessions) { try { p.kill(); } catch (_) {} }
  sessions.clear();
  app.quit();
});

ipcMain.handle('pty-create', (_e, { id, shellKind, cols, rows }) => {
  const { file, args } = resolveShell(shellKind);
  try {
    const p = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: Math.max(2, cols || 80),
      rows: Math.max(2, rows || 24),
      cwd: process.env.USERPROFILE || process.env.HOME || process.cwd(),
      env: process.env
    });
    sessions.set(id, p);
    p.onData((data) => {
      if (win && !win.isDestroyed()) win.webContents.send('pty-data', { id, data });
    });
    p.onExit(({ exitCode }) => {
      sessions.delete(id);
      if (win && !win.isDestroyed()) win.webContents.send('pty-exit', { id, exitCode });
    });
    return { ok: true, pid: p.pid };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.on('pty-write', (_e, { id, data }) => {
  const p = sessions.get(id);
  if (p) { try { p.write(data); } catch (_) {} }
});

ipcMain.on('pty-resize', (_e, { id, cols, rows }) => {
  const p = sessions.get(id);
  if (p && cols > 1 && rows > 1) { try { p.resize(cols, rows); } catch (_) {} }
});

ipcMain.on('pty-kill', (_e, { id }) => {
  const p = sessions.get(id);
  if (p) {
    try { p.kill(); } catch (_) {}
    sessions.delete(id);
  }
});

ipcMain.on('open-url', (_e, url) => {
  if (typeof url === 'string' && url.startsWith(REPO_URL)) {
    try { shell.openExternal(url); } catch (_) {}
  }
});

ipcMain.handle('state-load', () => {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch (_) {
    return null;
  }
});

ipcMain.on('state-save', (_e, state) => {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
});
