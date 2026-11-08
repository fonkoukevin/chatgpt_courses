package com.chatgptcourses.assets.service;

import com.chatgptcourses.assets.config.AssetStorageProperties;
import com.chatgptcourses.assets.storage.ObjectStorage;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** Explicit operational port. Network calls run after a short database claim transaction has committed. */
@Service
public class AssetStagingCleanup {
    private final JdbcTemplate jdbc;private final ObjectStorage storage;private final AssetStorageProperties properties;private final TransactionTemplate transaction;
    public AssetStagingCleanup(JdbcTemplate jdbc,ObjectStorage storage,AssetStorageProperties properties,PlatformTransactionManager manager){this.jdbc=jdbc;this.storage=storage;this.properties=properties;transaction=new TransactionTemplate(manager);}
    public record CleanupResult(int attempted,int cleaned,int failed){ }
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public CleanupResult cleanBatch(int limit){
        AssetAccessPolicy.check(limit>=1&&limit<=25);if(!properties.enabled())return new CleanupResult(0,0,0);int attempted=0,cleaned=0,failed=0;
        for(int index=0;index<limit;index++){
            if(Thread.currentThread().isInterrupted())break;
            Claim claim=transaction.execute(status->claim());if(claim==null)break;attempted++;
            try{storage.deleteStaging(new ObjectStorage.Location(claim.bucket(),claim.key()));
                Integer changed=transaction.execute(status->jdbc.update("UPDATE assets SET staging_cleaned_at=clock_timestamp(),staging_cleanup_claim_token=NULL,staging_cleanup_claim_until=NULL WHERE id=? AND staging_cleanup_claim_token=?",claim.id(),claim.token()));if(changed!=null&&changed==1)cleaned++;
            }catch(RuntimeException unavailable){failed++;}
        }
        return new CleanupResult(attempted,cleaned,failed);
    }
    private Claim claim(){
        var rows=jdbc.query("SELECT id,bucket_name,staging_key,state FROM assets WHERE staging_cleaned_at IS NULL AND expires_at+(?*INTERVAL '1 second')<clock_timestamp() AND(staging_cleanup_claim_until IS NULL OR staging_cleanup_claim_until<clock_timestamp()) ORDER BY expires_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",(rs,n)->new Pending(rs.getObject("id",UUID.class),rs.getString("bucket_name"),rs.getString("staging_key"),rs.getString("state")),properties.stagingCleanupGraceSeconds());
        if(rows.isEmpty())return null;var row=rows.getFirst();if("PENDING".equals(row.state()))jdbc.update("UPDATE assets SET state='EXPIRED',revision=revision+1 WHERE id=?",row.id());
        UUID token=UUID.randomUUID();jdbc.update("UPDATE assets SET staging_cleanup_claim_token=?,staging_cleanup_claim_until=clock_timestamp()+INTERVAL '30 seconds' WHERE id=?",token,row.id());return new Claim(row.id(),row.bucket(),row.key(),token);
    }
    private record Pending(UUID id,String bucket,String key,String state){@Override public String toString(){return "PendingStaging[redacted]";}}
    private record Claim(UUID id,String bucket,String key,UUID token){@Override public String toString(){return "StagingClaim[redacted]";}}
}
