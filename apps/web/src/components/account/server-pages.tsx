import "server-only";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Link, StatusMessage } from "@/components/ui";
import { readCurrentUser, readPreferences } from "@/lib/api/server-read";
import { readAccountProfile, readAttestation, readAttestations, readDataRequests, readSupportTicket, readSupportTickets } from "@/lib/api/account-server";
import { isUuid } from "@/lib/api/cms-validation";
import type { SupportContext } from "@/lib/api/generated/types.gen";
import type { SupportQuery } from "@/lib/api/support-client";
import { accountPath, accountSectionPath, safeAccountDestination, type AccountSection } from "@/lib/account/routes";
import { authHref } from "@/lib/auth/routes";
import { getAccountDictionary } from "@/lib/i18n/account";
import type { Locale } from "@/lib/i18n/locales";
import { AccountHome } from "./home";
import { PersonalAttestation, PersonalAttestations } from "./attestations";
import { PersonalDataRequests } from "./data-requests";
import { AccountShell } from "./shell";
import { PersonalSupportTicket, PersonalSupportTickets } from "./support";

type Props = { params: Promise<{ locale: string; ticketId?: string; attestationId?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
async function route(props: Props, locale: Locale) { const params = await props.params; if (params.locale !== locale) notFound(); return params; }
async function query(props: Props, locale: Locale, section: AccountSection) {
  const values = await props.searchParams;
  if (Object.values(values).some(value => Array.isArray(value))) notFound();
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries(values)) if (typeof value === "string") params.set(key,value);
  const destination = accountSectionPath(locale,section) + (params.size ? `?${params}` : "");
  if (!safeAccountDestination(destination,locale)) notFound();
  return { values: values as Record<string,string|undefined>, destination, pagination: { page: Number(values.page ?? 0), pageSize: Number(values.pageSize ?? 20) } };
}
async function user(locale: Locale, destination: string) {
  const result = await readCurrentUser();
  if (!result.ok && result.error.kind === "http" && result.error.status === 401) redirect(authHref(locale,"sign-in",destination,"required"));
  return result;
}
function Unavailable({locale,section="home",resourceId}:{locale:Locale;section?:AccountSection;resourceId?:string}) {
  const text=getAccountDictionary(locale);
  return <AccountShell locale={locale} section={section} resourceId={resourceId}><StatusMessage tone="danger"><p>{text.unavailable}</p><Link href={accountSectionPath(locale,section,resourceId)} prefetch={false}>{text.retry}</Link></StatusMessage></AccountShell>;
}
export function accountMetadata(locale:Locale,section:AccountSection="home"):Metadata {
  const text=getAccountDictionary(locale),titles={home:text.title,attestations:text.attestations,help:text.help,data:text.data};
  return {title:`${titles[section]} | ChatGPT Courses`,robots:{index:false,follow:false},referrer:"no-referrer"};
}
export function accountHomePage(locale:Locale){return async function Page(props:Props){
  await route(props,locale);await query(props,locale,"home");const current=await user(locale,accountPath(locale));
  if(!current.ok)return <Unavailable locale={locale}/>;
  const [profile,preferences]=await Promise.all([readAccountProfile(),readPreferences()]);
  return <AccountHome key={current.data.id} locale={locale} expectedAccountId={current.data.id} permissions={current.data.permissions} initialProfile={profile} initialPreferences={preferences}/>;
};}
export function accountAttestationsPage(locale:Locale){return async function Page(props:Props){
  await route(props,locale);const parsed=await query(props,locale,"attestations"),current=await user(locale,parsed.destination);
  if(!current.ok)return <Unavailable locale={locale} section="attestations"/>;
  return <PersonalAttestations key={current.data.id} locale={locale} expectedAccountId={current.data.id} initial={await readAttestations(parsed.pagination.page,parsed.pagination.pageSize)} query={parsed.pagination} enrollmentId={parsed.values.enrollmentId}/>;
};}
export function accountAttestationPage(locale:Locale){return async function Page(props:Props){
  const params=await route(props,locale);if(!isUuid(params.attestationId))notFound();
  const destination=accountSectionPath(locale,"attestations",params.attestationId),current=await user(locale,destination);
  if(Object.keys(await props.searchParams).length)notFound();
  if(!current.ok)return <Unavailable locale={locale} section="attestations" resourceId={params.attestationId}/>;
  const initial=await readAttestation(params.attestationId);if(!initial.ok&&initial.error.kind==="http"&&initial.error.status===404)notFound();
  return <PersonalAttestation key={`${current.data.id}:${params.attestationId}`} locale={locale} expectedAccountId={current.data.id} id={params.attestationId} initial={initial}/>;
};}
export function accountHelpPage(locale:Locale){return async function Page(props:Props){
  await route(props,locale);const parsed=await query(props,locale,"help"),current=await user(locale,parsed.destination);
  if(!current.ok)return <Unavailable locale={locale} section="help"/>;
  const values=parsed.values, supportQuery:SupportQuery={...parsed.pagination,...(values.state?{state:values.state as NonNullable<SupportQuery["state"]>}: {})};
  const fields=["resourceId","versionId","revisionId","orderId","projectId","enrollmentId"] as const;
  const context:SupportContext|undefined=fields.some(field=>values[field])?{locale:values.contextLocale??locale,...Object.fromEntries(fields.map(field=>[field,values[field]??null]))} as SupportContext:undefined;
  return <PersonalSupportTickets key={current.data.id} locale={locale} expectedAccountId={current.data.id} initial={await readSupportTickets(supportQuery)} query={supportQuery} context={context}/>;
};}
export function accountHelpTicketPage(locale:Locale){return async function Page(props:Props){
  const params=await route(props,locale);if(!isUuid(params.ticketId))notFound();
  if(Object.keys(await props.searchParams).length)notFound();
  const current=await user(locale,accountSectionPath(locale,"help",params.ticketId));
  if(!current.ok)return <Unavailable locale={locale} section="help" resourceId={params.ticketId}/>;
  const initial=await readSupportTicket(params.ticketId);if(!initial.ok&&initial.error.kind==="http"&&initial.error.status===404)notFound();
  return <PersonalSupportTicket key={`${current.data.id}:${params.ticketId}`} locale={locale} expectedAccountId={current.data.id} id={params.ticketId} initial={initial}/>;
};}
export function accountDataRequestsPage(locale:Locale){return async function Page(props:Props){
  await route(props,locale);const parsed=await query(props,locale,"data"),current=await user(locale,parsed.destination);
  if(!current.ok)return <Unavailable locale={locale} section="data"/>;
  return <PersonalDataRequests key={current.data.id} locale={locale} expectedAccountId={current.data.id} initial={await readDataRequests(parsed.pagination.page,parsed.pagination.pageSize)} query={parsed.pagination}/>;
};}
