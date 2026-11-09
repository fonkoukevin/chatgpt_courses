package com.chatgptcourses.support.http;

import jakarta.validation.constraints.*;
import java.util.UUID;

public final class SupportWorkDtos {
    private SupportWorkDtos(){ }
    public record Assignment(UUID assigneeId,@NotBlank @Size(max=2000) String reason){@Override public String toString(){return "SupportAssignmentRequest[redacted]";}}
    public record Draft(@NotNull @Size(max=8000) String text){@Override public String toString(){return "SupportDraftRequest[private]";}}
    public record Publication(@NotNull @Min(0) @Max(9_007_199_254_740_991L) Long expectedTicketRevision,
        @NotBlank @Size(max=2000) String reason){@Override public String toString(){return "SupportPublicationRequest[redacted]";}}
    public record Note(@NotBlank @Size(max=4000) String text){@Override public String toString(){return "SupportNoteRequest[private]";}}
    public record Time(@NotNull @Min(0) @Max(1440) Integer minutes,@NotBlank @Size(max=2000) String reason){@Override public String toString(){return "SupportTimeRequest[redacted]";}}
}
