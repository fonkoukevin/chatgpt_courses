package com.chatgptcourses.commerce.http;

import com.chatgptcourses.commerce.service.CommerceTypes;
import com.chatgptcourses.shared.money.Money;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Explicit HTTP values; authoritative price, owner and payment state never come from CreateOrder. */
public final class CommerceDtos {
    private CommerceDtos() { }
    public record LocalizedText(@NotNull @Pattern(regexp = "fr|en") String locale, @NotNull @Size(max = 8000) String text) {
        public static LocalizedText from(CommerceTypes.LocalizedText value) { return value == null ? null : new LocalizedText(value.locale(), value.text()); }
        public CommerceTypes.LocalizedText command() { return new CommerceTypes.LocalizedText(locale, text); }
    }
    public record OfferCopy(@NotNull @Pattern(regexp = "fr|en") String locale, @NotNull @Size(max = 180) String title, @NotNull @Size(max = 2000) String summary) {
        public static OfferCopy from(CommerceTypes.OfferCopy value) { return value == null ? null : new OfferCopy(value.locale(), value.title(), value.summary()); }
        public CommerceTypes.OfferCopy command() { return new CommerceTypes.OfferCopy(locale, title, summary); }
    }
    public record OfferResourceInput(@NotNull UUID resourceId, @NotNull UUID versionId) {
        public static OfferResourceInput from(CommerceTypes.OfferResourceInput value) { return value == null ? null : new OfferResourceInput(value.resourceId(), value.versionId()); }
        public CommerceTypes.OfferResourceInput command() { return new CommerceTypes.OfferResourceInput(resourceId, versionId); }
    }
    public record OfferPeriod(@Pattern(regexp = "FIXED|UNLIMITED|NONE|PERIOD") String mode, @Min(1) @Max(36500) Integer days) {
        public static OfferPeriod from(CommerceTypes.OfferPeriod value) { return value == null ? null : new OfferPeriod(value.mode(), value.days()); }
        public CommerceTypes.OfferPeriod command() { return new CommerceTypes.OfferPeriod(mode, days); }
    }
    public record OfferSupport(@Pattern(regexp = "NONE|ASYNC") String mode, @NotNull @Size(max = 2) List<@NotNull @Valid LocalizedText> descriptions) {
        public static OfferSupport from(CommerceTypes.OfferSupport value) { return value == null ? null : new OfferSupport(value.mode(), value.descriptions().stream().map(LocalizedText::from).toList()); }
        public CommerceTypes.OfferSupport command() { return new CommerceTypes.OfferSupport(mode, descriptions.stream().map(LocalizedText::command).toList()); }
    }
    public record OfferConditions(@Valid OfferPeriod access, @Valid OfferPeriod updates, @Pattern(regexp = "PINNED|UPDATES_DURING_PERIOD") String versionPolicy, @Valid OfferSupport support, @NotNull Boolean humanReviewIncluded, @Size(max = 100) String termsVersion, @NotNull @Size(max = 2) List<@NotNull @Valid LocalizedText> terms) {
        public static OfferConditions from(CommerceTypes.OfferConditions value) { return value == null ? null : new OfferConditions(OfferPeriod.from(value.access()), OfferPeriod.from(value.updates()), value.versionPolicy(), OfferSupport.from(value.support()), value.humanReviewIncluded(), value.termsVersion(), value.terms().stream().map(LocalizedText::from).toList()); }
        public CommerceTypes.OfferConditions command() { return new CommerceTypes.OfferConditions(access == null ? null : access.command(), updates == null ? null : updates.command(), versionPolicy, support == null ? null : support.command(), humanReviewIncluded, termsVersion, terms.stream().map(LocalizedText::command).toList()); }
    }
    public record OfferTax(@Pattern(regexp = "INCLUSIVE|EXEMPT|EXCLUSIVE") String mode, @NotNull @Size(max = 2) List<@NotNull @Valid LocalizedText> notices) {
        public static OfferTax from(CommerceTypes.OfferTax value) { return value == null ? null : new OfferTax(value.mode(), value.notices().stream().map(LocalizedText::from).toList()); }
        public CommerceTypes.OfferTax command() { return new CommerceTypes.OfferTax(mode, notices.stream().map(LocalizedText::command).toList()); }
    }
    public record OfferFields(@NotNull @Size(max = 2) List<@NotNull @Valid OfferCopy> copies, @NotNull @Size(max = 20) List<@NotNull @Valid OfferResourceInput> resources, @NotNull @Size(max = 2) List<@NotNull String> locales, @Valid Money price, @Valid OfferTax tax, @Valid OfferConditions conditions) {
        public static OfferFields from(CommerceTypes.OfferFields value) { return value == null ? null : new OfferFields(value.copies().stream().map(OfferCopy::from).toList(), value.resources().stream().map(OfferResourceInput::from).toList(), value.locales(), value.price(), OfferTax.from(value.tax()), OfferConditions.from(value.conditions())); }
        public CommerceTypes.OfferFields command() { return new CommerceTypes.OfferFields(copies.stream().map(OfferCopy::command).toList(), resources.stream().map(OfferResourceInput::command).toList(), locales, price, tax == null ? null : tax.command(), conditions == null ? null : conditions.command()); }
    }
    public record CreateOffer(@NotNull @Pattern(regexp = "[a-z0-9][a-z0-9-]{0,79}") String code, @NotNull @Pattern(regexp = "COURSE|PACK") String kind, @NotNull @Valid OfferFields fields, @NotNull @NotBlank @Size(max = 1000) String reason) {
        public static CreateOffer from(CommerceTypes.CreateOffer value) { return value == null ? null : new CreateOffer(value.code(), value.kind(), OfferFields.from(value.fields()), value.reason()); }
        public CommerceTypes.CreateOffer command() { return new CommerceTypes.CreateOffer(code, kind, fields == null ? null : fields.command(), reason); }
    }
    public record SaveOffer(@NotNull @Valid OfferFields fields, @NotNull @NotBlank @Size(max = 1000) String reason) {
        public static SaveOffer from(CommerceTypes.SaveOffer value) { return value == null ? null : new SaveOffer(OfferFields.from(value.fields()), value.reason()); }
        public CommerceTypes.SaveOffer command() { return new CommerceTypes.SaveOffer(fields == null ? null : fields.command(), reason); }
    }
    public record ChangeOfferState(@NotNull @NotBlank @Size(max = 1000) String reason) {
        public static ChangeOfferState from(CommerceTypes.ChangeOfferState value) { return value == null ? null : new ChangeOfferState(value.reason()); }
        public CommerceTypes.ChangeOfferState command() { return new CommerceTypes.ChangeOfferState(reason); }
    }
    public record OfferView(UUID id, UUID productId, long revision, UUID currentRevisionId, int revisionNumber, String code, String kind, String state, OfferFields fields, Instant createdAt, Instant updatedAt) {
        public static OfferView from(CommerceTypes.OfferView value) { return value == null ? null : new OfferView(value.id(), value.productId(), value.revision(), value.currentRevisionId(), value.revisionNumber(), value.code(), value.kind(), value.state(), OfferFields.from(value.fields()), value.createdAt(), value.updatedAt()); }
    }
    public record CommerceIssue(String code, String field, UUID resourceId, String locale) {
        public static CommerceIssue from(CommerceTypes.CommerceIssue value) { return value == null ? null : new CommerceIssue(value.code(), value.field(), value.resourceId(), value.locale()); }
    }
    public record OfferReadiness(UUID offerId, long checkedRevision, boolean summaryReady, boolean checkoutAvailable, List<CommerceIssue> blockingIssues, List<CommerceIssue> warnings, String checkoutUnavailableReason) {
        public static OfferReadiness from(CommerceTypes.OfferReadiness value) { return value == null ? null : new OfferReadiness(value.offerId(), value.checkedRevision(), value.summaryReady(), value.checkoutAvailable(), value.blockingIssues().stream().map(CommerceIssue::from).toList(), value.warnings().stream().map(CommerceIssue::from).toList(), value.checkoutUnavailableReason()); }
    }
    public record OfferResource(UUID resourceId, UUID versionId, int versionNumber, String locale, String title, String slug, String availability, String access) {
        public static OfferResource from(CommerceTypes.OfferResource value) { return value == null ? null : new OfferResource(value.resourceId(), value.versionId(), value.versionNumber(), value.locale(), value.title(), value.slug(), value.availability(), value.access()); }
    }
    public record PublicOffer(UUID id, UUID productId, long revision, String code, String kind, String state, String locale, boolean translationAvailable, String title, String summary, List<OfferResource> resources, List<String> locales, Money price, OfferTax tax, OfferConditions conditions, OfferReadiness readiness) {
        public static PublicOffer from(CommerceTypes.PublicOffer value) { return value == null ? null : new PublicOffer(value.id(), value.productId(), value.revision(), value.code(), value.kind(), value.state(), value.locale(), value.translationAvailable(), value.title(), value.summary(), value.resources().stream().map(OfferResource::from).toList(), value.locales(), value.price(), OfferTax.from(value.tax()), OfferConditions.from(value.conditions()), OfferReadiness.from(value.readiness())); }
    }
    public record OfferSummary(UUID id, long revision, String code, String kind, String state, String locale, boolean translationAvailable, String title, String summary, Money price) {
        public static OfferSummary from(CommerceTypes.OfferSummary value) { return value == null ? null : new OfferSummary(value.id(), value.revision(), value.code(), value.kind(), value.state(), value.locale(), value.translationAvailable(), value.title(), value.summary(), value.price()); }
    }
    public record OfferPage(List<OfferSummary> items, int page, int pageSize, long total) {
        public static OfferPage from(CommerceTypes.OfferPage value) { return value == null ? null : new OfferPage(value.items().stream().map(OfferSummary::from).toList(), value.page(), value.pageSize(), value.total()); }
    }
    public record CreateOrder(@NotNull UUID offerId, @NotNull @Min(0) @Max(9007199254740991L) Long offerRevision, @NotNull @Pattern(regexp = "fr|en") String locale, @NotNull @Size(max = 100) @NotBlank String acceptedTermsVersion) {
        public static CreateOrder from(CommerceTypes.CreateOrder value) { return value == null ? null : new CreateOrder(value.offerId(), value.offerRevision(), value.locale(), value.acceptedTermsVersion()); }
        public CommerceTypes.CreateOrder command() { return new CommerceTypes.CreateOrder(offerId, offerRevision, locale, acceptedTermsVersion); }
    }
    public record OrderResource(UUID id, UUID resourceId, UUID versionId, int versionNumber, String title, String slug, List<String> locales) {
        public static OrderResource from(CommerceTypes.OrderResource value) { return value == null ? null : new OrderResource(value.id(), value.resourceId(), value.versionId(), value.versionNumber(), value.title(), value.slug(), value.locales()); }
    }
    public record OrderSnapshot(UUID offerId, long offerRevision, UUID offerRevisionId, String code, String kind, String locale, String title, List<OrderResource> resources, List<String> locales, Money total, OfferTax tax, OfferConditions conditions) {
        public static OrderSnapshot from(CommerceTypes.OrderSnapshot value) { return value == null ? null : new OrderSnapshot(value.offerId(), value.offerRevision(), value.offerRevisionId(), value.code(), value.kind(), value.locale(), value.title(), value.resources().stream().map(OrderResource::from).toList(), value.locales(), value.total(), OfferTax.from(value.tax()), OfferConditions.from(value.conditions())); }
    }
    public record OrderView(UUID id, long revision, String orderStatus, String paymentStatus, String fulfillmentStatus, OrderSnapshot snapshot, String acceptedTermsVersion, Instant acceptedAt, Instant createdAt, Instant expiresAt) {
        public static OrderView from(CommerceTypes.OrderView value) { return value == null ? null : new OrderView(value.id(), value.revision(), value.orderStatus(), value.paymentStatus(), value.fulfillmentStatus(), OrderSnapshot.from(value.snapshot()), value.acceptedTermsVersion(), value.acceptedAt(), value.createdAt(), value.expiresAt()); }
    }
    public record OrderSummary(UUID id, long revision, UUID offerId, long offerRevision, String locale, String title, Money total, String orderStatus, String paymentStatus, String fulfillmentStatus, Instant createdAt, Instant expiresAt) {
        public static OrderSummary from(CommerceTypes.OrderSummary value) { return value == null ? null : new OrderSummary(value.id(), value.revision(), value.offerId(), value.offerRevision(), value.locale(), value.title(), value.total(), value.orderStatus(), value.paymentStatus(), value.fulfillmentStatus(), value.createdAt(), value.expiresAt()); }
    }
    public record OrderPage(List<OrderSummary> items, int page, int pageSize, long total) {
        public static OrderPage from(CommerceTypes.OrderPage value) { return value == null ? null : new OrderPage(value.items().stream().map(OrderSummary::from).toList(), value.page(), value.pageSize(), value.total()); }
    }
    public record CoverageResource(UUID resourceId, UUID versionId, List<String> coveredLocales, List<String> missingLocales, boolean alreadyAccessible) {
        public static CoverageResource from(CommerceTypes.CoverageResource value) { return value == null ? null : new CoverageResource(value.resourceId(), value.versionId(), value.coveredLocales(), value.missingLocales(), value.alreadyAccessible()); }
    }
    public record PurchaseCoverage(String status, List<CoverageResource> resources, int alreadyAccessibleCount, int newResourceCount) {
        public static PurchaseCoverage from(CommerceTypes.PurchaseCoverage value) { return value == null ? null : new PurchaseCoverage(value.status(), value.resources().stream().map(CoverageResource::from).toList(), value.alreadyAccessibleCount(), value.newResourceCount()); }
    }
    public record PurchaseContext(PublicOffer offer, PurchaseCoverage coverage, OrderSummary activeOrder) {
        public static PurchaseContext from(CommerceTypes.PurchaseContext value) { return value == null ? null : new PurchaseContext(PublicOffer.from(value.offer()), PurchaseCoverage.from(value.coverage()), OrderSummary.from(value.activeOrder())); }
    }
}
