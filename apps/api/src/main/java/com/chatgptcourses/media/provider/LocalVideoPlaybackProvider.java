package com.chatgptcourses.media.provider;

import com.chatgptcourses.media.config.MediaProperties;
import com.chatgptcourses.shared.config.RuntimeProperties;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.io.IOException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;

@Component
public class LocalVideoPlaybackProvider implements VideoPlaybackProvider {
    private final MediaProperties properties;
    private final Path root;
    @Autowired public LocalVideoPlaybackProvider(MediaProperties properties,RuntimeProperties runtime){this(properties,runtime.environment());}
    public LocalVideoPlaybackProvider(MediaProperties properties,String environment){
        this.properties=properties;
        if(properties.enabled()&&!Set.of("local","test").contains(environment))throw new IllegalArgumentException("Local test video is forbidden outside local/test");
        try{if(properties.enabled()){if(!privatePath(properties.localRoot().toAbsolutePath().normalize()))throw new IOException();Files.createDirectories(properties.localRoot());root=properties.localRoot().toRealPath();if(!Files.isDirectory(root)||!privatePath(root))throw new IOException();}else root=null;}
        catch(IOException invalid){throw new IllegalArgumentException("Private VIDEO_LOCAL_ROOT is unavailable");}
    }
    @Override public boolean available(){return properties.enabled()&&root!=null;}
    public Clip inspectSource(Path source){if(!available())throw new ApiException(ApiError.SERVICE_UNAVAILABLE);try{Path file=source.toRealPath();if(!Files.isRegularFile(file))throw new IOException();var value=Mp4Probe.inspect(file,properties.maxVideoBytes());return new Clip(file,value.durationSeconds(),value.sizeBytes(),value.sha256());}catch(IOException invalid){throw new ApiException(ApiError.VALIDATION_FAILED);}}
    @Override public Clip importClip(UUID id,Path source){
        if(!available())throw new ApiException(ApiError.SERVICE_UNAVAILABLE);
        try{var sourceReal=source.toRealPath();if(!Files.isRegularFile(sourceReal))throw new IOException();var metadata=Mp4Probe.inspect(sourceReal,properties.maxVideoBytes());Path target=target(id);
            if(!Files.exists(target,LinkOption.NOFOLLOW_LINKS)){try{Files.copy(sourceReal,target);}catch(FileAlreadyExistsException raced){/* Resolve and compare the immutable winner below. */}}
            if(Files.isSymbolicLink(target)||!target.toRealPath().startsWith(root))throw new IOException();var actual=Mp4Probe.inspect(target,properties.maxVideoBytes());if(!actual.sha256().equals(metadata.sha256()))throw new ApiException(ApiError.CONFLICT);
            return new Clip(target,actual.durationSeconds(),actual.sizeBytes(),actual.sha256());
        }catch(IOException invalid){throw new ApiException(ApiError.VALIDATION_FAILED);}
    }
    @Override public Optional<Clip> resolve(UUID id,long expectedSize,String expectedHash){
        if(!available()||id==null)return Optional.empty();try{Path file=target(id);if(!Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)||Files.isSymbolicLink(file)||!file.toRealPath().startsWith(root))return Optional.empty();var actual=Mp4Probe.inspect(file,properties.maxVideoBytes());return actual.sizeBytes()==expectedSize&&actual.sha256().equals(expectedHash)?Optional.of(new Clip(file,actual.durationSeconds(),actual.sizeBytes(),actual.sha256())):Optional.empty();}catch(IOException invalid){return Optional.empty();}
    }
    private Path target(UUID id){if(id==null)throw new ApiException(ApiError.VALIDATION_FAILED);return root.resolve(id+".mp4").normalize();}
    private static boolean privatePath(Path path){for(Path segment:path){String name=segment.toString().toLowerCase(java.util.Locale.ROOT);if(name.equals("public")||name.equals("static")||name.equals(".next"))return false;}return true;}
}
