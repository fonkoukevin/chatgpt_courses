package com.chatgptcourses.assets.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class AssetTypes {
    private AssetTypes(){ }
    public record UploadRequest(String filename,String contentType,long sizeBytes){@Override public String toString(){return "UploadRequest[redacted]";}}
    public record EditorialUploadRequest(UUID resourceId,UUID versionId,String locale,String filename,String contentType,long sizeBytes){ }
    public record AssetView(UUID id,long revision,String scope,String kind,String state,String filename,String contentType,long sizeBytes,String locale,UUID projectId,Instant createdAt,Instant readyAt,String rejectionCode,String validationStatus){ }
    public record UploadIntent(AssetView asset,String method,String uploadUrl,Map<String,String> headers,Instant expiresAt){@Override public String toString(){return "UploadIntent[redacted]";}}
    public record AssetPage(List<AssetView> items,int page,int pageSize,long total){ }
    public record AssetAccessContext(String locale,UUID resourceId,UUID versionId,UUID enrollmentId){ }
    public record DownloadAccess(UUID assetId,String method,String url,Instant expiresAt,String contentType,String filename,String disposition,long sizeBytes,String sha256){@Override public String toString(){return "DownloadAccess[redacted]";}}
    public record AcceptedFormat(String contentType,List<String> extensions,String kind,long maxBytes,boolean available,String unavailableReason){ }
    public record UploadCapabilities(boolean enabled,String unavailableReason,List<AcceptedFormat> formats,long maxFileBytes,int maxFilesPerProject,long maxBytesPerProject,int uploadTtlSeconds,int downloadTtlSeconds){ }
}
