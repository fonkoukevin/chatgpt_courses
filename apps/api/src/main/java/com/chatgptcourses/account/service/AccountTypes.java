package com.chatgptcourses.account.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AccountTypes {
    private AccountTypes() { }
    public record ProfileView(UUID id,String email,String displayName,long revision) { }
    public record SaveProfile(String displayName) { @Override public String toString(){return "SaveProfile[redacted]";} }
    public record CommercialDocument(UUID id,String kind,String filename,String contentType) { }
    public record CommercialDocuments(UUID orderId,String state,List<CommercialDocument> documents,String unavailableReason) { }
    public record CreateDataRequest(String type,String reason) { @Override public String toString(){return "CreateDataRequest[redacted]";} }
    public record CancelDataRequest(String reason) { @Override public String toString(){return "CancelDataRequest[redacted]";} }
    public record DataRequestView(UUID id,long revision,String type,String reason,String state,String processingUnavailableReason,Instant createdAt,Instant updatedAt,Instant cancelledAt) { @Override public String toString(){return "DataRequestView[redacted]";} }
    public record DataRequestPage(List<DataRequestView> items,int page,int pageSize,long total) { }
    public record DataRequestEvent(UUID id,UUID requestId,String type,String reason,Instant createdAt) { @Override public String toString(){return "DataRequestEvent[redacted]";} }
    public record DataRequestEventPage(List<DataRequestEvent> items,int page,int pageSize,long total) { }
    public record DataRequestCreation(DataRequestView value,boolean created) { }
}
