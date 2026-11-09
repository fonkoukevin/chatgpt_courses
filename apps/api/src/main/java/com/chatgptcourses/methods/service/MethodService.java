package com.chatgptcourses.methods.service;

import static com.chatgptcourses.methods.service.MethodTypes.*;
import static com.chatgptcourses.methods.service.MethodValidation.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.CatalogTypes.ResourceDetail;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
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
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class MethodService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final PublicCatalogueService catalogue;
    private final com.chatgptcourses.shared.metrics.BusinessFactRecorder facts;
    public MethodService(JdbcTemplate jdbc,ObjectMapper mapper,PublicCatalogueService catalogue){this.jdbc=jdbc;this.mapper=mapper;this.catalogue=catalogue;this.facts=new com.chatgptcourses.shared.metrics.BusinessFactRecorder(jdbc);}

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public MethodPage list(UUID actor,MethodQuery query){
        require(actor,"methods.read");check(query!=null&&query.page()>=0&&query.page()<=1_000_000&&query.pageSize()>=1&&query.pageSize()<=100);
        if(query.q()!=null)text(query.q(),0,240);if(query.category()!=null)text(query.category(),1,80);
        var args=new ArrayList<Object>();args.add(actor);var where=new StringBuilder(" WHERE owner_id=?");
        if(query.q()!=null&&!query.q().isBlank()){
            String pattern="%"+query.q().strip().replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
            where.append(" AND (title ILIKE ? OR notes ILIKE ? OR category ILIKE ?)");for(int i=0;i<3;i++)args.add(pattern);
        }
        if(query.category()!=null){where.append(" AND category=?");args.add(query.category());}
        long total=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM personal_methods"+where,Long.class,args.toArray()));
        args.add(query.pageSize());args.add((long)query.page()*query.pageSize());
        var items=jdbc.query("SELECT id,revision,title,locale,category,updated_at,source_revision_id FROM personal_methods"+where+" ORDER BY updated_at DESC,id LIMIT ? OFFSET ?",
            (rs,n)->new MethodSummary(uuid(rs,"id"),rs.getLong("revision"),rs.getString("title"),rs.getString("locale"),rs.getString("category"),instant(rs,"updated_at"),uuid(rs,"source_revision_id")!=null),args.toArray());
        return new MethodPage(items,query.page(),query.pageSize(),total);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public MethodView get(UUID actor,UUID id){require(actor,"methods.read");return owned(actor,id,false);}

    @Transactional
    public MethodView create(UUID actor,UUID accountContext,CreateMethod command){
        mutation(actor,accountContext);check(command!=null);fields(command.fields(),mapper);return insert(actor,command.fields(),null);
    }
    @Transactional
    public MethodView fromTemplate(UUID actor,UUID accountContext,FromTemplate command){
        mutation(actor,accountContext);check(command!=null&&command.sourceResourceId()!=null&&command.sourceVersionId()!=null&&command.sourceRevisionId()!=null);
        locale(command.sourceLocale());fields(command.fields(),mapper);
        var locked=jdbc.query("SELECT id FROM learning_resources WHERE id=? FOR SHARE",(rs,n)->uuid(rs,"id"),command.sourceResourceId());
        if(locked.isEmpty())throw notFound();mutation(actor,accountContext);
        ResourceDetail source=catalogue.version(command.sourceResourceId(),command.sourceVersionId(),command.sourceLocale());
        if(source.kind()!=ResourceKind.METHOD_TEMPLATE)throw notFound();
        if(!"PUBLISHED".equals(source.availability()))throw notFound();
        if(!"FREE".equals(source.access()))throw new AccessDeniedException("Source access unavailable");
        if(!Objects.equals(source.revisionId(),command.sourceRevisionId()))throw new ApiException(ApiError.REVISION_CONFLICT);
        if(source.document()==null||!complete(source.document().methodDefinition()))throw new ApiException(ApiError.CONTENT_NOT_READY);
        return insert(actor,command.fields(),origin(source));
    }
    @Transactional
    public MethodView update(UUID actor,UUID accountContext,UUID id,String ifMatch,UpdateMethod command){
        mutation(actor,accountContext);var old=owned(actor,id,true);mutation(actor,accountContext);match(old,ifMatch);
        check(command!=null);var f=command.fields();fields(f,mapper);
        if(f.equals(new MethodFields(old.title(),old.locale(),old.text(),old.parameters(),old.generatedFrom(),old.notes(),old.category())))return old;
        jdbc.update("UPDATE personal_methods SET title=?,locale=?,body=?,parameters=?::jsonb,generated_from=?::jsonb,notes=?,category=?,revision=revision+1,updated_at=greatest(updated_at,created_at,clock_timestamp()) WHERE id=? AND owner_id=? AND revision=?",
            f.title(),f.locale(),f.text(),mapper.writeValueAsString(f.parameters()),f.generatedFrom()==null?null:mapper.writeValueAsString(f.generatedFrom()),f.notes(),f.category(),id,actor,old.revision());
        return recorded(actor,owned(actor,id,false));
    }
    @Transactional
    public MethodView duplicate(UUID actor,UUID accountContext,UUID id,String ifMatch){
        mutation(actor,accountContext);var old=owned(actor,id,true);mutation(actor,accountContext);match(old,ifMatch);
        return insert(actor,new MethodFields(old.title(),old.locale(),old.text(),old.parameters(),old.generatedFrom(),old.notes(),old.category()),old.origin());
    }
    @Transactional
    public void delete(UUID actor,UUID accountContext,UUID id,String ifMatch){
        mutation(actor,accountContext);var old=owned(actor,id,true);mutation(actor,accountContext);match(old,ifMatch);
        jdbc.update("DELETE FROM personal_methods WHERE id=? AND owner_id=? AND revision=?",id,actor,old.revision());
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public SourceUpdate sourceUpdate(UUID actor,UUID id){
        require(actor,"methods.read");var method=owned(actor,id,false);var source=method.origin();
        if(source==null)return new SourceUpdate("NONE",null,null);
        ResourceDetail latest=available(source.resourceId(),null,source.locale());
        if(copyable(latest))return new SourceUpdate(source.revisionId().equals(latest.revisionId())?"CURRENT":"UPDATE_AVAILABLE",source,origin(latest));
        return new SourceUpdate("UNAVAILABLE",source,null);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public MethodTemplate template(UUID resourceId,UUID versionId,String locale){
        MethodValidation.locale(locale);var source=catalogue.version(resourceId,versionId,locale);
        if(source.kind()!=ResourceKind.METHOD_TEMPLATE)throw notFound();String state=source.availability();MethodDefinition definition=null;
        if("PUBLISHED".equals(state)){
            if(!"FREE".equals(source.access()))state="PROTECTED";
            else if(source.document()==null||!complete(source.document().methodDefinition()))state="MISSING_DEFINITION";
            else definition=source.document().methodDefinition();
        }
        return new MethodTemplate(resourceId,versionId,source.revisionId(),locale,source.title(),source.slug(),state,definition);
    }

    private MethodView insert(UUID actor,MethodFields f,MethodOrigin origin){
        UUID id=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO personal_methods(id,owner_id,title,locale,body,parameters,generated_from,notes,category,
              source_resource_id,source_version_id,source_translation_id,source_revision_id,source_locale,source_title,source_slug)
            VALUES(?,?,?,?,?,?::jsonb,?::jsonb,?,?,?,?,?,?,?,?,?)
            """,id,actor,f.title(),f.locale(),f.text(),mapper.writeValueAsString(f.parameters()),f.generatedFrom()==null?null:mapper.writeValueAsString(f.generatedFrom()),f.notes(),f.category(),
            origin==null?null:origin.resourceId(),origin==null?null:origin.versionId(),origin==null?null:origin.translationId(),origin==null?null:origin.revisionId(),origin==null?null:origin.locale(),origin==null?null:origin.title(),origin==null?null:origin.slug());
        return recorded(actor,owned(actor,id,false));
    }
    private MethodView recorded(UUID actor,MethodView value){facts.personalRevision(actor,"METHOD",value.id(),value.revision(),value.updatedAt());return value;}
    private MethodView owned(UUID actor,UUID id,boolean lock){
        var methods=jdbc.query("SELECT * FROM personal_methods WHERE id=? AND owner_id=?"+(lock?" FOR UPDATE":""),(rs,n)->view(rs),id,actor);
        if(methods.isEmpty())throw notFound();return methods.getFirst();
    }
    private MethodView view(ResultSet rs)throws SQLException{
        MethodOrigin origin=uuid(rs,"source_revision_id")==null?null:new MethodOrigin(uuid(rs,"source_resource_id"),uuid(rs,"source_version_id"),uuid(rs,"source_translation_id"),uuid(rs,"source_revision_id"),rs.getString("source_locale"),rs.getString("source_title"),rs.getString("source_slug"));
        return new MethodView(uuid(rs,"id"),rs.getLong("revision"),rs.getString("title"),rs.getString("locale"),rs.getString("body"),mapper.readValue(rs.getString("parameters"),MethodParameters.class),
            rs.getString("generated_from")==null?null:mapper.readValue(rs.getString("generated_from"),MethodParameters.class),rs.getString("notes"),rs.getString("category"),origin,instant(rs,"created_at"),instant(rs,"updated_at"));
    }
    private void mutation(UUID actor,UUID context){
        require(actor,"methods.write");if(context==null)throw new ApiException(ApiError.ACCOUNT_CONTEXT_REQUIRED);
        if(!context.equals(actor))throw new ApiException(ApiError.ACCOUNT_CONTEXT_CHANGED);
    }
    private void require(UUID actor,String permission){
        if(actor==null||!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_accounts u JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL JOIN role_permissions rp ON rp.role_id=ur.role_id AND rp.revoked_at IS NULL JOIN permissions p ON p.id=rp.permission_id WHERE u.id=? AND u.status='ACTIVE' AND p.code=?)",Boolean.class,actor,permission)))throw new AccessDeniedException("Method action unavailable");
    }
    private static void match(MethodView old,String ifMatch){RevisionPreconditions.requireMatch(ifMatch,EntityTags.forRevision("personal-method",old.id(),old.revision()));}
    private MethodOrigin origin(ResourceDetail source){
        UUID translation=jdbc.queryForObject("SELECT id FROM content_translations WHERE pedagogical_version_id=? AND locale=? AND published_revision_id=?",UUID.class,source.versionId(),source.locale(),source.revisionId());
        return new MethodOrigin(source.resourceId(),source.versionId(),translation,source.revisionId(),source.locale(),source.title(),source.slug());
    }
    private ResourceDetail available(UUID resource,UUID version,String locale){
        try{return version==null?catalogue.detail(resource,locale):catalogue.version(resource,version,locale);}
        catch(ApiException unavailable){if(unavailable.error()==ApiError.RESOURCE_NOT_FOUND)return null;throw unavailable;}
    }
    private static boolean copyable(ResourceDetail d){return d!=null&&d.kind()==ResourceKind.METHOD_TEMPLATE&&"PUBLISHED".equals(d.availability())&&"FREE".equals(d.access())&&d.document()!=null&&complete(d.document().methodDefinition());}
    private static ApiException notFound(){return new ApiException(ApiError.RESOURCE_NOT_FOUND);}
    private static UUID uuid(ResultSet rs,String key)throws SQLException{return rs.getObject(key,UUID.class);}
    private static Instant instant(ResultSet rs,String key)throws SQLException{Timestamp timestamp=rs.getTimestamp(key);return timestamp==null?null:timestamp.toInstant();}
}
