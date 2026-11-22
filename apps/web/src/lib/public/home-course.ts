import type { AuthResult } from "../api/auth-client";
import type { CataloguePage, CurriculumNode, ResourceCard, ResourceDetail } from "../api/generated/types.gen";
import type { Locale } from "../i18n/locales";
import { courseActivityHref, resourceHref } from "./routes";

export type HomeCourse = {
  title: string;
  summary: string;
  objective: string;
  expectedResult: string;
  audience: string[];
  prerequisites: string[];
  href: string;
  trial: { title: string; href: string } | null;
  modules: { title: string; summary: string }[];
};

/** A dedicated, complete COURSE result determines whether one course can be featured. */
export function singleHomeCourseCard(locale: Locale, result: AuthResult<CataloguePage>): ResourceCard | null {
  if (!result.ok || result.data.page !== 0 || result.data.total !== 1 || result.data.items.length !== 1) return null;
  const card = result.data.items[0];
  return card.kind === "COURSE" && card.locale === locale && card.slug ? card : null;
}

function firstFreeActivity(nodes: CurriculumNode[], locale: Locale): CurriculumNode | null {
  for (const node of nodes) {
    if (node.locale !== locale || node.availability !== "PUBLISHED" || !node.slug || !node.revisionId) continue;
    if (node.kind === "ACTIVITY" && node.access === "FREE" && node.title) return node;
    if (node.kind === "MODULE") {
      const activity = firstFreeActivity(node.children, locale);
      if (activity) return activity;
    }
  }
  return null;
}

/** Only public descriptive fields cross the server/client boundary; no lesson body is included. */
export function resolveHomeCourse(locale: Locale, catalogue: AuthResult<CataloguePage>, result?: AuthResult<ResourceDetail>): HomeCourse | null {
  const card = singleHomeCourseCard(locale, catalogue);
  if (!card || !result?.ok) return null;
  const course = result.data;
  if (course.kind !== "COURSE" || course.availability !== "PUBLISHED" || course.locale !== locale
    || course.resourceId !== card.resourceId || course.versionId !== card.versionId || course.revisionId !== card.revisionId
    || course.slug !== card.slug || !course.title || course.title !== card.title) return null;
  const activity = firstFreeActivity(course.curriculum, locale);
  return {
    title: course.title,
    summary: course.summary ?? "",
    objective: course.objective ?? "",
    expectedResult: course.expectedResult ?? "",
    audience: course.metadata.audience,
    prerequisites: course.prerequisites,
    href: resourceHref(card),
    trial: activity ? {
      title: activity.title!,
      href: courseActivityHref(locale, card.slug, activity.slug!, activity.resourceId, activity.versionId, course.versionId),
    } : null,
    modules: course.curriculum.filter((node) => node.kind === "MODULE" && node.locale === locale && node.availability === "PUBLISHED" && node.title)
      .map((node) => ({ title: node.title!, summary: node.summary ?? "" })),
  };
}
