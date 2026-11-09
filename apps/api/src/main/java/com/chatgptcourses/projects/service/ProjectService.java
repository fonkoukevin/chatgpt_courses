package com.chatgptcourses.projects.service;

import static com.chatgptcourses.projects.service.ProjectTypes.*;
import static com.chatgptcourses.projects.service.ProjectValidation.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.CatalogTypes.ResourceDetail;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.editorial.service.ContentTypes.ContentDocument;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.http.RevisionPreconditions;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** Owner-controlled text and explicitly declared evidence, with separately authorized educational resources. */
@Service
public class ProjectService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final PublicCatalogueService catalogue;
    private final LearningService learning;
    private final com.chatgptcourses.shared.metrics.BusinessFactRecorder facts;
    private final com.chatgptcourses.access.MemberContentService members;
    private static final String CURRENT=" FROM projects p JOIN project_revisions r ON r.id=p.current_revision_id JOIN pedagogical_versions sv ON sv.id=p.source_version_id ";
    private static final String LATEST=" LEFT JOIN LATERAL(SELECT a.* FROM project_self_assessments a WHERE a.project_id=p.id AND a.project_revision_id=p.current_revision_id ORDER BY a.assessment_number DESC LIMIT 1)a ON true ";
    private static final String STATE="CASE WHEN a.id IS NULL THEN r.stage WHEN a.needs_revision THEN 'NEEDS_REVISION' ELSE 'SELF_ASSESSED' END";
    public ProjectService(JdbcTemplate jdbc,ObjectMapper mapper,PublicCatalogueService catalogue,LearningService learning,com.chatgptcourses.access.MemberContentService members) {this.jdbc=jdbc;this.mapper=mapper;this.catalogue=catalogue;this.learning=learning;this.members=members;this.facts=new com.chatgptcourses.shared.metrics.BusinessFactRecorder(jdbc);}

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ProjectPage list(UUID actor,ProjectQuery query) {
        require(actor,"projects.read");check(query!=null);page(query.page(),query.pageSize());if(query.q()!=null)text(query.q(),0,240);
        check(query.state()==null||Set.of("DRAFT","READY_FOR_SELF_ASSESSMENT","SELF_ASSESSED","NEEDS_REVISION").contains(query.state()));
        var args=new ArrayList<Object>();args.add(actor);StringBuilder where=new StringBuilder(" WHERE p.owner_id=?");
        if(query.q()!=null&&!query.q().isBlank()) {
            String pattern="%"+query.q().strip().replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
            var conditions=new ArrayList<String>();for(String name:List.of("title","objective","scope","method","timeline","budget","clarifications","nextStep","externalText")){conditions.add("r.fields_json->>'"+name+"' ILIKE ?");args.add(pattern);}where.append(" AND (").append(String.join(" OR ",conditions)).append(")");
        }
        if(query.state()!=null){where.append(" AND (").append(STATE).append(")=?");args.add(query.state());}
        if(query.activityId()!=null){where.append(" AND p.source_activity_id=?");args.add(query.activityId());}
        if(query.activityVersionId()!=null){where.append(" AND p.source_version_id=?");args.add(query.activityVersionId());}
        long total=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*)"+CURRENT+LATEST+where,Long.class,args.toArray()));
        args.add(query.pageSize());args.add((long)query.page()*query.pageSize());
        var items=jdbc.query("SELECT p.id,p.revision,p.current_revision_id,r.fields_json->>'title' AS title,r.fields_json->>'locale' AS locale,"+STATE+" AS state,p.source_activity_id,p.source_version_id,sv.version_number AS source_version_number,p.source_title,p.course_title,greatest(p.updated_at,coalesce(a.evaluated_at,p.updated_at)) AS updated_at,r.created_at AS saved_at"+CURRENT+LATEST+where+" ORDER BY updated_at DESC,p.id LIMIT ? OFFSET ?",
            (rs,n)->new ProjectSummary(uuid(rs,"id"),rs.getLong("revision"),rs.getString("title"),rs.getString("locale"),rs.getString("state"),uuid(rs,"current_revision_id"),uuid(rs,"source_activity_id"),uuid(rs,"source_version_id"),rs.getInt("source_version_number"),rs.getString("source_title"),rs.getString("course_title"),instant(rs,"updated_at"),instant(rs,"saved_at")),args.toArray());
        return new ProjectPage(items,query.page(),query.pageSize(),total);
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ProjectTemplate template(UUID activityId,UUID activityVersionId,String locale) {
        locale(locale);check(activityId!=null&&activityVersionId!=null);return templateDetail(catalogue.version(activityId,activityVersionId,locale));
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ProjectTemplate memberTemplate(UUID actor,UUID activityId,UUID activityVersionId,String locale) {
        require(actor,"projects.read");locale(locale);check(activityId!=null&&activityVersionId!=null);return templateDetail(members.detail(actor,activityId,activityVersionId,locale));
    }
    private ProjectTemplate templateDetail(ResourceDetail detail) {
        UUID activityId=detail.resourceId(),activityVersionId=detail.versionId();String locale=detail.locale();
        if(detail.kind()!=ResourceKind.ACTIVITY)throw notFound();String available=detail.availability();
        if("PUBLISHED".equals(available))available=detail.document()!=null?"PUBLISHED":"PROTECTED";
        if(!"PUBLISHED".equals(available))return new ProjectTemplate(activityId,activityVersionId,detail.revisionId(),locale,detail.title(),available,null,null);
        var source=source(activityVersionId,locale,detail.revisionId());
        if(!complete(source.document()))return new ProjectTemplate(activityId,activityVersionId,detail.revisionId(),locale,detail.title(),"NOT_CONFIGURED",null,null);
        return new ProjectTemplate(activityId,activityVersionId,detail.revisionId(),locale,detail.title(),"PUBLISHED",detail,definition(detail.revisionId(),locale,source.document()));
    }
    @Transactional
    public ProjectCreationResult create(UUID actor,UUID accountContext,CreateProject command) {
        mutation(actor,accountContext);check(command!=null&&command.creationId()!=null&&command.activityId()!=null&&command.activityVersionId()!=null&&command.revisionId()!=null);locale(command.sourceLocale());fields(command.fields(),command.stage(),mapper);
        byte[] fingerprint=digest(command);lockActor(actor);mutation(actor,accountContext);
        var replay=jdbc.query("SELECT id,creation_fingerprint FROM projects WHERE owner_id=? AND creation_id=?",(rs,n)->new Replay(uuid(rs,"id"),rs.getBytes("creation_fingerprint")),actor,command.creationId());
        if(!replay.isEmpty()){if(!Arrays.equals(fingerprint,replay.getFirst().fingerprint()))throw new ApiException(ApiError.CONFLICT);return new ProjectCreationResult(owned(actor,replay.getFirst().id(),false),false);}
        lockSources(sourceResources(actor,command.enrollmentId(),command.activityId(),command.activityVersionId()));mutation(actor,accountContext);var template=templateDetail(members.detail(actor,command.activityId(),command.activityVersionId(),command.sourceLocale()));
        if("PROTECTED".equals(template.availability()))throw denied();if("NOT_CONFIGURED".equals(template.availability()))throw new ApiException(ApiError.CONTENT_NOT_READY);if(!"PUBLISHED".equals(template.availability()))throw notFound();
        if(!template.revisionId().equals(command.revisionId()))throw new ApiException(ApiError.REVISION_CONFLICT);
        var source=source(command.activityVersionId(),command.sourceLocale(),command.revisionId());UUID course=null,courseVersion=null;String courseTitle=null;
        if(command.enrollmentId()!=null) {
            var activity=learning.activity(actor,command.enrollmentId(),command.activityId(),command.activityVersionId(),command.sourceLocale());
            if(!"PUBLISHED".equals(activity.availability()))throw notFound();if(!"ACTIVE".equals(activity.accessStatus()))throw denied();
            var enrollment=jdbc.queryForMap("SELECT course_resource_id,course_version_id,course_title FROM learning_enrollments WHERE id=? AND owner_id=?",command.enrollmentId(),actor);
            course=(UUID)enrollment.get("course_resource_id");courseVersion=(UUID)enrollment.get("course_version_id");courseTitle=(String)enrollment.get("course_title");
        }
        UUID id=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO projects(id,owner_id,creation_id,creation_fingerprint,source_activity_id,source_version_id,source_translation_id,source_revision_id,source_locale,source_title,source_slug,enrollment_id,course_resource_id,course_version_id,course_title)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,id,actor,command.creationId(),fingerprint,command.activityId(),command.activityVersionId(),source.translation(),command.revisionId(),command.sourceLocale(),template.title(),template.resource().slug(),command.enrollmentId(),course,courseVersion,courseTitle);
        var definition=template.rubric();UUID rubric=UUID.randomUUID();jdbc.update("INSERT INTO project_rubric_snapshots(id,project_id,source_revision_id,locale,case_code,pass_points,max_points,reveal_policy,criteria,blocking_definitions) VALUES(?,?,?,?,?,?,?,?,?::jsonb,?::jsonb)",rubric,id,definition.sourceRevisionId(),definition.locale(),definition.caseCode(),definition.passPoints(),definition.maxPoints(),definition.revealPolicy(),mapper.writeValueAsString(definition.criteria()),mapper.writeValueAsString(definition.blockingIssues()));
        UUID revision=insertRevision(id,1,command.fields(),command.stage(),actor);jdbc.update("UPDATE projects SET current_revision_id=?,updated_at=greatest(updated_at,created_at,clock_timestamp()) WHERE id=?",revision,id);
        return new ProjectCreationResult(recorded(actor,owned(actor,id,false)),true);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ProjectView get(UUID actor,UUID projectId) {require(actor,"projects.read");return owned(actor,projectId,false);}
    @Transactional
    public ProjectView save(UUID actor,UUID accountContext,UUID projectId,String ifMatch,SaveProject command) {
        mutation(actor,accountContext);var old=owned(actor,projectId,true);mutation(actor,accountContext);match(old,ifMatch);check(command!=null);fields(command.fields(),command.stage(),mapper);
        if(old.fields().equals(command.fields())&&old.stage().equals(command.stage()))return old;
        UUID revision=insertRevision(projectId,old.revisionNumber()+1,command.fields(),command.stage(),actor);
        jdbc.update("UPDATE projects SET current_revision_id=?,revision=revision+1,updated_at=greatest(updated_at,created_at,clock_timestamp()) WHERE id=? AND owner_id=? AND revision=?",revision,projectId,actor,old.revision());return recorded(actor,owned(actor,projectId,false));
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ProjectRevisionPage revisions(UUID actor,UUID projectId,int page,int pageSize) {
        require(actor,"projects.read");owned(actor,projectId,false);page(page,pageSize);long count=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM project_revisions WHERE project_id=?",Long.class,projectId));
        var items=jdbc.query("SELECT id,project_id,revision_number,fields_json->>'title' AS title,fields_json->>'locale' AS locale,stage,created_at,author_id FROM project_revisions WHERE project_id=? ORDER BY revision_number DESC LIMIT ? OFFSET ?",(rs,n)->new ProjectRevisionSummary(uuid(rs,"id"),projectId,rs.getInt("revision_number"),rs.getString("title"),rs.getString("locale"),rs.getString("stage"),instant(rs,"created_at"),uuid(rs,"author_id")),projectId,pageSize,(long)page*pageSize);return new ProjectRevisionPage(items,page,pageSize,count);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ProjectRevisionView revision(UUID actor,UUID projectId,UUID revisionId) {require(actor,"projects.read");owned(actor,projectId,false);return revisionRow(projectId,revisionId);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ProjectContext context(UUID actor,UUID projectId,String locale) {
        require(actor,"projects.read");locale(locale);var project=owned(actor,projectId,false);var origin=project.origin();
        var original=members.detail(actor,origin.activityId(),origin.activityVersionId(),origin.locale());var localized=locale.equals(origin.locale())?original:members.detail(actor,origin.activityId(),origin.activityVersionId(),locale);
        String access=!"PUBLISHED".equals(localized.availability())?"UNAVAILABLE":localized.document()!=null?"ACTIVE":"PROTECTED";
        String availability=localized.availability();
        if(origin.enrollmentId()!=null) {
            var enrolled=learning.activity(actor,origin.enrollmentId(),origin.activityId(),origin.activityVersionId(),locale);
            availability=enrolled.availability();access=enrolled.accessStatus();localized=enrolled.resource();
        }
        return new ProjectContext(projectId,origin.activityId(),origin.activityVersionId(),availability,access,origin.revisionId(),original.revisionId(),!Objects.equals(origin.revisionId(),original.revisionId()),"ACTIVE".equals(access)?localized:null);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ProjectStatus status(UUID actor,UUID projectId) {require(actor,"projects.read");return status(owned(actor,projectId,false));}

    @Transactional
    public SelfAssessmentView selfAssess(UUID actor,UUID accountContext,UUID projectId,String ifMatch,SubmitSelfAssessment command) {
        mutation(actor,accountContext);check(command!=null&&command.submissionId()!=null&&command.projectRevisionId()!=null&&command.rubricVersionId()!=null);
        lockActor(actor);var project=owned(actor,projectId,true);mutation(actor,accountContext);
        var canonical=canonical(command);byte[] fingerprint=digest(new AssessmentFingerprint(projectId,canonical));
        var replay=jdbc.query("SELECT id,submission_fingerprint FROM project_self_assessments WHERE owner_id=? AND submission_id=?",(rs,n)->new Replay(uuid(rs,"id"),rs.getBytes("submission_fingerprint")),actor,command.submissionId());
        if(!replay.isEmpty()){if(!Arrays.equals(fingerprint,replay.getFirst().fingerprint()))throw new ApiException(ApiError.CONFLICT);return assessmentRow(projectId,replay.getFirst().id());}
        match(project,ifMatch);if(!project.currentRevisionId().equals(command.projectRevisionId())||!project.rubric().id().equals(command.rubricVersionId()))throw new ApiException(ApiError.REVISION_CONFLICT);
        declarations(canonical,project.rubric(),mapper);if(!"READY_FOR_SELF_ASSESSMENT".equals(project.stage()))throw new ApiException(ApiError.PROJECT_NOT_READY);
        Map<String,CriterionDeclaration> answers=new HashMap<>();for(var answer:canonical.answers())answers.put(answer.key(),answer);
        Map<String,BlockingDeclaration> declared=new HashMap<>();for(var issue:canonical.blockingDeclarations())declared.put(issue.key(),issue);
        int score=0;var blocking=new ArrayList<DeclaredBlockingIssue>();
        for(var criterion:project.rubric().criteria()) {var answer=answers.get(criterion.key());if(answer.satisfied())score+=criterion.points();else if(criterion.blocking())blocking.add(new DeclaredBlockingIssue(criterion.key(),criterion.label(),answer.comment()));}
        for(var issue:project.rubric().blockingIssues()) {var declaration=declared.get(issue.key());if(declaration.present())blocking.add(new DeclaredBlockingIssue(issue.key(),issue.label(),declaration.comment()));}
        boolean threshold=score>=project.rubric().passPoints(),needs=!threshold||!blocking.isEmpty();UUID id=UUID.randomUUID();
        int ordinal=Objects.requireNonNull(jdbc.queryForObject("SELECT coalesce(max(assessment_number),0)+1 FROM project_self_assessments WHERE project_id=?",Integer.class,projectId));
        jdbc.update("""
            INSERT INTO project_self_assessments(id,owner_id,project_id,project_revision_id,rubric_id,submission_id,submission_fingerprint,assessment_number,
              score_points,max_points,pass_points,threshold_met,needs_revision,answers,blocking_declarations,blocking_issues,comment,author_id,evaluated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?::jsonb,?,?,greatest(clock_timestamp(),?::timestamptz,coalesce((SELECT max(evaluated_at) FROM project_self_assessments WHERE project_id=?),clock_timestamp())))
            """,id,actor,projectId,project.currentRevisionId(),project.rubric().id(),command.submissionId(),fingerprint,ordinal,score,project.rubric().maxPoints(),project.rubric().passPoints(),threshold,needs,
            mapper.writeValueAsString(canonical.answers()),mapper.writeValueAsString(canonical.blockingDeclarations()),mapper.writeValueAsString(blocking),command.comment(),actor,Timestamp.from(project.savedAt()),projectId);
        return assessmentRow(projectId,id);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public SelfAssessmentPage assessments(UUID actor,UUID projectId,int page,int pageSize) {
        require(actor,"projects.read");owned(actor,projectId,false);page(page,pageSize);long count=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM project_self_assessments WHERE project_id=?",Long.class,projectId));
        var items=jdbc.query("SELECT id,project_revision_id,rubric_id,method,score_points,max_points,pass_points,threshold_met,needs_revision,jsonb_array_length(blocking_issues) AS blocking_count,evaluated_at,author_id FROM project_self_assessments WHERE project_id=? ORDER BY evaluated_at DESC,assessment_number DESC LIMIT ? OFFSET ?",(rs,n)->new SelfAssessmentSummary(uuid(rs,"id"),projectId,uuid(rs,"project_revision_id"),uuid(rs,"rubric_id"),rs.getString("method"),rs.getInt("score_points"),rs.getInt("max_points"),rs.getInt("pass_points"),rs.getBoolean("threshold_met"),rs.getBoolean("needs_revision"),rs.getInt("blocking_count"),instant(rs,"evaluated_at"),uuid(rs,"author_id")),projectId,pageSize,(long)page*pageSize);return new SelfAssessmentPage(items,page,pageSize,count);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public SelfAssessmentView assessment(UUID actor,UUID projectId,UUID assessmentId) {require(actor,"projects.read");owned(actor,projectId,false);return assessmentRow(projectId,assessmentId);}

    @Transactional
    public SolutionRevealView reveal(UUID actor,UUID accountContext,UUID activityId,RevealSolution command) {
        mutation(actor,accountContext);check(command!=null&&command.projectId()!=null&&command.projectRevisionId()!=null&&command.activityVersionId()!=null&&command.revisionId()!=null);locale(command.locale());
        var project=owned(actor,command.projectId(),true);revisionRow(project.id(),command.projectRevisionId());var origin=project.origin();
        check(origin.activityId().equals(activityId)&&origin.activityVersionId().equals(command.activityVersionId())&&origin.revisionId().equals(command.revisionId())&&origin.locale().equals(command.locale()));
        lockSources(sourceResources(actor,origin.enrollmentId(),activityId,origin.activityVersionId()));mutation(actor,accountContext);
        if(origin.enrollmentId()!=null) {
            var enrolled=learning.activity(actor,origin.enrollmentId(),activityId,origin.activityVersionId(),origin.locale());
            if(!"PUBLISHED".equals(enrolled.availability()))throw notFound();if(!"ACTIVE".equals(enrolled.accessStatus()))throw denied();
        }
        var current=members.detail(actor,activityId,origin.activityVersionId(),origin.locale());requireReadable(current);
        if("AFTER_SUBMISSION".equals(project.rubric().revealPolicy())&&!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM project_self_assessments WHERE project_id=? AND project_revision_id=?)",Boolean.class,project.id(),command.projectRevisionId())))throw new ApiException(ApiError.SOLUTION_REVEAL_REQUIRES_ASSESSMENT);
        var source=source(origin.activityVersionId(),origin.locale(),origin.revisionId());if(source.document().exercise()==null||source.document().exercise().correction().isBlank())throw new ApiException(ApiError.CONTENT_NOT_READY);
        var existing=jdbc.query("SELECT id,revealed_at FROM project_solution_reveals WHERE owner_id=? AND project_revision_id=? AND source_revision_id=? AND locale=?",(rs,n)->new Reveal(uuid(rs,"id"),instant(rs,"revealed_at")),actor,command.projectRevisionId(),origin.revisionId(),origin.locale());
        Reveal trace;
        if(existing.isEmpty()){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO project_solution_reveals(id,owner_id,project_id,project_revision_id,source_revision_id,locale,revealed_at) VALUES(?,?,?,?,?,?,clock_timestamp())",id,actor,project.id(),command.projectRevisionId(),origin.revisionId(),origin.locale());trace=jdbc.queryForObject("SELECT id,revealed_at FROM project_solution_reveals WHERE id=?",(rs,n)->new Reveal(uuid(rs,"id"),instant(rs,"revealed_at")),id);}else trace=existing.getFirst();
        return new SolutionRevealView(trace.id(),project.id(),command.projectRevisionId(),activityId,origin.activityVersionId(),origin.revisionId(),origin.locale(),source.document().exercise().correction(),trace.at(),solutionFiles(source.document(),origin.locale()));
    }

    /** Re-authorizes an existing disclosure; reading a file never creates a disclosure or validates a production. */
    @Transactional
    public String authorizeSolutionFile(UUID actor,UUID context,UUID projectId,UUID revealId,UUID assetId){
        require(actor,"projects.read");if(context==null)throw new ApiException(ApiError.ACCOUNT_CONTEXT_REQUIRED);if(!actor.equals(context))throw new ApiException(ApiError.ACCOUNT_CONTEXT_CHANGED);
        var project=owned(actor,projectId,true);var origin=project.origin();
        var rows=jdbc.query("SELECT project_revision_id FROM project_solution_reveals WHERE id=? AND project_id=? AND owner_id=? AND source_revision_id=? AND locale=?",(r,n)->r.getObject(1,UUID.class),revealId,projectId,actor,origin.revisionId(),origin.locale());
        if(rows.isEmpty())throw notFound();revisionRow(projectId,rows.getFirst());
        lockSources(sourceResources(actor,origin.enrollmentId(),origin.activityId(),origin.activityVersionId()));require(actor,"projects.read");
        if(origin.enrollmentId()!=null){var enrolled=learning.activity(actor,origin.enrollmentId(),origin.activityId(),origin.activityVersionId(),origin.locale());if(!"PUBLISHED".equals(enrolled.availability()))throw notFound();if(!"ACTIVE".equals(enrolled.accessStatus()))throw denied();}
        requireReadable(members.detail(actor,origin.activityId(),origin.activityVersionId(),origin.locale()));
        var document=source(origin.activityVersionId(),origin.locale(),origin.revisionId()).document();if(document.exercise()==null||!document.exercise().solutionAssetIds().contains(assetId))throw notFound();return origin.locale();
    }
    private List<SolutionFile> solutionFiles(ContentDocument document,String locale){
        if(document.exercise()==null||document.exercise().solutionAssetIds().isEmpty())return List.of();
        var result=new ArrayList<SolutionFile>();for(UUID id:document.exercise().solutionAssetIds()){
            var rows=jdbc.query("SELECT id,filename,locale FROM assets WHERE id=? AND scope='EDITORIAL' AND kind='FILE' AND state='READY' AND content_role='SOLUTION' AND locale=?",(r,n)->new SolutionFile(r.getObject(1,UUID.class),r.getString(2),r.getString(3)),id,locale);if(rows.isEmpty())throw new ApiException(ApiError.ASSET_NOT_READY);result.add(rows.getFirst());
        }return List.copyOf(result);
    }

    private ProjectStatus status(ProjectView project) {
        var latest=jdbc.query("SELECT * FROM project_self_assessments WHERE project_id=? AND project_revision_id=? ORDER BY assessment_number DESC LIMIT 1",(rs,n)->assessmentRow(rs),project.id(),project.currentRevisionId());
        var proof=latest.isEmpty()?null:latest.getFirst();return new ProjectStatus(project.id(),project.currentRevisionId(),project.stage(),proof==null?project.stage():proof.needsRevision()?"NEEDS_REVISION":"SELF_ASSESSED",proof);
    }
    private ProjectView recorded(UUID actor,ProjectView value){facts.personalRevision(actor,"PROJECT",value.id(),value.revision(),value.savedAt());return value;}
    private UUID insertRevision(UUID projectId,int number,ProjectFields fields,String stage,UUID actor) {UUID id=UUID.randomUUID();jdbc.update("INSERT INTO project_revisions(id,project_id,revision_number,fields_json,stage,author_id,created_at) VALUES(?,?,?,?::jsonb,?,?,clock_timestamp())",id,projectId,number,mapper.writeValueAsString(fields),stage,actor);return id;}
    private ProjectView owned(UUID actor,UUID projectId,boolean lock) {
        if(lock) {
            var ids=jdbc.query("SELECT id FROM projects WHERE id=? AND owner_id=? FOR UPDATE",(rs,n)->uuid(rs,"id"),projectId,actor);
            if(ids.isEmpty())throw notFound();return owned(actor,projectId,false);
        }
        var rows=jdbc.query("SELECT p.*,sv.version_number AS source_version_number,r.revision_number,r.fields_json::text AS fields_text,r.stage,r.created_at AS saved_at"+CURRENT+" WHERE p.id=? AND p.owner_id=?",(rs,n)->{
            var origin=new ProjectOrigin(uuid(rs,"source_activity_id"),uuid(rs,"source_version_id"),rs.getInt("source_version_number"),uuid(rs,"source_translation_id"),uuid(rs,"source_revision_id"),rs.getString("source_locale"),rs.getString("source_title"),rs.getString("source_slug"),uuid(rs,"enrollment_id"),uuid(rs,"course_resource_id"),uuid(rs,"course_version_id"),rs.getString("course_title"));
            return new ProjectView(uuid(rs,"id"),rs.getLong("revision"),uuid(rs,"current_revision_id"),rs.getInt("revision_number"),mapper.readValue(rs.getString("fields_text"),ProjectFields.class),rs.getString("stage"),origin,null,instant(rs,"created_at"),instant(rs,"updated_at"),instant(rs,"saved_at"));
        },projectId,actor);if(rows.isEmpty())throw notFound();var p=rows.getFirst();return new ProjectView(p.id(),p.revision(),p.currentRevisionId(),p.revisionNumber(),p.fields(),p.stage(),p.origin(),rubric(projectId),p.createdAt(),p.updatedAt(),p.savedAt());
    }
    private ProjectRubricSnapshot rubric(UUID projectId) {
        return jdbc.queryForObject("SELECT * FROM project_rubric_snapshots WHERE project_id=?",(rs,n)->new ProjectRubricSnapshot(uuid(rs,"id"),uuid(rs,"source_revision_id"),rs.getString("locale"),rs.getString("case_code"),rs.getInt("pass_points"),rs.getInt("max_points"),rs.getString("reveal_policy"),Arrays.asList(mapper.readValue(rs.getString("criteria"),ProjectCriterion[].class)),Arrays.asList(mapper.readValue(rs.getString("blocking_definitions"),BlockingIssueDefinition[].class))),projectId);
    }
    private Source source(UUID version,String locale,UUID revision) {
        var rows=jdbc.query("SELECT t.id,e.document_json::text AS document_text FROM content_translations t JOIN editorial_revisions e ON e.translation_id=t.id WHERE t.pedagogical_version_id=? AND t.locale=? AND e.id=?",(rs,n)->new Source(uuid(rs,"id"),mapper.readValue(rs.getString("document_text"),ContentDocument.class)),version,locale,revision);if(rows.isEmpty())throw notFound();return rows.getFirst();
    }
    private static ProjectRubricDefinition definition(UUID revision,String locale,ContentDocument document) {
        var p=document.projectPolicy();return new ProjectRubricDefinition(revision,locale,p.caseCode(),p.passPoints(),20,p.revealPolicy(),document.rubric().stream().map(r->new ProjectCriterion(r.key(),r.key().substring(0,r.key().lastIndexOf('-')),r.label(),r.points(),r.blocking())).toList(),p.blockingIssues());
    }
    private ProjectRevisionView revisionRow(UUID projectId,UUID revisionId) {
        var rows=jdbc.query("SELECT * FROM project_revisions WHERE id=? AND project_id=?",(rs,n)->new ProjectRevisionView(uuid(rs,"id"),projectId,rs.getInt("revision_number"),mapper.readValue(rs.getString("fields_json"),ProjectFields.class),rs.getString("stage"),instant(rs,"created_at"),uuid(rs,"author_id")),revisionId,projectId);if(rows.isEmpty())throw notFound();return rows.getFirst();
    }
    private SelfAssessmentView assessmentRow(UUID projectId,UUID id) {var rows=jdbc.query("SELECT * FROM project_self_assessments WHERE id=? AND project_id=?",(rs,n)->assessmentRow(rs),id,projectId);if(rows.isEmpty())throw notFound();return rows.getFirst();}
    private SelfAssessmentView assessmentRow(ResultSet rs)throws SQLException {
        return new SelfAssessmentView(uuid(rs,"id"),uuid(rs,"submission_id"),uuid(rs,"project_id"),uuid(rs,"project_revision_id"),uuid(rs,"rubric_id"),rs.getString("method"),rs.getInt("score_points"),rs.getInt("max_points"),rs.getInt("pass_points"),rs.getBoolean("threshold_met"),rs.getBoolean("needs_revision"),Arrays.asList(mapper.readValue(rs.getString("answers"),CriterionDeclaration[].class)),Arrays.asList(mapper.readValue(rs.getString("blocking_declarations"),BlockingDeclaration[].class)),Arrays.asList(mapper.readValue(rs.getString("blocking_issues"),DeclaredBlockingIssue[].class)),rs.getString("comment"),instant(rs,"evaluated_at"),uuid(rs,"author_id"),uuid(rs,"evaluator_id"),rs.getBoolean("declared_by_user"));
    }
    private static SubmitSelfAssessment canonical(SubmitSelfAssessment command) {
        check(command.answers()!=null&&command.blockingDeclarations()!=null&&command.answers().stream().noneMatch(a->a==null||a.key()==null)&&command.blockingDeclarations().stream().noneMatch(b->b==null||b.key()==null));
        return new SubmitSelfAssessment(command.submissionId(),command.projectRevisionId(),command.rubricVersionId(),command.answers().stream().sorted(Comparator.comparing(CriterionDeclaration::key)).toList(),command.blockingDeclarations().stream().sorted(Comparator.comparing(BlockingDeclaration::key)).toList(),command.comment());
    }
    private byte[] digest(Object value) {try{return MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsString(value).getBytes(StandardCharsets.UTF_8));}catch(NoSuchAlgorithmException absent){throw new IllegalStateException("SHA-256 unavailable",absent);}}
    private static void match(ProjectView project,String ifMatch) {RevisionPreconditions.requireMatch(ifMatch,EntityTags.forRevision("project",project.id(),project.revision()));}
    private static void requireReadable(ResourceDetail resource) {if(resource.kind()!=ResourceKind.ACTIVITY||!"PUBLISHED".equals(resource.availability()))throw notFound();if(resource.document()==null)throw denied();}
    private void lockActor(UUID actor) {jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(rs,n)->uuid(rs,"id"),actor);}
    private List<UUID> sourceResources(UUID actor,UUID enrollment,UUID activity,UUID version) {
        var ids=new ArrayList<UUID>();ids.add(activity);
        if(enrollment!=null) {
            var paths=jdbc.query("SELECT e.course_resource_id,i.module_id FROM learning_enrollments e JOIN learning_enrollment_activities i ON i.enrollment_id=e.id WHERE e.id=? AND e.owner_id=? AND i.activity_id=? AND i.activity_version_id=?",(rs,n)->List.of(uuid(rs,"course_resource_id"),uuid(rs,"module_id")),enrollment,actor,activity,version);
            if(paths.isEmpty())throw notFound();ids.addAll(paths.getFirst());
        }
        return ids;
    }
    private void lockSources(List<UUID> ids) {var unique=ids.stream().distinct().toList();String slots=String.join(",",unique.stream().map(id->"?").toList());jdbc.query("SELECT id FROM learning_resources WHERE id IN("+slots+") ORDER BY id FOR SHARE",(rs,n)->uuid(rs,"id"),unique.toArray());}
    private void mutation(UUID actor,UUID context) {require(actor,"projects.write");if(context==null)throw new ApiException(ApiError.ACCOUNT_CONTEXT_REQUIRED);if(!actor.equals(context))throw new ApiException(ApiError.ACCOUNT_CONTEXT_CHANGED);}
    private void require(UUID actor,String permission) {if(actor==null||!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_accounts u JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL JOIN role_permissions rp ON rp.role_id=ur.role_id AND rp.revoked_at IS NULL JOIN permissions p ON p.id=rp.permission_id WHERE u.id=? AND u.status='ACTIVE' AND p.code=?)",Boolean.class,actor,permission)))throw denied();}
    private static ApiException notFound() {return new ApiException(ApiError.RESOURCE_NOT_FOUND);}
    private static AccessDeniedException denied() {return new AccessDeniedException("Project action unavailable");}
    private static UUID uuid(ResultSet rs,String key)throws SQLException {return rs.getObject(key,UUID.class);}
    private static Instant instant(ResultSet rs,String key)throws SQLException {Timestamp t=rs.getTimestamp(key);return t==null?null:t.toInstant();}
    private record Source(UUID translation,ContentDocument document) { }
    private record Replay(UUID id,byte[] fingerprint) { }
    private record AssessmentFingerprint(UUID projectId,SubmitSelfAssessment command) { }
    private record Reveal(UUID id,Instant at) { }
}
