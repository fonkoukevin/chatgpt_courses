package com.chatgptcourses.editorial.service;

import static com.chatgptcourses.editorial.service.ContentTypes.*;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import tools.jackson.databind.ObjectMapper;
import com.chatgptcourses.methods.service.MethodValidation;
import com.chatgptcourses.learning.service.LearningValidation;
import com.chatgptcourses.projects.service.ProjectValidation;

/** Applied inside the use case as well as HTTP validation: direct callers cannot bypass bounds. */
final class ContentValidation {
    private ContentValidation() { }
    static void check(boolean condition) { if (!condition) throw new ApiException(ApiError.VALIDATION_FAILED); }
    static void text(String value, int min, int max) {
        check(value != null && value.length()<=max && value.strip().length()>=min && value.indexOf('\0')<0);
        for (int i=0;i<value.length();i++) {
            char c=value.charAt(i);
            if (Character.isHighSurrogate(c)) { check(i+1<value.length() && Character.isLowSurrogate(value.charAt(++i))); }
            else check(!Character.isLowSurrogate(c));
        }
    }
    static void locale(String locale) { check(locale!=null && Set.of("fr","en").contains(locale)); }
    static void slug(String slug) { text(slug,1,180); check(slug.matches("[a-z0-9]+(-[a-z0-9]+)*")); }
    static <T> void list(List<T> list,int max) { check(list!=null && list.size()<=max && list.stream().noneMatch(java.util.Objects::isNull)); }
    static void ids(List<UUID> ids,int max) { list(ids,max); check(new HashSet<>(ids).size()==ids.size()); }
    static void header(String title,String summary,String reason) { text(title,1,240);text(summary,0,2000);text(reason,1,1000); }
    static void pedagogy(String objectives,String evaluation) { text(objectives,1,4000);text(evaluation,1,4000); }
    static void page(int page,int size) { check(page>=0 && page<=1_000_000 && size>=1 && size<=100); }
    static void document(ContentDocument d,ObjectMapper mapper) {
        check(d!=null); text(d.objective(),0,4000);text(d.expectedResult(),0,4000);
        list(d.prerequisites(),20);d.prerequisites().forEach(s->text(s,1,1000));
        list(d.blocks(),60);
        for(var b:d.blocks()) {
            check(b.type()!=null && Set.of("HEADING","PARAGRAPH","LIST","CALLOUT","CODE","LINK").contains(b.type()));
            text(b.text(),1,4000);
            if("LINK".equals(b.type())) { text(b.url(),1,2000);url(b.url()); }
            else check(b.url()==null);
        }
        check(d.estimatedMinutes()==null || (d.estimatedMinutes()>0 && d.estimatedMinutes()<=1440));
        if(d.exercise()!=null) {text(d.exercise().instructions(),0,8000);text(d.exercise().correction(),0,8000);}
        list(d.quiz(),20);var keys=new HashSet<String>();
        for(var q:d.quiz()) {
            key(q.key());check(keys.add(q.key()));text(q.prompt(),1,2000);list(q.options(),8);check(q.options().size()>=2);
            q.options().forEach(s->text(s,1,1000));check(q.correctOption()>=0 && q.correctOption()<q.options().size());
            text(q.explanation(),1,4000);check(q.points()>=1 && q.points()<=1000);
        }
        list(d.rubric(),30);keys.clear();
        for(var r:d.rubric()) {key(r.key());check(keys.add(r.key()));text(r.label(),1,2000);check(r.points()>=1 && r.points()<=1000);}
        check(d.access()!=null && Set.of("FREE","PROTECTED").contains(d.access()));
        list(d.media(),20);var mediaIds=new HashSet<UUID>();
        for(var m:d.media()) {
            check(m.assetId()!=null && mediaIds.add(m.assetId()));
            check(m.kind()!=null && Set.of("IMAGE","VIDEO","FILE").contains(m.kind()));text(m.label(),1,240);
        }
        ids(d.relatedResourceIds(),30);
        if(d.methodDefinition()!=null)MethodValidation.definition(d.methodDefinition(),mapper);
        LearningValidation.policy(d.quizPolicy());
        ProjectValidation.policy(d.projectPolicy());
        check(mapper.writeValueAsString(d).getBytes(StandardCharsets.UTF_8).length<=48*1024);
    }
    private static void key(String key) { text(key,1,64);check(key.matches("[a-zA-Z0-9][a-zA-Z0-9_-]*")); }
    private static void url(String value) {
        check(value.chars().noneMatch(c->Character.isISOControl(c) || c=='\\'));
        try {
            URI u=URI.create(value);
            if(value.startsWith("/")) check(!value.startsWith("//") && u.getRawAuthority()==null);
            else check("https".equalsIgnoreCase(u.getScheme()) && u.getHost()!=null && u.getUserInfo()==null);
        } catch(IllegalArgumentException bad) {throw new ApiException(ApiError.VALIDATION_FAILED);}
    }
}
