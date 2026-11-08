package com.chatgptcourses.assets.storage;

import com.chatgptcourses.assets.config.AssetStorageProperties;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

/** Internal requests and browser signatures deliberately use different endpoints. No provider detail is logged. */
public final class S3ObjectStorage implements ObjectStorage,AutoCloseable {
    private final S3Client client;
    private final S3Presigner presigner;
    public S3ObjectStorage(AssetStorageProperties properties){
        var credentials=StaticCredentialsProvider.create(AwsBasicCredentials.create(properties.accessKey(),properties.secretKey()));
        var configuration=S3Configuration.builder().pathStyleAccessEnabled(properties.pathStyle()).build();
        client=S3Client.builder().credentialsProvider(credentials).region(Region.of(properties.region())).endpointOverride(properties.internalEndpoint()).serviceConfiguration(configuration)
            .httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(3)).socketTimeout(Duration.ofSeconds(10)))
            .overrideConfiguration(c->c.apiCallTimeout(Duration.ofSeconds(15)).apiCallAttemptTimeout(Duration.ofSeconds(12))).build();
        presigner=S3Presigner.builder().credentialsProvider(credentials).region(Region.of(properties.region())).endpointOverride(properties.externalEndpoint()).serviceConfiguration(configuration).build();
    }
    @Override public Optional<Metadata> head(Location location){
        try{var r=client.headObject(b->b.bucket(location.bucket()).key(location.key()));return Optional.of(new Metadata(r.contentLength(),r.contentType()));}
        catch(S3Exception e){if(e.statusCode()==404)return Optional.empty();throw new StorageUnavailableException();}
        catch(RuntimeException e){throw unavailable(e);}
    }
    @Override public byte[] read(Location location,long maximumBytes){
        if(maximumBytes<1||maximumBytes>Integer.MAX_VALUE-1)throw new IllegalArgumentException("Invalid object read bound");
        try(ResponseInputStream<GetObjectResponse> response=client.getObject(GetObjectRequest.builder().bucket(location.bucket()).key(location.key()).build())){
            if(response.response().contentLength()!=null&&response.response().contentLength()>maximumBytes)throw new StorageObjectTooLargeException();
            byte[] bytes=response.readNBytes((int)maximumBytes+1);if(bytes.length>maximumBytes)throw new StorageObjectTooLargeException();return bytes;
        }catch(StorageObjectTooLargeException e){throw e;}catch(IOException|RuntimeException e){throw unavailable(e);}
    }
    @Override public void put(Location location,byte[] bytes,String contentType,String disposition){
        try{client.putObject(PutObjectRequest.builder().bucket(location.bucket()).key(location.key()).contentType(contentType).contentDisposition(disposition).contentLength((long)bytes.length).cacheControl("private, no-store").build(),RequestBody.fromBytes(bytes));}
        catch(RuntimeException e){throw unavailable(e);}
    }
    @Override public SignedRequest presignPut(Location location,String contentType,long expectedBytes,Duration ttl){
        try{var object=PutObjectRequest.builder().bucket(location.bucket()).key(location.key()).contentType(contentType).contentLength(expectedBytes).build();
            var signed=presigner.presignPutObject(PutObjectPresignRequest.builder().signatureDuration(ttl).putObjectRequest(object).build());
            return new SignedRequest(signed.url().toExternalForm(),Map.of("Content-Type",contentType));
        }catch(RuntimeException e){throw unavailable(e);}
    }
    @Override public SignedRequest presignGet(Location location,String contentType,String disposition,Duration ttl){
        try{var object=GetObjectRequest.builder().bucket(location.bucket()).key(location.key()).responseContentType(contentType).responseContentDisposition(disposition).responseCacheControl("private, no-store").build();
            var signed=presigner.presignGetObject(GetObjectPresignRequest.builder().signatureDuration(ttl).getObjectRequest(object).build());return new SignedRequest(signed.url().toExternalForm(),Map.of());
        }catch(RuntimeException e){throw unavailable(e);}
    }
    @Override public void deleteStaging(Location location){
        if(!location.key().startsWith("staging/"))throw new IllegalArgumentException("Only staging objects may be removed");
        try{client.deleteObject(b->b.bucket(location.bucket()).key(location.key()));}catch(RuntimeException e){throw unavailable(e);}
    }
    private static StorageUnavailableException unavailable(Exception ignored){return new StorageUnavailableException();}
    @Override public void close(){try{presigner.close();}finally{client.close();}}
}
