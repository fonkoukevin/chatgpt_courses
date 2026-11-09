import "server-only";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { readCurrentUser } from "@/lib/api/server-read";
import { readOperationsDashboard, readAdminOrders, readAdminOrder, readAdminOffers, readAdminOffer, readAdminSupportTickets, readAdminSupportTicket, readContentCases, readContentCase, readOperationsMetrics, readOperationsAudit, readOperationsIncidents } from "@/lib/api/operations-server";
import { isUuid } from "@/lib/api/cms-validation";
import { authHref } from "@/lib/auth/routes";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { getOperationsDictionary } from "@/lib/i18n/operations";
import { operationsPath, adminOffersPath, type OperationsSection } from "@/lib/operations/routes";
import { defaultOperationsPeriod, parseOperationsQuery, type OperationsQuerySection, type AdminOrderQuery, type AdminOfferQuery, type ContentCaseQuery, type MetricsQuery, type AuditQuery, type IncidentQuery } from "@/lib/operations/query";
import type { SupportQuery } from "@/lib/api/support-client";
import { StatusMessage } from "@/components/ui";
import { OperationsShell } from "./shell";
import { OperationsDashboardPage } from "./dashboard";
import { AdminOrders, AdminOrder } from "./orders";
import { AdminOffers, AdminOffer } from "./offers";
import { AdminSupportTickets, AdminSupportTicket } from "./support";
import { AdminContentCases, AdminContentCase } from "./cases";
import { OperationsMetrics } from "./metrics";
import { OperationsAudit } from "./audit";
import { OperationsIncidents } from "./incidents";

type Section = OperationsSection | "offers";
type Props = { params: Promise<{ locale: string; orderId?: string; ticketId?: string; caseId?: string; offerId?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const path = (locale: Locale, section: Section, id?: string) => section === "offers" ? adminOffersPath(locale, id) : operationsPath(locale, section, id);
async function route(props: Props) { const params = await props.params; if (!isLocale(params.locale)) notFound(); return { ...params, locale: params.locale as Locale }; }
export async function operationsMetadata(props: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await route({ ...props, searchParams: Promise.resolve({}) });
  return { title: `${getOperationsDictionary(locale).dashboard} | ChatGPT Courses`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export function operationsServerPage(section: Section, detail = false) { return async function Page(props: Props) {
  const params = await route(props), locale = params.locale;
  const id = section === "orders" ? params.orderId : section === "support" ? params.ticketId : section === "content-cases" ? params.caseId : params.offerId;
  if (detail && !isUuid(id)) notFound();
  const raw = await props.searchParams, search = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) { if (Array.isArray(value) || detail) notFound(); if (value !== undefined) search.set(key, value); }
  let query;
  try {
    if (!detail) {
      if (section !== "offers" && section !== "support" && !search.has("from") && !search.has("to")) { const period = defaultOperationsPeriod(); search.set("from", period.from); search.set("to", period.to); }
      if (section === "offers" && !search.has("locale")) search.set("locale", locale);
      query = parseOperationsQuery(section as OperationsQuerySection, search);
    }
  } catch { notFound(); }
  const destination = path(locale, section, detail ? id : undefined) + (search.size ? `?${search}` : ""), current = await readCurrentUser();
  if (!current.ok && current.error.kind === "http" && current.error.status === 401) redirect(authHref(locale, "sign-in", destination, "required"));
  if (!current.ok) return <OperationsShell locale={locale} section={section}><StatusMessage tone="danger">{getOperationsDictionary(locale).unavailable}</StatusMessage></OperationsShell>;
  const common = { locale, expectedAccountId: current.data.id, permissions: current.data.permissions };
  if (detail && id) {
    if (section === "orders") return <AdminOrder key={`${current.data.id}:${id}`} {...common} id={id} initial={await readAdminOrder(id)} />;
    if (section === "offers") return <AdminOffer key={`${current.data.id}:${id}`} {...common} id={id} initial={await readAdminOffer(id)} />;
    if (section === "support") return <AdminSupportTicket key={`${current.data.id}:${id}`} {...common} id={id} initial={await readAdminSupportTicket(id)} />;
    if (section === "content-cases") return <AdminContentCase key={`${current.data.id}:${id}`} {...common} id={id} initial={await readContentCase(id)} />;
    notFound();
  }
  if (section === "dashboard") { const q = query as AdminOrderQuery; return <OperationsDashboardPage key={current.data.id} {...common} query={q} initial={await readOperationsDashboard(q)} />; }
  if (section === "orders") { const q = query as AdminOrderQuery; return <AdminOrders key={current.data.id} {...common} query={q} initial={await readAdminOrders(q)} />; }
  if (section === "offers") { const q = query as AdminOfferQuery; return <AdminOffers key={current.data.id} {...common} query={q} initial={await readAdminOffers(q)} />; }
  if (section === "support") { const q = query as SupportQuery; return <AdminSupportTickets key={current.data.id} {...common} query={q} initial={await readAdminSupportTickets(q)} />; }
  if (section === "content-cases") { const q = query as ContentCaseQuery; return <AdminContentCases key={current.data.id} {...common} query={q} initial={await readContentCases(q)} />; }
  if (section === "metrics") { const q = query as MetricsQuery; return <OperationsMetrics key={current.data.id} {...common} query={q} initial={await readOperationsMetrics(q)} />; }
  if (section === "audit") { const q = query as AuditQuery; return <OperationsAudit key={current.data.id} {...common} query={q} initial={await readOperationsAudit(q)} />; }
  const q = query as IncidentQuery; return <OperationsIncidents key={current.data.id} {...common} query={q} initial={await readOperationsIncidents(q)} />;
}; }
