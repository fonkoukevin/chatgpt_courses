package com.chatgptcourses.commerce.service;

import com.chatgptcourses.shared.money.Money;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Server-calculated commerce snapshots. Payment, order and access remain separate facts. */
public final class CommerceTypes {
    private CommerceTypes() { }
    public record LocalizedText(String locale,String text) { }
    public record OfferCopy(String locale,String title,String summary) { }
    public record OfferResourceInput(UUID resourceId,UUID versionId) { }
    public record OfferPeriod(String mode,Integer days) { }
    public record OfferSupport(String mode,List<LocalizedText> descriptions) { }
    public record OfferConditions(OfferPeriod access,OfferPeriod updates,String versionPolicy,OfferSupport support,boolean humanReviewIncluded,String termsVersion,List<LocalizedText> terms) { }
    public record OfferTax(String mode,List<LocalizedText> notices) { }
    public record OfferFields(List<OfferCopy> copies,List<OfferResourceInput> resources,List<String> locales,Money price,OfferTax tax,OfferConditions conditions) { }
    public record CreateOffer(String code,String kind,OfferFields fields,String reason) { }
    public record SaveOffer(OfferFields fields,String reason) { }
    public record ChangeOfferState(String reason) { }
    public record OfferView(UUID id,UUID productId,long revision,UUID currentRevisionId,int revisionNumber,String code,String kind,String state,OfferFields fields,Instant createdAt,Instant updatedAt) { }
    public record CommerceIssue(String code,String field,UUID resourceId,String locale) { }
    public record OfferReadiness(UUID offerId,long checkedRevision,boolean summaryReady,boolean checkoutAvailable,List<CommerceIssue> blockingIssues,List<CommerceIssue> warnings,String checkoutUnavailableReason) { }
    public record OfferResource(UUID resourceId,UUID versionId,int versionNumber,String locale,String title,String slug,String availability,String access) { }
    public record PublicOffer(UUID id,UUID productId,long revision,String code,String kind,String state,String locale,boolean translationAvailable,String title,String summary,List<OfferResource> resources,List<String> locales,Money price,OfferTax tax,OfferConditions conditions,OfferReadiness readiness) { }
    public record OfferSummary(UUID id,long revision,String code,String kind,String state,String locale,boolean translationAvailable,String title,String summary,Money price) { }
    public record OfferPage(List<OfferSummary> items,int page,int pageSize,long total) { }
    public record OfferQuery(String q,String state,String kind,String locale,int page,int pageSize) { }
    public record CreateOrder(UUID offerId,long offerRevision,String locale,String acceptedTermsVersion) { }
    public record OrderResource(UUID id,UUID resourceId,UUID versionId,int versionNumber,String title,String slug,List<String> locales) { }
    public record OrderSnapshot(UUID offerId,long offerRevision,UUID offerRevisionId,String code,String kind,String locale,String title,List<OrderResource> resources,List<String> locales,Money total,OfferTax tax,OfferConditions conditions) { }
    public record OrderView(UUID id,long revision,String orderStatus,String paymentStatus,String fulfillmentStatus,OrderSnapshot snapshot,String acceptedTermsVersion,Instant acceptedAt,Instant createdAt,Instant expiresAt) { }
    public record OrderSummary(UUID id,long revision,UUID offerId,long offerRevision,String locale,String title,Money total,String orderStatus,String paymentStatus,String fulfillmentStatus,Instant createdAt,Instant expiresAt) { }
    public record OrderPage(List<OrderSummary> items,int page,int pageSize,long total) { }
    public record OrderCreationResult(OrderView value,boolean created) { }
    public record CoverageResource(UUID resourceId,UUID versionId,List<String> coveredLocales,List<String> missingLocales,boolean alreadyAccessible) { }
    public record PurchaseCoverage(String status,List<CoverageResource> resources,int alreadyAccessibleCount,int newResourceCount) { }
    public record PurchaseContext(PublicOffer offer,PurchaseCoverage coverage,OrderSummary activeOrder) { }
}
