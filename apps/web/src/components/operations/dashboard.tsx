"use client";
import { useCallback } from "react";
import { Badge, Button } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { OperationsDashboard as Dashboard } from "@/lib/api/generated/types.gen";
import { getOperationsDashboard } from "@/lib/api/operations-client";
import { getOperationsDictionary } from "@/lib/i18n/operations";
import { getOperationsDataDictionary } from "@/lib/i18n/operations-data";
import type { Locale } from "@/lib/i18n/locales";
import { useLearningAccount } from "@/lib/learning/account";
import { operationsCount } from "@/lib/operations/format";
import type { OperationsPeriodQuery } from "@/lib/operations/query";
import { operationsHref } from "@/lib/operations/routes";
import { useAccountResource } from "@/components/account/use-resource";
import { OperationsBoundaryNotice, OperationsError, OperationsFilters, operationsDate } from "./parts";
import { OperationsShell } from "./shell";
export function OperationsDashboardPage({locale,expectedAccountId,permissions,initial,query}:{locale:Locale;expectedAccountId:string;permissions:string[];initial:AuthResult<Dashboard>;query:OperationsPeriodQuery}){
  const t=getOperationsDictionary(locale),d=getOperationsDataDictionary(locale),destination=operationsHref(locale,"dashboard",query),{state:account,boundary}=useLearningAccount(destination,expectedAccountId),load=useCallback(()=>getOperationsDashboard(query),[query]),read=useAccountResource(account,boundary,permissions.includes("operations.read")?load:null,initial);
  return <OperationsShell locale={locale} permissions={permissions} languageLinks={{fr:operationsHref("fr","dashboard",query),en:operationsHref("en","dashboard",query)}}><OperationsBoundaryNotice locale={locale} account={account} boundary={boundary} destination={destination}/><div className="space-y-6"><OperationsFilters locale={locale} section="dashboard" query={query}/>{account.status==="active"&&(read.result?.ok?<><Button variant="secondary" onClick={read.reload} busy={read.loading}>{t.refresh}</Button><p className="text-sm text-muted-foreground">{t.observedAt} : {operationsDate(read.result.data.generatedAt,locale)}</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-operations-dashboard>{read.result.data.counters.map(item=><section key={item.code} data-dashboard-counter={item.code} className="min-w-0 space-y-3 rounded-panel border border-border bg-surface p-4 sm:p-5"><h2 className="font-semibold">{d.counter[item.code]}</h2><Badge tone={item.availability==="AVAILABLE"?"neutral":"warning"}>{d.availability[item.availability]}</Badge><p className="break-all text-3xl font-semibold tabular-nums">{item.value===null?t.unknown:operationsCount(item.value,locale)}</p></section>)}</div><p className="text-sm leading-relaxed text-muted-foreground">{d.backlogHelp}</p><p className="text-sm leading-relaxed text-muted-foreground">{d.activationHelp}</p></>:read.result?<OperationsError locale={locale} error={read.result.error} retry={read.reload}/>:<p role="status">{t.loading}</p>)}</div></OperationsShell>;
}
export { OperationsDashboardPage as OperationsDashboard };
