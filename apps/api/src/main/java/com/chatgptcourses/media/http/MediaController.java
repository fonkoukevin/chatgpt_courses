package com.chatgptcourses.media.http;

import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.media.service.MediaService;
import com.chatgptcourses.media.service.MediaTypes;
import com.chatgptcourses.methods.http.MethodDtos;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.ApiProblems;
import com.chatgptcourses.shared.http.EntityTags;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/v1")
class MediaController {
    private final MediaService service;
    MediaController(MediaService service){this.service=service;}
    @GetMapping("/media/{mediaId}")
    ResponseEntity<MediaDtos.Metadata> metadata(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID mediaId,
            @RequestParam UUID resourceId,@RequestParam UUID versionId,@RequestParam @Pattern(regexp="fr|en")String locale,@RequestParam(required=false)UUID enrollmentId){return privateResponse(MediaDtos.Metadata.from(service.metadata(actor(principal),mediaId,new MediaTypes.MediaAccessContext(locale,resourceId,versionId,enrollmentId))));}
    @PostMapping("/media/{mediaId}/playback-access")
    ResponseEntity<MediaDtos.Playback> playback(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID mediaId,
            @RequestHeader(value="X-Account-Context",required=false) @Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN)String accountContext,
            @Valid @RequestBody MediaDtos.Context context){return privateResponse(MediaDtos.Playback.from(service.playback(actor(principal),context(accountContext),mediaId,context.command())));}
    @GetMapping("/me/media-progress/{mediaId}")
    ResponseEntity<MediaDtos.Progress> progress(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID mediaId,
            @RequestParam UUID resourceId,@RequestParam UUID versionId,@RequestParam @Pattern(regexp="fr|en")String locale,@RequestParam(required=false)UUID enrollmentId){return progressResponse(service.progress(required(principal),mediaId,new MediaTypes.MediaAccessContext(locale,resourceId,versionId,enrollmentId)));}
    @PutMapping("/me/media-progress/{mediaId}")
    ResponseEntity<MediaDtos.Progress> progress(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID mediaId,
            @RequestHeader(value="X-Account-Context",required=false) @Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN)String accountContext,
            @RequestHeader(value=HttpHeaders.IF_MATCH,required=false)String ifMatch,@Valid @RequestBody MediaDtos.SetProgress command){return progressResponse(service.setProgress(required(principal),context(accountContext),mediaId,ifMatch,command.command()));}
    @GetMapping("/media/{mediaId}/stream")
    ResponseEntity<StreamingResponseBody> stream(@PathVariable UUID mediaId,@RequestParam String grant,@RequestHeader(value=HttpHeaders.RANGE,required=false)String range,HttpServletRequest request){
        var clip=service.open(mediaId,grant);long[] interval=range(range,clip.sizeBytes());
        if(interval==null)throw new InvalidRange(clip.sizeBytes());
        long start=interval[0],length=interval[1]-start+1;boolean partial=range!=null;
        StreamingResponseBody body=output->{if(request.getMethod().equals("HEAD"))return;try(var channel=FileChannel.open(clip.file(),StandardOpenOption.READ)){channel.position(start);var buffer=ByteBuffer.allocate(65536);long remaining=length;while(remaining>0){buffer.clear();buffer.limit((int)Math.min(buffer.capacity(),remaining));int read=channel.read(buffer);if(read<0)throw new IOException("Video stream ended before verified size");output.write(buffer.array(),0,read);remaining-=read;}}};
        var result=ResponseEntity.status(partial?HttpStatus.PARTIAL_CONTENT:HttpStatus.OK).header(HttpHeaders.CACHE_CONTROL,"private, no-store").header(HttpHeaders.ACCEPT_RANGES,"bytes").header(HttpHeaders.CONTENT_DISPOSITION,"inline; filename=\"video.mp4\"").header("X-Content-Type-Options","nosniff").header("Referrer-Policy","no-referrer").contentType(MediaType.valueOf("video/mp4")).contentLength(length);
        if(partial)result.header(HttpHeaders.CONTENT_RANGE,"bytes "+start+"-"+interval[1]+"/"+clip.sizeBytes());return result.body(body);
    }
    @ExceptionHandler(InvalidRange.class)
    ResponseEntity<ProblemDetail> invalidRange(InvalidRange invalid,HttpServletRequest request){return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).header(HttpHeaders.CACHE_CONTROL,"private, no-store").header(HttpHeaders.CONTENT_RANGE,"bytes */"+invalid.size).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(ApiProblems.create(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,"RANGE_NOT_SATISFIABLE","La plage demandée est invalide.",request.getRequestURI()));}
    private static final class InvalidRange extends RuntimeException{final long size;InvalidRange(long size){super("Invalid video range");this.size=size;}}
    private static long[] range(String value,long size){if(value==null)return new long[]{0,size-1};try{var match=java.util.regex.Pattern.compile("bytes=(\\d*)-(\\d*)").matcher(value);if(!match.matches()||match.group(1).isEmpty()&&match.group(2).isEmpty())return null;long start,end;if(match.group(1).isEmpty()){long suffix=Long.parseLong(match.group(2));if(suffix<=0)return null;start=Math.max(0,size-suffix);end=size-1;}else{start=Long.parseLong(match.group(1));end=match.group(2).isEmpty()?size-1:Math.min(size-1,Long.parseLong(match.group(2)));}return start<0||start>=size||end<start?null:new long[]{start,end};}catch(NumberFormatException invalid){return null;}}
    private static UUID actor(IdentityUserDetails principal){return principal==null?null:principal.getUserId();}
    private static UUID required(IdentityUserDetails principal){UUID actor=actor(principal);if(actor==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return actor;}
    private static UUID context(String value){return value==null?null:UUID.fromString(value);}
    private static ResponseEntity<MediaDtos.Progress> progressResponse(MediaTypes.MediaProgressView value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").eTag(EntityTags.forRevision("media-progress",value.mediaId(),value.revision())).body(MediaDtos.Progress.from(value));}
    private static <T>ResponseEntity<T> privateResponse(T body){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(body);}
}
