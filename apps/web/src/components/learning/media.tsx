"use client";

import { AssetAccess } from "@/components/assets/access";
import type { ResourceDetail } from "@/lib/api/generated/types.gen";
import { getAssetsDictionary } from "@/lib/i18n/assets";
import type { Locale } from "@/lib/i18n/locales";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { VideoMedia } from "./video";

export function LearningMedia({ locale, resource, account, boundary, enrollmentId }: { locale: Locale; resource: ResourceDetail; account?: LearningAccountState; boundary?: LearningAccountBoundary; enrollmentId?: string }) {
  const t = getAssetsDictionary(locale), media = resource.document?.media ?? [];
  if (!media.length) return null;
  return <section className="min-w-0 space-y-5" data-learning-media><h2 className="text-2xl font-semibold">{t.media}</h2><ul className="space-y-4">{media.map((reference) => <li key={`media:${reference.assetId}:${resource.versionId}:${resource.locale}:${resource.revisionId}`} className="min-w-0 space-y-3 rounded-panel border border-border bg-surface-subtle p-4 sm:p-5"><h3 className="break-words font-semibold" lang={resource.locale}>{reference.label}</h3>{reference.kind === "VIDEO" ? <VideoMedia locale={locale} mediaId={reference.assetId} label={reference.label} context={{ locale: resource.locale, resourceId: resource.resourceId, versionId: resource.versionId, enrollmentId: enrollmentId ?? null }} account={account} boundary={boundary} /> : <AssetAccess locale={locale} assetId={reference.assetId} kind={reference.kind} label={reference.label} context={{ locale: resource.locale, resourceId: resource.resourceId, versionId: resource.versionId, enrollmentId: enrollmentId ?? null }} account={account} boundary={boundary} />}</li>)}</ul><p className="text-sm leading-relaxed text-muted-foreground">{t.textAlternative}</p></section>;
}
