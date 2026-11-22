"use client";

import { Badge, Link, StatusMessage } from "@/components/ui";
import { CommerceError, CommerceRefresh, OfferTerms } from "@/components/commerce/parts";
import type { AuthResult } from "@/lib/api/auth-client";
import type { CourseOfferSelection } from "@/lib/commerce/course-offers";
import { commerceMoney } from "@/lib/commerce/format";
import { offersPath } from "@/lib/commerce/routes";
import { getCommerceDictionary } from "@/lib/i18n/commerce";
import type { Locale } from "@/lib/i18n/locales";

const copy = {
  fr: { title: "Offre pour cette formation", help: "Pour la version et la langue de cette fiche. Consultez le contenu inclus et les conditions avant de choisir.",
    none: "Aucune offre publiée n’est liée à cette version en français.", choice: "Plusieurs offres incluent cette version. Choisissez celle qui vous convient.",
    included: "Contenu et conditions inclus", details: "Consulter cette offre", inactive: "Cette offre est indisponible à l’achat.", preparation: "Cette offre ne peut pas encore être commandée. Consultez ses informations à jour.", payment: "Le paiement est actuellement indisponible.",
    more: "Voir toutes les offres liées à cette version", version: "Version" },
  en: { title: "Offer for this course", help: "For the version and language on this page. Review what is included and the terms before choosing.",
    none: "No published offer is linked to this version in English.", choice: "Several offers include this version. Choose the one that suits you.",
    included: "Included content and terms", details: "View this offer", inactive: "This offer is unavailable for purchase.", preparation: "This offer cannot be ordered yet. Review its current details.", payment: "Payment is currently unavailable.",
    more: "View all offers linked to this version", version: "Version" },
} as const;

export function CourseOffers({ locale, result }: { locale: Locale; result?: AuthResult<CourseOfferSelection> }) {
  if (!result) return null;
  const t = copy[locale], commerce = getCommerceDictionary(locale);
  return <section className="min-w-0 space-y-4 border-t border-border pt-6" data-course-offers>
    <div className="space-y-2"><h2 className="text-xl font-semibold">{t.title}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.help}</p></div>
    {!result.ok ? <div className="space-y-3"><CommerceError locale={locale} error={result.error} /><CommerceRefresh locale={locale} /></div>
      : !result.data.items.length ? <StatusMessage>{t.none}</StatusMessage>
        : <>{result.data.total > 1 && <p className="text-sm leading-relaxed">{t.choice}</p>}
          <div className="space-y-5">{result.data.items.map(offer => <article key={`${offer.id}:${offer.revision}`} data-course-offer={offer.id} data-offer-revision={offer.revision} className="min-w-0 space-y-3 rounded-input border border-border p-4">
            <div className="flex flex-wrap gap-2"><Badge>{commerce[offer.kind]}</Badge><Badge tone={offer.state === "ACTIVE" ? "brand" : "warning"}>{commerce[offer.state]}</Badge></div>
            <h3 className="break-words text-lg font-semibold">{offer.title || commerce.missingTranslation}</h3>
            {offer.summary && <p className="break-words text-sm leading-relaxed text-muted-foreground">{offer.summary}</p>}
            <p className="break-words text-2xl font-semibold" data-course-offer-price>{commerceMoney(offer.price, locale) ?? commerce.priceUnknown}</p>
            {offer.state === "INACTIVE" ? <StatusMessage tone="warning">{t.inactive}</StatusMessage> : !offer.readiness.summaryReady ? <StatusMessage tone="warning">{t.preparation}</StatusMessage> : !offer.readiness.checkoutAvailable && <StatusMessage tone="warning">{t.payment}</StatusMessage>}
            <details className="group min-w-0"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{t.included}</summary>
              <div className="space-y-5 pt-2"><ul className="space-y-3 text-sm">{offer.resources.map(resource => <li key={`${resource.resourceId}:${resource.versionId}`} className="break-words"><p className="font-medium">{resource.title || commerce.notConfigured}</p><p className="text-muted-foreground">{t.version} {resource.versionNumber} · {resource.locale.toUpperCase()}</p></li>)}</ul>
                <OfferTerms locale={locale} conditions={offer.conditions} tax={offer.tax} />
              </div>
            </details>
            <Link href={offersPath(locale, offer.id)} prefetch={false} className="inline-flex min-h-11 items-center font-medium" data-course-offer-link>{t.details}</Link>
          </article>)}</div>
          {result.data.total > result.data.items.length && <Link href={result.data.moreHref} prefetch={false} className="inline-flex min-h-11 items-center font-medium" data-course-offers-more>{t.more}</Link>}
        </>}
  </section>;
}
