import "server-only";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Link, StatusMessage } from "@/components/ui";
import { readCurrentUser } from "@/lib/api/server-read";
import { readMethod, readMethods, readMethodSourceUpdate } from "@/lib/api/methods-server";
import type { MethodQuery } from "@/lib/api/methods-client";
import { isUuid } from "@/lib/api/cms-validation";
import { authHref } from "@/lib/auth/routes";
import { getMethodPageDictionary } from "@/lib/i18n/method-pages";
import type { Locale } from "@/lib/i18n/locales";
import { methodsHref, methodsNewHref, methodsPath } from "@/lib/methods/routes";
import { PersonalMethodsList } from "./list";
import { PersonalMethodEditor } from "./editor";
import { MethodDraftImport } from "./draft-import";
import { MethodShell } from "./shell";

type Parameters = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ locale: string; methodId?: string }>; searchParams: Promise<Parameters> };
const single = (value: string | string[] | undefined) => typeof value === "string" ? value : value === undefined ? undefined : null;
function queryFrom(input: Parameters): MethodQuery | null {
  const q = single(input.q), category = single(input.category), rawPage = single(input.page), rawSize = single(input.pageSize);
  if (rawPage === null || rawSize === null) return null;
  const page = rawPage ?? "0", size = rawSize ?? "20";
  if (q === null || category === null || page === null || size === null || (q?.length ?? 0) > 240 || (category?.length ?? 0) > 80
    || !/^\d+$/.test(page) || Number(page) > 1_000_000 || !/^\d+$/.test(size) || Number(size) < 1 || Number(size) > 100) return null;
  return { q: q?.trim() || undefined, category: category?.trim() || undefined, page: Number(page), pageSize: Number(size) };
}
async function account(locale: Locale, destination: string) {
  const result = await readCurrentUser();
  if (!result.ok && result.error.kind === "http" && result.error.status === 401) redirect(authHref(locale, "sign-in", destination, "required"));
  return result;
}
function Unavailable({ locale }: { locale: Locale }) {
  const t = getMethodPageDictionary(locale);
  return <MethodShell locale={locale}><StatusMessage tone="danger">{t.unavailable}</StatusMessage><Link href={methodsPath(locale)} prefetch={false} className="mt-4 inline-flex min-h-11 items-center">{t.retry}</Link></MethodShell>;
}
export function methodsMetadata(locale: Locale, create = false): Metadata {
  const t = getMethodPageDictionary(locale);
  return { title: `${create ? t.newMethod : t.methods} | ChatGPT Courses`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export function methodListPage(expected: Locale) {
  return async function Page({ params, searchParams }: Props) {
    if ((await params).locale !== expected) notFound();
    const query = queryFrom(await searchParams);
    const user = await account(expected, query ? methodsHref(expected, query) : methodsPath(expected));
    if (!user.ok || !query) return <Unavailable locale={expected} />;
    return <PersonalMethodsList locale={expected} initial={await readMethods(query)} query={query} expectedAccountId={user.data.id} />;
  };
}
export function methodNewPage(expected: Locale) {
  return async function Page({ params, searchParams }: Props) {
    if ((await params).locale !== expected) notFound();
    const input = await searchParams, draft = single(input.draft);
    if (draft === null || (draft !== undefined && !isUuid(draft))) notFound();
    const user = await account(expected, methodsNewHref(expected, draft));
    if (!user.ok) return <Unavailable locale={expected} />;
    return <MethodDraftImport key={`${user.data.id}:${draft ?? "new"}`} locale={expected} email={user.data.email} expectedAccountId={user.data.id} draftId={draft} />;
  };
}
export function methodDetailPage(expected: Locale) {
  return async function Page({ params }: Props) {
    const route = await params;
    if (route.locale !== expected || !isUuid(route.methodId)) notFound();
    const user = await account(expected, methodsPath(expected, route.methodId));
    if (!user.ok) return <Unavailable locale={expected} />;
    const [initial, sourceUpdate] = await Promise.all([readMethod(route.methodId), readMethodSourceUpdate(route.methodId)]);
    if (!initial.ok && initial.error.kind === "http" && initial.error.status === 404) notFound();
    return <PersonalMethodEditor locale={expected} initial={initial} sourceUpdate={sourceUpdate} expectedAccountId={user.data.id} email={user.data.email} />;
  };
}
