package com.chatgptcourses;

import com.chatgptcourses.assets.storage.StorageUnavailableException;
import com.chatgptcourses.shared.http.ApiException;
import java.io.IOException;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Test-only facts attached to the original failure, never provider output. */
final class S3CiDiagnostic {
    enum Phase { INTENT, PUT, CONFIRM, AFTER_CONFIRM, FIRST_IMPORT, SOURCE_READ, SOURCE_WRITE, SECOND_IMPORT, ASSERTIONS }
    private static final Set<String> STATES=Set.of("PENDING","READY","REJECTED","EXPIRED","MISSING","UNKNOWN");
    private static final Set<String> REJECTIONS=Set.of("NONE","OTHER","SIZE_MISMATCH","CONTENT_TYPE_MISMATCH","SIZE_EXCEEDED","INVALID_TEXT","INVALID_UTF8","DOCUMENT_VALIDATOR_UNAVAILABLE","FORMAT_NOT_ALLOWED","INVALID_SIGNATURE","INVALID_IMAGE","IMAGE_DIMENSIONS_EXCEEDED");
    private static final String COLUMNS="a.state,a.rejection_code,a.expires_at<=clock_timestamp() AS expired,greatest(0,floor(extract(epoch FROM(clock_timestamp()-a.created_at))*1000)) AS age_ms";
    record Snapshot(String state,String rejection,Boolean expired,long ageMs){ }
    private S3CiDiagnostic(){ }

    static final class Tracker {
        private final JdbcTemplate jdbc;private final String namespace;private final long start=System.nanoTime();
        private UUID asset;private Phase phase;
        Tracker(JdbcTemplate jdbc,String namespace,Phase phase){this.jdbc=jdbc;this.namespace=namespace;this.phase=phase;}
        void asset(UUID value){asset=value;}
        void phase(Phase value){phase=value;}
        void attach(Throwable failure){
            Snapshot snapshot=new Snapshot("UNKNOWN","OTHER",null,-1);
            try{
                var rows=asset!=null?jdbc.queryForList("SELECT "+COLUMNS+" FROM assets a WHERE a.id=?",asset)
                    :namespace!=null?jdbc.queryForList("SELECT "+COLUMNS+" FROM editorial_import_files f JOIN assets a ON a.id=f.asset_id WHERE f.namespace=? ORDER BY CASE WHEN a.state='READY' THEN 1 ELSE 0 END,a.created_at DESC LIMIT 1",namespace):java.util.List.<java.util.Map<String,Object>>of();
                if(rows.isEmpty())snapshot=new Snapshot("MISSING","NONE",null,-1);
                else{var row=rows.getFirst();snapshot=new Snapshot((String)row.get("state"),(String)row.get("rejection_code"),(Boolean)row.get("expired"),((Number)row.get("age_ms")).longValue());}
            }catch(RuntimeException ignored){ }
            // No extra query or remote call occurs before the original failure.
            failure.addSuppressed(new FailureDetails(render(snapshot,phase,(System.nanoTime()-start)/1_000_000,category(failure))));
        }
    }
    static String category(Throwable failure){
        if(failure instanceof AssertionError)return "ASSERTION";
        if(failure instanceof ApiException api)return switch(api.error()){
            case ASSET_NOT_READY -> "API_ASSET_NOT_READY";
            case SERVICE_UNAVAILABLE -> "API_SERVICE_UNAVAILABLE";
            case UPLOAD_OBJECT_MISSING -> "API_UPLOAD_OBJECT_MISSING";
            default -> "API_OTHER";
        };
        if(failure instanceof StorageUnavailableException)return "STORAGE_UNAVAILABLE";
        if(failure instanceof IOException)return "IO";
        return "OTHER";
    }
    static String render(Snapshot value,Phase phase,long elapsed,String error){
        String state=value.state()!=null&&STATES.contains(value.state())?value.state():"UNKNOWN";
        String rejection=value.rejection()==null?"NONE":REJECTIONS.contains(value.rejection())?value.rejection():"OTHER";
        String safeError=error!=null&&Set.of("ASSERTION","API_ASSET_NOT_READY","API_SERVICE_UNAVAILABLE","API_UPLOAD_OBJECT_MISSING","API_OTHER","STORAGE_UNAVAILABLE","IO","OTHER").contains(error)?error:"OTHER";
        return "P21_S3_DIAG_V1 phase="+phase.name()+" state="+state+" rejection="+rejection+" expired="+(value.expired()==null?"unknown":value.expired())
            +" elapsedMs="+Math.clamp(elapsed,0,120_000)+" ageMs="+(value.ageMs()<0?"unknown":Math.clamp(value.ageMs(),0,120_000))+" error="+safeError;
    }
    private static final class FailureDetails extends RuntimeException {
        FailureDetails(String safeMessage){super(safeMessage,null,false,false);}
    }
}
