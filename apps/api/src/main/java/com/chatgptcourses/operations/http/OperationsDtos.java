package com.chatgptcourses.operations.http;

import jakarta.validation.constraints.*;

public final class OperationsDtos {
    private OperationsDtos() { }
    public record Reconciliation(@NotNull @Pattern(regexp="PROVIDER_RECOVERED|MANUAL_RECONCILIATION") String reason,
        @NotNull @Min(0) @Max(9_007_199_254_740_991L) Long expectedOrderRevision) { }
    public record IncidentRetry(@NotNull @Pattern(regexp="PROVIDER_RECOVERED|MANUAL_RECONCILIATION|SMTP_RECOVERED|MANUAL_RETRY") String reason,
        @NotNull Boolean ackDuplicate) { }
}
