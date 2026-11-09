package com.chatgptcourses.support.service;

import com.chatgptcourses.support.service.SupportTypes.SupportMessageView;
import com.chatgptcourses.support.service.SupportTypes.SupportTicketView;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SupportWorkTypes {
    private SupportWorkTypes() { }
    public record SupportAssignmentView(UUID ticketId,long revision,UUID assigneeId,Instant updatedAt) { }
    public record AssignSupport(UUID assigneeId,String reason) { }
    public record SupportAssignee(UUID id,String displayName) { }
    public record SupportAssigneePage(List<SupportAssignee> items,int page,int pageSize,long total) { }
    public record SupportDraftView(UUID ticketId,UUID authorId,long revision,String text,String state,UUID publishedMessageId,Instant updatedAt) { @Override public String toString(){return "SupportDraft[private]";} }
    public record SaveSupportDraft(String text) { @Override public String toString(){return "SaveDraft[private]";} }
    public record PublishSupportDraft(long expectedTicketRevision,String reason) { }
    public record PublishedSupportReply(SupportTicketView ticket,SupportMessageView message,SupportDraftView draft) { }
    public record InternalNote(UUID id,UUID ticketId,UUID authorId,String text,Instant createdAt) { @Override public String toString(){return "InternalNote[private]";} }
    public record AddInternalNote(String text) { @Override public String toString(){return "AddInternalNote[private]";} }
    public record SupportTimeEntry(UUID id,UUID ticketId,UUID authorId,int minutes,String reason,Instant createdAt) { }
    public record RecordSupportTime(int minutes,String reason) { }
    public record InternalNotePage(List<InternalNote> items,int page,int pageSize,long total) { }
    public record SupportTimePage(List<SupportTimeEntry> items,int page,int pageSize,long total) { }
    public record PublicationResult(PublishedSupportReply value,boolean created) { }
    public record NoteResult(InternalNote value,boolean created) { }
    public record TimeResult(SupportTimeEntry value,boolean created) { }
}
