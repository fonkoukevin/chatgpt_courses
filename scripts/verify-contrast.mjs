import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib/runtime.mjs';

const source = readFileSync(join(root, 'references/design-tokens.css'), 'utf8');
const tokens = Object.fromEntries([...source.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map((match) => [match[1], match[2]]));
function luminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) throw new Error('Token de couleur RGB manquant.');
  const rgb = hex.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
// Actual opaque combinations used by the primitives and layouts. Decorative
// separators and disabled controls are not treated as readable active controls.
const pairs = [
  ['foreground', 'background', 4.5], ['foreground', 'surface-subtle', 4.5],
  ['muted-foreground', 'surface', 4.5], ['muted-foreground', 'surface-subtle', 4.5],
  ['muted-foreground', 'surface-hover', 4.5], ['background', 'brand', 4.5],
  ['background', 'brand-hover', 4.5], ['brand', 'brand-soft', 4.5],
  ['link', 'surface', 4.5], ['link', 'surface-subtle', 4.5],
  ['success', 'success-soft', 4.5], ['warning', 'warning-soft', 4.5],
  ['danger', 'danger-soft', 4.5], ['background', 'danger', 4.5],
  ['control-border', 'surface', 3], ['control-border', 'surface-subtle', 3],
  ['focus', 'surface', 3], ['focus', 'surface-subtle', 3], ['focus', 'brand-soft', 3],
];
const measurements = pairs.map(([foreground, background, minimum]) => {
  const a = luminance(tokens[foreground]); const b = luminance(tokens[background]);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return { foreground, background, colors: [tokens[foreground], tokens[background]], ratio: Number(ratio.toFixed(3)), minimum, passed: ratio >= minimum };
});
writeFileSync(join(root, 'docs/evidence/P02-contrast.json'), JSON.stringify({
  measuredAt: new Date().toISOString(), method: 'WCAG 2.2 relative luminance, sRGB, opaque colors',
  reference: 'https://www.w3.org/TR/WCAG22/#contrast-minimum', measurements,
}, null, 2) + '\n');
for (const result of measurements) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.foreground}/${result.background}: ${result.ratio}:1 (minimum ${result.minimum}:1)`);
if (measurements.some((result) => !result.passed)) throw new Error('Contraste insuffisant : voir docs/evidence/P02-contrast.json.');
