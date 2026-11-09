package com.chatgptcourses.assets.http;

import com.chatgptcourses.assets.service.AssetService;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.methods.http.MethodDtos;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController @RequestMapping("/api/v1")
class AssetController {
    private final AssetService service;
    AssetController(AssetService service){this.service=service;}
    @GetMapping("/me/projects/{projectId}/file-policy")
    ResponseEntity<AssetDtos.UploadCapabilities> projectPolicy(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID projectId){return response(AssetDtos.UploadCapabilities.from(service.projectPolicy(actor(principal),projectId)),false,false);}
    @GetMapping("/me/projects/{projectId}/attachments")
    ResponseEntity<AssetDtos.AssetPage> list(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID projectId,@RequestParam(defaultValue="0") @Min(0) @Max(1000000) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int pageSize){return response(AssetDtos.AssetPage.from(service.listProject(actor(principal),projectId,page,pageSize)),false,false);}
    @PostMapping("/me/projects/{projectId}/upload-intents")
    ResponseEntity<AssetDtos.UploadIntent> projectIntent(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID projectId,
        @RequestHeader(value="X-Account-Context",required=false) @Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,@Valid @RequestBody AssetDtos.UploadRequest request){return response(AssetDtos.UploadIntent.from(service.createProjectIntent(actor(principal),context(accountContext),projectId,request.command())),true,false);}
    @PostMapping("/me/projects/{projectId}/attachments")
    ResponseEntity<AssetDtos.AssetView> projectConfirm(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID projectId,
        @RequestHeader(value="X-Account-Context",required=false) @Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,@Valid @RequestBody AssetDtos.ConfirmUpload request){return response(AssetDtos.AssetView.from(service.confirmProject(actor(principal),context(accountContext),projectId,request.assetId())),false,false);}
    @GetMapping("/admin/assets/upload-policy")
    ResponseEntity<AssetDtos.UploadCapabilities> editorialPolicy(@AuthenticationPrincipal IdentityUserDetails principal){return response(AssetDtos.UploadCapabilities.from(service.editorialPolicy(actor(principal))),false,true);}
    @PostMapping("/admin/assets/upload-intents")
    ResponseEntity<AssetDtos.UploadIntent> editorialIntent(@AuthenticationPrincipal IdentityUserDetails principal,
        @RequestHeader(value="X-Account-Context",required=false) @Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,@Valid @RequestBody AssetDtos.EditorialUploadRequest request){return response(AssetDtos.UploadIntent.from(service.createEditorialIntent(actor(principal),context(accountContext),request.command())),true,true);}
    @GetMapping("/admin/assets/{assetId}")
    ResponseEntity<AssetDtos.AssetView> editorial(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID assetId){return response(AssetDtos.AssetView.from(service.getEditorial(actor(principal),assetId)),false,true);}
    @PostMapping("/admin/assets/{assetId}/confirmations")
    ResponseEntity<AssetDtos.AssetView> editorialConfirm(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID assetId,
        @RequestHeader(value="X-Account-Context",required=false) @Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext){return response(AssetDtos.AssetView.from(service.confirmEditorial(actor(principal),context(accountContext),assetId)),false,true);}
    @PostMapping("/admin/assets/{assetId}/download-access")
    ResponseEntity<AssetDtos.DownloadAccess> preview(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID assetId,
        @RequestHeader(value="X-Account-Context",required=false) @Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext){return response(AssetDtos.DownloadAccess.from(service.preview(actor(principal),context(accountContext),assetId)),false,true);}
    @PostMapping("/assets/{assetId}/download-access")
    ResponseEntity<AssetDtos.DownloadAccess> download(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID assetId,
        @RequestHeader(value="X-Account-Context",required=false) @Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext,@Valid @RequestBody(required=false) AssetDtos.AssetAccessContext request){return response(AssetDtos.DownloadAccess.from(service.download(principal==null?null:principal.getUserId(),context(accountContext),assetId,request==null?null:request.command())),false,false);}
    @PostMapping("/me/projects/{projectId}/solution-reveals/{revealId}/files/{assetId}/download-access")
    ResponseEntity<AssetDtos.DownloadAccess> solution(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID projectId,@PathVariable UUID revealId,@PathVariable UUID assetId,@RequestHeader(value="X-Account-Context",required=false) @Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN) String accountContext){return response(AssetDtos.DownloadAccess.from(service.solutionDownload(actor(principal),context(accountContext),projectId,revealId,assetId)),false,false);}
    private static UUID actor(IdentityUserDetails principal){if(principal==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return principal.getUserId();}
    private static UUID context(String value){return value==null?null:UUID.fromString(value);}
    private static <T> ResponseEntity<T> response(T body,boolean created,boolean admin){var builder=ResponseEntity.status(created?HttpStatus.CREATED:HttpStatus.OK).header(HttpHeaders.CACHE_CONTROL,"private, no-store");if(admin)builder.header("X-Robots-Tag","noindex, nofollow");return builder.body(body);}
}
