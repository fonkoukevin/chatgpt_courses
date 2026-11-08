package com.chatgptcourses.editorial.service;

import static com.chatgptcourses.editorial.service.ContentTypes.*;
import static com.chatgptcourses.editorial.service.ContentValidation.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.CatalogTypes.PublicMetadata;
import com.chatgptcourses.catalog.service.CatalogTypes.SaveMetadata;
import com.chatgptcourses.catalog.service.PublicMetadataStore;
import com.chatgptcourses.methods.service.MethodValidation;
import com.chatgptcourses.editorial.model.EditorialState;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.http.RevisionPreconditions;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import tools.jackson.databind.ObjectMapper;

/** Use-case transactions own all writes; stable-resource locks serialize its languages and versions. */
@Service
public class EditorialService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final PublicMetadataStore publicMetadata;
    private final List<EditorialMediaRegistry> mediaRegistries;
    private static final String SELECT = """
        SELECT t.*,v.resource_id,v.version_number,v.objectives,v.evaluation_definition,v.frozen_at,r.kind,
          s.slug,e.title,e.summary,e.document_json::text AS document_text,e.body AS legacy_body
        FROM content_translations t JOIN pedagogical_versions v ON v.id=t.pedagogical_version_id
        JOIN learning_resources r ON r.id=v.resource_id
        LEFT JOIN resource_slugs s ON s.resource_id=r.id AND s.locale=t.locale
        LEFT JOIN editorial_revisions e ON e.id=t.current_revision_id
        """;
    public EditorialService(JdbcTemplate jdbc,ObjectMapper mapper) {this(jdbc,mapper,List.of());}
    @Autowired
    public EditorialService(JdbcTemplate jdbc,ObjectMapper mapper,List<EditorialMediaRegistry> mediaRegistries) {this.jdbc=jdbc;this.mapper=mapper;this.publicMetadata=new PublicMetadataStore(jdbc,mapper);this.mediaRegistries=List.copyOf(mediaRegistries);}

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ContentView get(UUID actor,UUID id) {require(actor,"content.read");return view(row(id));}

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Page<ContentSummary> list(UUID actor,ContentQuery query) {
        require(actor,"content.read");check(query!=null);page(query.page(),query.size());
        if(query.q()!=null)text(query.q(),0,240);if(query.locale()!=null)locale(query.locale());
        var where=new StringBuilder(" WHERE 1=1");var args=new ArrayList<Object>();
        if(query.q()!=null && !query.q().isBlank()) {
            where.append(" AND (e.title ILIKE ? OR e.summary ILIKE ? OR s.slug ILIKE ?)");
            String escaped=query.q().replace("\\","\\\\").replace("%","\\%").replace("_","\\_");args.add("%"+escaped+"%");args.add("%"+escaped+"%");args.add("%"+escaped+"%");
        }
        if(query.kind()!=null){where.append(" AND r.kind=?");args.add(query.kind().name());}
        if(query.state()!=null){where.append(" AND t.editorial_state=?");args.add(query.state().name());}
        if(query.locale()!=null){where.append(" AND t.locale=?");args.add(query.locale());}
        if(query.verifiedBefore()!=null){where.append(" AND t.verified_at<?");args.add(Timestamp.from(query.verifiedBefore()));}
        if(query.needsUpdate()!=null){where.append(" AND (t.editorial_state='STALE')=?");args.add(query.needsUpdate());}
        if(query.courseId()!=null){where.append("""
            AND v.id IN (WITH RECURSIVE included(id) AS (
              SELECT pv.id FROM pedagogical_versions pv JOIN learning_resources lr ON lr.id=pv.resource_id WHERE lr.id=? AND lr.kind='COURSE'
              UNION SELECT c.child_version_id FROM version_compositions c JOIN included i ON c.parent_version_id=i.id)
              SELECT id FROM included)
            """);args.add(query.courseId());}
        String count="SELECT count(*) FROM ("+SELECT+where+") matched";
        long total=Objects.requireNonNull(jdbc.queryForObject(count,Long.class,args.toArray()));
        var paging=new ArrayList<>(args);paging.add(query.size());paging.add((long)query.page()*query.size());
        var items=jdbc.query(SELECT+where+" ORDER BY t.updated_at DESC,t.id LIMIT ? OFFSET ?",(rs,n)->summary(mapRow(rs)),paging.toArray());
        return new Page<>(items,query.page(),query.size(),total);
    }

    @Transactional
    public ContentView create(UUID actor,CreateContent c) {
        require(actor,"content.write");check(c!=null && c.kind()!=null);locale(c.locale());slug(c.slug());
        header(c.title(),c.summary(),c.reason());pedagogy(c.objectives(),c.evaluationDefinition());document(c.document(),mapper);ids(c.childVersionIds(),100);
        UUID resource=UUID.randomUUID();jdbc.update("INSERT INTO learning_resources(id,kind) VALUES(?,?)",resource,c.kind().name());
        UUID version=createVersion(resource,1,c.objectives(),c.evaluationDefinition(),null);
        setComposition(version,c.kind(),c.childVersionIds());
        putSlug(resource,c.kind(),c.locale(),c.slug());
        UUID id=createTranslation(version,c.locale(),null,null);
        append(id,c.title(),c.summary(),c.document(),actor,c.reason(),null);
        event(id,actor,"CREATE",c.reason());return changed(id);
    }

    @Transactional
    public ContentView revise(UUID actor,UUID id,String ifMatch,SaveRevision c) {
        require(actor,"content.write");var old=locked(id,ifMatch);require(actor,"content.write");editable(old);check(c!=null);
        header(c.title(),c.summary(),c.reason());document(c.document(),mapper);
        boolean initialTranslation=old.sourceTranslationId()!=null && old.publishedRevisionId()==null;
        if(old.frozenAt()!=null && !initialTranslation && !samePedagogy(old.document(),c.document()))throw new ApiException(ApiError.NEW_PEDAGOGICAL_VERSION_REQUIRED);
        append(id,c.title(),c.summary(),c.document(),actor,c.reason(),old.currentRevisionId());
        staleDependents(id,actor);event(id,actor,"REVISE",c.reason());return changed(id);
    }

    @Transactional
    public ContentView metadata(UUID actor,UUID id,String ifMatch,SaveMetadata c) {
        require(actor,"content.write");var old=locked(id,ifMatch);require(actor,"content.write");editable(old);check(c!=null);
        text(c.reason(),1,1000);publicMetadata.validate(c.metadata());
        if(old.document()==null)throw new ApiException(ApiError.CONTENT_NOT_READY);
        append(id,old.title(),old.summary(),old.document(),actor,c.reason(),old.currentRevisionId(),c.metadata());
        staleDependents(id,actor);event(id,actor,"REVISE",c.reason());return changed(id);
    }

    @Transactional
    public ContentView newVersion(UUID actor,UUID id,String ifMatch,NewVersion c) {
        require(actor,"content.write");var old=locked(id,ifMatch);require(actor,"content.write");editable(old);check(c!=null);
        header(c.title(),c.summary(),c.reason());pedagogy(c.objectives(),c.evaluationDefinition());document(c.document(),mapper);ids(c.childVersionIds(),100);
        Integer next=jdbc.queryForObject("SELECT coalesce(max(version_number),0)+1 FROM pedagogical_versions WHERE resource_id=?",Integer.class,old.resourceId());
        UUID version=createVersion(old.resourceId(),next,c.objectives(),c.evaluationDefinition(),old.versionId());
        setComposition(version,old.kind(),c.childVersionIds());UUID created=createTranslation(version,old.locale(),null,null);
        UUID revision=append(created,c.title(),c.summary(),c.document(),actor,c.reason(),null);publicMetadata.copy(old.currentRevisionId(),revision);event(created,actor,"NEW_VERSION",c.reason());
        return changed(created);
    }

    @Transactional
    public ContentView duplicate(UUID actor,UUID id,String ifMatch,DuplicateContent c) {
        require(actor,"content.write");var old=locked(id,ifMatch);require(actor,"content.write");check(c!=null);slug(c.slug());text(c.title(),1,240);text(c.reason(),1,1000);
        if(old.document()==null)throw new ApiException(ApiError.CONTENT_NOT_READY);
        UUID resource=UUID.randomUUID();jdbc.update("INSERT INTO learning_resources(id,kind,duplicated_from_id) VALUES(?,?,?)",resource,old.kind().name(),old.resourceId());
        UUID version=createVersion(resource,1,old.objectives(),old.evaluationDefinition(),null);
        setComposition(version,old.kind(),children(old.versionId()));putSlug(resource,old.kind(),old.locale(),c.slug());
        UUID created=createTranslation(version,old.locale(),null,null);UUID revision=append(created,c.title(),old.summary(),old.document(),actor,c.reason(),null);publicMetadata.copy(old.currentRevisionId(),revision);
        event(created,actor,"DUPLICATE",c.reason());return changed(created);
    }

    @Transactional
    public ContentView translate(UUID actor,UUID id,String ifMatch,CreateTranslation c) {
        require(actor,"content.write");var old=locked(id,ifMatch);require(actor,"content.write");editable(old);check(c!=null);locale(c.locale());slug(c.slug());
        check(!old.locale().equals(c.locale()));header(c.title(),c.summary(),c.reason());document(c.document(),mapper);
        if(old.currentRevisionId()==null)throw new ApiException(ApiError.CONTENT_NOT_READY);
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM content_translations WHERE pedagogical_version_id=? AND locale=?)",Boolean.class,old.versionId(),c.locale())))throw new ApiException(ApiError.CONFLICT);
        putSlug(old.resourceId(),old.kind(),c.locale(),c.slug());
        UUID created=createTranslation(old.versionId(),c.locale(),id,old.currentRevisionId());
        append(created,c.title(),c.summary(),c.document(),actor,c.reason(),null);event(created,actor,"TRANSLATE",c.reason());return changed(created);
    }

    @Transactional
    public ContentView transition(UUID actor,UUID id,String ifMatch,TransitionContent c) {
        check(c!=null && c.state()!=null);require(actor,c.state()==EditorialState.READY?"content.review":"content.write");
        var old=locked(id,ifMatch);require(actor,c.state()==EditorialState.READY?"content.review":"content.write");editable(old);text(c.reason(),1,1000);
        switch(c.state()) {
            case TO_REVIEW -> {
                if(old.state()!=EditorialState.DRAFT && old.state()!=EditorialState.STALE)throw new ApiException(ApiError.INVALID_CONTENT_TRANSITION);
                state(id,"TO_REVIEW");
            }
            case READY -> {
                if(old.state()!=EditorialState.TO_REVIEW)throw new ApiException(ApiError.INVALID_CONTENT_TRANSITION);
                UUID sourceCurrent=sourceCurrent(old);
                if(old.sourceTranslationId()!=null && !Objects.equals(c.sourceRevisionId(),sourceCurrent))throw new ApiException(ApiError.REVISION_CONFLICT);
                if(!readiness(old,false).ready())throw new ApiException(ApiError.CONTENT_NOT_READY);
                jdbc.update("UPDATE content_translations SET editorial_state='READY',reviewed_revision_id=current_revision_id,reviewed_source_revision_id=?,verified_at=greatest(created_at,CURRENT_TIMESTAMP),revision=revision+1,updated_at=greatest(created_at,CURRENT_TIMESTAMP) WHERE id=?",sourceCurrent,id);
            }
            case STALE -> {
                if(old.state()!=EditorialState.PUBLISHED && old.state()!=EditorialState.READY)throw new ApiException(ApiError.INVALID_CONTENT_TRANSITION);
                state(id,"STALE");staleDependents(id,actor);
            }
            default -> throw new ApiException(ApiError.INVALID_CONTENT_TRANSITION);
        }
        event(id,actor,c.state().name(),c.reason());return changed(id);
    }

    @Transactional
    public ContentView publish(UUID actor,UUID id,String ifMatch,PublishContent c) {
        require(actor,"content.publish");var old=locked(id,ifMatch);require(actor,"content.publish");editable(old);check(c!=null && c.revisionId()!=null);text(c.reason(),1,1000);
        if(!Objects.equals(old.currentRevisionId(),c.revisionId()))throw new ApiException(ApiError.REVISION_CONFLICT);
        if(old.state()!=EditorialState.READY || !readiness(old,true).ready())throw new ApiException(ApiError.CONTENT_NOT_READY);
        if(old.frozenAt()==null)jdbc.update("UPDATE pedagogical_versions SET frozen_at=greatest(created_at,CURRENT_TIMESTAMP),revision=revision+1,updated_at=greatest(created_at,CURRENT_TIMESTAMP) WHERE id=?",old.versionId());
        jdbc.update("UPDATE content_translations SET editorial_state='PUBLISHED',published_revision_id=?,published_verified_at=verified_at,published_source_revision_id=reviewed_source_revision_id,revision=revision+1,updated_at=greatest(created_at,CURRENT_TIMESTAMP) WHERE id=?",c.revisionId(),id);
        staleDependents(id,actor);event(id,actor,"PUBLISH",c.reason());return changed(id);
    }

    @Transactional
    public ContentView archive(UUID actor,UUID id,String ifMatch,ArchiveContent c) {
        require(actor,"content.archive");var old=locked(id,ifMatch);require(actor,"content.archive");check(c!=null);text(c.reason(),1,1000);
        if(old.state()==EditorialState.ARCHIVED)throw new ApiException(ApiError.INVALID_CONTENT_TRANSITION);
        state(id,"ARCHIVED");staleDependents(id,actor);event(id,actor,"ARCHIVE",c.reason());return changed(id);
    }

    @Transactional
    public ContentView composition(UUID actor,UUID id,String ifMatch,ReplaceComposition c) {
        require(actor,"content.write");var old=locked(id,ifMatch);require(actor,"content.write");editable(old);check(c!=null);text(c.reason(),1,1000);ids(c.childVersionIds(),100);
        if(old.frozenAt()!=null)throw new ApiException(ApiError.NEW_PEDAGOGICAL_VERSION_REQUIRED);
        setComposition(old.versionId(),old.kind(),c.childVersionIds());
        jdbc.update("UPDATE pedagogical_versions SET revision=revision+1,updated_at=greatest(created_at,CURRENT_TIMESTAMP) WHERE id=?",old.versionId());
        jdbc.update("UPDATE content_translations SET editorial_state='DRAFT',reviewed_revision_id=NULL,revision=revision+1,updated_at=greatest(created_at,CURRENT_TIMESTAMP) WHERE pedagogical_version_id=? AND editorial_state<>'ARCHIVED'",old.versionId());
        event(id,actor,"COMPOSITION",c.reason());return changed(id);
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Readiness readiness(UUID actor,UUID id) {require(actor,"content.read");return readiness(row(id),false);}

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Page<RevisionView> history(UUID actor,UUID id,int page,int size) {
        require(actor,"content.read");row(id);page(page,size);
        long count=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM editorial_revisions WHERE translation_id=?",Long.class,id));
        var revisions=jdbc.query("SELECT * FROM editorial_revisions WHERE translation_id=? ORDER BY revision_number DESC LIMIT ? OFFSET ?",
            (rs,n)->new RevisionView(uuid(rs,"id"),rs.getInt("revision_number"),rs.getString("title"),rs.getString("summary"),decode(rs.getString("document_json")),uuid(rs,"author_id"),instant(rs,"created_at"),rs.getString("reason"),uuid(rs,"replaces_revision_id"),rs.getString("document_json")==null?rs.getString("body"):null,publicMetadata.get(uuid(rs,"id"))),id,size,(long)page*size);
        return new Page<>(revisions,page,size,count);
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Dependencies dependencies(UUID actor,UUID id) {require(actor,"content.read");return dependencies(row(id));}

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public PublicContent publicContent(UUID resourceId,String locale) {
        locale(locale);
        // Select the latest version with a publication FIRST, then refuse archived/stale body; no historical fallback.
        var docs=jdbc.query("""
            SELECT t.*,v.resource_id,v.version_number,r.kind,s.slug,e.title,e.summary,e.document_json::text AS document_text,
              source.current_revision_id AS source_current,source.editorial_state AS source_state
            FROM content_translations t JOIN pedagogical_versions v ON v.id=t.pedagogical_version_id
            JOIN learning_resources r ON r.id=v.resource_id
            JOIN editorial_revisions e ON e.id=t.published_revision_id
            LEFT JOIN content_translations source ON source.id=t.source_translation_id
            LEFT JOIN resource_slugs s ON s.resource_id=r.id AND s.locale=t.locale
            WHERE r.id=? AND t.locale=? AND r.archived_at IS NULL AND v.version_number=(SELECT max(latest.version_number) FROM pedagogical_versions latest WHERE latest.resource_id=r.id AND EXISTS(SELECT 1 FROM content_translations published WHERE published.pedagogical_version_id=latest.id AND published.published_revision_id IS NOT NULL)) LIMIT 1
            """,(rs,n)-> {
                if("ARCHIVED".equals(rs.getString("editorial_state")))throw new ApiException(ApiError.RESOURCE_NOT_FOUND);
                ContentDocument d=decode(rs.getString("document_text"));
                if(d==null)throw new ApiException(ApiError.RESOURCE_NOT_FOUND);
                boolean stale="STALE".equals(rs.getString("editorial_state")) || (uuid(rs,"source_translation_id")!=null &&
                    (!Objects.equals(uuid(rs,"published_source_revision_id"),uuid(rs,"source_current")) || "ARCHIVED".equals(rs.getString("source_state")) || "STALE".equals(rs.getString("source_state"))));
                List<UUID> childResources=jdbc.query("SELECT v.resource_id FROM version_compositions c JOIN pedagogical_versions v ON v.id=c.child_version_id WHERE c.parent_version_id=? ORDER BY c.position",(s,i)->uuid(s,"resource_id"),uuid(rs,"pedagogical_version_id"));
                return new PublicContent(uuid(rs,"resource_id"),ResourceKind.valueOf(rs.getString("kind")),uuid(rs,"pedagogical_version_id"),rs.getInt("version_number"),locale,rs.getString("slug"),stale?"STALE":"PUBLISHED",uuid(rs,"published_revision_id"),rs.getString("title"),rs.getString("summary"),d.access(),!stale && "FREE".equals(d.access())?publicDocument(d):null,childResources);
            },resourceId,locale);
        if(docs.isEmpty())throw new ApiException(ApiError.RESOURCE_NOT_FOUND);return docs.getFirst();
    }

    // The following helpers all execute on the transaction's connection; lock before precondition comparison.
    private ContentView locked(UUID id,String ifMatch) {
        var candidate=row(id);
        jdbc.queryForObject("SELECT id FROM learning_resources WHERE id=? FOR UPDATE",UUID.class,candidate.resourceId());
        jdbc.query("SELECT id FROM pedagogical_versions WHERE resource_id=? ORDER BY id FOR UPDATE",(rs,n)->uuid(rs,"id"),candidate.resourceId());
        jdbc.query("SELECT t.id FROM content_translations t JOIN pedagogical_versions v ON v.id=t.pedagogical_version_id WHERE v.resource_id=? ORDER BY t.id FOR UPDATE OF t",(rs,n)->uuid(rs,"id"),candidate.resourceId());
        var current=row(id);RevisionPreconditions.requireMatch(ifMatch,EntityTags.forRevision("content",id,current.revision()));return current;
    }
    private void require(UUID actor,String permission) {
        if(actor==null)throw new AccessDeniedException("Action unavailable");
        Boolean allowed=jdbc.queryForObject("""
          SELECT EXISTS(SELECT 1 FROM user_accounts u JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL
            JOIN role_permissions rp ON rp.role_id=ur.role_id AND rp.revoked_at IS NULL
            JOIN permissions p ON p.id=rp.permission_id WHERE u.id=? AND u.status='ACTIVE' AND p.code=?)
          """,Boolean.class,actor,permission);
        if(!Boolean.TRUE.equals(allowed))throw new AccessDeniedException("Action unavailable");
    }
    private ContentView row(UUID id) {
        var rows=jdbc.query(SELECT+" WHERE t.id=?",(rs,n)->mapRow(rs),id);
        if(rows.isEmpty())throw new ApiException(ApiError.RESOURCE_NOT_FOUND);return rows.getFirst();
    }
    private ContentView mapRow(ResultSet rs)throws SQLException {
        return new ContentView(uuid(rs,"id"),uuid(rs,"resource_id"),ResourceKind.valueOf(rs.getString("kind")),uuid(rs,"pedagogical_version_id"),rs.getInt("version_number"),rs.getString("locale"),rs.getString("slug"),EditorialState.valueOf(rs.getString("editorial_state")),rs.getLong("revision"),uuid(rs,"current_revision_id"),uuid(rs,"published_revision_id"),rs.getString("title"),rs.getString("summary"),rs.getString("objectives"),rs.getString("evaluation_definition"),decode(rs.getString("document_text")),List.of(),uuid(rs,"source_translation_id"),uuid(rs,"source_revision_id"),uuid(rs,"reviewed_source_revision_id"),instant(rs,"verified_at"),instant(rs,"updated_at"),instant(rs,"frozen_at"),List.of(),rs.getString("document_text")==null?rs.getString("legacy_body"):null,publicMetadata.get(uuid(rs,"current_revision_id")));
    }
    private ContentView view(ContentView v) {
        var links=jdbc.query("SELECT id,locale,editorial_state,source_revision_id,reviewed_source_revision_id FROM content_translations WHERE pedagogical_version_id=? ORDER BY locale",
            (rs,n)->new TranslationLink(uuid(rs,"id"),rs.getString("locale"),EditorialState.valueOf(rs.getString("editorial_state")),uuid(rs,"source_revision_id"),uuid(rs,"reviewed_source_revision_id")),v.versionId());
        return new ContentView(v.id(),v.resourceId(),v.kind(),v.versionId(),v.versionNumber(),v.locale(),v.slug(),v.state(),v.revision(),v.currentRevisionId(),v.publishedRevisionId(),v.title(),v.summary(),v.objectives(),v.evaluationDefinition(),v.document(),children(v.versionId()),v.sourceTranslationId(),v.sourceRevisionId(),v.reviewedSourceRevisionId(),v.verifiedAt(),v.updatedAt(),v.frozenAt(),links,v.legacyBody(),v.metadata());
    }
    private ContentSummary summary(ContentView v) {return new ContentSummary(v.id(),v.resourceId(),v.kind(),v.versionId(),v.versionNumber(),v.locale(),v.slug(),v.state(),v.revision(),v.title(),v.summary(),v.verifiedAt(),v.updatedAt(),v.state()==EditorialState.STALE);}
    private ContentView changed(UUID id) {
        // Sibling link states and frozenAt are part of ContentView, hence its strong ETag includes their changes.
        UUID resource=row(id).resourceId();
        jdbc.update("UPDATE content_translations SET revision=revision+1,updated_at=greatest(created_at,CURRENT_TIMESTAMP) WHERE pedagogical_version_id IN(SELECT id FROM pedagogical_versions WHERE resource_id=?)",resource);
        return view(row(id));
    }
    private UUID createVersion(UUID resource,int number,String objective,String assessment,UUID replaces) {
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO pedagogical_versions(id,resource_id,version_number,objectives,evaluation_definition,replaces_version_id) VALUES(?,?,?,?,?,?)",id,resource,number,objective,assessment,replaces);return id;
    }
    private UUID createTranslation(UUID version,String locale,UUID source,UUID sourceRevision) {
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO content_translations(id,pedagogical_version_id,locale,editorial_state,source_translation_id,source_revision_id) VALUES(?,?,?,'DRAFT',?,?)",id,version,locale,source,sourceRevision);return id;
    }
    private void putSlug(UUID resource,ResourceKind kind,String locale,String value) {
        var found=jdbc.query("SELECT slug FROM resource_slugs WHERE resource_id=? AND locale=?",(rs,n)->rs.getString(1),resource,locale);
        if(!found.isEmpty()){if(!found.getFirst().equals(value))throw new ApiException(ApiError.CONFLICT);return;}
        jdbc.update("INSERT INTO resource_slugs(id,resource_id,resource_kind,locale,slug) VALUES(?,?,?,?,?)",UUID.randomUUID(),resource,kind.name(),locale,value);
    }
    private UUID append(UUID id,String title,String summary,ContentDocument d,UUID actor,String reason,UUID replaces) {
        return append(id,title,summary,d,actor,reason,replaces,null);
    }
    private UUID append(UUID id,String title,String summary,ContentDocument d,UUID actor,String reason,UUID replaces,PublicMetadata suppliedMetadata) {
        for(UUID resource:d.relatedResourceIds()) {
            if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM learning_resources WHERE id=?)",Boolean.class,resource)))throw new ApiException(ApiError.VALIDATION_FAILED);
        }
        UUID revision=UUID.randomUUID();int number=Objects.requireNonNull(jdbc.queryForObject("SELECT coalesce(max(revision_number),0)+1 FROM editorial_revisions WHERE translation_id=?",Integer.class,id));
        jdbc.update("INSERT INTO editorial_revisions(id,translation_id,revision_number,title,summary,body,author_id,document_json,reason,replaces_revision_id) VALUES(?,?,?,?,?,'',?,?::jsonb,?,?)",revision,id,number,title,summary,actor,mapper.writeValueAsString(d),reason,replaces);
        for(UUID resource:d.relatedResourceIds())jdbc.update("INSERT INTO editorial_resource_references(revision_id,resource_id) VALUES(?,?)",revision,resource);
        if(suppliedMetadata!=null)publicMetadata.put(revision,suppliedMetadata);else publicMetadata.copy(replaces,revision);
        jdbc.update("UPDATE content_translations SET current_revision_id=?,editorial_state='DRAFT',reviewed_revision_id=NULL,revision=revision+1,updated_at=greatest(created_at,CURRENT_TIMESTAMP) WHERE id=?",revision,id);
        return revision;
    }
    private void event(UUID id,UUID actor,String type,String reason) {
        jdbc.update("INSERT INTO editorial_events(id,translation_id,revision_id,actor_id,event_type,reason) SELECT ?,id,current_revision_id,?,?,? FROM content_translations WHERE id=?",UUID.randomUUID(),actor,type,reason,id);
    }
    private void state(UUID id,String state) {jdbc.update("UPDATE content_translations SET editorial_state=?,revision=revision+1,updated_at=greatest(created_at,CURRENT_TIMESTAMP) WHERE id=?",state,id);}
    private void editable(ContentView v) {if(v.state()==EditorialState.ARCHIVED)throw new ApiException(ApiError.INVALID_CONTENT_TRANSITION);}
    private List<UUID> children(UUID version) {return jdbc.query("SELECT child_version_id FROM version_compositions WHERE parent_version_id=? ORDER BY position",(rs,n)->uuid(rs,"child_version_id"),version);}
    private void setComposition(UUID version,ResourceKind kind,List<UUID> ids) {
        ids(ids,100);if(kind!=ResourceKind.COURSE && kind!=ResourceKind.MODULE)check(ids.isEmpty());
        for(UUID child:ids) {
            var kinds=jdbc.query("SELECT r.kind FROM pedagogical_versions v JOIN learning_resources r ON r.id=v.resource_id WHERE v.id=?",(rs,n)->rs.getString(1),child);
            check(kinds.size()==1 && ((kind==ResourceKind.COURSE && "MODULE".equals(kinds.getFirst())) || (kind==ResourceKind.MODULE && "ACTIVITY".equals(kinds.getFirst()))));
        }
        jdbc.update("DELETE FROM version_compositions WHERE parent_version_id=?",version);
        for(int i=0;i<ids.size();i++)jdbc.update("INSERT INTO version_compositions(id,parent_version_id,child_version_id,position) VALUES(?,?,?,?)",UUID.randomUUID(),version,ids.get(i),i+1);
    }
    private boolean samePedagogy(ContentDocument before,ContentDocument after) {
        return before!=null && Objects.equals(before.objective(),after.objective()) && Objects.equals(before.exercise(),after.exercise()) && Objects.equals(before.quiz(),after.quiz()) && Objects.equals(before.rubric(),after.rubric())
            && Objects.equals(com.chatgptcourses.learning.service.LearningValidation.effectivePolicy(before.quizPolicy()),com.chatgptcourses.learning.service.LearningValidation.effectivePolicy(after.quizPolicy()))
            && Objects.equals(before.projectPolicy(),after.projectPolicy());
    }
    private UUID sourceCurrent(ContentView v) {
        return v.sourceTranslationId()==null?null:jdbc.queryForObject("SELECT current_revision_id FROM content_translations WHERE id=?",UUID.class,v.sourceTranslationId());
    }
    private void staleDependents(UUID source,UUID actor) {
        var targets=jdbc.query("SELECT id FROM content_translations WHERE source_translation_id=? AND editorial_state<>'ARCHIVED' AND reviewed_source_revision_id IS NOT NULL AND (reviewed_source_revision_id IS DISTINCT FROM (SELECT current_revision_id FROM content_translations WHERE id=?) OR (SELECT editorial_state FROM content_translations WHERE id=?) IN('ARCHIVED','STALE'))",(rs,n)->uuid(rs,"id"),source,source,source);
        for(UUID id:targets) {state(id,"STALE");event(id,actor,"SOURCE_STALE","SOURCE_REVISION_CHANGED");}
    }
    private Readiness readiness(ContentView v,boolean requireReview) {
        var issues=new ArrayList<Issue>();var warnings=new ArrayList<Issue>();var d=v.document();
        if(v.state()==EditorialState.ARCHIVED)issue(issues,"ARCHIVED","state",v.resourceId());
        if(d==null){issue(issues,"STRUCTURED_DOCUMENT_REQUIRED","document",v.resourceId());return new Readiness(false,issues,warnings,v.currentRevisionId());}
        if(d.objective().isBlank())issue(issues,"OBJECTIVE_REQUIRED","document.objective",v.resourceId());
        if(d.expectedResult().isBlank())issue(issues,"EXPECTED_RESULT_REQUIRED","document.expectedResult",v.resourceId());
        if(d.blocks().isEmpty())issue(issues,"CONTENT_REQUIRED","document.blocks",v.resourceId());
        if(v.kind()==ResourceKind.METHOD_TEMPLATE&&!MethodValidation.complete(d.methodDefinition()))issue(issues,"METHOD_DEFINITION_REQUIRED","document.methodDefinition",v.resourceId());
        if(d.projectPolicy()!=null&&v.kind()!=ResourceKind.ACTIVITY)issue(issues,"PROJECT_POLICY_ACTIVITY_ONLY","document.projectPolicy",v.resourceId());
        if(d.projectPolicy()!=null&&!com.chatgptcourses.projects.service.ProjectValidation.complete(d))issue(issues,"PROJECT_RUBRIC_REQUIRED","document.rubric",v.resourceId());
        if(v.kind()==ResourceKind.ACTIVITY) {
            if(d.exercise()==null || d.exercise().instructions().isBlank())issue(issues,"EXERCISE_REQUIRED","document.exercise.instructions",v.resourceId());
            if(d.exercise()==null || d.exercise().correction().isBlank())issue(issues,"CORRECTION_REQUIRED","document.exercise.correction",v.resourceId());
            if(d.rubric().isEmpty())issue(issues,"RUBRIC_REQUIRED","document.rubric",v.resourceId());
        }
        if(d.estimatedMinutes()==null)issue(warnings,"NO_ESTIMATED_DURATION","document.estimatedMinutes",v.resourceId());
        for(var m:d.media())if(mediaRegistries.stream().noneMatch(registry->registry.ready(v.resourceId(),v.versionId(),v.locale(),m.assetId(),m.kind())))issue(m.required()?issues:warnings,m.required()?"MEDIA_UNVERIFIED":"OPTIONAL_MEDIA_UNVERIFIED","document.media",m.assetId());
        var childIds=children(v.versionId());
        if((v.kind()==ResourceKind.COURSE || v.kind()==ResourceKind.MODULE) && childIds.isEmpty())issue(issues,"CHILD_REQUIRED","childVersionIds",v.resourceId());
        for(UUID child:childIds) {
            var status=jdbc.query("SELECT v.frozen_at,t.editorial_state,t.published_revision_id,v.resource_id FROM pedagogical_versions v LEFT JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale=? WHERE v.id=?",(rs,n)->new Child(uuid(rs,"resource_id"),instant(rs,"frozen_at"),rs.getString("editorial_state"),uuid(rs,"published_revision_id")),v.locale(),child).getFirst();
            if(status.frozen()==null)issue(issues,"CHILD_NOT_FROZEN","childVersionIds",status.resource());
            if(status.published()==null || "ARCHIVED".equals(status.state()) || "STALE".equals(status.state()))issue(issues,"CHILD_NOT_PUBLISHED","childVersionIds",status.resource());
        }
        for(UUID related:d.relatedResourceIds()) {
            if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM content_translations t JOIN pedagogical_versions v ON v.id=t.pedagogical_version_id WHERE v.resource_id=? AND t.locale=? AND t.published_revision_id IS NOT NULL AND t.editorial_state NOT IN('ARCHIVED','STALE'))",Boolean.class,related,v.locale())))issue(issues,"RELATED_NOT_PUBLISHED","document.relatedResourceIds",related);
        }
        if(v.sourceTranslationId()!=null) {
            var source=row(v.sourceTranslationId());
            if(source.document()==null || !sameAssessmentStructure(source.document(),d))issue(issues,"TRANSLATION_ASSESSMENT_MISMATCH","document.quiz",v.resourceId());
            String sourceState=jdbc.queryForObject("SELECT editorial_state FROM content_translations WHERE id=?",String.class,v.sourceTranslationId());
            if("ARCHIVED".equals(sourceState) || "STALE".equals(sourceState) || (requireReview && !Objects.equals(sourceCurrent(v),v.reviewedSourceRevisionId())))issue(issues,"TRANSLATION_SOURCE_CHANGED","reviewedSourceRevisionId",v.resourceId());
        }
        if(requireReview) {
            UUID reviewed=jdbc.queryForObject("SELECT reviewed_revision_id FROM content_translations WHERE id=?",UUID.class,v.id());
            if(!Objects.equals(reviewed,v.currentRevisionId()) || v.verifiedAt()==null)issue(issues,"REVIEW_REQUIRED","state",v.resourceId());
        }
        return new Readiness(issues.isEmpty(),List.copyOf(issues),List.copyOf(warnings),v.currentRevisionId());
    }
    private Dependencies dependencies(ContentView v) {
        var deps=jdbc.query("""
          SELECT DISTINCT pv.resource_id,pv.id AS version_id,r.kind,coalesce(e.title,'') AS title,'COMPOSITION' AS relation
          FROM version_compositions c JOIN pedagogical_versions pv ON pv.id=c.parent_version_id JOIN learning_resources r ON r.id=pv.resource_id
          LEFT JOIN content_translations t ON t.pedagogical_version_id=pv.id AND t.locale=? LEFT JOIN editorial_revisions e ON e.id=t.current_revision_id WHERE c.child_version_id=?
          UNION
          SELECT DISTINCT pv.resource_id,pv.id,r.kind,e.title,'REFERENCE' FROM editorial_resource_references ref
          JOIN editorial_revisions e ON e.id=ref.revision_id JOIN content_translations t ON t.id=e.translation_id
          JOIN pedagogical_versions pv ON pv.id=t.pedagogical_version_id JOIN learning_resources r ON r.id=pv.resource_id WHERE ref.resource_id=?
          UNION
          SELECT pv.resource_id,pv.id,r.kind,coalesce(e.title,''),'TRANSLATION' FROM content_translations t
          JOIN pedagogical_versions pv ON pv.id=t.pedagogical_version_id JOIN learning_resources r ON r.id=pv.resource_id
          LEFT JOIN editorial_revisions e ON e.id=t.current_revision_id WHERE t.source_translation_id=?
          """,(rs,n)->new Dependency(uuid(rs,"resource_id"),uuid(rs,"version_id"),ResourceKind.valueOf(rs.getString("kind")),rs.getString("title"),rs.getString("relation")),v.locale(),v.versionId(),v.resourceId(),v.id());
        return new Dependencies(deps,v.state()!=EditorialState.ARCHIVED,List.of("ARCHIVE_REMOVES_PUBLIC_ACCESS","HISTORY_RETAINED","DEPENDENTS_REQUIRE_REVIEW"));
    }
    private static boolean sameAssessmentStructure(ContentDocument source,ContentDocument translated) {
        if((source.exercise()==null)!=(translated.exercise()==null) || source.quiz().size()!=translated.quiz().size() || source.rubric().size()!=translated.rubric().size()
            || !Objects.equals(com.chatgptcourses.learning.service.LearningValidation.effectivePolicy(source.quizPolicy()),com.chatgptcourses.learning.service.LearningValidation.effectivePolicy(translated.quizPolicy()))
            || !com.chatgptcourses.projects.service.ProjectValidation.equivalentPolicy(source.projectPolicy(),translated.projectPolicy()))return false;
        for(int i=0;i<source.quiz().size();i++) {
            var a=source.quiz().get(i);var b=translated.quiz().get(i);
            if(!a.key().equals(b.key()) || a.options().size()!=b.options().size() || a.correctOption()!=b.correctOption() || a.points()!=b.points())return false;
        }
        for(int i=0;i<source.rubric().size();i++) {
            var a=source.rubric().get(i);var b=translated.rubric().get(i);
            if(!a.key().equals(b.key()) || a.points()!=b.points() || a.blocking()!=b.blocking())return false;
        }
        return true;
    }
    private static void issue(List<Issue> list,String code,String field,UUID id) {list.add(new Issue(code,field,id,"FIX_"+code));}
    private ContentDocument decode(String json) {return json==null?null:mapper.readValue(json,ContentDocument.class);}
    private static PublicDocument publicDocument(ContentDocument d) {return new PublicDocument(d.objective(),d.expectedResult(),d.prerequisites(),d.blocks(),d.estimatedMinutes(),d.exercise()==null?null:d.exercise().instructions(),d.quiz().stream().map(q->new PublicQuizQuestion(q.key(),q.prompt(),q.options(),q.points())).toList(),d.rubric(),d.access(),d.media(),d.relatedResourceIds(),d.methodDefinition(),d.quizPolicy(),d.projectPolicy());}
    private static UUID uuid(ResultSet rs,String field)throws SQLException {return rs.getObject(field,UUID.class);}
    private static Instant instant(ResultSet rs,String field)throws SQLException {Timestamp t=rs.getTimestamp(field);return t==null?null:t.toInstant();}
    private record Child(UUID resource,Instant frozen,String state,UUID published) { }
}
