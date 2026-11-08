package com.chatgptcourses.catalog.service;

import static com.chatgptcourses.catalog.service.CatalogTypes.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.editorial.service.ContentTypes.ContentDocument;
import com.chatgptcourses.editorial.service.ContentTypes.PublicDocument;
import com.chatgptcourses.editorial.service.ContentTypes.PublicQuizQuestion;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** Public-only projections. No caller-supplied permission or owner snapshot is accepted. */
@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class PublicCatalogueService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final PublicMetadataStore metadata;
    private static final Set<ResourceKind> CARD_KINDS=Set.of(ResourceKind.COURSE,ResourceKind.ACTIVITY,ResourceKind.GUIDE,ResourceKind.METHOD_TEMPLATE);
    private static final String BASE="""
        FROM learning_resources r JOIN pedagogical_versions v ON v.resource_id=r.id
        JOIN content_translations t ON t.pedagogical_version_id=v.id
        JOIN editorial_revisions e ON e.id=t.published_revision_id
        LEFT JOIN content_translations source ON source.id=t.source_translation_id
        LEFT JOIN resource_slugs s ON s.resource_id=r.id AND s.locale=t.locale
        LEFT JOIN editorial_public_metadata m ON m.revision_id=e.id
        """;
    private static final String CURRENT_AVAILABLE="""
        WHERE r.archived_at IS NULL AND t.editorial_state NOT IN('ARCHIVED','STALE') AND e.document_json IS NOT NULL
          AND r.kind IN('COURSE','ACTIVITY','GUIDE','METHOD_TEMPLATE')
          AND (t.source_translation_id IS NULL OR (t.published_source_revision_id=source.current_revision_id AND source.editorial_state NOT IN('ARCHIVED','STALE')))
          AND v.version_number=(SELECT max(newest.version_number) FROM pedagogical_versions newest
            WHERE newest.resource_id=r.id AND EXISTS(SELECT 1 FROM content_translations published
              WHERE published.pedagogical_version_id=newest.id AND published.published_revision_id IS NOT NULL))
        """;
    private static final String CARD_SELECT="""
        SELECT r.id AS resource_id,r.kind,v.id AS version_id,v.version_number,t.locale,t.published_verified_at,
          e.id AS revision_id,e.title,e.summary,e.document_json::text AS document_text,s.slug,m.metadata_json::text AS metadata_text
        """;

    public PublicCatalogueService(JdbcTemplate jdbc,ObjectMapper mapper) {
        this.jdbc=jdbc;this.mapper=mapper;this.metadata=new PublicMetadataStore(jdbc,mapper);
    }

    public CataloguePage search(CatalogueQuery query) {
        validate(query);var args=new ArrayList<Object>();var filter=new StringBuilder(" AND t.locale=?");args.add(query.locale());
        if(query.q()!=null&&!query.q().isBlank()) {
            String pattern="%"+query.q().strip().replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
            filter.append(" AND (e.title ILIKE ? OR e.summary ILIKE ? OR s.slug ILIKE ? OR e.document_json->>'objective' ILIKE ?)");
            for(int i=0;i<4;i++)args.add(pattern);
        }
        if(query.type()!=null){filter.append(" AND r.kind=?");args.add(query.type().name());}
        if(query.goal()!=null){filter.append(" AND jsonb_exists(coalesce(m.metadata_json->'goalCodes','[]'::jsonb),?)");args.add(query.goal());}
        if(query.level()!=null){filter.append(" AND m.metadata_json->>'level'=?");args.add(query.level());}
        if(query.access()!=null){filter.append(" AND e.document_json->>'access'=?");args.add(query.access());}
        long total=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) "+BASE+CURRENT_AVAILABLE+filter,Long.class,args.toArray()));
        String order="RECENT".equals(query.sort())
            ?"(SELECT max(pub.created_at) FROM editorial_events pub WHERE pub.translation_id=t.id AND pub.revision_id=t.published_revision_id AND pub.event_type='PUBLISH') DESC NULLS LAST,r.id"
            :"lower(e.title) COLLATE \"C\",r.id";
        args.add(query.pageSize());args.add((long)query.page()*query.pageSize());
        var items=jdbc.query(CARD_SELECT+BASE+CURRENT_AVAILABLE+filter+" ORDER BY "+order+" LIMIT ? OFFSET ?",(rs,n)->card(rs),args.toArray());
        return new CataloguePage(items,query.page(),query.pageSize(),total);
    }

    public CatalogueFacets facets(String locale) {
        locale(locale);
        List<FacetOption> types=counts("r.kind",locale).stream().map(x->new FacetOption(x.code(),typeLabel(x.code(),locale),x.count())).toList();
        List<FacetOption> levels=counts("m.metadata_json->>'level'",locale).stream().filter(x->PublicMetadataStore.LEVELS.contains(x.code())).map(x->new FacetOption(x.code(),levelLabel(x.code(),locale),x.count())).toList();
        List<FacetOption> accesses=counts("e.document_json->>'access'",locale).stream().map(x->new FacetOption(x.code(),accessLabel(x.code(),locale),x.count())).toList();
        var goals=jdbc.query("SELECT goal.code,count(*) AS count "+BASE+" CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(m.metadata_json->'goalCodes','[]'::jsonb)) goal(code) "+CURRENT_AVAILABLE+" AND t.locale=? GROUP BY goal.code ORDER BY goal.code",
            (rs,n)->new FacetOption(rs.getString("code"),goalLabel(rs.getString("code"),locale),rs.getLong("count")),locale).stream().filter(x->PublicMetadataStore.GOALS.contains(x.code())).toList();
        var languages=jdbc.query("SELECT t.locale AS code,count(*) AS count "+BASE+CURRENT_AVAILABLE+" GROUP BY t.locale ORDER BY t.locale",
            (rs,n)->new FacetOption(rs.getString("code"),"fr".equals(rs.getString("code"))?"Français":"English",rs.getLong("count")));
        return new CatalogueFacets(types,goals,levels,accesses,languages);
    }

    public ResourceDetail detail(UUID resourceId,String locale) {
        locale(locale);var versions=jdbc.query("""
            SELECT v.id,v.resource_id,v.version_number,r.kind,r.archived_at FROM pedagogical_versions v
            JOIN learning_resources r ON r.id=v.resource_id WHERE r.id=?
              AND EXISTS(SELECT 1 FROM content_translations t WHERE t.pedagogical_version_id=v.id AND t.published_revision_id IS NOT NULL)
            ORDER BY v.version_number DESC LIMIT 1
            """,(rs,n)->versionInfo(rs),resourceId);
        if(versions.isEmpty())throw notFound();return detail(versions.getFirst(),locale);
    }

    public ResourceDetail bySlug(ResourceKind kind,String slug,String locale) {
        locale(locale);check(kind!=null&&CARD_KINDS.contains(kind));
        check(slug!=null&&slug.length()<=180&&slug.matches("[a-z0-9]+(-[a-z0-9]+)*"));
        var resources=jdbc.query("SELECT resource_id FROM resource_slugs WHERE resource_kind=? AND locale=? AND slug=?",(rs,n)->uuid(rs,"resource_id"),kind.name(),locale,slug);
        if(resources.isEmpty())throw notFound();return detail(resources.getFirst(),locale);
    }

    public ResourceDetail version(UUID resourceId,UUID versionId,String locale) {
        locale(locale);var versions=jdbc.query("""
            SELECT v.id,v.resource_id,v.version_number,r.kind,r.archived_at FROM pedagogical_versions v JOIN learning_resources r ON r.id=v.resource_id
            WHERE v.id=? AND v.resource_id=? AND EXISTS(SELECT 1 FROM content_translations t WHERE t.pedagogical_version_id=v.id AND t.published_revision_id IS NOT NULL)
            """,(rs,n)->versionInfo(rs),versionId,resourceId);
        if(versions.isEmpty())throw notFound();return detail(versions.getFirst(),locale);
    }

    private ResourceDetail detail(VersionInfo version,String locale) {
        var publication=publication(version,locale);boolean available="PUBLISHED".equals(publication.status());
        boolean hasMetadata=available||"STALE".equals(publication.status());
        ContentDocument document=hasMetadata?publication.document():null;
        var languages=List.of(language(version,"fr"),language(version,"en"));
        List<CurriculumNode> curriculum=available?curriculum(version.id(),locale):List.of();
        List<ResourceCard> related=document==null?List.of():related(document.relatedResourceIds(),locale);
        return new ResourceDetail(version.resourceId(),version.kind(),version.id(),version.number(),locale,publication.slug(),publication.status(),
            hasMetadata?publication.revisionId():null,hasMetadata?publication.title():null,hasMetadata?publication.summary():null,
            document==null?null:document.access(),available&&"FREE".equals(document.access())?publicDocument(document):null,
            hasMetadata?publication.metadata():PublicMetadataStore.empty(),hasMetadata?publication.reviewedAt():null,languages,curriculum,related,
            document==null?null:document.objective(),document==null?null:document.expectedResult(),document==null?List.of():document.prerequisites(),document==null?null:document.estimatedMinutes());
    }

    private List<CurriculumNode> curriculum(UUID parent,String locale) {
        // One bounded, metadata-only query for COURSE->MODULE->ACTIVITY, without loading lesson bodies.
        var rows=jdbc.query("""
            WITH RECURSIVE tree(parent_id,id,depth,path) AS (
              SELECT c.parent_version_id,c.child_version_id,1,ARRAY[c.position] FROM version_compositions c WHERE c.parent_version_id=?
              UNION ALL SELECT c.parent_version_id,c.child_version_id,tree.depth+1,tree.path||c.position
                FROM version_compositions c JOIN tree ON c.parent_version_id=tree.id WHERE tree.depth<2)
            SELECT tree.parent_id,v.id,v.resource_id,v.version_number,r.kind,r.archived_at,s.slug,t.editorial_state,
              t.published_revision_id,t.source_translation_id,t.published_source_revision_id,source.current_revision_id AS source_current,
              source.editorial_state AS source_state,e.title,e.summary,e.document_json IS NOT NULL AS has_document,
              e.document_json->>'access' AS access,e.document_json->>'estimatedMinutes' AS minutes
            FROM tree JOIN pedagogical_versions v ON v.id=tree.id JOIN learning_resources r ON r.id=v.resource_id
            LEFT JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale=?
            LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id
            LEFT JOIN content_translations source ON source.id=t.source_translation_id
            LEFT JOIN resource_slugs s ON s.resource_id=r.id AND s.locale=? ORDER BY tree.path
            """,(rs,n)->{
                UUID revision=uuid(rs,"published_revision_id");String status;
                if(instant(rs,"archived_at")!=null||"ARCHIVED".equals(rs.getString("editorial_state")))status="WITHDRAWN";
                else if(revision==null)status="MISSING_TRANSLATION";
                else if(!rs.getBoolean("has_document"))status="WITHDRAWN";
                else if("STALE".equals(rs.getString("editorial_state"))||(uuid(rs,"source_translation_id")!=null&&
                    (!Objects.equals(uuid(rs,"published_source_revision_id"),uuid(rs,"source_current"))||Set.of("ARCHIVED","STALE").contains(rs.getString("source_state")))))status="STALE";
                else status="PUBLISHED";
                String minutes=rs.getString("minutes");
                return new ProgramRow(uuid(rs,"parent_id"),versionInfo(rs),status,revision,rs.getString("slug"),rs.getString("title"),rs.getString("summary"),rs.getString("access"),minutes==null?null:Integer.valueOf(minutes));
            },parent,locale,locale);
        Map<UUID,List<ProgramRow>> children=new HashMap<>();
        for(var row:rows)children.computeIfAbsent(row.parent(),ignored->new ArrayList<>()).add(row);
        return nodes(parent,locale,children);
    }
    private static List<CurriculumNode> nodes(UUID parent,String locale,Map<UUID,List<ProgramRow>> tree) {
        return tree.getOrDefault(parent,List.of()).stream().map(p->{var v=p.version();boolean visible="PUBLISHED".equals(p.status());
            return new CurriculumNode(v.resourceId(),v.kind(),v.id(),v.number(),locale,p.slug(),p.status(),visible?p.revisionId():null,
                visible?p.title():null,visible?p.summary():null,visible?p.access():null,visible?p.minutes():null,visible?nodes(v.id(),locale,tree):List.of());}).toList();
    }

    private Publication publication(VersionInfo version,String locale) {
        var rows=jdbc.query("""
            SELECT t.*,e.title,e.summary,e.document_json::text AS document_text,s.slug,m.metadata_json::text AS metadata_text,
              source.current_revision_id AS source_current,source.editorial_state AS source_state
            FROM content_translations t LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id
            LEFT JOIN resource_slugs s ON s.resource_id=? AND s.locale=t.locale
            LEFT JOIN editorial_public_metadata m ON m.revision_id=e.id
            LEFT JOIN content_translations source ON source.id=t.source_translation_id
            WHERE t.pedagogical_version_id=? AND t.locale=?
            """,(rs,n)-> {
                UUID revision=uuid(rs,"published_revision_id");ContentDocument d=document(rs.getString("document_text"));String status;
                if(version.archivedAt()!=null||"ARCHIVED".equals(rs.getString("editorial_state")))status="WITHDRAWN";
                else if(revision==null)status="MISSING_TRANSLATION";
                else if(d==null)status="WITHDRAWN";
                else if("STALE".equals(rs.getString("editorial_state")) || (uuid(rs,"source_translation_id")!=null &&
                    (!Objects.equals(uuid(rs,"published_source_revision_id"),uuid(rs,"source_current")) || Set.of("ARCHIVED","STALE").contains(rs.getString("source_state")))))status="STALE";
                else status="PUBLISHED";
                return new Publication(status,revision,rs.getString("slug"),rs.getString("title"),rs.getString("summary"),d,metadata(rs.getString("metadata_text")),instant(rs,"published_verified_at"));
            },version.resourceId(),version.id(),locale);
        if(rows.isEmpty())return new Publication(version.archivedAt()==null?"MISSING_TRANSLATION":"WITHDRAWN",null,null,null,null,null,PublicMetadataStore.empty(),null);
        return rows.getFirst();
    }
    private LanguageAvailability language(VersionInfo version,String locale) {
        var p=publication(version,locale);return new LanguageAvailability(locale,p.status(),"PUBLISHED".equals(p.status())?p.slug():null);
    }
    private List<ResourceCard> related(List<UUID> resources,String locale) {
        var cards=new ArrayList<ResourceCard>();
        for(UUID resource:resources)cards.addAll(jdbc.query(CARD_SELECT+BASE+CURRENT_AVAILABLE+" AND r.id=? AND t.locale=?",(rs,n)->card(rs),resource,locale));
        return List.copyOf(cards);
    }
    private ResourceCard card(ResultSet rs)throws SQLException {
        ContentDocument d=document(rs.getString("document_text"));var m=metadata(rs.getString("metadata_text"));
        return new ResourceCard(uuid(rs,"resource_id"),ResourceKind.valueOf(rs.getString("kind")),uuid(rs,"version_id"),rs.getInt("version_number"),uuid(rs,"revision_id"),rs.getString("locale"),rs.getString("slug"),rs.getString("title"),rs.getString("summary"),d.objective(),d.expectedResult(),d.estimatedMinutes(),d.access(),m.goalCodes(),m.level(),instant(rs,"published_verified_at"));
    }
    private List<FacetOption> counts(String expression,String locale) {
        // expression is selected by this class, never supplied by a request.
        return jdbc.query("SELECT "+expression+" AS code,count(*) AS count "+BASE+CURRENT_AVAILABLE+" AND t.locale=? AND "+expression+" IS NOT NULL GROUP BY "+expression+" ORDER BY "+expression,
            (rs,n)->new FacetOption(rs.getString("code"),rs.getString("code"),rs.getLong("count")),locale);
    }
    private static void validate(CatalogueQuery q) {
        check(q!=null);locale(q.locale());check(q.type()==null||CARD_KINDS.contains(q.type()));
        check(q.q()==null||(q.q().length()<=240&&q.q().indexOf('\0')<0));
        check(q.goal()==null||PublicMetadataStore.GOALS.contains(q.goal()));check(q.level()==null||PublicMetadataStore.LEVELS.contains(q.level()));
        check(q.access()==null||Set.of("FREE","PROTECTED").contains(q.access()));
        check(q.sort()==null||Set.of("TITLE","RECENT").contains(q.sort()));check(q.page()>=0&&q.page()<=1_000_000&&q.pageSize()>=1&&q.pageSize()<=100);
    }
    private static void locale(String locale){check(locale!=null&&Set.of("fr","en").contains(locale));}
    private static void check(boolean value){if(!value)throw new ApiException(ApiError.VALIDATION_FAILED);}
    private static ApiException notFound(){return new ApiException(ApiError.RESOURCE_NOT_FOUND);}
    private ContentDocument document(String json){return json==null?null:mapper.readValue(json,ContentDocument.class);}
    private PublicMetadata metadata(String json){return json==null?PublicMetadataStore.empty():mapper.readValue(json,PublicMetadata.class);}
    private static PublicDocument publicDocument(ContentDocument d){return new PublicDocument(d.objective(),d.expectedResult(),d.prerequisites(),d.blocks(),d.estimatedMinutes(),d.exercise()==null?null:d.exercise().instructions(),d.quiz().stream().map(q->new PublicQuizQuestion(q.key(),q.prompt(),q.options(),q.points())).toList(),d.rubric(),d.access(),d.media(),d.relatedResourceIds());}
    private static VersionInfo versionInfo(ResultSet rs)throws SQLException{return new VersionInfo(uuid(rs,"id"),uuid(rs,"resource_id"),rs.getInt("version_number"),ResourceKind.valueOf(rs.getString("kind")),instant(rs,"archived_at"));}
    private static UUID uuid(ResultSet rs,String key)throws SQLException{return rs.getObject(key,UUID.class);}
    private static Instant instant(ResultSet rs,String key)throws SQLException{Timestamp value=rs.getTimestamp(key);return value==null?null:value.toInstant();}
    private record VersionInfo(UUID id,UUID resourceId,int number,ResourceKind kind,Instant archivedAt) { }
    private record Publication(String status,UUID revisionId,String slug,String title,String summary,ContentDocument document,PublicMetadata metadata,Instant reviewedAt) { }
    private record ProgramRow(UUID parent,VersionInfo version,String status,UUID revisionId,String slug,String title,String summary,String access,Integer minutes) { }
    private static String typeLabel(String code,String locale){return ("fr".equals(locale)?Map.of("COURSE","Parcours","ACTIVITY","Activités","GUIDE","Guides","METHOD_TEMPLATE","Modèles de méthode"):Map.of("COURSE","Courses","ACTIVITY","Activities","GUIDE","Guides","METHOD_TEMPLATE","Method templates")).getOrDefault(code,code);}
    private static String accessLabel(String code,String locale){return "FREE".equals(code)?("fr".equals(locale)?"Gratuit":"Free"):("fr".equals(locale)?"Protégé":"Protected");}
    private static String levelLabel(String code,String locale){return ("fr".equals(locale)?Map.of("BEGINNER","Débutant","INTERMEDIATE","Intermédiaire","ADVANCED","Avancé"):Map.of("BEGINNER","Beginner","INTERMEDIATE","Intermediate","ADVANCED","Advanced")).getOrDefault(code,code);}
    private static String goalLabel(String code,String locale){return ("fr".equals(locale)?Map.of("understand-brief","Comprendre un brief","define-scope","Définir une prestation","prepare-prompt","Préparer une demande","build-proposal","Construire une proposition","check-output","Contrôler un résultat","reuse-method","Réutiliser une méthode"):Map.of("understand-brief","Understand a brief","define-scope","Define the scope","prepare-prompt","Prepare a prompt","build-proposal","Build a proposal","check-output","Check an output","reuse-method","Reuse a method")).getOrDefault(code,code);}
}
