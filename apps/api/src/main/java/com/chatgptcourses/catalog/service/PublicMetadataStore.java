package com.chatgptcourses.catalog.service;

import static com.chatgptcourses.catalog.service.CatalogTypes.*;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

/** Revision-owned metadata helpers; callers own their complete editorial transaction. */
public final class PublicMetadataStore {
    public static final List<String> GOALS=List.of("understand-brief","define-scope","prepare-prompt","build-proposal","check-output","reuse-method");
    public static final List<String> LEVELS=List.of("BEGINNER","INTERMEDIATE","ADVANCED");
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public PublicMetadataStore(JdbcTemplate jdbc,ObjectMapper mapper) {this.jdbc=jdbc;this.mapper=mapper;}
    public static PublicMetadata empty() {return new PublicMetadata(List.of(),null,List.of(),List.of(),List.of(),List.of(),null);}
    public PublicMetadata get(UUID revision) {
        if(revision==null)return empty();
        var rows=jdbc.query("SELECT metadata_json::text FROM editorial_public_metadata WHERE revision_id=?",(rs,n)->mapper.readValue(rs.getString(1),PublicMetadata.class),revision);
        return rows.isEmpty()?empty():rows.getFirst();
    }
    public void put(UUID revision,PublicMetadata metadata) {
        validate(metadata);jdbc.update("INSERT INTO editorial_public_metadata(revision_id,metadata_json) VALUES(?,?::jsonb)",revision,mapper.writeValueAsString(metadata));
    }
    public void copy(UUID source,UUID target) {
        if(source==null)return;
        jdbc.update("INSERT INTO editorial_public_metadata(revision_id,metadata_json) SELECT ?,metadata_json FROM editorial_public_metadata WHERE revision_id=?",target,source);
    }
    public void validate(PublicMetadata m) {
        check(m!=null);list(m.goalCodes(),6);check(new HashSet<>(m.goalCodes()).size()==m.goalCodes().size() && GOALS.containsAll(m.goalCodes()));
        check(m.level()==null || LEVELS.contains(m.level()));list(m.audience(),10);m.audience().forEach(s->text(s,500));
        list(m.tools(),10);for(var t:m.tools()){text(t.name(),120);if(t.url()!=null)url(t.url());}
        list(m.sources(),20);for(var s:m.sources()){text(s.label(),240);url(s.url());}
        list(m.faq(),12);for(var f:m.faq()){text(f.question(),500);text(f.answer(),2000);}
        if(m.evaluationDescription()!=null)text(m.evaluationDescription(),4000);
        check(mapper.writeValueAsString(m).getBytes(StandardCharsets.UTF_8).length<=16*1024);
    }
    private static void url(String value) {
        text(value,2000);check(value.chars().noneMatch(c->Character.isISOControl(c)||c=='\\'));
        try {
            URI u=URI.create(value);
            if(value.startsWith("/"))check(!value.startsWith("//")&&u.getRawAuthority()==null);
            else check("https".equalsIgnoreCase(u.getScheme())&&u.getHost()!=null&&u.getUserInfo()==null);
        }catch(IllegalArgumentException invalid){throw new ApiException(ApiError.VALIDATION_FAILED);}
    }
    private static void text(String value,int max) {
        check(value!=null&&!value.isBlank()&&value.length()<=max&&value.indexOf('\0')<0);
        for(int i=0;i<value.length();i++){
            char c=value.charAt(i);
            if(Character.isHighSurrogate(c))check(i+1<value.length()&&Character.isLowSurrogate(value.charAt(++i)));
            else check(!Character.isLowSurrogate(c));
        }
    }
    private static <T> void list(List<T> items,int max){check(items!=null&&items.size()<=max&&items.stream().noneMatch(java.util.Objects::isNull));}
    private static void check(boolean value){if(!value)throw new ApiException(ApiError.VALIDATION_FAILED);}
}
