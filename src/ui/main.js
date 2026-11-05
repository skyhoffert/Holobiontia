import { DEFAULTS, KNOBS } from '../sim/config.js';
import { createGraph } from './graph.js';
import { createView } from './view.js';
import { renderInspector } from './inspector.js';
import { renderLegend } from './legend.js';

const $ = (id) => document.getElementById(id);

const worker = new Worker(new URL('../sim/worker.js', import.meta.url), { type: 'module' });
const send = (type, data = {}) => worker.postMessage({ type, ...data });

const view = createView($('world-canvas'), (x, y) => {
  if (!snap) return;
  selectedId = view.pick(snap, x, y);
  renderInspector($('inspector'), snap, selectedId);
});
const graph = createGraph($('graph-canvas'));

let snap = null;
let selectedId = null;
let overlay = $('overlay').value;

worker.onmessage = ({ data }) => {
  snap = data;
  graph.push(snap);
  $('play').textContent = snap.playing ? 'Pause' : 'Play';
  const status = snap.n === 0 ? ' · EXTINCT' : '';
  const drift = (snap.matter - snap.matter0).toExponential(1);
  const air = `air vital ${snap.air.vital.toFixed(0)}, spent ${snap.air.spent.toFixed(0)}`;
  $('stats').textContent = `tick ${snap.tick} · pop ${snap.n} · ${air} · matter drift ${drift}${status}`;
  renderInspector($('inspector'), snap, selectedId);
};

function frame() {
  if (snap) view.draw(snap, overlay, selectedId);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function togglePlay() {
  send('play', { on: !snap?.playing });
}

function setSpeed() {
  $('speed-out').textContent = `${$('speed').value} t/s`;
  send('speed', { tps: Number($('speed').value) });
}

function buildKnobs() {
  for (const { key, label, min, max, step } of KNOBS) {
    const row = document.createElement('label');
    row.className = 'knob';
    row.innerHTML = `${label} <output></output><input type="range" min="${min}" max="${max}" step="${step}" value="${DEFAULTS[key]}">`;
    const input = row.querySelector('input');
    const out = row.querySelector('output');
    out.textContent = DEFAULTS[key];
    input.oninput = () => {
      out.textContent = input.value;
      send('set', { key, value: Number(input.value) });
    };
    $('knobs').append(row);
  }
}

$('play').onclick = togglePlay;
$('step').onclick = () => send('step');
$('speed').oninput = setSpeed;
$('overlay').onchange = (e) => {
  overlay = e.target.value;
  renderLegend($('legend'), overlay);
};
$('reset').onclick = () => {
  selectedId = null;
  graph.clear();
  send('reset', { seed: Number($('seed').value) });
};

addEventListener('keydown', (e) => {
  if (e.target.matches('input, select')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.key === '.') send('step');
});

buildKnobs();
setSpeed();
renderLegend($('legend'), overlay);
