"use client";

import { useId } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button, Checkbox, FormField, Input, Select, TextArea } from "@/components/ui";
import { getCmsDictionary, type CmsDictionary } from "@/lib/i18n/cms";
import type { Locale } from "@/lib/i18n/locales";
import type { ContentDocument } from "@/lib/api/generated/types.gen";

export function emptyDocument(): ContentDocument {
  return { objective: "", expectedResult: "", prerequisites: [], blocks: [], estimatedMinutes: null, exercise: null, quiz: [], rubric: [], access: "PROTECTED", media: [], relatedResourceIds: [] };
}
export function normalizeDocument(value: ContentDocument): ContentDocument {
  const methodDefinition = value.methodDefinition ? { ...value.methodDefinition,
    useCases: value.methodDefinition.useCases.filter((line) => line.trim()), requiredInputs: value.methodDefinition.requiredInputs.filter((line) => line.trim()),
    steps: value.methodDefinition.steps.filter((line) => line.trim()), checks: value.methodDefinition.checks.filter((line) => line.trim()), limitations: value.methodDefinition.limitations.filter((line) => line.trim()) } : null;
  return { ...value, methodDefinition, prerequisites: value.prerequisites.filter((line) => line.trim()), relatedResourceIds: value.relatedResourceIds.filter((line) => line.trim()) };
}
const lines = (value: string): string[] => value ? value.split("\n") : [];
const choices = (values: Record<string, string>) => Object.entries(values).map(([value, label]) => ({ value, label }));

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

function OrderControls({ index, count, move, remove, text, scope }: { index: number; count: number; move: (direction: -1 | 1) => void; remove: () => void; text: CmsDictionary; scope: string }) {
  function reorder(direction: -1 | 1) {
    move(direction);
    requestAnimationFrame(() => {
      const target = index + direction;
      const requested = document.getElementById(`${scope}-${target}-${direction}`) as HTMLButtonElement | null;
      const fallback = document.getElementById(`${scope}-${target}-${-direction}`) as HTMLButtonElement | null;
      (requested?.disabled ? fallback : requested)?.focus();
    });
  }
  return <div className="flex flex-wrap items-center gap-2">
    <Button id={`${scope}-${index}--1`} variant="secondary" size="icon" disabled={index === 0} aria-label={text.moveUp.replace("{n}", String(index + 1))} onClick={() => reorder(-1)}><ArrowUp aria-hidden="true" size={18} /></Button>
    <Button id={`${scope}-${index}-1`} variant="secondary" size="icon" disabled={index === count - 1} aria-label={text.moveDown.replace("{n}", String(index + 1))} onClick={() => reorder(1)}><ArrowDown aria-hidden="true" size={18} /></Button>
    <Button variant="ghost" onClick={remove}><Trash2 aria-hidden="true" size={18} />{text.remove}</Button>
  </div>;
}

export function DocumentEditor({ locale, value, onChange, sectionPrefix = "cms" }: { locale: Locale; value: ContentDocument; onChange: (value: ContentDocument) => void; sectionPrefix?: string }) {
  const text = getCmsDictionary(locale);
  const prefix = useId();
  function set<K extends keyof ContentDocument>(key: K, next: ContentDocument[K]) { onChange({ ...value, [key]: next }); }
  const field = (key: string) => `${prefix}-${key}`;
  return <div className="space-y-8">
    <section id={`${sectionPrefix}-objective`} className="grid gap-5">
      <FormField id={field("objective")} label={text.objective} required><TextArea value={value.objective} onChange={(event) => set("objective", event.target.value)} rows={3} /></FormField>
      <FormField id={field("expected-result")} label={text.expectedResult} required><TextArea value={value.expectedResult} onChange={(event) => set("expectedResult", event.target.value)} rows={3} /></FormField>
      <FormField id={field("prerequisites")} label={text.prerequisites}><TextArea value={value.prerequisites.join("\n")} onChange={(event) => set("prerequisites", lines(event.target.value))} rows={3} /></FormField>
      <div className="grid gap-5 sm:grid-cols-2"><FormField id={field("duration")} label={text.duration}><Input type="number" min={1} max={1440} step={1} value={value.estimatedMinutes ?? ""} onChange={(event) => set("estimatedMinutes", event.target.value ? Number(event.target.value) : null)} /></FormField>
        <FormField id={field("access")} label={text.accessPolicy}><Select value={value.access} onChange={(event) => set("access", event.target.value as ContentDocument["access"])} options={choices(text.access)} /></FormField></div>
    </section>
    <section id={`${sectionPrefix}-blocks`} className="space-y-5"><h2 className="text-xl font-semibold">{text.blocks}</h2>
      {value.blocks.map((block, index) => <div key={index} className="space-y-4 rounded-input border border-border p-4" data-block-index={index}>
        <FormField id={field(`block-${index}-type`)} label={text.blockType}><Select value={block.type} onChange={(event) => set("blocks", value.blocks.map((item, position) => position === index ? { ...item, type: event.target.value as typeof item.type, url: event.target.value === "LINK" ? item.url : null } : item))} options={choices(text.block)} /></FormField>
        <FormField id={field(`block-${index}-text`)} label={`${text.blockText} ${index + 1}`}><TextArea value={block.text} onChange={(event) => set("blocks", value.blocks.map((item, position) => position === index ? { ...item, text: event.target.value } : item))} rows={4} /></FormField>
        {block.type === "LINK" && <FormField id={field(`block-${index}-url`)} label={text.url}><Input value={block.url ?? ""} onChange={(event) => set("blocks", value.blocks.map((item, position) => position === index ? { ...item, url: event.target.value || null } : item))} /></FormField>}
        <OrderControls scope={field("block-order")} index={index} count={value.blocks.length} text={text} move={(direction) => set("blocks", moveItem(value.blocks, index, direction))} remove={() => set("blocks", value.blocks.filter((_, position) => position !== index))} />
      </div>)}
      <Button variant="secondary" disabled={value.blocks.length >= 60} onClick={() => set("blocks", [...value.blocks, { type: "PARAGRAPH", text: "", url: null }])}>{text.addBlock}</Button>
    </section>
    <section id={`${sectionPrefix}-exercise`} className="space-y-4"><h2 className="text-xl font-semibold">{text.exercise}</h2>
      {value.exercise ? <><FormField id={field("instructions")} label={text.instructions}><TextArea rows={5} value={value.exercise.instructions} onChange={(event) => set("exercise", { ...value.exercise!, instructions: event.target.value })} /></FormField>
        <FormField id={field("correction")} label={text.correction}><TextArea rows={6} value={value.exercise.correction} onChange={(event) => set("exercise", { ...value.exercise!, correction: event.target.value })} /></FormField>
        <Button variant="ghost" onClick={() => set("exercise", null)}>{text.removeExercise}</Button></> : <Button variant="secondary" onClick={() => set("exercise", { instructions: "", correction: "" })}>{text.addExercise}</Button>}
    </section>
    <section id={`${sectionPrefix}-quiz`} className="space-y-5"><h2 className="text-xl font-semibold">{text.quiz}</h2>
      {value.quiz.map((question, index) => <div key={index} className="space-y-4 rounded-input border border-border p-4">
        <FormField id={field(`question-${index}-key`)} label={text.questionKey}><Input value={question.key} onChange={(event) => set("quiz", value.quiz.map((item, position) => position === index ? { ...item, key: event.target.value } : item))} /></FormField>
        <FormField id={field(`question-${index}-prompt`)} label={text.question}><TextArea rows={3} value={question.prompt} onChange={(event) => set("quiz", value.quiz.map((item, position) => position === index ? { ...item, prompt: event.target.value } : item))} /></FormField>
        <FormField id={field(`question-${index}-options`)} label={text.options}><TextArea rows={4} value={question.options.join("\n")} onChange={(event) => set("quiz", value.quiz.map((item, position) => position === index ? { ...item, options: lines(event.target.value) } : item))} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2"><FormField id={field(`question-${index}-correct`)} label={text.correctOption}><Input type="number" min={1} max={question.options.length} step={1} value={question.correctOption < 0 ? "" : question.correctOption + 1} onChange={(event) => set("quiz", value.quiz.map((item, position) => position === index ? { ...item, correctOption: Number(event.target.value) - 1 } : item))} /></FormField>
          <FormField id={field(`question-${index}-points`)} label={text.points}><Input type="number" min={1} step={1} value={question.points} onChange={(event) => set("quiz", value.quiz.map((item, position) => position === index ? { ...item, points: Number(event.target.value) } : item))} /></FormField></div>
        <FormField id={field(`question-${index}-explanation`)} label={text.explanation}><TextArea rows={3} value={question.explanation} onChange={(event) => set("quiz", value.quiz.map((item, position) => position === index ? { ...item, explanation: event.target.value } : item))} /></FormField>
        <OrderControls scope={field("quiz-order")} index={index} count={value.quiz.length} text={text} move={(direction) => set("quiz", moveItem(value.quiz, index, direction))} remove={() => set("quiz", value.quiz.filter((_, position) => position !== index))} />
      </div>)}
      <Button variant="secondary" disabled={value.quiz.length >= 20} onClick={() => set("quiz", [...value.quiz, { key: "", prompt: "", options: ["", ""], correctOption: -1, explanation: "", points: 1 }])}>{text.addQuestion}</Button>
    </section>
    <section id={`${sectionPrefix}-rubric`} className="space-y-5"><h2 className="text-xl font-semibold">{text.rubric}</h2><p className="text-sm text-muted-foreground">{text.declared}</p>
      {value.rubric.map((criterion, index) => <div key={index} className="space-y-4 rounded-input border border-border p-4">
        <FormField id={field(`criterion-${index}-key`)} label={text.criterionKey}><Input value={criterion.key} onChange={(event) => set("rubric", value.rubric.map((item, position) => position === index ? { ...item, key: event.target.value } : item))} /></FormField>
        <FormField id={field(`criterion-${index}-label`)} label={text.criterion}><TextArea rows={3} value={criterion.label} onChange={(event) => set("rubric", value.rubric.map((item, position) => position === index ? { ...item, label: event.target.value } : item))} /></FormField>
        <FormField id={field(`criterion-${index}-points`)} label={text.points}><Input type="number" min={1} step={1} value={criterion.points} onChange={(event) => set("rubric", value.rubric.map((item, position) => position === index ? { ...item, points: Number(event.target.value) } : item))} /></FormField>
        <Checkbox id={field(`criterion-${index}-blocking`)} label={text.blocking} checked={criterion.blocking} onCheckedChange={(checked) => set("rubric", value.rubric.map((item, position) => position === index ? { ...item, blocking: checked === true } : item))} />
        <OrderControls scope={field("rubric-order")} index={index} count={value.rubric.length} text={text} move={(direction) => set("rubric", moveItem(value.rubric, index, direction))} remove={() => set("rubric", value.rubric.filter((_, position) => position !== index))} />
      </div>)}
      <Button variant="secondary" disabled={value.rubric.length >= 30} onClick={() => set("rubric", [...value.rubric, { key: "", label: "", points: 1, blocking: false }])}>{text.addCriterion}</Button>
    </section>
    <section id={`${sectionPrefix}-media`} className="space-y-5"><h2 className="text-xl font-semibold">{text.media}</h2><p className="text-sm text-muted-foreground">{text.mediaUnavailable}</p>
      {value.media.map((media, index) => <div key={index} className="space-y-4 rounded-input border border-border p-4">
        <FormField id={field(`media-${index}-id`)} label={text.assetId}><Input value={media.assetId} onChange={(event) => set("media", value.media.map((item, position) => position === index ? { ...item, assetId: event.target.value } : item))} /></FormField>
        <FormField id={field(`media-${index}-kind`)} label={text.mediaType}><Select value={media.kind} options={choices(text.mediaKind)} onChange={(event) => set("media", value.media.map((item, position) => position === index ? { ...item, kind: event.target.value as typeof item.kind } : item))} /></FormField>
        <FormField id={field(`media-${index}-label`)} label={text.mediaLabel}><Input value={media.label} onChange={(event) => set("media", value.media.map((item, position) => position === index ? { ...item, label: event.target.value } : item))} /></FormField>
        <Checkbox id={field(`media-${index}-required`)} label={text.mediaRequired} checked={media.required} onCheckedChange={(checked) => set("media", value.media.map((item, position) => position === index ? { ...item, required: checked === true } : item))} />
        <Button variant="ghost" onClick={() => set("media", value.media.filter((_, position) => position !== index))}>{text.remove}</Button>
      </div>)}
      <Button variant="secondary" disabled={value.media.length >= 20} onClick={() => set("media", [...value.media, { assetId: "", kind: "FILE", label: "", required: false }])}>{text.addMedia}</Button>
    </section>
    <section id={`${sectionPrefix}-related`}><FormField id={field("related")} label={text.related}><TextArea rows={3} value={value.relatedResourceIds.join("\n")} onChange={(event) => set("relatedResourceIds", lines(event.target.value))} /></FormField></section>
  </div>;
}
