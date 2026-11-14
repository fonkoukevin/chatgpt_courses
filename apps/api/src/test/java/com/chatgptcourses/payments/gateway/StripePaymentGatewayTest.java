package com.chatgptcourses.payments.gateway;

import static org.assertj.core.api.Assertions.*;
import com.chatgptcourses.payments.config.StripeSettings;
import com.chatgptcourses.payments.service.PaymentGatewayException;
import com.chatgptcourses.payments.service.PaymentTypes.CheckoutParameters;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

/** Pinned real SDK over loopback HTTP with synthetic data; no merchant, card or database. */
class StripePaymentGatewayTest {
    @Test void onlyTheTwoHostedPathFamiliesRetainTheExactHttpsIdentityAndBound() {
        for (var prefix : List.of("/c/pay/", "/g/pay/")) {
            String base = "https://checkout.stripe.com" + prefix;
            assertThat(StripePaymentGateway.validCheckoutUrl(base + "cs_test_SYNTHETIC?locale=fr#synthetic-fragment")).isTrue();
            assertThat(StripePaymentGateway.validCheckoutUrl(base + "x".repeat(4096 - base.length()))).isTrue();
            assertThat(StripePaymentGateway.validCheckoutUrl(base + "x".repeat(4097 - base.length()))).isFalse();
            for (var unsafe : List.of("http://checkout.stripe.com" + prefix + "synthetic",
                    "https://checkout.stripe.com:443" + prefix + "synthetic",
                    "https://checkout.stripe.com:9443" + prefix + "synthetic",
                    "https://synthetic@checkout.stripe.com" + prefix + "synthetic",
                    "https://checkout.stripe.com.foreign.invalid" + prefix + "synthetic",
                    "https://foreign.invalid" + prefix + "synthetic")) {
                assertThat(StripePaymentGateway.validCheckoutUrl(unsafe)).isFalse();
            }
        }
        for (var path : List.of("/pay/synthetic", "/x/pay/synthetic", "/g/pay", "/g/payment/synthetic",
                "/g/pay-other/synthetic", "/G/pay/synthetic", "//g/pay/synthetic", "/c/pay-other/synthetic")) {
            assertThat(StripePaymentGateway.validCheckoutUrl("https://checkout.stripe.com" + path)).isFalse();
        }
        assertThat(StripePaymentGateway.validCheckoutUrl(null)).isFalse();
        assertThat(StripePaymentGateway.validCheckoutUrl("https://checkout.stripe.com/g/pay/invalid space")).isFalse();
    }

    @Test void realSdkCreatesRetrievesAndFindsBothHostedRoutesWithoutChangingTheirUrlOrCreatingAgain() throws Exception {
        for (var prefix : List.of("/c/pay/", "/g/pay/")) try (var provider = new Provider(prefix)) {
            var gateway = provider.gateway();
            var created = gateway.createCheckout(provider.parameters, provider.idempotencyKey());
            assertThat(created.url()).isEqualTo(provider.checkoutUrl());
            assertThat(created.sessionId()).isEqualTo(Provider.SESSION);
            assertThat(created.expiresAt()).isEqualTo(provider.parameters.expiresAt());
            assertThat(created.livemode()).isFalse();
            var facts = gateway.retrieveCheckoutFacts(created.sessionId());
            assertThat(facts.url()).isEqualTo(created.url());
            assertThat(facts.operationId()).isEqualTo(provider.parameters.operationId());
            assertThat(facts.orderId()).isEqualTo(provider.parameters.orderId());
            assertThat(facts.sessionStatus()).isEqualTo("open");
            assertThat(facts.paymentStatus()).isEqualTo("unpaid");
            assertThat(facts.amountTotal()).isEqualTo(100);
            assertThat(facts.lines()).hasSize(1);
            assertThat(facts.lines().getFirst().productReference()).isEqualTo(provider.parameters.offerRevisionId().toString());
            assertThat(gateway.findCheckoutFacts(provider.parameters)).contains(facts);
            assertThat(provider.creates.get()).isEqualTo(1);
            assertThat(provider.accountReads.get()).isEqualTo(1);
            assertThat(provider.failure.get()).isNull();
        }
    }

    @Test void nativeResponseModeExpiryAndUntrustedRouteStillFailClosedForCreateAndRetrieval() throws Exception {
        try (var provider = new Provider("/g/pay/")) {
            var gateway = provider.gateway();
            for (var change : List.of("LIVE", "EXPIRY", "FOREIGN", "PATH")) {
                provider.invalid = change;
                var failure = catchThrowable(() -> gateway.createCheckout(provider.parameters, provider.idempotencyKey()));
                assertThat(failure).isInstanceOf(PaymentGatewayException.class);
                assertThat(((PaymentGatewayException) failure).reason()).isEqualTo("PROVIDER_RESPONSE_INVALID");
                assertThat(((PaymentGatewayException) failure).ambiguous()).isTrue();
                if (change.equals("FOREIGN") || change.equals("PATH")) {
                    var retrieval = catchThrowable(() -> gateway.retrieveCheckoutFacts(Provider.SESSION));
                    assertThat(retrieval).isInstanceOf(PaymentGatewayException.class);
                    assertThat(((PaymentGatewayException) retrieval).reason()).isEqualTo("PROVIDER_RESPONSE_INVALID");
                }
            }
            assertThat(provider.failure.get()).isNull();
        }
    }

    private static final class Provider implements AutoCloseable {
        static final String SESSION = "cs_test_SYNTHETIC_GATEWAY", ACCOUNT = "acct_SYNTHETIC_GATEWAY";
        final AtomicInteger creates = new AtomicInteger(), accountReads = new AtomicInteger();
        final AtomicReference<String> failure = new AtomicReference<>();
        final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
        final HttpServer server;
        final String prefix;
        final CheckoutParameters parameters = new CheckoutParameters(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "fr", "Synthetic gateway contract", 100, "EUR", "https://courses.invalid/fr/synthetic?checkout=success",
                "https://courses.invalid/fr/synthetic?checkout=cancel", Instant.now().plusSeconds(3600).truncatedTo(ChronoUnit.SECONDS));
        volatile String invalid = "NONE";
        Provider(String prefix) throws Exception {
            this.prefix = prefix;
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(executor); server.createContext("/", this::handle); server.start();
        }
        StripePaymentGateway gateway() {
            return new StripePaymentGateway(new StripeSettings(true, "TEST", "sk_test_SYNTHETIC_GATEWAY", "whsec_SYNTHETIC_GATEWAY",
                    ACCOUNT, URI.create("http://127.0.0.1:" + server.getAddress().getPort()), Duration.ofSeconds(1), Duration.ofSeconds(3), Duration.ofMinutes(10)));
        }
        String idempotencyKey() { return "cc-checkout-" + parameters.operationId(); }
        String checkoutUrl() { return "https://checkout.stripe.com" + prefix + SESSION + "?locale=fr#synthetic-fragment"; }
        void require(boolean condition, String code) { if (!condition) { failure.compareAndSet(null, code); throw new IllegalStateException(code); } }
        void handle(HttpExchange exchange) {
            try {
                require("Bearer sk_test_SYNTHETIC_GATEWAY".equals(exchange.getRequestHeaders().getFirst("Authorization")), "SYNTHETIC_AUTH_MISSING");
                require(StripeSettings.API_VERSION.equals(exchange.getRequestHeaders().getFirst("Stripe-Version")), "SYNTHETIC_VERSION_CHANGED");
                require(exchange.getRequestHeaders().getFirst("Stripe-Account") == null, "SYNTHETIC_CONNECT_UNEXPECTED");
                String path = exchange.getRequestURI().getPath(); Object response;
                if (path.equals("/v1/account")) { accountReads.incrementAndGet(); response = Map.of("id", ACCOUNT, "object", "account"); }
                else if (exchange.getRequestMethod().equals("POST")) {
                    require(path.equals("/v1/checkout/sessions"), "SYNTHETIC_POST_UNEXPECTED");
                    require(idempotencyKey().equals(exchange.getRequestHeaders().getFirst("Idempotency-Key")), "SYNTHETIC_IDEMPOTENCY_CHANGED");
                    var form = new HashMap<String, String>();
                    for (var pair : new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8).split("&")) {
                        var parts = pair.split("=", 2); form.put(URLDecoder.decode(parts[0], StandardCharsets.UTF_8), URLDecoder.decode(parts.length == 2 ? parts[1] : "", StandardCharsets.UTF_8));
                    }
                    require(parameters.orderId().toString().equals(form.get("client_reference_id")) && parameters.operationId().toString().equals(form.get("metadata[operation_id]"))
                            && parameters.orderId().toString().equals(form.get("metadata[order_id]")) && Long.toString(parameters.expiresAt().getEpochSecond()).equals(form.get("expires_at")), "SYNTHETIC_REQUEST_IDENTITY_CHANGED");
                    creates.incrementAndGet(); response = session();
                } else if (path.endsWith("/line_items")) {
                    response = Map.of("object", "list", "has_more", false, "data", List.of(Map.of("id", "li_SYNTHETIC", "object", "item", "amount_total", 100, "currency", "eur", "quantity", 1,
                            "price", Map.of("id", "price_SYNTHETIC", "object", "price", "product", Map.of("id", "prod_SYNTHETIC", "object", "product", "metadata", Map.of("offer_revision_id", parameters.offerRevisionId().toString()))))));
                } else if (path.equals("/v1/checkout/sessions")) response = Map.of("object", "list", "has_more", false, "data", List.of(session()));
                else { require(path.equals("/v1/checkout/sessions/" + SESSION), "SYNTHETIC_GET_UNEXPECTED"); response = session(); }
                byte[] body = new ObjectMapper().writeValueAsBytes(response); exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body);
            } catch (Exception unavailable) { try { exchange.sendResponseHeaders(500, -1); } catch (Exception ignored) { /* Local fixture already failed closed. */ } }
            finally { exchange.close(); }
        }
        Map<String, Object> session() {
            String url = invalid.equals("FOREIGN") ? "https://foreign.invalid/g/pay/synthetic" : invalid.equals("PATH") ? "https://checkout.stripe.com/x/pay/synthetic" : checkoutUrl();
            return Map.ofEntries(Map.entry("id", SESSION), Map.entry("object", "checkout.session"), Map.entry("livemode", invalid.equals("LIVE")),
                    Map.entry("expires_at", parameters.expiresAt().getEpochSecond() + (invalid.equals("EXPIRY") ? 1 : 0)), Map.entry("url", url),
                    Map.entry("metadata", Map.of("operation_id", parameters.operationId().toString(), "order_id", parameters.orderId().toString())),
                    Map.entry("client_reference_id", parameters.orderId().toString()), Map.entry("mode", "payment"), Map.entry("status", "open"), Map.entry("payment_status", "unpaid"),
                    Map.entry("amount_total", 100), Map.entry("currency", "eur"));
        }
        public void close() { server.stop(0); executor.close(); }
    }
}
