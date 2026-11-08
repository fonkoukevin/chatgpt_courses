import { defineConfig } from '@playwright/test';
import { resolve, relative, isAbsolute } from 'node:path';

const origin = process.env.COURSES_BROWSER_ORIGIN;
const evidence = process.env.COURSES_BROWSER_EVIDENCE;
const results = process.env.COURSES_BROWSER_RESULTS;
const phase = process.env.COURSES_BROWSER_PHASE ?? 'P01';
if (!['P01', 'P02', 'P04'].includes(phase)) throw new Error('Phase navigateur inconnue.');
if (!origin || !evidence || !results || !process.env.COURSES_BROWSER_IPC || !process.env.COURSES_BROWSER_TOKEN) {
  throw new Error('Utiliser scripts/verify-browser.mjs pour réserver les ports et superviser les processus.');
}
const url = new URL(origin);
if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
  throw new Error('La recette navigateur doit cibler une origine HTTP de boucle locale.');
}
for (const [base, path] of [[resolve(`docs/evidence/${phase}-browser`), evidence], [resolve('.runtime'), results]]) {
  const child = relative(base, resolve(path));
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Chemin de preuve hors du dossier réservé.');
}

export default defineConfig({
  testDir: './tests/browser',
  testMatch: phase === 'P01' ? '**/foundations.spec.ts' : phase === 'P02' ? '**/design-system.spec.ts' : '**/identity.spec.ts',
  fullyParallel: false,
  workers: 1, // The outage scenario owns the dedicated API process.
  retries: 0,
  timeout: 120_000,
  globalTimeout: 600_000,
  expect: { timeout: 10_000 },
  outputDir: results,
  reporter: [['list'], ['json', { outputFile: resolve(evidence, 'results.json') }]],
  use: {
    baseURL: origin,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
    serviceWorkers: 'block',
  },
});
