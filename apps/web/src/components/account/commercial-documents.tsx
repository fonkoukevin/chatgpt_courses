"use client";
import { useCallback } from "react";
import { Button, StatusMessage } from "@/components/ui";
import { getCommercialDocuments } from "@/lib/api/account-client";
import { getAccountDictionary } from "@/lib/i18n/account";
import type { Locale } from "@/lib/i18n/locales";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { AccountError } from "./parts";
import { useAccountResource } from "./use-resource";
export function OrderCommercialDocuments({ locale, orderId, account, boundary }: { locale: Locale; orderId: string; account: LearningAccountState; boundary: LearningAccountBoundary }) {
  const t = getAccountDictionary(locale), load = useCallback(() => getCommercialDocuments(orderId), [orderId]), read = useAccountResource(account, boundary, load);
  return account.status === "active" ? <section className="space-y-4 rounded-panel border border-border p-4 sm:p-6" data-commercial-documents><h3 className="text-xl font-semibold">{t.documents}</h3><p className="text-sm text-muted-foreground">{t.documentsHelp}</p>{read.result?.ok ? <StatusMessage>{t.noDocuments}</StatusMessage> : read.result ? <AccountError locale={locale} error={read.result.error} retry={read.reload} /> : <p role="status">{t.loading}</p>}<Button variant="secondary" onClick={read.reload} busy={read.loading}>{t.refresh}</Button></section> : null;
}
