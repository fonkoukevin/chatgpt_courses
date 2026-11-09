package com.chatgptcourses.support.http;

import com.chatgptcourses.support.service.SupportTypes.SupportContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

public final class SupportDtos {
    private SupportDtos() { }
    public record Context(@NotNull @Pattern(regexp="fr|en")String locale,UUID resourceId,UUID versionId,UUID revisionId,UUID orderId,UUID projectId,UUID enrollmentId){SupportContext domain(){return new SupportContext(locale,resourceId,versionId,revisionId,orderId,projectId,enrollmentId);}}
    public record Create(@NotNull @Pattern(regexp="TECHNICAL|CONTENT|ACCESS|ORDER|ACCOUNT|OTHER")String category,@NotBlank @Size(max=160)String subject,@NotBlank @Size(max=8000)String message,@NotNull @Pattern(regexp="fr|en")String locale,@Valid Context context,@NotNull @Size(max=5)List<@NotNull UUID> attachmentIds){@Override public String toString(){return "SupportCreate[redacted]";}}
    public record Message(@NotBlank @Size(max=8000)String message,@NotNull @Size(max=5)List<@NotNull UUID> attachmentIds){@Override public String toString(){return "SupportMessage[redacted]";}}
    public record State(@NotNull @Pattern(regexp="OPEN|IN_PROGRESS|WAITING_FOR_USER|RESOLVED|CLOSED")String state,@NotBlank @Size(max=2000)String reason){@Override public String toString(){return "SupportState[redacted]";}}
}
