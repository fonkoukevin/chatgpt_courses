package com.chatgptcourses.learning.service;

import static com.chatgptcourses.learning.service.LearningTypes.*;
import static com.chatgptcourses.learning.service.LearningValidation.*;
import com.chatgptcourses.catalog.model.ResourceKind;
import com.chatgptcourses.catalog.service.CatalogTypes.ResourceDetail;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.editorial.service.ContentTypes.ContentDocument;
import com.chatgptcourses.editorial.service.ContentTypes.QuizQuestion;
import com.chatgptcourses.methods.service.MethodService;
import com.chatgptcourses.methods.service.MethodTypes.MethodQuery;
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
import java.util.LinkedHashSet;
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

/** Version-pinned tracking, never an entitlement or an implicit project evaluation. */
@Service
public class LearningService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final PublicCatalogueService catalogue;
    private final MethodService methods;
    private final com.chatgptcourses.access.MemberContentService members;
    private final com.chatgptcourses.access.EntitlementAccess entitlements;
    public LearningService(JdbcTemplate jdbc,ObjectMapper mapper,PublicCatalogueService catalogue,MethodService methods,
        com.chatgptcourses.access.MemberContentService members,com.chatgptcourses.access.EntitlementAccess entitlements) {
        this.jdbc=jdbc;this.mapper=mapper;this.catalogue=catalogue;this.methods=methods;this.members=members;this.entitlements=entitlements;
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public LearningDashboard dashboard(UUID actor,String locale) {
        require(actor,"learning.read");locale(locale);
        var rows=jdbc.query("SELECT * FROM learning_enrollments WHERE owner_id=? ORDER BY last_visited_at DESC NULLS LAST,created_at DESC,id LIMIT 100",(rs,n)->enrollmentRow(rs),actor);
        var summaries=new ArrayList<EnrollmentSummary>();ResumeTarget resume=null;
        for(var row:rows) {
            var course=catalogue.version(row.courseId(),row.courseVersion(),locale);
            var items=items(row,course,locale);summaries.add(summary(row,course));
            if(resume==null&&"PUBLISHED".equals(course.availability())) {
                var available=items.stream().filter(i->"ACTIVE".equals(i.access())).toList();
                Item selected=available.stream().filter(i->Objects.equals(i.version(),row.lastActivity())).findFirst().orElse(null);
                if(selected==null)selected=available.stream().filter(i->i.progress().completedAt()==null).findFirst().orElse(available.isEmpty()?null:available.getFirst());
                if(selected!=null)resume=new ResumeTarget(row.id(),row.courseId(),row.courseVersion(),course.slug(),selected.activity(),selected.version(),selected.slug(),locale,selected.title());
            }
        }
        boolean allowed=permitted(actor,"methods.read");
        return new LearningDashboard(resume,summaries,allowed?methods.list(actor,new MethodQuery(null,null,0,5)).items():List.of(),allowed?"AVAILABLE":"FORBIDDEN");
    }

    @Transactional
    public EnrollmentResult enroll(UUID actor,UUID accountContext,EnrollCourse command) {
        mutation(actor,accountContext);check(command!=null&&command.courseResourceId()!=null&&command.courseVersionId()!=null);locale(command.locale());
        lockActor(actor);mutation(actor,accountContext);
        var existing=jdbc.query("SELECT * FROM learning_enrollments WHERE owner_id=? AND course_version_id=?",(rs,n)->enrollmentRow(rs),actor,command.courseVersionId());
        if(!existing.isEmpty()) {
            check(existing.getFirst().courseId().equals(command.courseResourceId()));return new EnrollmentResult(view(existing.getFirst(),command.locale()),false);
        }
        lockResources(List.of(command.courseResourceId()));mutation(actor,accountContext);
        var course=catalogue.version(command.courseResourceId(),command.courseVersionId(),command.locale());
        if(course.kind()!=ResourceKind.COURSE)throw notFound();
        if(!"PUBLISHED".equals(course.availability()))throw notFound();
        boolean accessible=entitlements.covers(actor,course.resourceId(),course.versionId(),command.locale())||course.curriculum().stream().filter(m->"PUBLISHED".equals(m.availability())).flatMap(m->m.children().stream())
            .anyMatch(a->a.kind()==ResourceKind.ACTIVITY&&"PUBLISHED".equals(a.availability())&&"FREE".equals(a.access()));
        if(!accessible)throw denied();
        var snapshots=jdbc.query("""
            SELECT mv.resource_id AS module_id,mv.id AS module_version_id,av.resource_id AS activity_id,av.id AS activity_version_id,
              coalesce(e.title,'') AS activity_title,cm.position AS module_position,ma.position AS activity_position
            FROM version_compositions cm JOIN pedagogical_versions mv ON mv.id=cm.child_version_id
            JOIN version_compositions ma ON ma.parent_version_id=mv.id JOIN pedagogical_versions av ON av.id=ma.child_version_id
            LEFT JOIN content_translations t ON t.pedagogical_version_id=av.id AND t.locale=?
            LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id
            WHERE cm.parent_version_id=? ORDER BY cm.position,ma.position
            """,(rs,n)->new Snapshot(uuid(rs,"module_id"),uuid(rs,"module_version_id"),uuid(rs,"activity_id"),uuid(rs,"activity_version_id"),rs.getString("activity_title")),command.locale(),command.courseVersionId());
        var unique=new LinkedHashSet<UUID>();var actual=snapshots.stream().filter(s->unique.add(s.version())).toList();
        check(!actual.isEmpty()&&actual.size()<=10000);UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO learning_enrollments(id,owner_id,course_resource_id,course_version_id,course_version_number,course_title,enrolled_locale,activity_count) VALUES(?,?,?,?,?,?,?,?)",
            id,actor,course.resourceId(),course.versionId(),course.versionNumber(),course.title(),command.locale(),actual.size());
        int position=0;
        for(var item:actual) {
            jdbc.update("INSERT INTO learning_enrollment_activities(id,enrollment_id,course_version_id,module_id,module_version_id,activity_id,activity_version_id,position,activity_title) VALUES(?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(),id,course.versionId(),item.module(),item.moduleVersion(),item.activity(),item.version(),++position,item.title());
            jdbc.update("INSERT INTO learning_activity_progress(id,enrollment_id,activity_version_id) VALUES(?,?,?)",UUID.randomUUID(),id,item.version());
        }
        return new EnrollmentResult(view(owned(actor,id),command.locale()),true);
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public EnrollmentView enrollment(UUID actor,UUID enrollmentId,String locale) {
        require(actor,"learning.read");locale(locale);return view(owned(actor,enrollmentId),locale);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public LearningActivity activity(UUID actor,UUID enrollmentId,UUID activityId,UUID activityVersionId,String locale) {
        require(actor,"learning.read");locale(locale);var row=owned(actor,enrollmentId);var course=catalogue.version(row.courseId(),row.courseVersion(),locale);
        check(activityVersionId!=null);var items=items(row,course,locale);var item=item(items,activityId,activityVersionId);var detail=members.detail(actor,item.activity(),item.version(),locale);
        // Metadata can explain withdrawal, but the catalogue never sends a protected body.
        var overview="ACTIVE".equals(item.access())?quizOverview(actor,item.version(),detail):null;
        int index=items.indexOf(item);
        if(!"ACTIVE".equals(item.access()))detail=contextDetail(detail,item.availability());
        return new LearningActivity(row.id(),item.activity(),item.version(),item.module(),item.moduleVersion(),item.position(),row.count(),detail,item.progress(),
            index>0?link(items.get(index-1)):null,index+1<items.size()?link(items.get(index+1)):null,overview,item.access(),item.availability());
    }
    @Transactional
    public VisitView visit(UUID actor,UUID accountContext,UUID enrollmentId,VisitActivity command) {
        mutation(actor,accountContext);check(command!=null&&command.activityId()!=null&&command.activityVersionId()!=null);locale(command.locale());
        var row=owned(actor,enrollmentId);var item=accessibleItem(actor,accountContext,row,command.activityId(),command.activityVersionId(),command.locale());
        jdbc.update("UPDATE learning_enrollments SET last_activity_version_id=?,last_visited_at=greatest(created_at,CURRENT_TIMESTAMP,coalesce(last_visited_at,created_at)) WHERE id=?",item.version(),row.id());
        var current=owned(actor,row.id());return new VisitView(row.id(),item.activity(),item.version(),current.lastVisited());
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ActivityProgressView progress(UUID actor,UUID activityId,UUID enrollmentId,UUID activityVersionId) {
        require(actor,"learning.read");check(activityVersionId!=null);owned(actor,enrollmentId);return progressRow(enrollmentId,activityId,activityVersionId,false);
    }
    @Transactional
    public ActivityProgressView setProgress(UUID actor,UUID accountContext,UUID activityId,String ifMatch,SetActivityProgress command) {
        mutation(actor,accountContext);check(command!=null&&command.enrollmentId()!=null&&command.activityVersionId()!=null);locale(command.locale());
        var row=owned(actor,command.enrollmentId());var old=progressRow(row.id(),activityId,command.activityVersionId(),true);
        mutation(actor,accountContext);RevisionPreconditions.requireMatch(ifMatch,EntityTags.forRevision("activity-progress",old.id(),old.revision()));
        check(old.activityVersionId().equals(command.activityVersionId()));accessibleItem(actor,accountContext,row,activityId,old.activityVersionId(),command.locale());
        if((old.readAt()!=null)==command.read()&&(old.completedAt()!=null)==command.completed())return old;
        jdbc.update("UPDATE learning_activity_progress SET read_at=CASE WHEN ? THEN coalesce(read_at,greatest(created_at,CURRENT_TIMESTAMP)) ELSE NULL END,completed_at=CASE WHEN ? THEN coalesce(completed_at,greatest(created_at,CURRENT_TIMESTAMP)) ELSE NULL END,revision=revision+1,updated_at=greatest(updated_at,created_at,CURRENT_TIMESTAMP) WHERE id=? AND revision=?",
            command.read(),command.completed(),old.id(),old.revision());return progressRow(row.id(),activityId,command.activityVersionId(),false);
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ActivityNoteLookup noteForActivity(UUID actor,UUID activityId,UUID activityVersionId) {
        require(actor,"learning.read");check(activityId!=null&&activityVersionId!=null);
        var rows=jdbc.query("SELECT * FROM learning_activity_notes WHERE owner_id=? AND activity_id=? AND activity_version_id=?",(rs,n)->noteRow(rs),actor,activityId,activityVersionId);
        return new ActivityNoteLookup(rows.isEmpty()?null:rows.getFirst());
    }
    @Transactional
    public ActivityNoteView createNote(UUID actor,UUID accountContext,CreateActivityNote command) {
        mutation(actor,accountContext);check(command!=null&&command.activityId()!=null&&command.activityVersionId()!=null);locale(command.locale());noteText(command.text(),mapper);
        lockActor(actor);lockResources(List.of(command.activityId()));mutation(actor,accountContext);
        requireReadable(members.detail(actor,command.activityId(),command.activityVersionId(),command.locale()),ResourceKind.ACTIVITY);
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM learning_activity_notes WHERE owner_id=? AND activity_version_id=?)",Boolean.class,actor,command.activityVersionId())))throw new ApiException(ApiError.ACTIVITY_NOTE_EXISTS);
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO learning_activity_notes(id,owner_id,activity_id,activity_version_id,locale,body) VALUES(?,?,?,?,?,?)",id,actor,command.activityId(),command.activityVersionId(),command.locale(),command.text());
        return ownedNote(actor,id,false);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ActivityNoteView note(UUID actor,UUID noteId) {require(actor,"learning.read");return ownedNote(actor,noteId,false);}
    @Transactional
    public ActivityNoteView updateNote(UUID actor,UUID accountContext,UUID noteId,String ifMatch,UpdateActivityNote command) {
        mutation(actor,accountContext);var old=ownedNote(actor,noteId,true);mutation(actor,accountContext);
        RevisionPreconditions.requireMatch(ifMatch,EntityTags.forRevision("activity-note",old.id(),old.revision()));check(command!=null);noteText(command.text(),mapper);
        if(old.text().equals(command.text()))return old;
        jdbc.update("UPDATE learning_activity_notes SET body=?,revision=revision+1,updated_at=greatest(updated_at,created_at,CURRENT_TIMESTAMP) WHERE id=? AND owner_id=? AND revision=?",command.text(),noteId,actor,old.revision());
        return ownedNote(actor,noteId,false);
    }

    @Transactional
    public QuizAttemptView submitQuiz(UUID actor,UUID accountContext,UUID activityId,SubmitQuiz command) {
        mutation(actor,accountContext);check(command!=null&&command.enrollmentId()!=null&&command.activityVersionId()!=null&&command.revisionId()!=null&&command.submissionId()!=null);locale(command.locale());
        var answers=canonicalAnswers(command.answers());byte[] fingerprint=fingerprint(activityId,command,answers);
        lockActor(actor);mutation(actor,accountContext);
        var replay=jdbc.query("SELECT * FROM learning_quiz_attempts WHERE owner_id=? AND submission_id=?",(rs,n)->new AttemptRow(attemptRow(rs),rs.getBytes("request_fingerprint")),actor,command.submissionId());
        if(!replay.isEmpty()) {
            if(!Arrays.equals(fingerprint,replay.getFirst().fingerprint()))throw new ApiException(ApiError.CONFLICT);
            return replay.getFirst().value();
        }
        var row=owned(actor,command.enrollmentId());accessibleItem(actor,accountContext,row,activityId,command.activityVersionId(),command.locale());
        var source=quizSource(actor,activityId,command.activityVersionId(),command.locale(),command.revisionId());
        int used=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM learning_quiz_attempts WHERE owner_id=? AND activity_version_id=?",Integer.class,actor,command.activityVersionId()));
        var policy=effectivePolicy(source.document().quizPolicy());
        if(policy.maxAttempts()!=null&&used>=policy.maxAttempts())throw new ApiException(ApiError.QUIZ_ATTEMPTS_EXHAUSTED);
        var graded=grade(source.document(),answers);UUID id=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO learning_quiz_attempts(id,owner_id,submission_id,enrollment_id,activity_id,activity_version_id,translation_id,revision_id,locale,attempt_number,
              score_points,max_points,passed,pass_percent,max_attempts,request_fingerprint,quiz_snapshot,answers,results)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?::jsonb)
            """,id,actor,command.submissionId(),row.id(),activityId,command.activityVersionId(),source.translation(),command.revisionId(),command.locale(),used+1,
            graded.points(),graded.max(),graded.passed(),policy.passPercent(),policy.maxAttempts(),fingerprint,mapper.writeValueAsString(source.document().quiz()),mapper.writeValueAsString(answers),mapper.writeValueAsString(graded.results()));
        return ownedAttempt(actor,id);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public QuizAttemptPage attempts(UUID actor,UUID activityVersionId,int page,int pageSize) {
        require(actor,"learning.read");check(activityVersionId!=null);page(page,pageSize);
        long total=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM learning_quiz_attempts WHERE owner_id=? AND activity_version_id=?",Long.class,actor,activityVersionId));
        var items=jdbc.query("SELECT * FROM learning_quiz_attempts WHERE owner_id=? AND activity_version_id=? ORDER BY submitted_at DESC,id LIMIT ? OFFSET ?",(rs,n)->attemptRow(rs),actor,activityVersionId,pageSize,(long)page*pageSize);
        return new QuizAttemptPage(items,page,pageSize,total);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public QuizAttemptView attempt(UUID actor,UUID attemptId) {require(actor,"learning.read");return ownedAttempt(actor,attemptId);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public FormativeQuizResult checkQuiz(UUID activityId,UUID activityVersionId,CheckQuiz command) {
        check(command!=null&&activityId!=null&&activityVersionId!=null&&command.revisionId()!=null);locale(command.locale());
        var source=quizSource(null,activityId,activityVersionId,command.locale(),command.revisionId());var graded=grade(source.document(),canonicalAnswers(command.answers()));
        return new FormativeQuizResult(activityId,activityVersionId,command.revisionId(),command.locale(),graded.points(),graded.max(),graded.passed(),effectivePolicy(source.document().quizPolicy()),graded.results());
    }

    private EnrollmentView view(EnrollmentRow row,String locale) {
        var course=catalogue.version(row.courseId(),row.courseVersion(),locale);var items=items(row,course,locale);
        return new EnrollmentView(summary(row,course),course.curriculum(),items.stream().map(i->new EnrolledActivity(i.activity(),i.version(),i.module(),i.moduleVersion(),i.position(),i.title(),i.access(),i.availability(),i.progress())).toList());
    }
    private EnrollmentSummary summary(EnrollmentRow row,ResourceDetail course) {
        var counts=jdbc.queryForMap("SELECT count(*) FILTER(WHERE p.read_at IS NOT NULL) AS read,count(*) FILTER(WHERE p.completed_at IS NOT NULL) AS completed FROM learning_activity_progress p WHERE enrollment_id=?",row.id());
        int passed=Objects.requireNonNull(jdbc.queryForObject("SELECT count(DISTINCT q.activity_version_id) FROM learning_quiz_attempts q JOIN learning_enrollment_activities i ON i.activity_version_id=q.activity_version_id WHERE i.enrollment_id=? AND q.owner_id=? AND q.passed",Integer.class,row.id(),row.owner()));
        return new EnrollmentSummary(row.id(),row.courseId(),row.courseVersion(),row.versionNumber(),row.title(),row.locale(),course.slug(),access(course.availability(),course.access(),entitlements.covers(row.owner(),row.courseId(),row.courseVersion(),course.locale())),course.availability(),
            new ProgressTotals(row.count(),((Number)counts.get("read")).intValue(),((Number)counts.get("completed")).intValue(),passed,"NOT_AVAILABLE"),row.created(),row.lastVisited());
    }
    private Item accessibleItem(UUID actor,UUID context,EnrollmentRow row,UUID activityId,UUID version,String locale) {
        var first=snapshot(row.id(),activityId,version);lockResources(List.of(row.courseId(),first.module(),first.activity()));mutation(actor,context);
        var course=catalogue.version(row.courseId(),row.courseVersion(),locale);var item=item(items(row,course,locale),activityId,version);
        if(!"PUBLISHED".equals(item.availability()))throw notFound();if(!"ACTIVE".equals(item.access()))throw denied();return item;
    }
    private Snapshot snapshot(UUID enrollment,UUID activityId,UUID version) {
        var rows=jdbc.query("SELECT * FROM learning_enrollment_activities WHERE enrollment_id=? AND activity_id=? AND activity_version_id=?",(rs,n)->new Snapshot(uuid(rs,"module_id"),uuid(rs,"module_version_id"),uuid(rs,"activity_id"),uuid(rs,"activity_version_id"),rs.getString("activity_title")),enrollment,activityId,version);
        if(rows.isEmpty())throw notFound();return rows.getFirst();
    }
    private List<Item> items(EnrollmentRow row,ResourceDetail course,String locale) {
        String query="""
            SELECT i.*,p.id AS progress_id,p.revision AS progress_revision,p.read_at,p.completed_at,s.slug,e.title,
              e.document_json->>'access' AS activity_access,
            """+status("t","e","r","source")+" AS activity_status,"+status("mt","me","mr","msource")+" AS module_status "+"""
            FROM learning_enrollment_activities i JOIN learning_activity_progress p ON p.enrollment_id=i.enrollment_id AND p.activity_version_id=i.activity_version_id
            JOIN learning_resources r ON r.id=i.activity_id JOIN learning_resources mr ON mr.id=i.module_id
            LEFT JOIN content_translations t ON t.pedagogical_version_id=i.activity_version_id AND t.locale=?
            LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id LEFT JOIN content_translations source ON source.id=t.source_translation_id
            LEFT JOIN resource_slugs s ON s.resource_id=i.activity_id AND s.locale=?
            LEFT JOIN content_translations mt ON mt.pedagogical_version_id=i.module_version_id AND mt.locale=?
            LEFT JOIN editorial_revisions me ON me.id=mt.published_revision_id LEFT JOIN content_translations msource ON msource.id=mt.source_translation_id
            WHERE i.enrollment_id=? ORDER BY i.position
            """;
        return jdbc.query(query,(rs,n)->{
            String availability=!"PUBLISHED".equals(course.availability())?course.availability():!"PUBLISHED".equals(rs.getString("module_status"))?rs.getString("module_status"):rs.getString("activity_status");
            String currentTitle=rs.getString("title");
            return new Item(uuid(rs,"activity_id"),uuid(rs,"activity_version_id"),uuid(rs,"module_id"),uuid(rs,"module_version_id"),rs.getInt("position"),
                currentTitle==null?rs.getString("activity_title"):currentTitle,rs.getString("slug"),availability,access(availability,rs.getString("activity_access"),entitlements.covers(row.owner(),uuid(rs,"activity_id"),uuid(rs,"activity_version_id"),locale)),
                new ActivityProgressView(uuid(rs,"progress_id"),row.id(),uuid(rs,"activity_id"),uuid(rs,"activity_version_id"),rs.getLong("progress_revision"),instant(rs,"read_at"),instant(rs,"completed_at")));
        },locale,locale,locale,row.id());
    }
    private static String status(String t,String e,String r,String source) {
        return "CASE WHEN "+r+".archived_at IS NOT NULL OR "+t+".editorial_state='ARCHIVED' THEN 'WITHDRAWN' WHEN "+t+".published_revision_id IS NULL THEN 'MISSING_TRANSLATION' WHEN "+e+".document_json IS NULL THEN 'WITHDRAWN' WHEN "+t+".editorial_state='STALE' OR ("+t+".source_translation_id IS NOT NULL AND ("+t+".published_source_revision_id IS DISTINCT FROM "+source+".current_revision_id OR "+source+".editorial_state IN('ARCHIVED','STALE'))) THEN 'STALE' ELSE 'PUBLISHED' END";
    }
    private static String access(String availability,String policy,boolean entitled) {return !"PUBLISHED".equals(availability)?"UNAVAILABLE":"FREE".equals(policy)||entitled?"ACTIVE":"PROTECTED";}
    private static Item item(List<Item> items,UUID activity,UUID version) {return items.stream().filter(i->i.activity().equals(activity)&&(version==null||i.version().equals(version))).findFirst().orElseThrow(LearningService::notFound);}
    private static ActivityLink link(Item item) {return new ActivityLink(item.activity(),item.version(),item.slug(),item.title(),item.availability(),item.access());}
    private static ResourceDetail contextDetail(ResourceDetail d,String availability) {
        return new ResourceDetail(d.resourceId(),d.kind(),d.versionId(),d.versionNumber(),d.locale(),d.slug(),availability,d.revisionId(),d.title(),d.summary(),d.access(),null,d.metadata(),d.reviewedAt(),d.languages(),d.curriculum(),d.related(),d.objective(),d.expectedResult(),d.prerequisites(),d.estimatedMinutes());
    }
    private QuizOverview quizOverview(UUID actor,UUID activityVersion,ResourceDetail detail) {
        if(detail.document()==null||detail.document().quiz().isEmpty())return null;
        var p=effectivePolicy(detail.document().quizPolicy());int used=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM learning_quiz_attempts WHERE owner_id=? AND activity_version_id=?",Integer.class,actor,activityVersion));
        var latest=jdbc.query("SELECT id FROM learning_quiz_attempts WHERE owner_id=? AND activity_version_id=? ORDER BY attempt_number DESC LIMIT 1",(rs,n)->uuid(rs,"id"),actor,activityVersion);
        boolean passed=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM learning_quiz_attempts WHERE owner_id=? AND activity_version_id=? AND passed)",Boolean.class,actor,activityVersion));
        return new QuizOverview(p,used,p.maxAttempts()==null?null:Math.max(0,p.maxAttempts()-used),latest.isEmpty()?null:latest.getFirst(),passed);
    }
    private Source quizSource(UUID actor,UUID activityId,UUID version,String locale,UUID revision) {
        var detail=members.detail(actor,activityId,version,locale);requireReadable(detail,ResourceKind.ACTIVITY);
        if(!Objects.equals(detail.revisionId(),revision))throw new ApiException(ApiError.REVISION_CONFLICT);
        var rows=jdbc.query("SELECT t.id,e.document_json::text AS document_text FROM content_translations t JOIN editorial_revisions e ON e.id=t.published_revision_id WHERE t.pedagogical_version_id=? AND t.locale=? AND e.id=?",(rs,n)->new Source(uuid(rs,"id"),mapper.readValue(rs.getString("document_text"),ContentDocument.class)),version,locale,revision);
        if(rows.isEmpty())throw new ApiException(ApiError.REVISION_CONFLICT);var source=rows.getFirst();
        if(source.document().quiz().isEmpty())throw new ApiException(ApiError.QUIZ_UNAVAILABLE);return source;
    }
    private static Grade grade(ContentDocument document,List<QuizAnswer> answers) {
        check(answers.size()==document.quiz().size());Map<String,Integer> supplied=new HashMap<>();for(var answer:answers)supplied.put(answer.key(),answer.optionIndex());
        var results=new ArrayList<QuizQuestionResult>();int score=0,total=0;
        for(QuizQuestion q:document.quiz()) {
            Integer selected=supplied.remove(q.key());check(selected!=null&&selected>=0&&selected<q.options().size());boolean correct=selected==q.correctOption();int points=correct?q.points():0;
            score+=points;total+=q.points();results.add(new QuizQuestionResult(q.key(),q.prompt(),q.options(),selected,q.correctOption(),correct,q.explanation(),q.points(),points));
        }
        check(supplied.isEmpty()&&total>0);return new Grade(score,total,score*100>=total*effectivePolicy(document.quizPolicy()).passPercent(),results);
    }
    private static List<QuizAnswer> canonicalAnswers(List<QuizAnswer> answers) {
        check(answers!=null&&answers.size()<=20&&answers.stream().noneMatch(Objects::isNull));Set<String> keys=new LinkedHashSet<>();
        for(var answer:answers) {text(answer.key(),64);check(answer.key().matches("[a-zA-Z0-9][a-zA-Z0-9_-]*")&&keys.add(answer.key())&&answer.optionIndex()>=0&&answer.optionIndex()<8);}
        return answers.stream().sorted(Comparator.comparing(QuizAnswer::key)).toList();
    }
    private byte[] fingerprint(UUID activity,SubmitQuiz command,List<QuizAnswer> answers) {
        check(activity!=null);var canonical=new SubmitQuiz(command.enrollmentId(),command.activityVersionId(),command.revisionId(),command.locale(),command.submissionId(),answers);
        try{return MessageDigest.getInstance("SHA-256").digest((activity+":"+mapper.writeValueAsString(canonical)).getBytes(StandardCharsets.UTF_8));}
        catch(NoSuchAlgorithmException unavailable){throw new IllegalStateException("SHA-256 unavailable",unavailable);}
    }
    private static void requireReadable(ResourceDetail detail,ResourceKind kind) {
        if(detail.kind()!=kind||!"PUBLISHED".equals(detail.availability()))throw notFound();if(detail.document()==null)throw denied();
    }
    private EnrollmentRow owned(UUID actor,UUID id) {
        var rows=jdbc.query("SELECT * FROM learning_enrollments WHERE id=? AND owner_id=?",(rs,n)->enrollmentRow(rs),id,actor);if(rows.isEmpty())throw notFound();return rows.getFirst();
    }
    private static EnrollmentRow enrollmentRow(ResultSet rs)throws SQLException {
        return new EnrollmentRow(uuid(rs,"id"),uuid(rs,"owner_id"),uuid(rs,"course_resource_id"),uuid(rs,"course_version_id"),rs.getInt("course_version_number"),rs.getString("course_title"),rs.getString("enrolled_locale"),rs.getInt("activity_count"),uuid(rs,"last_activity_version_id"),instant(rs,"last_visited_at"),instant(rs,"created_at"));
    }
    private ActivityProgressView progressRow(UUID enrollment,UUID activity,UUID version,boolean lock) {
        var rows=jdbc.query("SELECT p.*,i.activity_id FROM learning_activity_progress p JOIN learning_enrollment_activities i ON i.enrollment_id=p.enrollment_id AND i.activity_version_id=p.activity_version_id WHERE p.enrollment_id=? AND i.activity_id=? AND i.activity_version_id=?"+(lock?" FOR UPDATE OF p":""),
            (rs,n)->new ActivityProgressView(uuid(rs,"id"),enrollment,uuid(rs,"activity_id"),uuid(rs,"activity_version_id"),rs.getLong("revision"),instant(rs,"read_at"),instant(rs,"completed_at")),enrollment,activity,version);
        if(rows.isEmpty())throw notFound();return rows.getFirst();
    }
    private ActivityNoteView ownedNote(UUID actor,UUID id,boolean lock) {
        var rows=jdbc.query("SELECT * FROM learning_activity_notes WHERE id=? AND owner_id=?"+(lock?" FOR UPDATE":""),(rs,n)->noteRow(rs),id,actor);if(rows.isEmpty())throw notFound();return rows.getFirst();
    }
    private static ActivityNoteView noteRow(ResultSet rs)throws SQLException {return new ActivityNoteView(uuid(rs,"id"),uuid(rs,"activity_id"),uuid(rs,"activity_version_id"),rs.getString("locale"),rs.getString("body"),rs.getLong("revision"),instant(rs,"created_at"),instant(rs,"updated_at"));}
    private QuizAttemptView ownedAttempt(UUID actor,UUID id) {
        var rows=jdbc.query("SELECT * FROM learning_quiz_attempts WHERE id=? AND owner_id=?",(rs,n)->attemptRow(rs),id,actor);if(rows.isEmpty())throw notFound();return rows.getFirst();
    }
    private QuizAttemptView attemptRow(ResultSet rs)throws SQLException {
        List<QuizQuestionResult> results=Arrays.asList(mapper.readValue(rs.getString("results"),QuizQuestionResult[].class));Integer max=(Integer)rs.getObject("max_attempts");
        return new QuizAttemptView(uuid(rs,"id"),uuid(rs,"submission_id"),uuid(rs,"enrollment_id"),uuid(rs,"activity_id"),uuid(rs,"activity_version_id"),uuid(rs,"revision_id"),rs.getString("locale"),rs.getInt("attempt_number"),rs.getInt("score_points"),rs.getInt("max_points"),rs.getBoolean("passed"),new QuizPolicy(rs.getInt("pass_percent"),max),instant(rs,"submitted_at"),results);
    }
    private void lockActor(UUID actor) {jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR UPDATE",(rs,n)->uuid(rs,"id"),actor);}
    private void lockResources(List<UUID> resources) {
        var ids=resources.stream().distinct().sorted().toList();String slots=String.join(",",ids.stream().map(id->"?").toList());
        jdbc.query("SELECT id FROM learning_resources WHERE id IN("+slots+") ORDER BY id FOR SHARE",(rs,n)->uuid(rs,"id"),ids.toArray());
    }
    private void mutation(UUID actor,UUID context) {
        require(actor,"learning.write");if(context==null)throw new ApiException(ApiError.ACCOUNT_CONTEXT_REQUIRED);if(!actor.equals(context))throw new ApiException(ApiError.ACCOUNT_CONTEXT_CHANGED);
    }
    private void require(UUID actor,String permission) {if(!permitted(actor,permission))throw denied();}
    private boolean permitted(UUID actor,String permission) {
        return actor!=null&&Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_accounts u JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL JOIN role_permissions rp ON rp.role_id=ur.role_id AND rp.revoked_at IS NULL JOIN permissions p ON p.id=rp.permission_id WHERE u.id=? AND u.status='ACTIVE' AND p.code=?)",Boolean.class,actor,permission));
    }
    private static ApiException notFound() {return new ApiException(ApiError.RESOURCE_NOT_FOUND);}
    private static AccessDeniedException denied() {return new AccessDeniedException("Learning action unavailable");}
    private static UUID uuid(ResultSet rs,String key)throws SQLException {return rs.getObject(key,UUID.class);}
    private static Instant instant(ResultSet rs,String key)throws SQLException {Timestamp value=rs.getTimestamp(key);return value==null?null:value.toInstant();}
    private record EnrollmentRow(UUID id,UUID owner,UUID courseId,UUID courseVersion,int versionNumber,String title,String locale,int count,UUID lastActivity,Instant lastVisited,Instant created) { }
    private record Snapshot(UUID module,UUID moduleVersion,UUID activity,UUID version,String title) { }
    private record Item(UUID activity,UUID version,UUID module,UUID moduleVersion,int position,String title,String slug,String availability,String access,ActivityProgressView progress) { }
    private record Source(UUID translation,ContentDocument document) { }
    private record Grade(int points,int max,boolean passed,List<QuizQuestionResult> results) { }
    private record AttemptRow(QuizAttemptView value,byte[] fingerprint) { }
}
