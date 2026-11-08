package com.chatgptcourses.assets.storage;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.S3Exception;

/** Local/test operator command; does not start Spring, migrations, workers or a web server. */
public final class LocalStorageBootstrap {
    private LocalStorageBootstrap(){ }
    public static void main(String[] args){
        try{if(args.length!=0)throw new IllegalArgumentException();initialize(System.getenv());System.out.println("LOCAL_STORAGE_READY");}
        catch(Exception unavailable){System.err.println("LOCAL_STORAGE_BOOTSTRAP_FAILED");System.exit(1);}
    }
    public static void initialize(Map<String,String> environment){
        String mode=environment.get("APP_ENV");check("local".equals(mode)||"test".equals(mode));URI internal=loopback(environment.get("S3_ENDPOINT"));loopback(environment.get("S3_EXTERNAL_ENDPOINT"));String origin=loopback(environment.get("APP_PUBLIC_ORIGIN")).toString().replaceAll("/$","");
        String editorial=bucket(environment.get("S3_PUBLIC_BUCKET")),personal=bucket(environment.get("S3_PRIVATE_BUCKET"));check(!editorial.equals(personal));check("true".equals(environment.getOrDefault("S3_PATH_STYLE","true")));
        var credentials=StaticCredentialsProvider.create(AwsBasicCredentials.create(required(environment,"S3_ACCESS_KEY"),required(environment,"S3_SECRET_KEY")));
        try(var client=S3Client.builder().credentialsProvider(credentials).region(Region.of(required(environment,"S3_REGION"))).endpointOverride(internal).serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(3)).socketTimeout(Duration.ofSeconds(10))).overrideConfiguration(c->c.apiCallTimeout(Duration.ofSeconds(15))).build()){
            for(String name:new String[]{editorial,personal}){
                try{client.headBucket(b->b.bucket(name));}catch(S3Exception missing){if(missing.statusCode()!=404)throw new StorageUnavailableException();try{client.createBucket(b->b.bucket(name));}catch(S3Exception race){if(race.statusCode()!=409)throw new StorageUnavailableException();client.headBucket(b->b.bucket(name));}}
                // Default bucket/object ACL stays private; no public ACL is ever requested here.
                client.putBucketCors(b->b.bucket(name).corsConfiguration(c->c.corsRules(rule->rule.allowedOrigins(origin).allowedMethods("GET","PUT","HEAD").allowedHeaders("Content-Type").exposeHeaders("ETag").maxAgeSeconds(0))));
            }
        }catch(RuntimeException unavailable){throw new StorageUnavailableException();}
    }
    private static URI loopback(String value){try{URI uri=URI.create(value);check("http".equals(uri.getScheme())&&("localhost".equals(uri.getHost())||"127.0.0.1".equals(uri.getHost()))&&uri.getUserInfo()==null&&uri.getQuery()==null&&uri.getFragment()==null&&(uri.getPath().isEmpty()||uri.getPath().equals("/"))&&(uri.getPort()==-1||uri.getPort()>0&&uri.getPort()<=65535));return uri;}catch(RuntimeException invalid){throw new IllegalArgumentException("Local storage configuration is invalid");}}
    private static String bucket(String value){check(value!=null&&value.matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")&&!value.contains(".."));return value;}
    private static String required(Map<String,String> environment,String name){String value=environment.get(name);check(value!=null&&!value.isBlank()&&!value.contains("\n")&&!value.contains("\r"));return value;}
    private static void check(boolean valid){if(!valid)throw new IllegalArgumentException("Local storage configuration is invalid");}
}
