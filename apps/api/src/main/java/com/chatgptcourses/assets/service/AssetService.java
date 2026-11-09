package com.chatgptcourses.assets.service;

import static com.chatgptcourses.assets.service.AssetAccessPolicy.*;
import static com.chatgptcourses.assets.service.AssetTypes.*;
import com.chatgptcourses.assets.config.AssetStorageProperties;
import com.chatgptcourses.assets.storage.ObjectStorage;
import com.chatgptcourses.assets.storage.StorageObjectTooLargeException;
import com.chatgptcourses.assets.storage.StorageUnavailableException;
import com.chatgptcourses.assets.validation.AssetContentValidator;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.editorial.service.EditorialMediaRegistry;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AssetService implements EditorialMediaRegistry {
    private final JdbcTemplate jdbc;private final AssetAccessPolicy policy;private final ObjectStorage storage;private final AssetStorageProperties properties;private final AssetContentValidator validator;
    public AssetService(JdbcTemplate jdbc,AssetAccessPolicy policy,ObjectStorage storage,AssetStorageProperties properties,AssetContentValidator validator){this.jdbc=jdbc;this.policy=policy;this.storage=storage;this.properties=properties;this.validator=validator;}
    @Transactional(readOnly=true)
    public UploadCapabilities projectPolicy(UUID actor,UUID projectId){policy.project(actor,projectId,"assets.read",false);return capabilities(false);}
    @Transactional(readOnly=true)
    public UploadCapabilities editorialPolicy(UUID actor){policy.require(actor,"content.read");return capabilities(true);}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public AssetPage listProject(UUID actor,UUID projectId,int page,int pageSize){
        policy.project(actor,projectId,"assets.read",false);check(page>=0&&page<=1_000_000&&pageSize>=1&&pageSize<=100);
        long total=jdbc.queryForObject("SELECT count(*) FROM assets WHERE project_id=? AND owner_id=?",Long.class,projectId,actor);
        var rows=jdbc.query("SELECT * FROM assets WHERE project_id=? AND owner_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?",this::row,projectId,actor,pageSize,(long)page*pageSize);
        return new AssetPage(rows.stream().map(this::view).toList(),page,pageSize,total);
    }
    @Transactional
    public UploadIntent createProjectIntent(UUID actor,UUID accountContext,UUID projectId,UploadRequest command){
        policy.mutation(actor,accountContext,"assets.write");enabled();validate(command,false);policy.project(actor,projectId,"assets.write",true);policy.mutation(actor,accountContext,"assets.write");
        var quota=jdbc.queryForMap("SELECT count(*) AS files,coalesce(sum(coalesce(verified_size,declared_size)),0) AS bytes FROM assets WHERE project_id=? AND(state='READY' OR(state='PENDING' AND expires_at>clock_timestamp()))",projectId);
        if(((Number)quota.get("files")).longValue()>=properties.maxFilesPerProject()||((Number)quota.get("bytes")).longValue()+command.sizeBytes()>properties.maxBytesPerProject())throw new ApiException(ApiError.ASSET_QUOTA_EXCEEDED);
        return intent(insert(actor,"PROJECT_FILE",projectId,null,null,null,command));
    }
    @Transactional
    public UploadIntent createEditorialIntent(UUID actor,UUID accountContext,EditorialUploadRequest command){
        policy.mutation(actor,accountContext,"content.write");enabled();check(command!=null);var upload=new UploadRequest(command.filename(),command.contentType(),command.sizeBytes());validate(upload,true);
        policy.editorialOrigin(command.resourceId(),command.versionId(),command.locale());
        jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(rs,n)->rs.getObject(1,UUID.class),actor);policy.mutation(actor,accountContext,"content.write");
        long count=jdbc.queryForObject("SELECT count(*) FROM assets WHERE owner_id=? AND scope='EDITORIAL' AND state='PENDING' AND expires_at>clock_timestamp()",Long.class,actor);
        if(count>=properties.maxFilesPerProject())throw new ApiException(ApiError.ASSET_QUOTA_EXCEEDED);
        return intent(insert(actor,"EDITORIAL",null,command.resourceId(),command.versionId(),command.locale(),upload));
    }
    @Transactional
    public AssetView confirmProject(UUID actor,UUID accountContext,UUID projectId,UUID assetId){
        policy.mutation(actor,accountContext,"assets.write");policy.project(actor,projectId,"assets.write",true);var asset=load(assetId,true);
        if(!"PROJECT_FILE".equals(asset.scope())||!actor.equals(asset.owner())||!projectId.equals(asset.project()))throw notFound();policy.mutation(actor,accountContext,"assets.write");return confirm(asset);
    }
    @Transactional
    public AssetView confirmEditorial(UUID actor,UUID accountContext,UUID assetId){
        policy.mutation(actor,accountContext,"content.write");var asset=load(assetId,true);if(!"EDITORIAL".equals(asset.scope()))throw notFound();policy.mutation(actor,accountContext,"content.write");return confirm(asset);
    }
    @Transactional(readOnly=true)
    public AssetView getEditorial(UUID actor,UUID assetId){policy.require(actor,"content.read");var asset=load(assetId,false);if(!"EDITORIAL".equals(asset.scope()))throw notFound();return view(asset);}
    @Transactional(readOnly=true)
    public DownloadAccess preview(UUID actor,UUID accountContext,UUID assetId){policy.mutation(actor,accountContext,"content.read");var asset=load(assetId,false);if(!"EDITORIAL".equals(asset.scope()))throw notFound();return access(asset);}
    @Transactional(readOnly=true)
    public DownloadAccess supportDownload(UUID actor,UUID accountContext,UUID ticketId,UUID assetId,boolean admin){policy.selectedSupportAttachment(actor,accountContext,ticketId,assetId,admin);var asset=load(assetId,false);if(!"PROJECT_FILE".equals(asset.scope()))throw notFound();return access(asset);}
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public DownloadAccess download(UUID actor,UUID accountContext,UUID assetId,AssetAccessContext context){
        policy.accountContext(actor,accountContext);
        var asset=load(assetId,false);
        if("PROJECT_FILE".equals(asset.scope())){if(!asset.owner().equals(actor))throw notFound();policy.project(actor,asset.project(),"assets.read",false);}
        else policy.editorialDownload(actor,asset.id(),asset.kind(),asset.locale(),context);
        return access(asset);
    }
    /** Publication hook: records are terminal/immutable. The author cannot mark an arbitrary UUID verified. */
    @Transactional(readOnly=true)
    public boolean readyEditorial(UUID assetId,String kind,String locale){
        if(!properties.enabled()||assetId==null||kind==null||locale==null)return false;
        var rows=jdbc.query("SELECT * FROM assets WHERE id=? AND scope='EDITORIAL' AND state='READY' AND kind=? AND locale=?",this::row,assetId,kind,locale);if(rows.isEmpty())return false;
        try{return objectMatches(rows.getFirst());}catch(StorageUnavailableException unavailable){return false;}
    }
    @Override public boolean ready(UUID resourceId,UUID versionId,String locale,UUID mediaId,String kind){return ("FILE".equals(kind)||"IMAGE".equals(kind))&&readyEditorial(mediaId,kind,locale);}
    private AssetView confirm(Asset asset){
        if(!"PENDING".equals(asset.state()))return view(asset);enabled();
        if(!asset.expiresAt().isAfter(now())){jdbc.update("UPDATE assets SET state='EXPIRED',revision=revision+1 WHERE id=?",asset.id());return view(load(asset.id(),false));}
        var staging=new ObjectStorage.Location(asset.bucket(),asset.stagingKey());
        try{
            var metadata=storage.head(staging);if(metadata.isEmpty())throw new ApiException(ApiError.UPLOAD_OBJECT_MISSING);
            if(metadata.get().sizeBytes()!=asset.declaredSize()||metadata.get().sizeBytes()>maximum(asset.kind()))return reject(asset,"SIZE_MISMATCH");
            if(!asset.declaredType().equals(metadata.get().contentType()))return reject(asset,"CONTENT_TYPE_MISMATCH");
            byte[] original=storage.read(staging,maximum(asset.kind()));
            if(original.length!=asset.declaredSize())return reject(asset,"SIZE_MISMATCH");
            var validation=validator.validate(original,asset.declaredType());if(!validation.accepted())return reject(asset,validation.rejectionCode());
            byte[] bytes=validation.bytes();if(bytes.length<1||bytes.length>maximum(asset.kind()))return reject(asset,"SIZE_EXCEEDED");
            storage.put(new ObjectStorage.Location(asset.bucket(),asset.readyKey()),bytes,validation.contentType(),disposition(asset.filename(),asset.kind()));
            jdbc.update("UPDATE assets SET state='READY',verified_content_type=?,verified_size=?,content_sha256=?,ready_at=greatest(created_at,clock_timestamp()),revision=revision+1 WHERE id=?",validation.contentType(),bytes.length,sha256(bytes),asset.id());
            // The still-valid staging PUT can only target the staging key. Cleanup is best effort.
            try{storage.deleteStaging(staging);}catch(StorageUnavailableException ignored){ }
            return view(load(asset.id(),false));
        }catch(StorageObjectTooLargeException e){return reject(asset,"SIZE_EXCEEDED");}
        catch(StorageUnavailableException e){throw new ApiException(ApiError.SERVICE_UNAVAILABLE);}
    }
    private AssetView reject(Asset asset,String code){jdbc.update("UPDATE assets SET state='REJECTED',rejection_code=?,revision=revision+1 WHERE id=?",code,asset.id());return view(load(asset.id(),false));}
    private DownloadAccess access(Asset asset){
        enabled();if(!"READY".equals(asset.state()))throw new ApiException(ApiError.ASSET_NOT_READY);
        Duration ttl=Duration.ofSeconds(properties.downloadTtlSeconds());String disposition=disposition(asset.filename(),asset.kind());
        try{if(!objectMatches(asset))throw new ApiException(ApiError.ASSET_NOT_READY);var signed=storage.presignGet(new ObjectStorage.Location(asset.bucket(),asset.readyKey()),asset.verifiedType(),disposition,ttl);return new DownloadAccess(asset.id(),"GET",signed.url(),Instant.now().plus(ttl),asset.verifiedType(),asset.filename(),"FILE".equals(asset.kind())?"attachment":"inline",asset.verifiedSize(),java.util.HexFormat.of().formatHex(asset.sha256()));}
        catch(StorageUnavailableException e){throw new ApiException(ApiError.SERVICE_UNAVAILABLE);}
    }
    private UploadIntent intent(Asset asset){
        try{var signed=storage.presignPut(new ObjectStorage.Location(asset.bucket(),asset.stagingKey()),asset.declaredType(),asset.declaredSize(),Duration.ofSeconds(properties.uploadTtlSeconds()));return new UploadIntent(view(asset),"PUT",signed.url(),signed.headers(),asset.expiresAt());}
        catch(StorageUnavailableException e){throw new ApiException(ApiError.SERVICE_UNAVAILABLE);}
    }
    private Asset insert(UUID actor,String scope,UUID project,UUID resource,UUID version,String locale,UploadRequest command){
        UUID id=UUID.randomUUID();String kind=command.contentType().startsWith("image/")?"IMAGE":"FILE",bucket="PROJECT_FILE".equals(scope)?properties.privateBucket():properties.editorialBucket();
        Instant issuedAt=now();
        jdbc.update("INSERT INTO assets(id,owner_id,scope,kind,project_id,origin_resource_id,origin_version_id,locale,bucket_name,staging_key,ready_key,filename,declared_content_type,declared_size,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,actor,scope,kind,project,resource,version,locale,bucket,"staging/"+id+"/"+UUID.randomUUID(),"ready/"+id+"/"+UUID.randomUUID(),command.filename(),command.contentType(),command.sizeBytes(),java.sql.Timestamp.from(issuedAt),java.sql.Timestamp.from(issuedAt.plusSeconds(properties.uploadTtlSeconds())));return load(id,false);
    }
    private void validate(UploadRequest command,boolean editorial){
        check(command!=null&&command.filename()!=null&&command.filename().length()>=1&&command.filename().length()<=180&&command.filename().equals(command.filename().strip())&&!command.filename().contains("/")&&!command.filename().contains("\\")&&command.filename().codePoints().noneMatch(c->Character.isISOControl(c)||c>=0xd800&&c<=0xdfff));
        check(command.contentType()!=null&&command.sizeBytes()>0);String name=command.filename().toLowerCase(java.util.Locale.ROOT);
        boolean allowed=editorial?"image/png".equals(command.contentType())&&name.endsWith(".png")||"image/jpeg".equals(command.contentType())&&(name.endsWith(".jpg")||name.endsWith(".jpeg"))||"text/plain".equals(command.contentType())&&name.endsWith(".txt")
            :"text/plain".equals(command.contentType())&&name.endsWith(".txt")||"application/pdf".equals(command.contentType())&&name.endsWith(".pdf")&&validator.pdfAvailable();
        check(allowed&&command.sizeBytes()<=maximum(command.contentType().startsWith("image/")?"IMAGE":"FILE"));
    }
    private UploadCapabilities capabilities(boolean editorial){
        var text=new AcceptedFormat("text/plain",List.of(".txt"),"FILE",properties.maxFileBytes(),properties.enabled(),properties.enabled()?null:"STORAGE_NOT_CONFIGURED");
        var pdf=new AcceptedFormat("application/pdf",List.of(".pdf"),"FILE",properties.maxFileBytes(),properties.enabled()&&validator.pdfAvailable(),validator.pdfAvailable()?properties.enabled()?null:"STORAGE_NOT_CONFIGURED":"DOCUMENT_VALIDATOR_UNAVAILABLE");
        List<AcceptedFormat> formats=editorial?List.of(text,new AcceptedFormat("image/png",List.of(".png"),"IMAGE",properties.maxImageBytes(),properties.enabled(),properties.enabled()?null:"STORAGE_NOT_CONFIGURED"),new AcceptedFormat("image/jpeg",List.of(".jpg",".jpeg"),"IMAGE",properties.maxImageBytes(),properties.enabled(),properties.enabled()?null:"STORAGE_NOT_CONFIGURED"),pdf):List.of(text,pdf);
        return new UploadCapabilities(properties.enabled(),properties.enabled()?null:"STORAGE_NOT_CONFIGURED",formats,editorial?Math.max(properties.maxFileBytes(),properties.maxImageBytes()):properties.maxFileBytes(),properties.maxFilesPerProject(),properties.maxBytesPerProject(),properties.uploadTtlSeconds(),properties.downloadTtlSeconds());
    }
    private Asset load(UUID id,boolean lock){if(id==null)throw notFound();var rows=jdbc.query("SELECT * FROM assets WHERE id=?"+(lock?" FOR UPDATE":""),this::row,id);if(rows.isEmpty())throw notFound();return rows.getFirst();}
    private Asset row(ResultSet rs,int index)throws SQLException{return new Asset(rs.getObject("id",UUID.class),rs.getObject("owner_id",UUID.class),rs.getString("scope"),rs.getString("kind"),rs.getObject("project_id",UUID.class),rs.getString("locale"),rs.getString("bucket_name"),rs.getString("staging_key"),rs.getString("ready_key"),rs.getString("filename"),rs.getString("declared_content_type"),rs.getLong("declared_size"),rs.getString("verified_content_type"),rs.getObject("verified_size",Long.class),rs.getBytes("content_sha256"),rs.getString("state"),rs.getString("rejection_code"),rs.getLong("revision"),rs.getTimestamp("expires_at").toInstant(),rs.getTimestamp("created_at").toInstant(),rs.getTimestamp("ready_at")==null?null:rs.getTimestamp("ready_at").toInstant());}
    private AssetView view(Asset a){return new AssetView(a.id(),a.revision(),a.scope(),a.kind(),a.state(),a.filename(),a.verifiedType()==null?a.declaredType():a.verifiedType(),a.verifiedSize()==null?a.declaredSize():a.verifiedSize(),a.locale(),a.project(),a.createdAt(),a.readyAt(),a.rejection(),"READY".equals(a.state())?"FORMAT_VERIFIED":"REJECTED".equals(a.state())?"REJECTED":"PENDING");}
    private long maximum(String kind){return "IMAGE".equals(kind)?properties.maxImageBytes():properties.maxFileBytes();}
    private boolean objectMatches(Asset asset){var actual=storage.head(new ObjectStorage.Location(asset.bucket(),asset.readyKey()));return actual.isPresent()&&actual.get().sizeBytes()==asset.verifiedSize()&&asset.verifiedType().equals(actual.get().contentType());}
    private Instant now(){return jdbc.queryForObject("SELECT clock_timestamp()",java.sql.Timestamp.class).toInstant();}
    private void enabled(){if(!properties.enabled())throw new ApiException(ApiError.SERVICE_UNAVAILABLE);}
    private static byte[] sha256(byte[] bytes){try{return MessageDigest.getInstance("SHA-256").digest(bytes);}catch(NoSuchAlgorithmException e){throw new IllegalStateException("SHA-256 unavailable");}}
    private static String disposition(String filename,String kind){String extension=filename.substring(filename.lastIndexOf('.')+1).toLowerCase(java.util.Locale.ROOT);return ("FILE".equals(kind)?"attachment":"inline")+"; filename=\"download."+extension+"\"; filename*=UTF-8''"+URLEncoder.encode(filename,StandardCharsets.UTF_8).replace("+","%20");}
    private record Asset(UUID id,UUID owner,String scope,String kind,UUID project,String locale,String bucket,String stagingKey,String readyKey,String filename,String declaredType,long declaredSize,String verifiedType,Long verifiedSize,byte[] sha256,String state,String rejection,long revision,Instant expiresAt,Instant createdAt,Instant readyAt){@Override public String toString(){return "Asset[redacted]";}}
}
