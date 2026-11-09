package com.chatgptcourses.operations.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ContentCaseTypes {
    private ContentCaseTypes() { }
    public record ContentCaseView(UUID id,long revision,UUID ticketId,UUID resourceId,UUID versionId,UUID sourceRevisionId,UUID translationId,String locale,String title,String state,UUID assigneeId,UUID correctedRevisionId,Instant createdAt,Instant updatedAt) { }
    public record CreateContentCase(UUID ticketId,UUID resourceId,UUID versionId,UUID sourceRevisionId,String locale,String reason) { }
    public record UpdateContentCase(String state,UUID assigneeId,UUID correctedRevisionId,String reason) { }
    public record ContentCaseEvent(UUID id,UUID caseId,UUID actorId,String action,String reason,UUID correctedRevisionId,Instant createdAt) { }
    public record ContentCasePage(List<ContentCaseView> items,int page,int pageSize,long total) { }
    public record ContentCaseEventPage(List<ContentCaseEvent> items,int page,int pageSize,long total) { }
    public record ContentCaseCreation(ContentCaseView value,boolean created) { }
}
