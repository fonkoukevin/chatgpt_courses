package com.chatgptcourses.operations.http;

import jakarta.validation.constraints.*;
import java.util.UUID;

public final class ContentCaseDtos {
    private ContentCaseDtos(){ }
    public record Create(UUID ticketId,@NotNull UUID resourceId,@NotNull UUID versionId,UUID sourceRevisionId,
        @NotNull @Pattern(regexp="fr|en") String locale,@NotBlank @Size(max=2000) String reason){@Override public String toString(){return "ContentCaseCreate[redacted]";}}
    public record Update(@NotNull @Pattern(regexp="OPEN|IN_PROGRESS|RESOLVED|DISMISSED") String state,
        UUID assigneeId,UUID correctedRevisionId,@NotBlank @Size(max=2000) String reason){@Override public String toString(){return "ContentCaseUpdate[redacted]";}}
}
