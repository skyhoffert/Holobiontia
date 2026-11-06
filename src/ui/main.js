import { DEFAULTS, KNOBS, SAVE_VERSION } from '../sim/config.js';
import { createGraph } from './graph.js';
import { createView } from './view.js';
import { renderInspector } from './inspector.js';
import { renderLegend } from './legend.js';
import { findOrganisms, membersOf } from './organisms.js';
import { initResize } from './resize.js';
import { renderSpecies } from './species.js';

const $ = (id) => document.getElementById(id);
const sum = (values) => values.reduce((a, b) => a + b, 0);

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
  if (data.saved) {
    downloadSave(data);
    return;
  }
  snap = data;
  snap.organisms = findOrganisms(snap);
  graph.push(snap);
  $('play').textContent = snap.playing ? 'Pause' : 'Play';
  const status = snap.n === 0 ? ' · EXTINCT' : '';
  const drift = (snap.matter - snap.matter0).toExponential(1);
  const air = `air vital ${snap.air.vital.toFixed(0)}, spent ${snap.air.spent.toFixed(0)}`;
  const dead = `detritus ${sum(snap.fields.detritus).toFixed(0)}, sediment ${sum(snap.sediment).toFixed(0)}`;
  $('largest').textContent = `Largest: ${snap.organisms.largest}`;
  $('stats').textContent = `tick ${snap.tick} · cells ${snap.n} · organisms ${snap.organisms.count} · ${air} · ${dead} · matter drift ${drift}${status}`;
  renderInspector($('inspector'), snap, selectedId);
  renderSpecies($('species'), snap);
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

function downloadSave({ saved, seed, tick }) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([saved], { type: 'application/json' }));
  link.download = `holobiontia-seed${seed}-tick${tick}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

function flash(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 1500);
}

async function loadSave(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.version !== SAVE_VERSION) throw new Error(`unsupported save version ${data.version}`);
    for (const { key } of KNOBS) knobSetters[key](data.cfg[key] ?? DEFAULTS[key]);
    $('seed').value = data.cfg.seed;
    selectedId = null;
    graph.clear();
    send('load', { data });
  } catch (err) {
    console.error(err);
    flash($('load'), 'Load failed');
  }
}

const knobValues = { ...DEFAULTS };
const knobSetters = {}; // show a value without sending it to the sim

function settingsText() {
  const changed = KNOBS.filter(({ key }) => knobValues[key] !== DEFAULTS[key]);
  const unchanged = KNOBS.filter(({ key }) => knobValues[key] === DEFAULTS[key]);
  return [
    `seed: ${$('seed').value}, tick: ${snap?.tick ?? 0}, cells: ${snap?.n ?? 0}`,
    '',
    'Changed:',
    ...(changed.length ? changed.map(({ key }) => `${key}: ${knobValues[key]} (default ${DEFAULTS[key]})`) : ['none']),
    '',
    'Unchanged:',
    ...unchanged.map(({ key }) => `${key}: ${knobValues[key]}`),
  ].join('\n');
}

async function copySettings() {
  try {
    await navigator.clipboard.writeText(settingsText());
    flash($('copy-settings'), 'Copied');
  } catch {
    flash($('copy-settings'), 'Copy failed');
  }
}

function buildKnobs() {
  for (const { key, label, min, max, step, hint, hardMin = 0, hardMax = Infinity } of KNOBS) {
    const row = document.createElement('label');
    row.className = 'knob';
    row.innerHTML = `${label} <span class="knob-help">?</span> <input class="knob-num" type="number" step="${step}"><input type="range" min="${min}" max="${max}" step="${step}"><small class="knob-hint" hidden></small>`;
    const slider = row.querySelector('[type=range]');
    const num = row.querySelector('.knob-num');
    const help = row.querySelector('.knob-help');
    const text = row.querySelector('.knob-hint');
    help.title = hint;
    text.textContent = hint;
    help.onclick = (e) => {
      e.preventDefault(); // stay out of the label's click-to-focus
      text.hidden = !text.hidden;
    };
    const show = (value) => {
      slider.min = Math.min(Number(slider.min), value); // typed values stretch the slider's range
      slider.max = Math.max(Number(slider.max), value);
      slider.value = value;
      num.value = value;
    };
    const apply = (value) => {
      const safe = Math.min(hardMax, Math.max(hardMin, value));
      show(safe);
      knobValues[key] = safe;
      send('set', { key, value: safe });
    };
    slider.oninput = () => apply(Number(slider.value));
    num.onchange = () => {
      if (Number.isNaN(num.valueAsNumber)) show(knobValues[key]); // emptied or invalid: keep the current value
      else apply(num.valueAsNumber);
    };
    row.ondblclick = (e) => {
      if (e.target !== row) return; // only the name, not the inputs or ?
      slider.min = min;
      slider.max = max;
      apply(DEFAULTS[key]);
    };
    knobSetters[key] = (value) => {
      show(value);
      knobValues[key] = value;
    };
    show(DEFAULTS[key]);
    $('knobs').append(row);
  }
}

$('copy-settings').onclick = copySettings;
$('save').onclick = () => send('save');
$('load').onclick = () => $('load-file').click();
$('load-file').onchange = (e) => {
  if (e.target.files[0]) loadSave(e.target.files[0]);
  e.target.value = ''; // lets the same file load again
};
$('play').onclick = togglePlay;
$('step').onclick = () => send('step');
$('speed').oninput = setSpeed;
$('overlay').onchange = (e) => {
  overlay = e.target.value;
  renderLegend($('legend'), overlay);
};
$('largest').onclick = () => {
  if (!snap?.n) return;
  const members = membersOf(snap.organisms, snap.organisms.largestRoot);
  selectedId = snap.cells.id[view.focus(snap, members)];
  renderInspector($('inspector'), snap, selectedId);
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

initResize();
buildKnobs();
setSpeed();
renderLegend($('legend'), overlay);
