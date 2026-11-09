import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** Minimal health status only: no Spring context, credentials, cookies or output. */
public final class HealthProbe {
    private HealthProbe() { }
    public static void main(String[] args) {
        try (var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1))
                .followRedirects(HttpClient.Redirect.NEVER).build()) {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:8080/api/v1/system/health"))
                    .timeout(Duration.ofSeconds(2)).GET().build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (var body = response.body()) {
                byte[] bytes = body.readNBytes(129);
                if (response.statusCode() != 200 || bytes.length > 128
                        || !new String(bytes, StandardCharsets.UTF_8).strip().equals("{\"status\":\"UP\"}")) {
                    System.exit(1);
                }
            }
        } catch (Exception unavailable) {
            System.exit(1);
        }
    }
}
