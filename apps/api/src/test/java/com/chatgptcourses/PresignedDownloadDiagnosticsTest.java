package com.chatgptcourses;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

/** Pure synthetic checks: no Spring, containers, HTTP client or persisted fake incident. */
class PresignedDownloadDiagnosticsTest {
    private static final String PRIVATE="PRIVATE_SENTINEL_MUST_NOT_LEAVE_INPUT";
    private static final URI SIGNED=URI.create("https://"+PRIVATE+".invalid/private-bucket/private-user/object?X-Amz-Date=20261127T123456Z&X-Amz-Expires=2&X-Amz-Credential="+PRIVATE+"&X-Amz-Signature="+PRIVATE+"&X-Amz-Security-Token="+PRIVATE);
    private static final PresignedDownloadDiagnostics.Timing TIMING=new PresignedDownloadDiagnostics.Timing(
        Instant.parse("2026-11-27T12:34:56.100Z"),Instant.parse("2026-11-27T12:34:56.200Z"),
        Instant.parse("2026-11-27T12:34:58.300Z"),100_000_000L,2_100_000_000L);

    @Test void unexpectedStatusKeepsOnlyApprovedMetadataAndKnownS3Code()throws Exception{
        for(var code:List.of("AccessDenied","RequestTimeTooSkewed","SignatureDoesNotMatch","ExpiredToken","RequestExpired","InvalidAccessKeyId")){
            var captures=new ArrayList<Map<String,Object>>();
            PresignedDownloadDiagnostics.captureIfUnexpected(403,"Fri, 27 Nov 2026 12:34:58 GMT",
                bytes("<Error><Code>"+code+"</Code><Message>"+PRIVATE+"</Message><Resource>/private-user/object</Resource><RequestId>"+PRIVATE+"</RequestId></Error>"),SIGNED,TIMING,captures::add);
            assertPrivateInputsAbsent(captures);
            assertTrue(captures.size()==1,"One metadata capture for the single unexpected read");
            var report=captures.getFirst();
            assertTrue(Integer.valueOf(403).equals(report.get("httpStatus")));
            assertTrue("2026-11-27T12:34:58Z".equals(report.get("s3Date")));
            assertTrue("2026-11-27T12:34:56Z".equals(report.get("signedAt")));
            assertTrue("2026-11-27T12:34:58Z".equals(report.get("signedExpiresAt")));
            assertTrue(code.equals(report.get("s3Code")));
            assertTrue(Boolean.TRUE.equals(report.get("s3DateAvailable"))&&Boolean.TRUE.equals(report.get("signatureTimesAvailable"))&&Boolean.TRUE.equals(report.get("s3CodeAvailable")));
            assertTrue(Long.valueOf(100_000_000L).equals(report.get("linkToGetNanos"))&&Long.valueOf(2_100_000_000L).equals(report.get("getElapsedNanos")));
        }
    }

    @Test void malformedOrUntrustedInputsDoNotPreventTimingCaptureOrEscapeAsDiagnostics()throws Exception{
        var inputs=List.of("<Error><Code>"+PRIVATE+"</Code><Message>"+PRIVATE+"</Message></Error>",
            "<html>"+PRIVATE+"</html>","<Error><Code>AccessDenied</Code>",
            "<!DOCTYPE Error [<!ENTITY secret SYSTEM 'file:///"+PRIVATE+"'>]><Error><Code>&secret;</Code></Error>");
        for(var body:inputs){
            var captures=new ArrayList<Map<String,Object>>();
            var malformed=URI.create("https://"+PRIVATE+".invalid/private-user/object?X-Amz-Date="+PRIVATE+"&X-Amz-Expires=2&X-Amz-Signature="+PRIVATE);
            PresignedDownloadDiagnostics.captureIfUnexpected(403,PRIVATE,bytes(body),malformed,TIMING,captures::add);
            assertPrivateInputsAbsent(captures);
            assertTrue(captures.size()==1);
            var report=captures.getFirst();
            assertTrue(Boolean.FALSE.equals(report.get("s3DateAvailable"))&&Boolean.FALSE.equals(report.get("signatureTimesAvailable"))&&Boolean.FALSE.equals(report.get("s3CodeAvailable")));
            assertTrue("2026-11-27T12:34:58.300Z".equals(report.get("getFinishedAt")));
            assertFalse(report.containsKey("s3Code")||report.containsKey("signedAt")||report.containsKey("signedExpiresAt")||report.containsKey("s3Date"));
        }
    }

    @Test void expectedSuccessIsNotCapturedAndSinkFailureCannotReplaceStatusAssertion(){
        var calls=new java.util.concurrent.atomic.AtomicInteger();
        assertTrue(PresignedDownloadDiagnostics.collectIfUnexpected(200,null,null,null,null).isEmpty());
        assertDoesNotThrow(()->PresignedDownloadDiagnostics.captureIfUnexpected(200,null,null,null,null,value->{calls.incrementAndGet();throw new java.io.IOException(PRIVATE);}));
        assertTrue(calls.get()==0,"A successful response creates no incident");
        assertDoesNotThrow(()->PresignedDownloadDiagnostics.captureIfUnexpected(403,null,bytes("invalid"),SIGNED,TIMING,value->{calls.incrementAndGet();throw new java.io.IOException(PRIVATE);}));
        assertTrue(calls.get()==1,"A failed sink is attempted once and never retried");
    }

    @Test void expiryIndicationRequiresTheExactKnownCodeAndMessage()throws Exception{
        for(var sample:List.of(
            new String[]{"AccessDenied","Request has expired","true"},
            new String[]{"AccessDenied","Request has expired ","false"},
            new String[]{"AccessDenied",PRIVATE,"false"},
            new String[]{"SignatureDoesNotMatch","Request has expired","false"})){
            var report=PresignedDownloadDiagnostics.collectObservation(403,null,
                bytes("<Error><Code>"+sample[0]+"</Code><Message>"+sample[1]+"</Message></Error>"),SIGNED,TIMING);
            assertPrivateInputsAbsent(List.of(report));
            assertTrue(Boolean.valueOf(sample[2]).equals(report.get("s3ExpiryIndicated")));
        }
    }

    @Test void successfulXmlContentCannotBeInterpretedAsAStorageError()throws Exception{
        var report=PresignedDownloadDiagnostics.collectObservation(200,"Fri, 27 Nov 2026 12:34:58 GMT",
            bytes("<Error><Code>AccessDenied</Code><Message>Request has expired</Message><Private>"+PRIVATE+"</Private></Error>"),SIGNED,TIMING);
        assertPrivateInputsAbsent(List.of(report));
        assertTrue(Boolean.FALSE.equals(report.get("s3CodeAvailable"))&&Boolean.FALSE.equals(report.get("s3ExpiryIndicated")));
        assertFalse(report.containsKey("s3Code"),"A successful file is content, never an S3 error response");
    }

    private static byte[] bytes(String value){return value.getBytes(StandardCharsets.UTF_8);}
    private static void assertPrivateInputsAbsent(List<Map<String,Object>> captures)throws Exception{
        String serialized=new ObjectMapper().writeValueAsString(captures);
        // Assert booleans first: a failed privacy guard never prints the unsafe candidate report.
        assertFalse(serialized.contains(PRIVATE),"No private sentinel in captured metadata");
        assertFalse(serialized.contains("private-user")||serialized.contains("private-bucket")||serialized.contains("https://")||serialized.contains("file:///"),"No identity, object path or URL in captured metadata");
        assertFalse(serialized.contains("X-Amz-")||serialized.contains("Credential")||serialized.contains("Security-Token")||serialized.contains("<Error>")||serialized.contains("Message")||serialized.contains("RequestId"),"No raw signature, body or header data in captured metadata");
    }
}
