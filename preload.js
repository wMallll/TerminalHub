'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('termAPI', {
  create: (opts) => ipcRenderer.invoke('pty-create', opts),
  write: (id, data) => ipcRenderer.send('pty-write', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send('pty-resize', { id, cols, rows }),
  kill: (id) => ipcRenderer.send('pty-kill', { id }),
  onData: (cb) => ipcRenderer.on('pty-data', (_e, msg) => cb(msg)),
  onExit: (cb) => ipcRenderer.on('pty-exit', (_e, msg) => cb(msg)),
  loadStartup: () => ipcRenderer.invoke('startup-load'),
  loadState: () => ipcRenderer.invoke('state-load'),
  saveState: (state) => ipcRenderer.send('state-save', state),
  onUpdate: (cb) => ipcRenderer.on('update-available', (_e, msg) => cb(msg)),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_e, msg) => cb(msg)),
  onUpdateError: (cb) => ipcRenderer.on('update-error', (_e, msg) => cb(msg)),
  installUpdate: () => ipcRenderer.send('update-install'),
  openUrl: (url) => ipcRenderer.send('open-url', url),
  platform: process.platform
});
