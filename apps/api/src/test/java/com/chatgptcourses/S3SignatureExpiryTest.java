package com.chatgptcourses;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.chatgptcourses.assets.config.AssetStorageProperties;
import com.chatgptcourses.assets.storage.ObjectStorage;
import com.chatgptcourses.assets.storage.S3ObjectStorage;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Real SDK signing only: no Spring, container, HTTP request or provider credentials. */
class S3SignatureExpiryTest {
    private static final List<Duration> TTLS=List.of(Duration.ofSeconds(2),Duration.ofMillis(2500),Duration.ofSeconds(2,999999999));

    @Test void getMetadataUsesTheWholeSecondDeadlineCarriedByTheSignature(){
        try(var storage=storage()){
            for(var ttl:TTLS)assertWireDeadline(storage.presignGet(new ObjectStorage.Location("isolated-private","fixture"),"text/plain","attachment",ttl),ttl);
        }
    }

    @Test void putMetadataUsesTheWholeSecondDeadlineCarriedByTheSignature(){
        try(var storage=storage()){
            for(var ttl:TTLS)assertWireDeadline(storage.presignPut(new ObjectStorage.Location("isolated-private","staging/fixture"),"text/plain",5,ttl),ttl);
        }
    }

    @Test void signedRequestStringDoesNotRevealBearerMaterial(){
        var signed=new ObjectStorage.SignedRequest("https://storage.invalid/PRIVATE_SENTINEL?X-Amz-Signature=PRIVATE_SENTINEL",
            Map.of("Synthetic-Header","PRIVATE_SENTINEL"),Instant.parse("2099-01-01T00:00:02Z"));
        // Only booleans reach the assertions: a failed redaction test must not echo the values.
        assertFalse(signed.toString().contains("PRIVATE_SENTINEL")||signed.toString().contains("https://"),"Signed request rendering must remain redacted");
    }

    private static void assertWireDeadline(ObjectStorage.SignedRequest signed,Duration requested){
        String date=null,duration=null;int dates=0,durations=0;
        for(var pair:URI.create(signed.url()).getRawQuery().split("&")){
            if(pair.startsWith("X-Amz-Date=")){date=pair.substring("X-Amz-Date=".length());dates++;}
            if(pair.startsWith("X-Amz-Expires=")){duration=pair.substring("X-Amz-Expires=".length());durations++;}
        }
        assertTrue(dates==1&&durations==1,"Signature must carry one date and duration");
        assertTrue(date!=null&&date.matches("[0-9]{8}T[0-9]{6}Z")&&duration!=null&&duration.matches("[0-9]+"),"Temporal signature fields must use their wire format");
        // Parse the wire fields independently of the production formatter.
        var signedAt=Instant.parse(date.substring(0,4)+"-"+date.substring(4,6)+"-"+date.substring(6,8)+"T"
            +date.substring(9,11)+":"+date.substring(11,13)+":"+date.substring(13,15)+"Z");
        long seconds=Long.parseLong(duration);
        assertTrue(seconds==requested.getSeconds(),"Configured signing duration must remain unchanged");
        assertTrue(signed.expiresAt().equals(signedAt.plusSeconds(seconds)),"Metadata must match the deadline in the signed request");
        assertTrue(signed.expiresAt().getNano()==0,"Wire deadline has whole-second precision");
    }

    private static S3ObjectStorage storage(){
        return new S3ObjectStorage(new AssetStorageProperties(true,URI.create("http://127.0.0.1:1"),URI.create("http://localhost:1"),
            "us-east-1","synthetic-access","synthetic-secret","isolated-editorial","isolated-private",true,
            1024,1024,10,10240,300,60,16000000,4096,60));
    }
}
