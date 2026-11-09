package com.chatgptcourses.support.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SupportTypes {
    private SupportTypes() { }
    public record SupportContext(String locale,UUID resourceId,UUID versionId,UUID revisionId,UUID orderId,UUID projectId,UUID enrollmentId) { }
    public record CreateSupportTicket(String category,String subject,String message,String locale,SupportContext context,List<UUID> attachmentIds) { @Override public String toString(){return "CreateSupportTicket[redacted]";} }
    public record AddSupportMessage(String message,List<UUID> attachmentIds) { @Override public String toString(){return "AddSupportMessage[redacted]";} }
    public record ChangeSupportState(String state,String reason) { @Override public String toString(){return "ChangeSupportState[redacted]";} }
    public record SupportTicketView(UUID id,long revision,String category,String subject,String locale,String state,SupportContext context,Instant createdAt,Instant updatedAt) { @Override public String toString(){return "SupportTicket[redacted]";} }
    public record SupportAttachment(UUID assetId,String filename,String contentType,long sizeBytes,String sha256) { }
    public record SupportMessageView(UUID id,UUID ticketId,String authorKind,String message,List<SupportAttachment> attachments,Instant createdAt,String notificationStatus) { @Override public String toString(){return "SupportMessage[redacted]";} }
    public record SupportTicketEvent(UUID id,UUID ticketId,String type,String fromState,String toState,String authorKind,String reason,Instant createdAt) { @Override public String toString(){return "SupportEvent[redacted]";} }
    public record SupportConversationUpdate(SupportTicketView ticket,SupportMessageView message) { }
    public record SupportMessageCreation(SupportConversationUpdate value,boolean created) { }
    public record SupportTicketCreation(SupportTicketView value,boolean created) { }
    public record SupportTicketPage(List<SupportTicketView> items,int page,int pageSize,long total) { }
    public record SupportMessagePage(List<SupportMessageView> items,int page,int pageSize,long total) { }
    public record SupportEventPage(List<SupportTicketEvent> items,int page,int pageSize,long total) { }
}
