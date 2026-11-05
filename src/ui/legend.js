// Colour key for the selected overlay: dark is low, bright is high.
import { DEFAULTS } from '../sim/config.js';
import { OVERLAYS, WATER } from './view.js';

const NOTES = {
  light: `Unshaded surface: ${DEFAULTS.light}`,
  vital: `World starts at ${DEFAULTS.vital0} per square`,
  spent: `World starts at ${DEFAULTS.spent0} per square`,
  detritus: 'Dead matter, sinking. The brown floor band is sediment.',
};

const rgb = (c) => `rgb(${c.join(',')})`;

export function renderLegend(el, overlay) {
  const style = OVERLAYS[overlay];
  if (!style) {
    el.innerHTML = '';
    return;
  }
  const mid = style.max * 0.5 ** (1 / style.gamma); // value drawn halfway along the bar
  el.innerHTML = `
    <div class="legend-bar" style="background: linear-gradient(to right, ${rgb(WATER)}, ${rgb(style.tint)})"></div>
    <div class="legend-scale"><span>0</span><span>${mid}</span><span>${style.max}+</span></div>
    <div class="legend-note">Dark = low, bright = high. Sky uses the same scale.<br>${NOTES[overlay]}</div>`;
}
