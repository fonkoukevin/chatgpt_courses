package com.chatgptcourses.commerce.service;

import static com.chatgptcourses.commerce.service.CommerceTypes.*;
import static com.chatgptcourses.commerce.service.OfferValidation.*;
import com.chatgptcourses.editorial.service.ContentTypes.ContentDocument;
import com.chatgptcourses.editorial.service.EditorialMediaRegistry;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.http.RevisionPreconditions;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** Versioned commercial terms are distinct from publications and from payment/access facts. */
@Service
public class OfferService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final CommerceAuthorization auth;
    private final CommerceSettings settings;
    private final PaymentGateway gateway;
    private final List<EditorialMediaRegistry> registries;
    private static final String SELECT="SELECT o.*,p.code,p.kind,r.revision_number,r.fields_json::text AS fields_text FROM offers o JOIN products p ON p.id=o.product_id JOIN offer_revisions r ON r.id=o.current_revision_id ";
    public OfferService(JdbcTemplate jdbc,ObjectMapper mapper,CommerceAuthorization auth,CommerceSettings settings,PaymentGateway gateway,List<EditorialMediaRegistry> registries){
        this.jdbc=jdbc;this.mapper=mapper;this.auth=auth;this.settings=settings;this.gateway=gateway;this.registries=List.copyOf(registries);
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public OfferPage listPublic(OfferQuery query){return list(query,false);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public OfferPage listAdmin(UUID actor,OfferQuery query){auth.require(actor,"commerce.offers.read");return list(query,true);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public PublicOffer publicOffer(UUID id,String locale){locale(locale);var offer=load(id,false);if("DRAFT".equals(offer.state()))throw missing();return project(offer,locale);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public OfferView get(UUID actor,UUID id){auth.require(actor,"commerce.offers.read");return load(id,false);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public OfferReadiness readiness(UUID actor,UUID id){auth.require(actor,"commerce.offers.read");return readiness(load(id,false));}

    @Transactional
    public OfferView create(UUID actor,UUID context,CreateOffer command){
        auth.mutation(actor,context,"commerce.offers.write");check(command!=null&&command.code()!=null&&command.code().matches("[a-z0-9][a-z0-9-]{0,79}")&&command.kind()!=null&&List.of("COURSE","PACK").contains(command.kind()));fields(command.fields(),mapper);reason(command.reason());
        lockActor(actor);lockResources(command.fields());auth.mutation(actor,context,"commerce.offers.write");
        UUID product=UUID.randomUUID(),id=UUID.randomUUID();
        try{jdbc.update("INSERT INTO products(id,code,kind) VALUES(?,?,?)",product,command.code(),command.kind());}catch(DataIntegrityViolationException failure){throw new ApiException(ApiError.CONFLICT);}
        jdbc.update("INSERT INTO offers(id,product_id,state) VALUES(?,?,'DRAFT')",id,product);
        UUID revision=append(id,1,command.fields(),actor,command.reason());
        jdbc.update("UPDATE offers SET current_revision_id=?,revision=revision+1,updated_at=greatest(created_at,clock_timestamp()) WHERE id=?",revision,id);
        event(id,revision,actor,"CREATE",command.reason());return load(id,false);
    }

    @Transactional
    public OfferView save(UUID actor,UUID context,UUID id,String ifMatch,SaveOffer command){
        auth.mutation(actor,context,"commerce.offers.write");check(command!=null);fields(command.fields(),mapper);reason(command.reason());lockActor(actor);
        var before=load(id,true);RevisionPreconditions.requireMatch(ifMatch,tag(before));lockResources(command.fields());auth.mutation(actor,context,"commerce.offers.write");
        UUID revision=append(id,before.revisionNumber()+1,command.fields(),actor,command.reason());
        jdbc.update("UPDATE offers SET current_revision_id=?,state=CASE WHEN state='DRAFT' THEN 'DRAFT' ELSE 'INACTIVE' END,revision=revision+1,updated_at=greatest(updated_at,clock_timestamp()) WHERE id=?",revision,id);
        event(id,revision,actor,"SAVE",command.reason());return load(id,false);
    }

    @Transactional
    public OfferView activate(UUID actor,UUID context,UUID id,String ifMatch,ChangeOfferState command){return change(actor,context,id,ifMatch,command,true);}
    @Transactional
    public OfferView deactivate(UUID actor,UUID context,UUID id,String ifMatch,ChangeOfferState command){return change(actor,context,id,ifMatch,command,false);}

    /** Called inside the order transaction after the actor lock. Holds offer and curriculum locks. */
    @Transactional
    public PublicOffer lockForOrder(UUID id,long expectedRevision,String locale){
        locale(locale);check(expectedRevision>=0&&expectedRevision<=MAX);
        var offer=loadShared(id);
        if(offer.revision()!=expectedRevision)throw new ApiException(ApiError.OFFER_CHANGED);
        if(!"ACTIVE".equals(offer.state())||!offer.fields().locales().contains(locale))throw new ApiException(ApiError.OFFER_NOT_READY);
        lockResources(offer.fields());var publicOffer=project(offer,locale);
        if(!publicOffer.readiness().summaryReady())throw new ApiException(ApiError.OFFER_NOT_READY);return publicOffer;
    }

    private OfferView change(UUID actor,UUID context,UUID id,String ifMatch,ChangeOfferState command,boolean activate){
        auth.mutation(actor,context,"commerce.offers.activate");check(command!=null);reason(command.reason());lockActor(actor);var offer=load(id,true);RevisionPreconditions.requireMatch(ifMatch,tag(offer));
        if(activate){lockResources(offer.fields());if(!readiness(offer).summaryReady())throw new ApiException(ApiError.OFFER_NOT_READY);}
        auth.mutation(actor,context,"commerce.offers.activate");String state=activate?"ACTIVE":"INACTIVE";
        if(state.equals(offer.state()))return offer;
        jdbc.update("UPDATE offers SET state=?,revision=revision+1,updated_at=greatest(updated_at,clock_timestamp()) WHERE id=?",state,id);event(id,offer.currentRevisionId(),actor,activate?"ACTIVATE":"DEACTIVATE",command.reason());return load(id,false);
    }
    private OfferPage list(OfferQuery q,boolean admin){
        check(q!=null&&q.page()>=0&&q.page()<=1_000_000&&q.pageSize()>=1&&q.pageSize()<=100);locale(q.locale());
        check(q.q()==null||q.q().length()<=240);check(q.state()==null||List.of("DRAFT","ACTIVE","INACTIVE").contains(q.state()));check(q.kind()==null||List.of("COURSE","PACK").contains(q.kind()));
        var args=new ArrayList<Object>();StringBuilder where=new StringBuilder(admin?" WHERE true":" WHERE o.state<>'DRAFT'");
        if(q.state()!=null){where.append(" AND o.state=?");args.add(q.state());}if(q.kind()!=null){where.append(" AND p.kind=?");args.add(q.kind());}
        if(q.q()!=null&&!q.q().isBlank()){where.append(" AND (p.code ILIKE ? OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.fields_json->'copies') c WHERE c->>'locale'=? AND (c->>'title' ILIKE ? OR c->>'summary' ILIKE ?)))");String pattern="%"+q.q().strip().replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";args.add(pattern);args.add(q.locale());args.add(pattern);args.add(pattern);}
        String base=" FROM offers o JOIN products p ON p.id=o.product_id JOIN offer_revisions r ON r.id=o.current_revision_id";
        long total=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*)"+base+where,Long.class,args.toArray()));args.add(q.pageSize());args.add((long)q.page()*q.pageSize());
        var values=jdbc.query(SELECT+where+" ORDER BY p.code,o.id LIMIT ? OFFSET ?",(rs,n)->offer(rs),args.toArray());
        return new OfferPage(values.stream().map(v->{var copy=copy(v.fields(),q.locale());return new OfferSummary(v.id(),v.revision(),v.code(),v.kind(),v.state(),q.locale(),copy!=null,copy==null?null:copy.title(),copy==null?null:copy.summary(),v.fields().price());}).toList(),q.page(),q.pageSize(),total);
    }
    private PublicOffer project(OfferView offer,String locale){
        var f=offer.fields();var copy=copy(f,locale);var resources=f.resources().stream().map(r->{var source=source(r.resourceId(),r.versionId(),locale);return new OfferResource(r.resourceId(),r.versionId(),source.versionNumber(),locale,source.title(),source.slug(),source.availability(),source.document()==null?null:source.document().access());}).toList();
        return new PublicOffer(offer.id(),offer.productId(),offer.revision(),offer.code(),offer.kind(),offer.state(),locale,copy!=null,copy==null?null:copy.title(),copy==null?null:copy.summary(),resources,f.locales(),f.price(),f.tax(),f.conditions(),readiness(offer));
    }
    private OfferReadiness readiness(OfferView offer){
        var issues=new ArrayList<CommerceIssue>();var warnings=new ArrayList<CommerceIssue>();var f=offer.fields();
        if(!settings.enabled())issue(issues,"COMMERCE_NOT_CONFIGURED","configuration",null,null);
        if(f.price()==null)issue(issues,"PRICE_REQUIRED","price",null,null);else if(!settings.allowedCurrencies().contains(f.price().currency()))issue(issues,"CURRENCY_NOT_CONFIGURED","price.currency",null,null);
        if(f.locales().isEmpty())issue(issues,"LOCALES_REQUIRED","locales",null,null);
        if(f.resources().isEmpty())issue(issues,"RESOURCES_REQUIRED","resources",null,null);
        if(("COURSE".equals(offer.kind())&&f.resources().size()!=1)||("PACK".equals(offer.kind())&&f.resources().size()<2))issue(issues,"PRODUCT_COMPOSITION_INVALID","resources",null,null);
        var c=f.conditions();
        if(c==null||!periodReady(c.access(),false))issue(issues,"ACCESS_REQUIRED","conditions.access",null,null);
        if(c==null||!periodReady(c.updates(),true))issue(issues,"UPDATES_REQUIRED","conditions.updates",null,null);
        if(c==null||c.versionPolicy()==null||("UPDATES_DURING_PERIOD".equals(c.versionPolicy())&&(c.updates()==null||!"PERIOD".equals(c.updates().mode()))))issue(issues,"VERSION_POLICY_REQUIRED","conditions.versionPolicy",null,null);
        if(c==null||c.support()==null||c.support().mode()==null)issue(issues,"SUPPORT_REQUIRED","conditions.support",null,null);
        if(c!=null&&c.humanReviewIncluded())issue(issues,"HUMAN_REVIEW_UNAVAILABLE","conditions.humanReviewIncluded",null,null);
        if(f.tax()==null||f.tax().mode()==null)issue(issues,"TAX_REQUIRED","tax",null,null);else if("EXCLUSIVE".equals(f.tax().mode()))issue(issues,"TAX_NOT_SUPPORTED","tax.mode",null,null);
        var tree=tree(f);if(tree.size()>2000)issue(issues,"CURRICULUM_TOO_LARGE","resources",null,null);
        for(var locale:f.locales()){
            var copy=copy(f,locale);if(copy==null||copy.title().isBlank()||copy.summary().isBlank())issue(issues,"COPY_REQUIRED","copies",null,locale);
            if(f.tax()!=null&&!localizedReady(f.tax().notices(),locale))issue(issues,"TAX_NOTICE_REQUIRED","tax.notices",null,locale);
            if(c==null||c.termsVersion()==null||c.termsVersion().isBlank()||!localizedReady(c.terms(),locale))issue(issues,"TERMS_REQUIRED","conditions.terms",null,locale);
            if(c!=null&&c.support()!=null&&"ASYNC".equals(c.support().mode())&&!localizedReady(c.support().descriptions(),locale))issue(issues,"SUPPORT_DESCRIPTION_REQUIRED","conditions.support.descriptions",null,locale);
            if(tree.size()<=2000)for(var node:tree){var source=source(node.resourceId(),node.versionId(),locale);
                if(!"PUBLISHED".equals(source.availability())){issue(issues,"RESOURCE_UNAVAILABLE","resources",node.resourceId(),locale);continue;}
                for(var media:source.document().media())if(registries.stream().noneMatch(r->r.ready(node.resourceId(),node.versionId(),locale,media.assetId(),media.kind())))issue(media.required()?issues:warnings,media.required()?"MEDIA_UNAVAILABLE":"OPTIONAL_MEDIA_UNAVAILABLE","resources.media",node.resourceId(),locale);
            }
        }
        String checkoutReason=!"ACTIVE".equals(offer.state())?"OFFER_INACTIVE":!issues.isEmpty()?"OFFER_NOT_READY":!gateway.configured()?gateway.unavailableReason():null;
        return new OfferReadiness(offer.id(),offer.revision(),issues.isEmpty(),checkoutReason==null,List.copyOf(issues),List.copyOf(warnings),checkoutReason);
    }
    private static boolean periodReady(OfferPeriod period,boolean updates){return period!=null&&period.mode()!=null&&((updates?"NONE":"UNLIMITED").equals(period.mode())||((updates?"PERIOD":"FIXED").equals(period.mode())&&period.days()!=null));}
    private static boolean localizedReady(List<LocalizedText> values,String locale){return values.stream().anyMatch(v->locale.equals(v.locale())&&!v.text().isBlank());}
    private static OfferCopy copy(OfferFields f,String locale){return f.copies().stream().filter(c->locale.equals(c.locale())).findFirst().orElse(null);}
    private static void issue(List<CommerceIssue> target,String code,String field,UUID resource,String locale){var value=new CommerceIssue(code,field,resource,locale);if(!target.contains(value))target.add(value);}
    private List<OfferResourceInput> tree(OfferFields fields){
        if(fields.resources().isEmpty())return List.of();String slots=String.join(",",fields.resources().stream().map(r->"?").toList());
        return jdbc.query("WITH RECURSIVE scope AS(SELECT id,resource_id FROM pedagogical_versions WHERE id IN("+slots+") UNION SELECT v.id,v.resource_id FROM scope p JOIN version_compositions c ON c.parent_version_id=p.id JOIN pedagogical_versions v ON v.id=c.child_version_id) SELECT resource_id,id FROM scope ORDER BY resource_id,id LIMIT 2001",(rs,n)->new OfferResourceInput(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class)),fields.resources().stream().map(OfferResourceInput::versionId).toArray());
    }
    private void lockResources(OfferFields fields){
        for(var r:fields.resources())check(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pedagogical_versions v JOIN learning_resources r ON r.id=v.resource_id WHERE v.id=? AND r.id=? AND r.kind='COURSE')",Boolean.class,r.versionId(),r.resourceId())));
        var nodes=tree(fields);if(nodes.isEmpty())return;var ids=nodes.stream().map(OfferResourceInput::resourceId).distinct().sorted().toList();String slots=String.join(",",ids.stream().map(x->"?").toList());jdbc.query("SELECT id FROM learning_resources WHERE id IN("+slots+") ORDER BY id FOR SHARE",(rs,n)->rs.getObject(1,UUID.class),ids.toArray());
        // A draft composition may have changed while the resource locks were awaited.
        // Never validate or sell a newly discovered child outside the acquired scope.
        if(!nodes.equals(tree(fields)))throw new ApiException(ApiError.CONFLICT);
    }
    private Source source(UUID resource,UUID version,String locale){
        var values=jdbc.query("""
            SELECT v.version_number,r.archived_at,t.editorial_state,t.published_source_revision_id,src.current_revision_id AS source_current,src.editorial_state AS source_state,
              e.title,e.document_json::text AS document_text,s.slug,t.id AS translation_id,t.source_translation_id
            FROM pedagogical_versions v JOIN learning_resources r ON r.id=v.resource_id
            LEFT JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale=?
            LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id
            LEFT JOIN content_translations src ON src.id=t.source_translation_id
            LEFT JOIN resource_slugs s ON s.resource_id=r.id AND s.locale=? WHERE v.id=? AND r.id=?
            """,(rs,n)->{
                String document=rs.getString("document_text"),state=rs.getString("editorial_state"),availability="PUBLISHED";
                if(rs.getObject("archived_at")!=null||"ARCHIVED".equals(state))availability="WITHDRAWN";
                else if(rs.getObject("translation_id")==null)availability="TRANSLATION_MISSING";
                else if("STALE".equals(state)||(rs.getObject("source_translation_id")!=null&&(!Objects.equals(rs.getObject("published_source_revision_id"),rs.getObject("source_current"))||List.of("ARCHIVED","STALE").contains(rs.getString("source_state")))))availability="STALE";
                else if(document==null)availability="UNAVAILABLE";
                return new Source(rs.getInt("version_number"),rs.getString("title"),rs.getString("slug"),availability,document==null?null:mapper.readValue(document,ContentDocument.class));
            },locale,locale,version,resource);
        return values.isEmpty()?new Source(0,null,null,"UNAVAILABLE",null):values.getFirst();
    }
    private UUID append(UUID offer,int number,OfferFields fields,UUID actor,String reason){
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO offer_revisions(id,offer_id,revision_number,fields_json,author_id,reason) VALUES(?,?,?,?::jsonb,?,?)",id,offer,number,mapper.writeValueAsString(fields),actor,reason);
        for(int i=0;i<fields.resources().size();i++){var r=fields.resources().get(i);jdbc.update("INSERT INTO offer_revision_resources(revision_id,resource_id,version_id,position) VALUES(?,?,?,?)",id,r.resourceId(),r.versionId(),i);}return id;
    }
    private void event(UUID offer,UUID revision,UUID actor,String event,String reason){jdbc.update("INSERT INTO offer_events(id,offer_id,revision_id,actor_id,event_type,reason) VALUES(?,?,?,?,?,?)",UUID.randomUUID(),offer,revision,actor,event,reason);}
    private void lockActor(UUID actor){jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(rs,n)->rs.getObject(1,UUID.class),actor);}
    private OfferView load(UUID id,boolean lock){if(lock&&jdbc.query("SELECT id FROM offers WHERE id=? FOR UPDATE",(rs,n)->rs.getObject(1,UUID.class),id).isEmpty())throw missing();var rows=jdbc.query(SELECT+" WHERE o.id=?",(rs,n)->offer(rs),id);if(rows.isEmpty())throw missing();return rows.getFirst();}
    private OfferView loadShared(UUID id){if(jdbc.query("SELECT id FROM offers WHERE id=? FOR SHARE",(rs,n)->rs.getObject(1,UUID.class),id).isEmpty())throw missing();return load(id,false);}
    private OfferView offer(ResultSet rs)throws SQLException{return new OfferView(rs.getObject("id",UUID.class),rs.getObject("product_id",UUID.class),rs.getLong("revision"),rs.getObject("current_revision_id",UUID.class),rs.getInt("revision_number"),rs.getString("code"),rs.getString("kind"),rs.getString("state"),mapper.readValue(rs.getString("fields_text"),OfferFields.class),rs.getTimestamp("created_at").toInstant(),rs.getTimestamp("updated_at").toInstant());}
    private static String tag(OfferView v){return EntityTags.forRevision("offer",v.id(),v.revision());}
    private static ApiException missing(){return new ApiException(ApiError.RESOURCE_NOT_FOUND);}
    private record Source(int versionNumber,String title,String slug,String availability,ContentDocument document){ }
}
