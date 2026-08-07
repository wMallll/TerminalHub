'use strict';

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile, spawn } = require('child_process');

const REPO_URL = 'https://github.com/wMallll/TerminalHub';

const pty = require('@lydell/node-pty');

let win = null;
const sessions = new Map();

const stateFile = () => path.join(app.getPath('userData'), 'terminalhub-state.json');

function resolveShell(kind, command) {
  if (process.platform === 'win32') {
    if (kind === 'powershell') {
      return {
        file: 'powershell.exe',
        args: command ? ['-NoLogo', '-NoExit', '-Command', command] : ['-NoLogo']
      };
    }
    return {
      file: process.env.ComSpec || 'cmd.exe',
      args: command ? ['/k', command] : []
    };
  }
  const sh = process.env.SHELL || 'bash';
  return { file: sh, args: command ? ['-c', command + '; exec ' + sh] : [] };
}

function loadStartupConfig() {
  const candidates = [
    path.join(path.dirname(app.getPath('exe')), 'startup.json'),
    path.join(app.getPath('userData'), 'startup.json')
  ];
  for (const f of candidates) {
    try {
      const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (cfg && Array.isArray(cfg.tabs) && cfg.tabs.length > 0) return cfg;
    } catch (_) {}
  }
  return null;
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

let pendingUpdate = null;

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
          const asset = (info.assets || []).find((a) => /win64-portable\.zip$/i.test(a.name || ''));
          pendingUpdate = {
            version: latest,
            zipUrl: asset ? asset.browser_download_url : null,
            url: info.html_url || (REPO_URL + '/releases/latest')
          };
          win.webContents.send('update-available', {
            version: latest,
            url: pendingUpdate.url,
            canAuto: !!(pendingUpdate.zipUrl && process.platform === 'win32')
          });
        }
      } catch (_) {}
    });
  });
  req.on('error', () => {});
  req.setTimeout(10000, () => req.destroy());
}

function download(url, dest, onProgress, redirects) {
  return new Promise((resolve, reject) => {
    if ((redirects || 0) > 5) return reject(new Error('demasiadas redirecciones'));
    let u;
    try { u = new URL(url); } catch (err) { return reject(err); }
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': 'TerminalHub', 'Accept': 'application/octet-stream' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, dest, onProgress, (redirects || 0) + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0;
      let lastPct = -1;
      const out = fs.createWriteStream(dest);
      res.on('data', (chunk) => {
        got += chunk.length;
        if (total > 0) {
          const pct = Math.floor((got * 100) / total);
          if (pct !== lastPct) { lastPct = pct; onProgress(pct); }
        }
      });
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('tiempo de espera agotado')));
  });
}

async function installUpdate() {
  const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
  if (!pendingUpdate || !pendingUpdate.zipUrl || process.platform !== 'win32') {
    send('update-error', { message: 'actualización automática no disponible' });
    return;
  }
  try {
    const tmp = path.join(os.tmpdir(), 'TerminalHub-update');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const zipPath = path.join(tmp, 'update.zip');
    await download(pendingUpdate.zipUrl, zipPath, (pct) => send('update-progress', { phase: 'download', percent: pct }));

    send('update-progress', { phase: 'extract' });
    const extractDir = path.join(tmp, 'extracted');
    await new Promise((resolve, reject) => {
      execFile('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        "Expand-Archive -LiteralPath '" + zipPath + "' -DestinationPath '" + extractDir + "' -Force"
      ], { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
    });

    let src = extractDir;
    const entries = fs.readdirSync(extractDir);
    if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
      src = path.join(extractDir, entries[0]);
    }
    if (!fs.existsSync(path.join(src, 'TerminalHub.exe'))) {
      throw new Error('el paquete descargado no es válido');
    }

    const appDir = path.dirname(app.getPath('exe'));
    const bat = path.join(tmp, 'apply-update.bat');
    const logPath = path.join(tmp, 'update.log');
    fs.writeFileSync(bat, [
      '@echo off',
      'title TerminalHub - actualizacion',
      'echo Cerrando TerminalHub...',
      'set tries=0',
      ':wait',
      'ping -n 2 127.0.0.1 >nul',
      'set /a tries+=1',
      'tasklist /FI "IMAGENAME eq TerminalHub.exe" /NH 2>nul | findstr /I "TerminalHub.exe" >nul',
      'if errorlevel 1 goto ready',
      'if %tries% LSS 15 goto wait',
      'echo Forzando el cierre de TerminalHub...',
      'taskkill /F /IM TerminalHub.exe /T >nul 2>&1',
      ':ready',
      'ping -n 3 127.0.0.1 >nul',
      'echo Instalando la actualizacion...',
      'robocopy "' + src + '" "' + appDir + '" /e /r:20 /w:1 >"' + logPath + '" 2>&1',
      'echo Listo. Abriendo TerminalHub...',
      'start "" "' + appDir + '\\TerminalHub.exe"',
      'rd /s /q "' + extractDir + '" 2>nul',
      'del /q "' + zipPath + '" 2>nul',
      '(goto) 2>nul & del "%~f0"'
    ].join('\r\n'), 'utf8');

    send('update-progress', { phase: 'install' });
    for (const [, p] of sessions) { try { p.kill(); } catch (_) {} }
    sessions.clear();
    const child = spawn('cmd.exe', ['/c', bat], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    setTimeout(() => { try { app.exit(0); } catch (_) { app.quit(); } }, 400);
  } catch (err) {
    send('update-error', { message: String((err && err.message) || err) });
  }
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();
  setTimeout(checkForUpdates, 3000);
});

app.on('window-all-closed', () => {
  for (const [, p] of sessions) { try { p.kill(); } catch (_) {} }
  sessions.clear();
  app.exit(0);
});

ipcMain.handle('pty-create', (_e, { id, shellKind, cols, rows, cwd, command }) => {
  const { file, args } = resolveShell(shellKind, typeof command === 'string' && command.trim() ? command.trim() : null);
  let workDir = process.env.USERPROFILE || process.env.HOME || process.cwd();
  if (typeof cwd === 'string' && cwd.trim()) {
    try { if (fs.statSync(cwd).isDirectory()) workDir = cwd; } catch (_) {}
  }
  try {
    const p = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: Math.max(2, cols || 80),
      rows: Math.max(2, rows || 24),
      cwd: workDir,
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

ipcMain.on('update-install', () => { installUpdate(); });

ipcMain.on('open-url', (_e, url) => {
  if (typeof url === 'string' && url.startsWith(REPO_URL)) {
    try { shell.openExternal(url); } catch (_) {}
  }
});

ipcMain.handle('startup-load', () => loadStartupConfig());

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
