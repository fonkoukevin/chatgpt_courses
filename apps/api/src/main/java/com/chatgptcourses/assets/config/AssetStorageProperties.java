package com.chatgptcourses.assets.config;

import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("courses.assets")
public record AssetStorageProperties(
    @DefaultValue("false") boolean enabled,URI internalEndpoint,URI externalEndpoint,
    @DefaultValue("us-east-1") String region,String accessKey,String secretKey,String editorialBucket,String privateBucket,
    @DefaultValue("true") boolean pathStyle,
    @DefaultValue("5242880") long maxFileBytes,@DefaultValue("10485760") long maxImageBytes,
    @DefaultValue("10") int maxFilesPerProject,@DefaultValue("20971520") long maxBytesPerProject,
    @DefaultValue("300") int uploadTtlSeconds,@DefaultValue("60") int downloadTtlSeconds,
    @DefaultValue("16000000") long maxImagePixels,@DefaultValue("4096") int maxImageDimension,@DefaultValue("60") int stagingCleanupGraceSeconds) {
    public AssetStorageProperties {
        if(maxFileBytes<1||maxFileBytes>20*1024*1024||maxImageBytes<1||maxImageBytes>20*1024*1024||maxFilesPerProject<1||maxFilesPerProject>100||maxBytesPerProject<1||maxBytesPerProject>1024L*1024*1024||uploadTtlSeconds<1||uploadTtlSeconds>900||downloadTtlSeconds<1||downloadTtlSeconds>300||maxImagePixels<1||maxImagePixels>40_000_000||maxImageDimension<1||maxImageDimension>16384||stagingCleanupGraceSeconds<0||stagingCleanupGraceSeconds>3600)throw new IllegalArgumentException("Invalid asset policy configuration");
        if(enabled&&(!endpoint(internalEndpoint,false)||!endpoint(externalEndpoint,true)||!text(region)||!text(accessKey)||!text(secretKey)||!bucket(editorialBucket)||!bucket(privateBucket)||editorialBucket.equals(privateBucket)))throw new IllegalArgumentException("Incomplete asset storage configuration");
    }
    private static boolean text(String v){return v!=null&&!v.isBlank()&&!v.contains("\n")&&!v.contains("\r");}
    private static boolean bucket(String v){return v!=null&&v.matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")&&!v.contains("..");}
    private static boolean endpoint(URI v,boolean external){return v!=null&&v.getHost()!=null&&(!external||!v.getHost().equals("s3"))&&v.getUserInfo()==null&&v.getQuery()==null&&v.getFragment()==null&&(v.getPath().isEmpty()||v.getPath().equals("/"))&&("https".equals(v.getScheme())||"http".equals(v.getScheme())&&("127.0.0.1".equals(v.getHost())||"localhost".equals(v.getHost())||v.getHost().equals("[::1]")||v.getHost().equals("::1")||!external&&v.getHost().equals("s3")));}
    @Override public String toString(){return "AssetStorageProperties[redacted]";}
}
