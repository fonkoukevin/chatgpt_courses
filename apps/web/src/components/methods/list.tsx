"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, FormField, Input, Link, Pagination, StatusMessage } from "@/components/ui";
import { getCurrentUser, type AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { subscribeAccountEvents } from "@/lib/auth/account-events";
import { authHref } from "@/lib/auth/routes";
import type { ListMethodsData, MethodPage } from "@/lib/api/generated/types.gen";
import type { Locale } from "@/lib/i18n/locales";
import { getMethodsDictionary } from "@/lib/i18n/methods";
import { methodsHref, methodsPath } from "@/lib/methods/routes";
import { publicCatalogueHref } from "@/lib/public/routes";
import { MethodShell } from "./shell";
import { methodDate, MethodsError } from "./parts";

type Query = NonNullable<ListMethodsData["query"]>;
export type PersonalMethodsListProps = { locale: Locale; initial: AuthResult<MethodPage>; expectedAccountId: string; query: Query };
export function PersonalMethodsList(props: PersonalMethodsListProps) { return <ListReady key={props.expectedAccountId} {...props} />; }
function ListReady({ locale, initial, query, expectedAccountId }: PersonalMethodsListProps) {
  const t = getMethodsDictionary(locale), id = useId(), router = useRouter(); const [pending, startTransition] = useTransition();
  const [accountChecking, setAccountChecking] = useState(false), [accountMismatch, setAccountMismatch] = useState(false), [accountError, setAccountError] = useState<ApiError | null>(null);
  useEffect(() => {
    let sequence = 0;
    const unsubscribe = subscribeAccountEvents((kind) => {
      const request = ++sequence;
      if (kind !== "signed-in") { window.location.replace(authHref(locale, "sign-in", methodsHref(locale, query), "required")); return; }
      setAccountChecking(true);
      void getCurrentUser().then((result) => { if (request !== sequence) return; setAccountChecking(false); if (result.ok) { setAccountMismatch(result.data.id !== expectedAccountId); setAccountError(null); } else setAccountError(result.error); });
    });
    return () => { sequence++; unsubscribe(); };
  }, [locale, query, expectedAccountId]);
  if (accountChecking || accountMismatch || accountError) return <MethodShell locale={locale} title={t.libraryTitle} description={t.libraryIntro}><div className="space-y-4">{accountChecking ? <p role="status">{t.loading}</p> : accountError ? <MethodsError locale={locale} error={accountError} returnTo={methodsPath(locale)} /> : <StatusMessage tone="warning">{t.accountChanged}</StatusMessage>}<Link href={methodsPath(locale)} prefetch={false}>{t.accountLibrary}</Link></div></MethodShell>;
  return <MethodShell locale={locale} title={t.libraryTitle} description={t.libraryIntro} languageLinks={{ fr: methodsHref("fr", query), en: methodsHref("en", query) }}><div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button asChild><Link href={methodsPath(locale, "new")} prefetch={false} className="no-underline">{t.newMethod}</Link></Button>{initial.ok && <p role="status" className="text-sm text-muted-foreground">{initial.data.total} {initial.data.total === 1 ? t.oneMethod : t.manyMethods}</p>}</div>
    <form action={methodsPath(locale)} method="get" className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(160px,240px)_auto] sm:items-end" key={JSON.stringify(query)}><FormField id={`${id}-search`} label={t.search}><Input name="q" type="search" maxLength={240} defaultValue={query.q ?? ""} placeholder={t.searchHint} /></FormField><FormField id={`${id}-category`} label={t.categoryFilter}><Input name="category" maxLength={80} defaultValue={query.category ?? ""} /></FormField><Button type="submit">{t.searchAction}</Button></form>
    {(query.q || query.category) && <Link href={methodsPath(locale)} className="inline-flex min-h-11 items-center text-sm">{t.clearFilters}</Link>}
    {!initial.ok ? <MethodsError locale={locale} error={initial.error} returnTo={methodsHref(locale, query)} retry={() => startTransition(() => router.refresh())} /> : initial.data.items.length === 0 ? <EmptyState title={query.q || query.category ? t.noMatchTitle : t.emptyTitle} description={query.q || query.category ? t.noMatchDescription : t.emptyDescription}><Link href={`${publicCatalogueHref(locale)}?${new URLSearchParams({ locale, type: "METHOD_TEMPLATE" })}`}>{t.catalogue}</Link></EmptyState> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{initial.data.items.map((method) => <Card key={method.id}><CardHeader><div className="flex flex-wrap gap-2"><Badge>{method.locale.toUpperCase()}</Badge>{method.category && <Badge>{method.category}</Badge>}<Badge tone={method.hasSource ? "brand" : "neutral"}>{method.hasSource ? t.hasSource : t.independent}</Badge></div><h2 className="break-words text-xl font-semibold"><Link href={methodsPath(locale, method.id)} prefetch={false}>{method.title}</Link></h2></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{t.updated} {methodDate(method.updatedAt, locale)}</p><Link href={methodsPath(locale, method.id)} prefetch={false} className="inline-flex min-h-11 items-center">{t.open}</Link></CardContent></Card>)}</div>}
    {initial.ok && initial.data.total > 0 && initial.data.page < Math.ceil(initial.data.total / initial.data.pageSize) && <Pagination page={initial.data.page + 1} totalPages={Math.ceil(initial.data.total / initial.data.pageSize)} label={t.pagination} previousLabel={t.previous} nextLabel={t.next} pageLabel={t.pageLabel} hrefForPage={(page) => methodsHref(locale, { ...query, page: page - 1 })} />}
    {pending && <p role="status" className="text-sm text-muted-foreground">{t.loading}</p>}
  </div></MethodShell>;
}
