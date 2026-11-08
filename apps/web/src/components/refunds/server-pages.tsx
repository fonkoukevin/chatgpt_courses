import "server-only";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { StatusMessage } from "@/components/ui";
import { readCurrentUser } from "@/lib/api/server-read";
import { readEntitlements, readRefundContext, readRefundOperation, readRefundOperations, readRefundRequest, readRefundRequests } from "@/lib/api/refunds-server";
import type { RefundOperationQuery, RefundRequestQuery } from "@/lib/api/refunds-client";
import { isUuid } from "@/lib/api/cms-validation";
import { authHref } from "@/lib/auth/routes";
import { getRefundsDictionary, getRefundStateDictionary } from "@/lib/i18n/refunds";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { adminRefundOperationPath, adminRefundsHref, adminRefundsPath, entitlementsPath, orderRefundsPath, safeRefundsDestination, type RefundAdminQuery, type RefundPageQuery } from "@/lib/refunds/routes";
import { OrderRefunds, PersonalEntitlements } from "./learner";
import { AdminRefundOperation, AdminRefundRequest, AdminRefundsList } from "./admin";
import { RefundAdminShell, RefundError, RefundShell } from "./parts";

type Props = { params: Promise<{ locale: string; orderId?: string; requestId?: string; operationId?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
async function route(props: Props, expected?: Locale) { const value = await props.params; if (!isLocale(value.locale) || expected && value.locale !== expected) notFound(); return { ...value, locale: value.locale as Locale }; }
async function query(props: Props, locale: Locale, path: string): Promise<RefundAdminQuery> {
  const input = await props.searchParams, params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) { if (Array.isArray(value)) notFound(); if (value !== undefined) params.set(key, value); }
  if (!safeRefundsDestination(path + (params.size ? `?${params}` : ""), locale)) notFound();
  return { page: Number(params.get("page") ?? 0), pageSize: Number(params.get("pageSize") ?? 20), ...(params.get("view") ? { view: params.get("view") as RefundAdminQuery["view"] } : {}), ...(params.get("state") ? { state: params.get("state")! } : {}), ...(params.get("orderId") ? { orderId: params.get("orderId")! } : {}) };
}
async function user(locale: Locale, destination: string) {
  const result = await readCurrentUser();
  if (!result.ok && result.error.kind === "http" && result.error.status === 401) redirect(authHref(locale, "sign-in", destination, "required"));
  return result;
}
export function refundsMetadata(locale: Locale, kind: "learner" | "entitlements" | "admin" = "learner"): Metadata {
  const t = getRefundsDictionary(locale), state = getRefundStateDictionary(locale);
  return { title: `${kind === "admin" ? t.operatorTitle : kind === "entitlements" ? state.entitlementsTitle : t.title} | ChatGPT Courses`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export async function adminRefundsMetadata(props: Pick<Props, "params">): Promise<Metadata> { const params = await props.params; if (!isLocale(params.locale)) notFound(); return refundsMetadata(params.locale, "admin"); }
export function orderRefundsPage(locale: Locale) { return async function Page(props: Props) {
  const params = await route(props, locale); if (!isUuid(params.orderId)) notFound();
  const path = orderRefundsPath(locale, params.orderId), paging: RefundPageQuery = await query(props, locale, path), current = await user(locale, path);
  if (!current.ok) return <RefundShell locale={locale} orderId={params.orderId}><RefundError locale={locale} error={current.error} /></RefundShell>;
  const [context, requests, operations] = await Promise.all([readRefundContext(params.orderId), readRefundRequests({ ...paging, orderId: params.orderId }), readRefundOperations({ ...paging, orderId: params.orderId })]);
  if (!context.ok && context.error.kind === "http" && context.error.status === 404) notFound();
  return <OrderRefunds key={`${current.data.id}:${params.orderId}`} locale={locale} orderId={params.orderId} expectedAccountId={current.data.id} initialContext={context} initialRequests={requests} initialOperations={operations} query={paging} />;
}; }
export function entitlementsPage(locale: Locale) { return async function Page(props: Props) {
  await route(props, locale); const path = entitlementsPath(locale), paging: RefundPageQuery = await query(props, locale, path), current = await user(locale, path);
  if (!current.ok) return <RefundShell locale={locale}><RefundError locale={locale} error={current.error} /></RefundShell>;
  return <PersonalEntitlements key={current.data.id} locale={locale} expectedAccountId={current.data.id} initial={await readEntitlements(locale, paging.page, paging.pageSize)} query={paging} />;
}; }
export async function AdminRefundsServerPage(props: Props) {
  const { locale } = await route(props), filters = await query(props, locale, adminRefundsPath(locale)), current = await user(locale, adminRefundsHref(locale, filters));
  if (!current.ok) return <RefundAdminShell locale={locale}><RefundError locale={locale} error={current.error} /></RefundAdminShell>;
  if (!current.data.permissions.includes("refunds.admin.read")) return <RefundAdminShell locale={locale}><StatusMessage tone="danger">{getRefundsDictionary(locale).forbidden}</StatusMessage></RefundAdminShell>;
  const initial = filters.view === "operations" ? await readRefundOperations({ ...filters, state: filters.state as RefundOperationQuery["state"] }, true) : await readRefundRequests({ ...filters, state: filters.state as RefundRequestQuery["state"] }, true);
  return <AdminRefundsList key={`${current.data.id}:${adminRefundsHref(locale, filters)}`} locale={locale} expectedAccountId={current.data.id} permissions={current.data.permissions} query={filters} initial={initial} />;
}
export async function AdminRefundRequestServerPage(props: Props) {
  const { locale, requestId } = await route(props); if (!isUuid(requestId)) notFound();
  await query(props, locale, adminRefundsPath(locale, requestId));
  const current = await user(locale, adminRefundsPath(locale, requestId));
  if (!current.ok) return <RefundAdminShell locale={locale}><RefundError locale={locale} error={current.error} /></RefundAdminShell>;
  if (!current.data.permissions.includes("refunds.admin.read")) return <RefundAdminShell locale={locale}><StatusMessage tone="danger">{getRefundsDictionary(locale).forbidden}</StatusMessage></RefundAdminShell>;
  const initial = await readRefundRequest(requestId, true); if (!initial.ok && initial.error.kind === "http" && initial.error.status === 404) notFound();
  return <AdminRefundRequest key={`${current.data.id}:${requestId}`} locale={locale} expectedAccountId={current.data.id} permissions={current.data.permissions} id={requestId} initial={initial} />;
}
export async function AdminRefundOperationServerPage(props: Props) {
  const { locale, operationId } = await route(props); if (!isUuid(operationId)) notFound();
  await query(props, locale, adminRefundOperationPath(locale, operationId));
  const current = await user(locale, adminRefundOperationPath(locale, operationId));
  if (!current.ok) return <RefundAdminShell locale={locale}><RefundError locale={locale} error={current.error} /></RefundAdminShell>;
  if (!current.data.permissions.includes("refunds.admin.read")) return <RefundAdminShell locale={locale}><StatusMessage tone="danger">{getRefundsDictionary(locale).forbidden}</StatusMessage></RefundAdminShell>;
  const initial = await readRefundOperation(operationId, true); if (!initial.ok && initial.error.kind === "http" && initial.error.status === 404) notFound();
  return <AdminRefundOperation key={`${current.data.id}:${operationId}`} locale={locale} expectedAccountId={current.data.id} permissions={current.data.permissions} id={operationId} initial={initial} />;
}
