package com.chatgptcourses;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import tools.jackson.databind.ObjectMapper;

/** Explicit loopback transport double. The application still uses its pinned Stripe SDK and PostgreSQL. */
final class RefundStripeProvider implements AutoCloseable {
    static final String ACCOUNT = "acct_P13Isolated";
    final String key = "sk_test_local_" + UUID.randomUUID().toString().replace("-", "");
    final HttpServer server;
    final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    final Map<String, Session> sessions = new ConcurrentHashMap<>();
    final Map<String, Refund> refunds = new ConcurrentHashMap<>();
    final Map<String, String> refundKeys = new ConcurrentHashMap<>();
    final Map<String, Map<String, String>> refundParameters = new ConcurrentHashMap<>();
    final AtomicInteger refundPosts = new AtomicInteger();
    final AtomicInteger sessionPosts = new AtomicInteger();
    final AtomicInteger signatureVersionChecks = new AtomicInteger();
    volatile String nextRefundStatus = "succeeded";
    volatile boolean delayNextRefund;
    volatile CountDownLatch entered, release;
    volatile Consumer<Map<String, String>> beforeRefund = ignored -> { };
    volatile boolean allAuthorized = true;
    volatile boolean allNoConnect = true;
    volatile boolean allRefundParametersStable = true;

    RefundStripeProvider() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(executor);
            server.createContext("/v1/", this::handle);
            server.start();
        } catch (java.io.IOException failure) {
            throw new IllegalStateException("Isolated Stripe transport could not start");
        }
    }

    String base() { return "http://127.0.0.1:" + server.getAddress().getPort(); }

    void resetFaults() {
        nextRefundStatus = "succeeded";
        delayNextRefund = false;
        entered = null;
        release = null;
        beforeRefund = ignored -> { };
    }

    Session sessionForOrder(UUID orderId) {
        return sessions.values().stream().filter(s -> orderId.toString().equals(s.params().get("metadata[order_id]"))).findFirst().orElseThrow();
    }

    Refund externalRefund(Session session, long amount, String status) {
        return externalRefund(session, amount, status, Map.of());
    }

    Refund externalRefund(Session session, long amount, String status, Map<String, String> metadata) {
        Refund value = new Refund("re_fixture_" + opaque(), session.intentId(), amount, status, metadata);
        refunds.put(value.id, value);
        return value;
    }

    void status(String refundId, String status) { refunds.get(refundId).status = status; }

    private void handle(HttpExchange exchange) {
        try {
            allAuthorized &= ("Bearer " + key).equals(exchange.getRequestHeaders().getFirst("Authorization"));
            allNoConnect &= exchange.getRequestHeaders().getFirst("Stripe-Account") == null;
            if (com.chatgptcourses.payments.config.StripeSettings.API_VERSION.equals(exchange.getRequestHeaders().getFirst("Stripe-Version"))) signatureVersionChecks.incrementAndGet();
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod();
            Object result;
            if (path.equals("/v1/account")) result = Map.of("id", ACCOUNT, "object", "account");
            else if (path.equals("/v1/checkout/sessions") && method.equals("POST")) {
                sessionPosts.incrementAndGet();
                Map<String, String> params = form(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                String id = "cs_test_fixture_" + opaque();
                Session session = new Session(id, "pi_fixture_" + opaque(), "ch_fixture_" + opaque(), Map.copyOf(params));
                sessions.put(id, session);
                result = sessionJson(session);
            } else if (path.equals("/v1/checkout/sessions")) {
                result = list(sessions.values().stream().map(this::sessionJson).toList());
            } else if (path.startsWith("/v1/checkout/sessions/")) {
                Session session = sessions.values().stream().filter(s -> path.equals("/v1/checkout/sessions/" + s.id()) || path.equals("/v1/checkout/sessions/" + s.id() + "/line_items")).findFirst().orElseThrow();
                result = path.endsWith("/line_items") ? list(List.of(lineJson(session))) : sessionJson(session);
            } else if (path.equals("/v1/refunds") && method.equals("POST")) {
                refundPosts.incrementAndGet();
                Map<String, String> params = form(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                beforeRefund.accept(params);
                String idempotency = Objects.requireNonNull(exchange.getRequestHeaders().getFirst("Idempotency-Key"));
                var firstParameters = refundParameters.putIfAbsent(idempotency, Map.copyOf(params));
                allRefundParametersStable &= firstParameters == null || firstParameters.equals(params);
                String refundId = refundKeys.computeIfAbsent(idempotency, ignored -> {
                    Refund value = new Refund("re_fixture_" + opaque(), params.get("payment_intent"), Long.parseLong(params.get("amount")), nextRefundStatus, metadata(params));
                    refunds.put(value.id, value);
                    return value.id;
                });
                result = refundJson(refunds.get(refundId));
                CountDownLatch signal = entered, gate = release;
                if (signal != null) signal.countDown();
                if (gate != null) gate.await(8, TimeUnit.SECONDS);
                if (delayNextRefund) { delayNextRefund = false; Thread.sleep(3400); }
            } else if (path.equals("/v1/refunds")) {
                String intent = form(exchange.getRequestURI().getRawQuery()).get("payment_intent");
                result = list(refunds.values().stream().filter(r -> intent == null || intent.equals(r.intent)).map(this::refundJson).toList());
            } else if (path.startsWith("/v1/refunds/")) {
                result = refundJson(Objects.requireNonNull(refunds.get(path.substring("/v1/refunds/".length()))));
            } else if (path.startsWith("/v1/payment_intents/")) {
                Session session = sessions.values().stream().filter(s -> path.endsWith(s.intentId())).findFirst().orElseThrow();
                result = intentJson(session);
            } else if (path.startsWith("/v1/charges/")) {
                Session session = sessions.values().stream().filter(s -> path.endsWith(s.chargeId())).findFirst().orElseThrow();
                result = chargeJson(session);
            } else {
                exchange.sendResponseHeaders(404, -1);
                return;
            }
            byte[] bytes = new ObjectMapper().writeValueAsBytes(result);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
        } catch (Exception failure) {
            // Deliberately no message, request, headers or stack trace: those may contain bearer credentials.
            try { exchange.sendResponseHeaders(500, -1); } catch (java.io.IOException ignored) { }
        } finally { exchange.close(); }
    }

    Map<String, Object> sessionJson(Session session) {
        var p = session.params();
        var value = new LinkedHashMap<String, Object>();
        value.put("id", session.id()); value.put("object", "checkout.session");
        value.put("client_reference_id", p.get("client_reference_id"));
        value.put("metadata", Map.of("operation_id", p.get("metadata[operation_id]"), "order_id", p.get("metadata[order_id]")));
        value.put("mode", "payment"); value.put("status", "complete"); value.put("payment_status", "paid");
        value.put("livemode", false); value.put("amount_total", session.amount()); value.put("currency", session.currency());
        value.put("expires_at", Long.parseLong(p.get("expires_at")));
        value.put("url", "https://checkout.stripe.com/c/pay/" + session.id());
        value.put("payment_intent", intentJson(session));
        return value;
    }

    private Map<String, Object> intentJson(Session session) {
        return Map.of("id", session.intentId(), "object", "payment_intent", "status", "succeeded", "amount", session.amount(), "amount_received", session.amount(), "currency", session.currency(), "livemode", false, "latest_charge", chargeJson(session));
    }

    private Map<String, Object> chargeJson(Session session) {
        long refunded = refunds.values().stream().filter(r -> r.intent.equals(session.intentId()) && r.status.equals("succeeded")).mapToLong(r -> r.amount).sum();
        return Map.of("id", session.chargeId(), "object", "charge", "payment_intent", session.intentId(), "amount", session.amount(), "currency", session.currency(), "amount_refunded", refunded, "refunded", refunded == session.amount(), "livemode", false);
    }

    private Map<String, Object> lineJson(Session session) {
        var p = session.params();
        return Map.of("id", "li_fixture_" + session.id(), "object", "item", "amount_total", session.amount(), "currency", session.currency(), "quantity", 1, "price", Map.of("id", "price_fixture", "object", "price", "product", Map.of("id", "prod_fixture", "object", "product", "metadata", Map.of("offer_revision_id", p.get("line_items[0][price_data][product_data][metadata][offer_revision_id]")))));
    }

    Map<String, Object> refundJson(Refund refund) {
        Session session = sessions.values().stream().filter(s -> s.intentId().equals(refund.intent)).findFirst().orElseThrow();
        var result = new LinkedHashMap<String, Object>();
        result.put("id", refund.id); result.put("object", "refund"); result.put("amount", refund.amount);
        result.put("currency", session.currency()); result.put("payment_intent", refund.intent); result.put("charge", session.chargeId());
        result.put("status", refund.status); result.put("metadata", refund.metadata); result.put("created", Instant.now().getEpochSecond());
        if (refund.status.equals("failed")) result.put("failure_reason", "lost_or_stolen_card");
        return result;
    }

    private static Map<String, String> metadata(Map<String, String> form) {
        var result = new HashMap<String, String>();
        form.forEach((key, value) -> { if (key.startsWith("metadata[") && key.endsWith("]")) result.put(key.substring(9, key.length() - 1), value); });
        return Map.copyOf(result);
    }
    private static Map<String, String> form(String body) {
        var result = new HashMap<String, String>();
        if (body == null || body.isEmpty()) return result;
        for (String pair : body.split("&")) { String[] p = pair.split("=", 2); result.put(URLDecoder.decode(p[0], StandardCharsets.UTF_8), URLDecoder.decode(p.length == 2 ? p[1] : "", StandardCharsets.UTF_8)); }
        return result;
    }
    private static Map<String, Object> list(List<?> values) { return Map.of("object", "list", "has_more", false, "data", values); }
    private static String opaque() { return UUID.randomUUID().toString().replace("-", ""); }
    @Override public void close() { server.stop(0); executor.close(); }
    record Session(String id, String intentId, String chargeId, Map<String, String> params) {
        long amount() { return Long.parseLong(params.get("line_items[0][price_data][unit_amount]")); }
        String currency() { return params.get("line_items[0][price_data][currency]"); }
        @Override public String toString() { return "StripeSessionFixture[redacted]"; }
    }
    static final class Refund {
        final String id, intent;
        final long amount;
        final Map<String, String> metadata;
        volatile String status;
        Refund(String id, String intent, long amount, String status, Map<String, String> metadata) { this.id = id; this.intent = intent; this.amount = amount; this.status = status; this.metadata = Map.copyOf(metadata); }
        @Override public String toString() { return "StripeRefundFixture[redacted]"; }
    }
}
