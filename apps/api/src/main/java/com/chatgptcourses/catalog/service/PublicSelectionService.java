package com.chatgptcourses.catalog.service;

import com.chatgptcourses.commerce.service.CommerceAuthorization;
import com.chatgptcourses.commerce.service.OfferService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.http.RevisionPreconditions;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Append-only decisions about discovery; publication and business facts are untouched. */
@Service
public class PublicSelectionService {
    public record Selection(UUID revisionId, String provenance, boolean approved, long selectionRevision,
            UUID actorId, String reason, Instant decidedAt) { }
    public record ChangeSelection(UUID revisionId, String provenance, boolean approved, String reason) { }
    private record Target(UUID revisionId, UUID versionId, String locale, boolean available) { }
    private final JdbcTemplate jdbc;
    private final CommerceAuthorization authorization;
    private final OfferService offers;
    public PublicSelectionService(JdbcTemplate jdbc, CommerceAuthorization authorization, OfferService offers) { this.jdbc=jdbc;this.authorization=authorization;this.offers=offers; }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Selection content(UUID actor, UUID translationId) {
        authorization.require(actor,"content.read");return selection("editorial_public_selections",contentTarget(translationId,false).revisionId());
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Selection offer(UUID actor, UUID offerId) {
        authorization.require(actor,"commerce.offers.read");return selection("offer_public_selections",offerTarget(offerId,false).revisionId());
    }
    @Transactional
    public Selection selectContent(UUID actor, UUID accountContext, UUID translationId, String ifMatch, ChangeSelection command) {
        authorization.mutation(actor,accountContext,"content.publish");validate(command);lockActor(actor);
        var target=contentTarget(translationId,true);var current=selection("editorial_public_selections",target.revisionId());
        match("content-selection",target,current,ifMatch,command);
        if(command.approved()&&(!target.available()||!Boolean.TRUE.equals(jdbc.queryForObject(PublicSelectionSql.CONTENT_DEPENDENCIES_READY,Boolean.class,target.versionId(),target.locale()))))throw new ApiException(ApiError.CONTENT_NOT_READY);
        authorization.mutation(actor,accountContext,"content.publish");return append("editorial_public_selections",actor,current,command);
    }
    @Transactional
    public Selection selectOffer(UUID actor, UUID accountContext, UUID offerId, String ifMatch, ChangeSelection command) {
        authorization.mutation(actor,accountContext,"commerce.offers.activate");validate(command);lockActor(actor);
        var target=offerTarget(offerId,true);var current=selection("offer_public_selections",target.revisionId());
        match("offer-selection",target,current,ifMatch,command);
        if(command.approved()&&(!target.available()||!offers.discoveryReady(offerId)||!Boolean.TRUE.equals(jdbc.queryForObject("SELECT "+PublicSelectionSql.OFFER_DEPENDENCIES_READY+" FROM offer_revisions r WHERE r.id=?",Boolean.class,target.revisionId()))))throw new ApiException(ApiError.OFFER_NOT_READY);
        authorization.mutation(actor,accountContext,"commerce.offers.activate");return append("offer_public_selections",actor,current,command);
    }
    public static String tag(String kind,Selection value){return EntityTags.forRevision(kind,value.revisionId(),value.selectionRevision());}
    private static void match(String kind,Target target,Selection current,String ifMatch,ChangeSelection command){
        RevisionPreconditions.requireMatch(ifMatch,tag(kind,current));
        if(!Objects.equals(target.revisionId(),command.revisionId()))throw new ApiException(ApiError.REVISION_CONFLICT);
    }
    private Selection append(String table,UUID actor,Selection current,ChangeSelection command){
        if(current.selectionRevision()==EntityTags.MAX_SAFE_REVISION)throw new ApiException(ApiError.CONFLICT);
        jdbc.update("INSERT INTO "+table+"(revision_id,selection_revision,provenance,approved,actor_id,reason) VALUES(?,?,?,?,?,?)",current.revisionId(),current.selectionRevision()+1,command.provenance(),command.approved(),actor,command.reason());
        return selection(table,current.revisionId());
    }
    private Selection selection(String table,UUID revision){
        var rows=jdbc.query("SELECT revision_id,provenance,approved,selection_revision,actor_id,reason,created_at FROM "+table+" WHERE revision_id=? ORDER BY selection_revision DESC LIMIT 1",(rs,n)->new Selection(rs.getObject(1,UUID.class),rs.getString(2),rs.getBoolean(3),rs.getLong(4),rs.getObject(5,UUID.class),rs.getString(6),rs.getTimestamp(7).toInstant()),revision);
        return rows.isEmpty()?new Selection(revision,"UNREVIEWED",false,0,null,null,null):rows.getFirst();
    }
    private Target contentTarget(UUID translation,boolean lock){
        var rows=jdbc.query("""
            SELECT t.published_revision_id,t.pedagogical_version_id,t.locale,
              r.archived_at IS NULL AND t.editorial_state NOT IN('ARCHIVED','STALE') AND e.document_json IS NOT NULL
              AND(t.source_translation_id IS NULL OR(t.published_source_revision_id=source.current_revision_id AND source.editorial_state NOT IN('ARCHIVED','STALE'))) AS available
            FROM content_translations t JOIN pedagogical_versions v ON v.id=t.pedagogical_version_id JOIN learning_resources r ON r.id=v.resource_id
            LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id LEFT JOIN content_translations source ON source.id=t.source_translation_id
            WHERE t.id=?
            """+(lock?" FOR UPDATE OF t":""),(rs,n)->new Target(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getString(3),rs.getBoolean(4)),translation);
        if(rows.isEmpty())throw new ApiException(ApiError.RESOURCE_NOT_FOUND);
        if(rows.getFirst().revisionId()==null)throw new ApiException(ApiError.CONTENT_NOT_READY);return rows.getFirst();
    }
    private Target offerTarget(UUID offer,boolean lock){
        var rows=jdbc.query("SELECT current_revision_id,state<>'DRAFT' FROM offers WHERE id=?"+(lock?" FOR UPDATE":""),(rs,n)->new Target(rs.getObject(1,UUID.class),null,null,rs.getBoolean(2)),offer);
        if(rows.isEmpty())throw new ApiException(ApiError.RESOURCE_NOT_FOUND);
        if(rows.getFirst().revisionId()==null)throw new ApiException(ApiError.OFFER_NOT_READY);return rows.getFirst();
    }
    private void lockActor(UUID actor){jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(rs,n)->rs.getObject(1,UUID.class),actor);}
    private static void validate(ChangeSelection command){
        if(command==null||command.revisionId()==null||command.provenance()==null||!List.of("EDITORIAL","RECIPE").contains(command.provenance())||command.reason()==null||command.reason().isBlank()||command.reason().length()>1000||command.reason().indexOf('\0')>=0||command.approved()&&!"EDITORIAL".equals(command.provenance()))throw new ApiException(ApiError.VALIDATION_FAILED);
    }
}
