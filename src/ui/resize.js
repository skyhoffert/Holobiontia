// Drag handles between panes. Sizes live in CSS variables on the page grid.
const MIN_PANEL = 100; // CSS px
const MIN_BOTTOM = 80;
const MIN_WORLD_W = 240;
const MIN_WORLD_H = 150;
const GRAPH_SHARE = [15, 85]; // percent of the bottom pane

const $ = (id) => document.getElementById(id);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const setVar = (name, value) => document.documentElement.style.setProperty(name, value);

function drag(handle, onMove) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (handle.hasPointerCapture(e.pointerId)) onMove(e);
  });
}

export function initResize() {
  drag($('resize-left'), (e) => {
    const max = innerWidth - $('right').offsetWidth - MIN_WORLD_W;
    setVar('--left-w', `${clamp(e.clientX, MIN_PANEL, max)}px`);
  });
  drag($('resize-right'), (e) => {
    const max = innerWidth - $('left').offsetWidth - MIN_WORLD_W;
    setVar('--right-w', `${clamp(innerWidth - e.clientX, MIN_PANEL, max)}px`);
  });
  drag($('resize-bottom'), (e) => {
    const max = innerHeight - $('top').offsetHeight - MIN_WORLD_H;
    setVar('--bottom-h', `${clamp(innerHeight - e.clientY, MIN_BOTTOM, max)}px`);
  });
  drag($('resize-graph'), (e) => {
    const { left, width } = $('bottom').getBoundingClientRect();
    setVar('--graph-w', `${clamp(((e.clientX - left) / width) * 100, ...GRAPH_SHARE)}%`);
  });
}
