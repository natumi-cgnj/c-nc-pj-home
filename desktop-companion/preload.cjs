'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('JaneDesktop', Object.freeze({
  manifest: () => ipcRenderer.invoke('jane:manifest'),
  artwork: id => ipcRenderer.invoke('jane:artwork', id),
  frame: value => ipcRenderer.send('jane:frame', value),
  openProgram: () => ipcRenderer.send('jane:open'),
  login: () => ipcRenderer.send('jane:login'),
  reconnect: () => ipcRenderer.send('jane:reconnect'),
  menu: () => ipcRenderer.send('jane:menu'),
  hit: opaque => ipcRenderer.send('jane:hit', opaque === true),
  drag: phase => ipcRenderer.send('jane:drag', phase),
  onRefresh: callback => {
    const listener = () => callback();
    ipcRenderer.on('jane:refresh', listener);
    return () => ipcRenderer.removeListener('jane:refresh', listener);
  }
}));
