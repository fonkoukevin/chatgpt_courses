import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Local executable check only: reads the actual Spring bean, never its values into logs. */
public final class StripeConfigProbe {
    private static boolean same(Object actual, String name) {
        String expected = System.getenv(name);
        return actual instanceof String value && expected != null
            && MessageDigest.isEqual(value.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8));
    }
    public static void main(String[] ignored) throws Exception {
        Object context = null;
        Class<?> lifecycle = Class.forName("org.springframework.context.ConfigurableApplicationContext");
        try {
            context = Class.forName("org.springframework.boot.SpringApplication").getMethod("run", Class.class, String[].class)
                .invoke(null, Class.forName("com.chatgptcourses.CoursesApplication"), new String[]{
                    "--server.port=0", "--server.address=127.0.0.1", "--spring.profiles.active=local",
                    "--spring.main.banner-mode=off", "--logging.level.root=OFF",
                    "--courses.notifications.outbox.worker-enabled=false", "--courses.payments.inbox.worker-enabled=false",
                    "--courses.assets.staging-cleanup-worker-enabled=false", "--spring.session.jdbc.cleanup-cron=-"
                });
            Class<?> type = Class.forName("com.chatgptcourses.payments.config.StripeSettings");
            Object settings = lifecycle.getMethod("getBean", Class.class).invoke(context, type);
            boolean key = same(type.getMethod("apiKey").invoke(settings), "STRIPE_SECRET_KEY");
            boolean webhook = same(type.getMethod("webhookSecret").invoke(settings), "STRIPE_WEBHOOK_SECRET");
            boolean account = same(type.getMethod("accountId").invoke(settings), "STRIPE_ACCOUNT_ID");
            boolean mode = "TEST".equals(type.getMethod("mode").invoke(settings));
            boolean enabled = Boolean.TRUE.equals(type.getMethod("enabled").invoke(settings));
            boolean enabledMatches = enabled == "true".equalsIgnoreCase(System.getenv("STRIPE_ENABLED"));
            boolean webhookConfigured = !((String) type.getMethod("webhookSecret").invoke(settings)).isBlank();
            System.out.println("COURSES_STRIPE_BINDING {\"springContextStarted\":true,\"secretMatchesEnvironment\":" + key
                + ",\"webhookMatchesEnvironment\":" + webhook + ",\"accountMatchesEnvironment\":" + account
                + ",\"testMode\":" + mode + ",\"enabledMatchesEnvironment\":" + enabledMatches
                + ",\"stripeEnabled\":" + enabled + ",\"webhookSecretConfigured\":" + webhookConfigured + ",\"secretsPrinted\":false}");
            if (!key || !webhook || !account || !mode || !enabledMatches) throw new IllegalStateException("Private binding not confirmed");
        } finally {
            if (context != null) lifecycle.getMethod("close").invoke(context);
        }
    }
}
