package com.chatgptcourses.projects.service;

import static com.chatgptcourses.projects.service.ProjectTypes.*;
import com.chatgptcourses.editorial.service.ContentTypes.ContentDocument;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import tools.jackson.databind.ObjectMapper;

public final class ProjectValidation {
    private ProjectValidation() { }
    public static final Set<String> CRITERION_KEYS=Set.of("fidelity-1","fidelity-2","fidelity-3","fidelity-4","scope-1","scope-2","scope-3","scope-4","budget-1","budget-2","budget-3","budget-4","schedule-1","schedule-2","schedule-3","schedule-4","presentation-1","presentation-2","presentation-3","presentation-4");
    public static final Set<String> BLOCKING_KEYS=Set.of("invented-claims","definitive-wrong-total","unpriced-inclusion","unsupported-date");
    static void check(boolean condition) {if(!condition)throw new ApiException(ApiError.VALIDATION_FAILED);}
    static void locale(String locale) {check(locale!=null&&Set.of("fr","en").contains(locale));}
    static void text(String value,int min,int max) {
        check(value!=null&&value.length()<=max&&value.strip().length()>=min&&value.indexOf('\0')<0);
        for(int i=0;i<value.length();i++){char c=value.charAt(i);if(Character.isHighSurrogate(c))check(i+1<value.length()&&Character.isLowSurrogate(value.charAt(++i)));else check(!Character.isLowSurrogate(c));}
    }
    public static void policy(ProjectPolicy policy) {
        if(policy==null)return;
        check(policy.caseCode()!=null&&Set.of("BR01","BR02").contains(policy.caseCode()));check(policy.passPoints()>=1&&policy.passPoints()<=20);
        check(policy.revealPolicy()!=null&&Set.of("EXPLICIT","AFTER_SUBMISSION").contains(policy.revealPolicy()));
        check(policy.blockingIssues()!=null&&policy.blockingIssues().size()<=4&&policy.blockingIssues().stream().noneMatch(Objects::isNull));
        var keys=new HashSet<String>();for(var issue:policy.blockingIssues()){text(issue.key(),1,64);check(BLOCKING_KEYS.contains(issue.key())&&keys.add(issue.key()));text(issue.label(),0,1000);}
    }
    public static boolean complete(ContentDocument document) {
        if(document==null||document.projectPolicy()==null||document.rubric()==null)return false;
        var p=document.projectPolicy();
        return document.rubric().size()==20&&document.rubric().stream().map(r->r.key()).collect(java.util.stream.Collectors.toSet()).equals(CRITERION_KEYS)
            &&document.rubric().stream().allMatch(r->r.points()==1&&!r.label().isBlank())&&p.blockingIssues().size()==4
            &&p.blockingIssues().stream().map(BlockingIssueDefinition::key).collect(java.util.stream.Collectors.toSet()).equals(BLOCKING_KEYS)
            &&p.blockingIssues().stream().allMatch(i->!i.label().isBlank())&&document.exercise()!=null&&!document.exercise().correction().isBlank();
    }
    public static boolean equivalentPolicy(ProjectPolicy a,ProjectPolicy b) {
        if(a==null||b==null)return a==b;
        return a.caseCode().equals(b.caseCode())&&a.passPoints()==b.passPoints()&&a.revealPolicy().equals(b.revealPolicy())
            &&a.blockingIssues().stream().map(BlockingIssueDefinition::key).toList().equals(b.blockingIssues().stream().map(BlockingIssueDefinition::key).toList());
    }
    static void fields(ProjectFields fields,String stage,ObjectMapper mapper) {
        check(fields!=null);text(fields.title(),1,240);locale(fields.locale());
        for(String value:new String[]{fields.objective(),fields.scope(),fields.method(),fields.timeline(),fields.budget(),fields.clarifications(),fields.nextStep()})text(value,0,8000);
        text(fields.externalText(),0,32000);check(mapper.writeValueAsString(fields).getBytes(StandardCharsets.UTF_8).length<=48*1024);
        check(stage!=null&&Set.of("DRAFT","READY_FOR_SELF_ASSESSMENT").contains(stage));
        if("READY_FOR_SELF_ASSESSMENT".equals(stage)&&List.of(fields.objective(),fields.scope(),fields.method(),fields.timeline(),fields.budget(),fields.clarifications(),fields.nextStep(),fields.externalText()).stream().allMatch(String::isBlank))throw new ApiException(ApiError.PROJECT_NOT_READY);
    }
    static void declarations(SubmitSelfAssessment command,ProjectRubricSnapshot rubric,ObjectMapper mapper) {
        check(command!=null&&command.submissionId()!=null&&command.projectRevisionId()!=null&&command.rubricVersionId()!=null);
        check(command.answers()!=null&&command.answers().size()==20&&command.answers().stream().noneMatch(Objects::isNull));
        var keys=new HashSet<String>();for(var answer:command.answers()){check(answer.key()!=null&&CRITERION_KEYS.contains(answer.key())&&keys.add(answer.key()));text(answer.comment(),0,1000);}
        check(command.blockingDeclarations()!=null&&command.blockingDeclarations().size()==4&&command.blockingDeclarations().stream().noneMatch(Objects::isNull));
        keys.clear();for(var issue:command.blockingDeclarations()){check(issue.key()!=null&&BLOCKING_KEYS.contains(issue.key())&&keys.add(issue.key()));text(issue.comment(),0,1000);}
        text(command.comment(),0,4000);check(mapper.writeValueAsString(command).getBytes(StandardCharsets.UTF_8).length<=48*1024);
        check(rubric.id().equals(command.rubricVersionId()));
    }
    static void page(int page,int size) {check(page>=0&&page<=1_000_000&&size>=1&&size<=100);}
}
