package com.chatgptcourses.assets.http;

import com.chatgptcourses.assets.service.AssetTypes;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Explicit transport. Never exposes the registry bucket, staging key, ready key or owner. */
public final class AssetDtos {
    private AssetDtos(){ }
    public record UploadRequest(@NotBlank @Size(max=180) String filename,@NotNull @Pattern(regexp="text/plain|application/pdf|image/png|image/jpeg") String contentType,@NotNull @Min(1) @Max(20971520) Long sizeBytes){
        AssetTypes.UploadRequest command(){return new AssetTypes.UploadRequest(filename,contentType,sizeBytes);}
        @Override public String toString(){return "UploadRequest[redacted]";}
    }
    public record EditorialUploadRequest(@NotNull UUID resourceId,@NotNull UUID versionId,@NotNull @Pattern(regexp="fr|en") String locale,@NotBlank @Size(max=180) String filename,@NotNull @Pattern(regexp="text/plain|application/pdf|image/png|image/jpeg") String contentType,@NotNull @Min(1) @Max(20971520) Long sizeBytes){
        AssetTypes.EditorialUploadRequest command(){return new AssetTypes.EditorialUploadRequest(resourceId,versionId,locale,filename,contentType,sizeBytes);}
        @Override public String toString(){return "EditorialUploadRequest[redacted]";}
    }
    public record ConfirmUpload(@NotNull UUID assetId){ }
    public record AssetAccessContext(@NotNull @Pattern(regexp="fr|en") String locale,@NotNull UUID resourceId,@NotNull UUID versionId,UUID enrollmentId){
        AssetTypes.AssetAccessContext command(){return new AssetTypes.AssetAccessContext(locale,resourceId,versionId,enrollmentId);}
    }
    public record AssetView(UUID id,long revision,String scope,String kind,String state,String filename,String contentType,long sizeBytes,String locale,UUID projectId,Instant createdAt,Instant readyAt,String rejectionCode,String validationStatus){
        public static AssetView from(AssetTypes.AssetView v){return new AssetView(v.id(),v.revision(),v.scope(),v.kind(),v.state(),v.filename(),v.contentType(),v.sizeBytes(),v.locale(),v.projectId(),v.createdAt(),v.readyAt(),v.rejectionCode(),v.validationStatus());}
        @Override public String toString(){return "AssetView[redacted]";}
    }
    public record UploadIntent(AssetView asset,String method,String uploadUrl,Map<String,String> headers,Instant expiresAt){
        public static UploadIntent from(AssetTypes.UploadIntent v){return new UploadIntent(AssetView.from(v.asset()),v.method(),v.uploadUrl(),v.headers(),v.expiresAt());}
        @Override public String toString(){return "UploadIntent[redacted]";}
    }
    public record AssetPage(List<AssetView> items,int page,int pageSize,long total){public static AssetPage from(AssetTypes.AssetPage v){return new AssetPage(v.items().stream().map(AssetView::from).toList(),v.page(),v.pageSize(),v.total());}}
    public record DownloadAccess(UUID assetId,String method,String url,Instant expiresAt,String contentType,String filename,String disposition,long sizeBytes,String sha256){
        public static DownloadAccess from(AssetTypes.DownloadAccess v){return new DownloadAccess(v.assetId(),v.method(),v.url(),v.expiresAt(),v.contentType(),v.filename(),v.disposition(),v.sizeBytes(),v.sha256());}
        @Override public String toString(){return "DownloadAccess[redacted]";}
    }
    public record AcceptedFormat(String contentType,List<String> extensions,String kind,long maxBytes,boolean available,String unavailableReason){public static AcceptedFormat from(AssetTypes.AcceptedFormat v){return new AcceptedFormat(v.contentType(),v.extensions(),v.kind(),v.maxBytes(),v.available(),v.unavailableReason());}}
    public record UploadCapabilities(boolean enabled,String unavailableReason,List<AcceptedFormat> formats,long maxFileBytes,int maxFilesPerProject,long maxBytesPerProject,int uploadTtlSeconds,int downloadTtlSeconds){
        public static UploadCapabilities from(AssetTypes.UploadCapabilities v){return new UploadCapabilities(v.enabled(),v.unavailableReason(),v.formats().stream().map(AcceptedFormat::from).toList(),v.maxFileBytes(),v.maxFilesPerProject(),v.maxBytesPerProject(),v.uploadTtlSeconds(),v.downloadTtlSeconds());}
    }
}
