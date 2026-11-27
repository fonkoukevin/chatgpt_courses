package com.chatgptcourses;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.chatgptcourses.assets.config.AssetStorageProperties;
import com.chatgptcourses.assets.service.AssetAccessPolicy;
import com.chatgptcourses.assets.service.AssetService;
import com.chatgptcourses.assets.storage.ObjectStorage;
import java.net.URI;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

/** A service/port contract only: no SQL execution, Spring context, network or payment. */
class SignedDownloadExpiryContractTest {
    @Test void downloadMetadataKeepsTheProvidersSignedDeadlineInsteadOfStartingANewTtl()throws Exception{
        UUID actor=UUID.randomUUID(),asset=UUID.randomUUID();
        var jdbc=mock(JdbcTemplate.class);var policy=mock(AssetAccessPolicy.class);
        var row=mock(ResultSet.class);
        when(row.getObject("id",UUID.class)).thenReturn(asset);
        when(row.getObject("owner_id",UUID.class)).thenReturn(actor);
        when(row.getString("scope")).thenReturn("EDITORIAL");
        when(row.getString("kind")).thenReturn("FILE");
        when(row.getString("locale")).thenReturn("fr");
        when(row.getString("bucket_name")).thenReturn("isolated-editorial");
        when(row.getString("staging_key")).thenReturn("staging/fixture");
        when(row.getString("ready_key")).thenReturn("ready/fixture");
        when(row.getString("filename")).thenReturn("fixture.md");
        when(row.getString("declared_content_type")).thenReturn("text/plain");
        when(row.getLong("declared_size")).thenReturn(5L);
        when(row.getString("verified_content_type")).thenReturn("text/plain");
        when(row.getObject("verified_size",Long.class)).thenReturn(5L);
        when(row.getBytes("content_sha256")).thenReturn(new byte[32]);
        when(row.getString("state")).thenReturn("READY");
        when(row.getLong("revision")).thenReturn(1L);
        var created=Timestamp.from(Instant.parse("2026-01-01T00:00:00Z"));
        when(row.getTimestamp("created_at")).thenReturn(created);
        when(row.getTimestamp("expires_at")).thenReturn(created);
        when(row.getTimestamp("ready_at")).thenReturn(created);
        when(jdbc.query(eq("SELECT * FROM assets WHERE id=?"),any(RowMapper.class),eq(asset)))
            .thenAnswer(invocation->{RowMapper<?> mapper=invocation.getArgument(1);return List.of(mapper.mapRow(row,0));});
        Instant providerDeadline=Instant.parse("2099-01-01T00:00:02Z");
        var calls=new AtomicInteger();
        ObjectStorage storage=new ObjectStorage(){
            public Optional<Metadata> head(Location location){return Optional.of(new Metadata(5,"text/plain"));}
            public SignedRequest presignGet(Location location,String type,String disposition,Duration ttl){
                assertTrue(Duration.ofSeconds(60).equals(ttl),"Configured TTL must be passed unchanged");
                calls.incrementAndGet();
                return new SignedRequest("https://storage.invalid/fixture?X-Amz-Date=20990101T000000Z&X-Amz-Expires=2&X-Amz-Signature=synthetic",Map.of(),providerDeadline);
            }
            public byte[] read(Location location,long maximum){throw new AssertionError("No object read expected");}
            public void put(Location location,byte[] bytes,String type,String disposition){throw new AssertionError("No write expected");}
            public SignedRequest presignPut(Location location,String type,long size,Duration ttl){throw new AssertionError("No upload expected");}
            public void deleteStaging(Location location){throw new AssertionError("No delete expected");}
        };
        var settings=new AssetStorageProperties(true,URI.create("http://127.0.0.1:8333"),URI.create("http://localhost:8333"),
            "us-east-1","synthetic-access","synthetic-secret","isolated-editorial","isolated-private",true,
            1024,1024,10,10240,300,60,16000000,4096,60);
        var service=new AssetService(jdbc,policy,storage,settings,null,null);
        var download=service.preview(actor,actor,asset);
        // Assert only the public date predicate, never the signed request or download record.
        assertTrue(providerDeadline.equals(download.expiresAt()),"Download metadata must retain the provider's signed deadline");
        assertTrue(calls.get()==1,"A signed link must be issued once without regeneration");
        verify(policy).mutation(actor,actor,"content.read");
    }
}
