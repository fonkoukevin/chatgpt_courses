package com.chatgptcourses.methods.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Personal text and source snapshots remain independent; no persistence entities cross HTTP. */
public final class MethodTypes {
    private MethodTypes() { }
    public record MethodParameters(String objective,String context,String availableData,String recipient,String format,String constraints,String clarifications) { }
    public record MethodDefinition(List<String> useCases,List<String> requiredInputs,List<String> steps,String starterInstruction,
        String example,List<String> checks,List<String> limitations,MethodParameters defaults) { }
    public record MethodFields(String title,String locale,String text,MethodParameters parameters,MethodParameters generatedFrom,String notes,String category) { }
    public record CreateMethod(MethodFields fields) { }
    public record UpdateMethod(MethodFields fields) { }
    public record FromTemplate(UUID sourceResourceId,UUID sourceVersionId,UUID sourceRevisionId,String sourceLocale,MethodFields fields) { }
    public record MethodOrigin(UUID resourceId,UUID versionId,UUID translationId,UUID revisionId,String locale,String title,String slug) { }
    public record MethodView(UUID id,long revision,String title,String locale,String text,MethodParameters parameters,
        MethodParameters generatedFrom,String notes,String category,MethodOrigin origin,Instant createdAt,Instant updatedAt) { }
    public record MethodSummary(UUID id,long revision,String title,String locale,String category,Instant updatedAt,boolean hasSource) { }
    public record MethodQuery(String q,String category,int page,int pageSize) { }
    public record MethodPage(List<MethodSummary> items,int page,int pageSize,long total) { }
    public record SourceUpdate(String status,MethodOrigin source,MethodOrigin candidate) { }
    public record MethodTemplate(UUID resourceId,UUID versionId,UUID revisionId,String locale,String title,String slug,String availability,MethodDefinition definition) { }
}
