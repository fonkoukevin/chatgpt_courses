package com.chatgptcourses.media.config;

import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("courses.media")
public record MediaProperties(@DefaultValue("false")boolean enabled,String provider,Path localRoot,Path importManifest,
        @DefaultValue("60")int linkTtlSeconds,@DefaultValue("20971520")long maxVideoBytes){
    public MediaProperties{
        if(linkTtlSeconds<1||linkTtlSeconds>60||maxVideoBytes<1||maxVideoBytes>134217728)throw new IllegalArgumentException("Invalid local video limits");
        if(enabled&&(!"local-test".equals(provider)||localRoot==null||!localRoot.isAbsolute()))throw new IllegalArgumentException("Local video requires provider local-test and an absolute private VIDEO_LOCAL_ROOT");
    }
    @Override public String toString(){return "MediaProperties[redacted]";}
}
