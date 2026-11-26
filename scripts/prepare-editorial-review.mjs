import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = 'content/course-client-proposal/v1';
const sourceRoot = join(root, sourceDirectory);
const outputDirectory = '.runtime/course-editorial-review';
const owner = 'prepare-editorial-review-v1\n';
const locales = ['fr', 'en'];
const moduleKeys = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06'];
const resourceKeys = ['br01-tr01', 'scoping-table', 'prompt-method', 'proposal-template', 'assessment-grid-br01', 'commented-solution-br01', 'br02', 'commented-solution-br02', 'presentation-emails'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = path => path.replaceAll('\\', '/');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const requireValue = (value, code) => { if (!value) throw new Error(code); };
const contained = (base, target) => { const local = relative(base, target); return local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local); };
const lessonAnchor = (locale, key) => `lesson-${locale}-${key}`;
const resourceAnchor = (locale, key) => `resource-${locale}-${key}`;
const text = {
  fr: { name:'Français', lessons:'Six modules en français', resources:'Supports en français', objective:'Objectif', result:'Production attendue', prerequisites:'Prérequis', exercise:'Exercice', correction:'Afficher la correction éditoriale', quiz:'Quiz et barème', answer:'Afficher la bonne réponse et son explication', correct:'Bonne réponse', explanation:'Explication', points:'Points', source:'Source originale', supportLink:'Consulter les supports de cette langue', top:'Revenir au sommaire', sourceList:'Liste de la source', table:'Tableau de la ressource', noPrerequisite:'Aucun prérequis renseigné.' },
  en: { name:'English', lessons:'Six modules in English', resources:'Resources in English', objective:'Objective', result:'Expected work', prerequisites:'Prerequisites', exercise:'Exercise', correction:'Show the editorial answer', quiz:'Quiz and answer key', answer:'Show the correct answer and explanation', correct:'Correct answer', explanation:'Explanation', points:'Points', source:'Original source', supportLink:'Browse resources in this language', top:'Back to contents', sourceList:'Source list', table:'Resource table', noPrerequisite:'No prerequisite provided.' },
};

function readSource(path) {
  const target = realpathSync(join(sourceRoot, path));
  requireValue(contained(realpathSync(sourceRoot), target) && lstatSync(target).isFile(), 'SOURCE_OUTSIDE_EDITORIAL_DIRECTORY');
  const bytes = readFileSync(target);
  const value = new TextDecoder('utf-8', { fatal:true }).decode(bytes);
  return { bytes, value, path:slash(join(sourceDirectory, path)), sha256:sha(bytes) };
}

function hrefFor(target, locale) {
  const local = /^([a-z0-9-]+)\.md$/.exec(target);
  if (local && resourceKeys.includes(local[1])) return { href:'#' + resourceAnchor(locale, local[1]), external:false };
  try {
    const url = new URL(target);
    if (url.protocol === 'https:' && !url.username && !url.password) return { href:url.href, external:true };
  } catch { /* Unknown source links remain readable text, never active destinations. */ }
  return null;
}

function inline(value, locale) {
  const tokens = [];
  const token = html => { const key = `\u0000${tokens.length}\u0000`; tokens.push(html); return key; };
  let remaining = String(value).replace(/\u0000/g, '\uFFFD');
  remaining = remaining.replace(/`([^`\n]+)`/g, (_, code) => token(`<code>${escape(code)}</code>`));
  remaining = remaining.replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g, (_, label, target) => {
    const link = hrefFor(target, locale);
    return token(link ? `<a href="${escape(link.href)}"${link.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(label)}</a>` : `${escape(label)} <span class="source-link">(${escape(target)})</span>`);
  });
  remaining = escape(remaining).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>').replace(/\\\|/g, '|');
  return remaining.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
}

const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(value => value.trim());
const separator = line => cells(line).every(value => /^:?-{3,}:?$/.test(value));
function markdown(value, locale) {
  const lines = String(value).replace(/\r\n?/g, '\n').split('\n'), out = [];
  const startsBlock = index => /^\s*$|^#{1,6}\s|^```|^>\s?|^\s*[-*]\s|^\s*\d+[.)]\s|^\s*(?:---+|\*\*\*+)\s*$/.test(lines[index] ?? '') || Boolean(lines[index + 1]?.includes('|') && separator(lines[index + 1]));
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (/^```/.test(line)) {
      const code = []; index++;
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index++;
      out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`); continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { const level = Math.min(heading[1].length + 2, 6); out.push(`<h${level}>${inline(heading[2], locale)}</h${level}>`); index++; continue; }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { out.push('<hr>'); index++; continue; }
    if (line.includes('|') && index + 1 < lines.length && separator(lines[index + 1])) {
      const headers = cells(line), rows = []; index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(cells(lines[index++]));
      requireValue(rows.every(row => row.length === headers.length), 'INCONSISTENT_MARKDOWN_TABLE');
      out.push(`<div class="table-scroll" role="region" aria-label="${escape(text[locale].table)}" tabindex="0"><table><thead><tr>${headers.map(cell => `<th scope="col">${inline(cell, locale)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inline(cell, locale)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    const ordered = /^\s*\d+[.)]\s+/.test(line), unordered = /^\s*[-*]\s+/.test(line);
    if (ordered || unordered) {
      const pattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*]\s+(.+)$/, items = [];
      while (index < lines.length) { const match = pattern.exec(lines[index]); if (!match) break; items.push(inline(match[1], locale)); index++; }
      const tag = ordered ? 'ol' : 'ul'; out.push(`<${tag}>${items.map(item => `<li>${item}</li>`).join('')}</${tag}>`); continue;
    }
    if (/^>/.test(line)) {
      const quote = []; while (index < lines.length && /^>/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(quote.join('\n'), locale)}</blockquote>`); continue;
    }
    const paragraph = [line]; index++;
    while (index < lines.length && !startsBlock(index)) paragraph.push(lines[index++]);
    out.push(`<p>${inline(paragraph.join('\n'), locale)}</p>`);
  }
  return out.join('\n');
}

function blockMarkup(block, locale) {
  requireValue(block && typeof block.text === 'string', 'INVALID_LESSON_BLOCK');
  const content = inline(block.text, locale);
  if (block.type === 'HEADING') return `<h4>${content}</h4>`;
  if (block.type === 'PARAGRAPH') return `<p>${content}</p>`;
  if (block.type === 'CALLOUT') return `<aside class="callout">${content}</aside>`;
  if (block.type === 'CODE') return `<pre><code>${escape(block.text)}</code></pre>`;
  if (block.type === 'LIST') return `<ul>${block.text.split('\n').filter(value => value.trim()).map(value => `<li>${inline(value, locale)}</li>`).join('')}</ul>`;
  if (block.type === 'LINK') {
    const link = hrefFor(block.url, locale);
    requireValue(link, 'UNSUPPORTED_LESSON_LINK_DESTINATION');
    return `<p><a href="${escape(link.href)}"${link.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${content}</a></p>`;
  }
  throw new Error('UNSUPPORTED_LESSON_BLOCK_' + String(block.type).replace(/[^A-Z_]/g, ''));
}

function lessonMarkup(lesson) {
  const { data, source } = lesson, t = text[data.locale];
  return `<article id="${lessonAnchor(data.locale, data.key)}" lang="${data.locale}" class="review-item lesson">
<header><p class="eyebrow">${data.key.toUpperCase()} · ${escape(t.name)} · v1</p><h3>${escape(data.title)}</h3><p class="lead">${inline(data.summary, data.locale)}</p><p class="source-path">${escape(t.source)} : <code>${escape(source.path)}</code></p></header>
<dl class="outcomes"><dt>${t.objective}</dt><dd>${inline(data.objective, data.locale)}</dd><dt>${t.result}</dt><dd>${inline(data.expectedResult, data.locale)}</dd><dt>${t.prerequisites}</dt><dd>${data.prerequisites.length ? `<ul>${data.prerequisites.map(item=>`<li>${inline(item, data.locale)}</li>`).join('')}</ul>` : t.noPrerequisite}</dd></dl>
<div class="rich lesson-body">${data.blocks.map(block=>blockMarkup(block, data.locale)).join('\n')}</div>
<section class="exercise"><h4>${t.exercise}</h4><p>${inline(data.exercise.instructions, data.locale)}</p><details class="answer"><summary>${t.correction}</summary><div><p>${inline(data.exercise.correction, data.locale)}</p></div></details></section>
<section class="quiz"><h4>${t.quiz}</h4><ol>${data.quiz.map(question=>`<li class="question"><p><strong>${inline(question.prompt, data.locale)}</strong></p><ol type="A">${question.options.map(option=>`<li>${inline(option, data.locale)}</li>`).join('')}</ol><details class="answer"><summary>${t.answer}</summary><div><p><strong>${t.correct} :</strong> ${String.fromCharCode(65 + question.correctOption)} — ${inline(question.options[question.correctOption], data.locale)}</p><p><strong>${t.explanation} :</strong> ${inline(question.explanation, data.locale)}</p><p>${t.points} : ${escape(question.points)}</p><p class="source-path"><code>${escape(question.key)}</code></p></div></details></li>`).join('')}</ol></section>
<nav class="item-footer" aria-label="${escape(t.sourceList)}"><a href="#resources-${data.locale}">${t.supportLink}</a><a href="#contents">${t.top}</a><a href="#${lessonAnchor(data.locale === 'fr' ? 'en' : 'fr', data.key)}" lang="${data.locale === 'fr' ? 'en' : 'fr'}">${data.locale === 'fr' ? 'English' : 'Français'} · ${data.key.toUpperCase()}</a></nav></article>`;
}

const css = `:root{color-scheme:light;--ink:#202123;--muted:#60656c;--brand:#12345b;--line:#d6dae0;--soft:#f7f7f8;--warning:#855500}*{box-sizing:border-box}html{scroll-behavior:auto;scroll-padding-top:1rem}body{margin:0;background:#fff;color:var(--ink);font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:#244f85;text-underline-offset:.18em}a:hover{color:var(--brand)}a:focus-visible,summary:focus-visible,.table-scroll:focus-visible{outline:3px solid #275dad;outline-offset:4px}.skip{position:absolute;left:1rem;top:-8rem;padding:.6rem;background:#fff;z-index:5}.skip:focus{top:1rem}body>header,main,body>footer{max-width:1180px;margin:0 auto;padding:1.5rem}body>header{padding-top:2.5rem}h1,h2,h3,h4,h5,h6{line-height:1.22;letter-spacing:-.02em;overflow-wrap:anywhere}h1{font-size:clamp(2rem,4vw,3rem);max-width:28ch;margin:.5rem 0 1.25rem}h2{font-size:1.8rem;margin-top:3rem}h3{font-size:1.6rem;margin:.5rem 0}h4{font-size:1.2rem;margin:2rem 0 .8rem}p,li,dd{overflow-wrap:anywhere}.lead{font-size:1.1rem;color:var(--muted);max-width:76ch}.notice{padding:1rem 1.25rem;border:1px solid #d4b978;border-left:5px solid var(--warning);border-radius:.6rem;background:#fff6df;color:#603e00}.status{display:flex;flex-wrap:wrap;gap:.5rem;list-style:none;padding:0}.status li{font-size:.85rem;border:1px solid var(--line);background:var(--soft);padding:.35rem .65rem;border-radius:.4rem}.contents{margin-top:2rem;border:1px solid var(--line);border-radius:.8rem;padding:1rem 1.25rem;background:var(--soft)}.contents h2{margin:.1rem 0 1rem;font-size:1.35rem}.contents-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.5rem}.contents h3{font-size:1rem}.contents ol,.contents ul{padding-left:1.25rem}.contents a{display:inline-block;padding:.22rem 0}.resources-index{font-size:.9rem}.review-item{border-top:2px solid var(--line);padding-top:1.8rem;margin:2.5rem 0 4rem;scroll-margin-top:1rem}.review-item>header,.outcomes,.rich,.exercise,.quiz,.item-footer{max-width:78ch}.eyebrow{font-size:.85rem;font-weight:650;color:var(--brand);margin-bottom:.25rem}.source-path{font-size:.8rem;color:var(--muted);overflow-wrap:anywhere}.outcomes{padding:1rem 1.25rem;background:var(--soft);border-radius:.65rem}.outcomes dt{font-weight:650}.outcomes dd{margin:0 0 1rem}.outcomes dd:last-child{margin-bottom:0}.outcomes ul{padding-left:1.2rem;margin:.25rem 0}.rich p,.exercise>p,.answer p,blockquote{white-space:pre-wrap}.rich ul,.rich ol,.question>ol{padding-left:1.5rem}.rich li{margin:.35rem 0}.callout{white-space:pre-wrap;border-left:4px solid #8a8f98;background:#edf2f8;padding:1rem 1.25rem;border-radius:.2rem;margin:1.5rem 0}.exercise{border:1px solid var(--line);padding:0 1.25rem 1.25rem;border-radius:.65rem;margin-top:2rem}.answer{border:1px solid var(--line);border-radius:.5rem;background:#fff;margin:1rem 0}.answer summary{cursor:pointer;font-weight:600;min-height:44px;padding:.7rem .9rem;color:var(--brand)}.answer>div{padding:0 .9rem .8rem}.answer[open]{background:#f7f7f8}.question{padding:.5rem 0 1.5rem;border-bottom:1px solid var(--line)}.quiz>ol{padding-left:1.5rem}.item-footer{display:flex;flex-wrap:wrap;gap:.5rem 1.5rem;margin-top:2rem;font-size:.9rem}.item-footer a{min-height:44px;display:inline-flex;align-items:center}.table-scroll{max-width:100%;overflow-x:auto;margin:1.5rem 0;border:1px solid var(--line);border-radius:.45rem}table{width:100%;border-collapse:collapse;font-size:.92rem}th,td{padding:.65rem .8rem;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);min-width:8rem}th{background:var(--soft)}pre{max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--soft);border:1px solid var(--line);border-radius:.5rem;padding:1rem}code{font: .88em/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}blockquote{border-left:3px solid var(--line);margin:1rem 0;padding:.4rem 1.2rem;color:var(--muted)}hr{border:0;border-top:1px solid var(--line);margin:2rem 0}.resource-warning{font-size:.9rem;padding:.7rem 1rem;background:#fff6df;border-radius:.4rem;color:#603e00}.source-link{font-size:.9em;color:var(--muted)}body>footer{border-top:1px solid var(--line);font-size:.9rem;color:var(--muted);margin-top:3rem}.print-note{font-size:.85rem;color:var(--muted)}@media(max-width:650px){body>header,main,body>footer{padding:1rem}.contents-grid{grid-template-columns:1fr}.contents{padding:1rem}h2{font-size:1.55rem}h3{font-size:1.4rem}.outcomes,.exercise{padding-left:.9rem;padding-right:.9rem}.item-footer{gap:.4rem 1rem}}@media print{body{font-size:11pt}.skip,.contents{display:none}.review-item{break-before:page;margin:1rem 0}a{color:inherit}body>header,main,body>footer{max-width:none;padding:0}.notice{background:#fff}.answer{break-inside:avoid}.table-scroll{overflow:visible}pre{break-inside:avoid}}`;

function prepareOutput() {
  const runtime = join(root, '.runtime');
  if (!existsSync(runtime)) mkdirSync(runtime);
  requireValue(contained(realpathSync(root), realpathSync(runtime)), 'RUNTIME_OUTSIDE_WORKSPACE');
  const destination = join(root, outputDirectory), marker = join(destination, '.generated-by');
  if (existsSync(destination)) {
    requireValue(!lstatSync(destination).isSymbolicLink() && lstatSync(destination).isDirectory() && contained(realpathSync(root), realpathSync(destination)), 'OUTPUT_DIRECTORY_NOT_OWNED');
    requireValue(existsSync(marker) && lstatSync(marker).isFile() && !lstatSync(marker).isSymbolicLink() && readFileSync(marker, 'utf8') === owner, 'OUTPUT_DIRECTORY_NOT_RECOGNIZED');
  } else { mkdirSync(destination); writeFileSync(marker, owner, { flag:'wx' }); }
  for (const file of ['review.html', 'manifest.json']) if (existsSync(join(destination, file))) requireValue(lstatSync(join(destination, file)).isFile() && !lstatSync(join(destination, file)).isSymbolicLink(), 'OUTPUT_FILE_NOT_OWNED');
  return destination;
}

export function prepareEditorialReview() {
  const lessons = [], resources = [];
  for (const locale of locales) for (const key of moduleKeys) {
    const source = readSource(`${locale}/${key}.json`), data = JSON.parse(source.value);
    requireValue(data.key === key && data.locale === locale && typeof data.title === 'string' && typeof data.summary === 'string' && typeof data.objective === 'string' && typeof data.expectedResult === 'string' && Array.isArray(data.prerequisites) && data.prerequisites.every(value=>typeof value === 'string') && Array.isArray(data.blocks) && typeof data.exercise?.instructions === 'string' && typeof data.exercise?.correction === 'string' && Array.isArray(data.quiz), 'INVALID_LESSON_IDENTITY_OR_SHAPE');
    for (const question of data.quiz) requireValue(typeof question.key === 'string' && typeof question.prompt === 'string' && Array.isArray(question.options) && question.options.every(value=>typeof value === 'string') && Number.isInteger(question.correctOption) && question.correctOption >= 0 && question.correctOption < question.options.length && typeof question.explanation === 'string' && Number.isInteger(question.points) && question.points > 0, 'INVALID_QUIZ_ANSWER_KEY');
    lessons.push({ data, source });
  }
  for (const locale of locales) for (const key of resourceKeys) {
    const source = readSource(`resources/${locale}/${key}.md`);
    requireValue(source.value.trim(), 'EMPTY_RESOURCE'); resources.push({ key, locale, source });
  }
  const contents = locales.map(locale=>`<section lang="${locale}"><h3><a href="#lessons-${locale}">${escape(text[locale].lessons)}</a></h3><ol>${lessons.filter(lesson=>lesson.data.locale === locale).map(({ data })=>`<li><a href="#${lessonAnchor(locale, data.key)}">${data.key.toUpperCase()} — ${escape(data.title)}</a></li>`).join('')}</ol><h3><a href="#resources-${locale}">${escape(text[locale].resources)}</a></h3><ul class="resources-index">${resources.filter(resource=>resource.locale === locale).map(resource=>`<li><a href="#${resourceAnchor(locale, resource.key)}">${escape(resource.key)}${resource.key.startsWith('commented-solution-') ? (locale === 'fr' ? ' · corrigé' : ' · answer') : ''}</a></li>`).join('')}</ul></section>`).join('');
  const sections = locales.map(locale=>`<section id="lessons-${locale}" lang="${locale}" aria-labelledby="heading-lessons-${locale}"><h2 id="heading-lessons-${locale}">${escape(text[locale].lessons)}</h2>${lessons.filter(lesson=>lesson.data.locale === locale).map(lessonMarkup).join('\n')}</section><section id="resources-${locale}" lang="${locale}" aria-labelledby="heading-resources-${locale}"><h2 id="heading-resources-${locale}">${escape(text[locale].resources)}</h2>${resources.filter(resource=>resource.locale === locale).map(resource=>`<article class="review-item resource" id="${resourceAnchor(locale, resource.key)}"><header><p class="eyebrow">v1 · ${escape(text[locale].name)}</p><h3>${escape(resource.key)}</h3><p class="source-path">${escape(text[locale].source)} : <code>${escape(resource.source.path)}</code></p>${resource.key.startsWith('commented-solution-') ? '<p class="resource-warning" lang="fr">Corrigé inclus pour la revue éditoriale locale. Cette lecture ne constitue aucune remise, validation ou progression apprenant.</p>' : ''}</header><div class="rich">${markdown(resource.source.value, locale)}</div><nav class="item-footer"><a href="#contents">${text[locale].top}</a><a href="#${resourceAnchor(locale === 'fr' ? 'en' : 'fr', resource.key)}" lang="${locale === 'fr' ? 'en' : 'fr'}">${locale === 'fr' ? 'English' : 'Français'} · ${escape(resource.key)}</a></nav></article>`).join('\n')}</section>`).join('\n');
  const html = `<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="robots" content="noindex, nofollow"><title>Revue éditoriale locale — Du brief à la proposition</title><style>${css}</style></head><body><a class="skip" href="#main-content">Aller au contenu de revue</a><header><p class="eyebrow">ChatGPT Courses · sources v1 · FR / EN</p><h1>Du brief à la proposition : dossier de relecture</h1><p class="notice"><strong>Lecture éditoriale locale, corrigés inclus, pas une publication apprenant.</strong> Ce document rassemble les sources pour une revue humaine. Sa génération ne publie rien, n’importe rien et n’enregistre aucune approbation.</p><ul class="status"><li>Revue humaine : en attente</li><li>Essai apprenant humain : non effectué</li><li>12 leçons · 18 supports</li></ul><p class="lead">Lisez chaque langue et comparez objectifs, consignes, réponses et supports. Les corrections et bonnes réponses des quiz sont repliées ; ouvrez-les volontairement pour la relecture. Les deux corrigés de projet de chaque langue figurent dans les supports.</p><p class="print-note">Les volets repliés restent fermés à l’impression : ouvrez les corrections souhaitées avant d’imprimer. Aucun bouton de validation ni formulaire n’est présent ; consignez les décisions dans le dossier de revue du projet.</p><nav class="contents" id="contents" aria-label="Sommaire de la revue"><h2>Sommaire</h2><div class="contents-grid">${contents}</div></nav></header><main id="main-content" tabindex="-1">${sections}</main><footer><p>Sources locales uniquement. Les liens HTTPS présents dans les sources s’ouvrent sur action volontaire ; aucune ressource distante n’est chargée automatiquement. Rendu Markdown limité aux titres, paragraphes, listes simples, tableaux, citations, code et liens. Le HTML brut des sources est affiché comme texte.</p><p>Les identités, langues et empreintes SHA256 originales figurent dans <code>manifest.json</code>. Revue humaine : PENDING · Essai apprenant : NOT_PERFORMED.</p></footer></body></html>\n`;
  const sources = [...lessons.map(({ data, source })=>({ kind:'LESSON', logicalKey:data.key, locale:data.locale, anchor:lessonAnchor(data.locale, data.key), title:data.title, path:source.path, sha256:source.sha256, bytes:source.bytes.length })), ...resources.map(resource=>({ kind:'RESOURCE', logicalKey:resource.key, locale:resource.locale, anchor:resourceAnchor(resource.locale, resource.key), purpose:resource.key.startsWith('commented-solution-') ? 'SOLUTION' : 'RESOURCE', path:resource.source.path, sha256:resource.source.sha256, bytes:resource.source.bytes.length }))];
  const manifest = { schemaVersion:1, generator:'prepare-editorial-review-v1', courseLogicalKey:'course-client-proposal', sourceDirectory, sourceVersion:'v1', humanReview:'PENDING', learnerTrial:'NOT_PERFORMED', publicationRequested:false, importRequested:false, approvalRecorded:false, output:{ path:'review.html', sha256:sha(html), bytes:Buffer.byteLength(html, 'utf8') }, sources };
  const destination = prepareOutput(), manifestText = JSON.stringify(manifest, null, 2) + '\n';
  let changed = false;
  for (const [name, value] of [['review.html', html], ['manifest.json', manifestText]]) {
    const target = join(destination, name);
    if (!existsSync(target) || readFileSync(target, 'utf8') !== value) { writeFileSync(target, value, 'utf8'); changed = true; }
  }
  return { generated:true, changed, directory:outputDirectory, html:outputDirectory+'/review.html', manifest:outputDirectory+'/manifest.json', lessons:lessons.length, resources:resources.length, sourceFiles:sources.length, htmlSha256:manifest.output.sha256, humanReview:manifest.humanReview, learnerTrial:manifest.learnerTrial, imported:false, published:false, approvalRecorded:false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { requireValue(process.argv.length === 2, 'NO_ARGUMENT_EXPECTED'); console.log(JSON.stringify(prepareEditorialReview())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
