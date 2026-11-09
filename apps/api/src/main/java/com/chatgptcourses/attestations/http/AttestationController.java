package com.chatgptcourses.attestations.http;

import static com.chatgptcourses.account.service.AccountOperations.context;
import static com.chatgptcourses.attestations.service.AttestationTypes.*;
import com.chatgptcourses.attestations.service.AttestationService;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me")
class AttestationController {
    private final AttestationService attestations;
    AttestationController(AttestationService attestations){this.attestations=attestations;}
    record Issue(@NotNull @Pattern(regexp="fr|en")String locale,@NotNull @Pattern(regexp="[a-f0-9]{64}")String expectedEvidenceFingerprint) { }
    @GetMapping("/attestation-enrollments") ResponseEntity<AttestationEnrollmentPage> enrollments(@AuthenticationPrincipal IdentityUserDetails p,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int pageSize){return response(attestations.enrollments(actor(p),page,pageSize));}
    @GetMapping("/enrollments/{id}/attestation-eligibility") ResponseEntity<AttestationEligibility> eligibility(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable UUID id,@RequestParam String locale){return response(attestations.eligibility(actor(p),id,locale));}
    @PostMapping("/enrollments/{id}/attestations") ResponseEntity<AttestationView> issue(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable UUID id,@RequestHeader(value="X-Account-Context",required=false)String ctx,@RequestHeader(value="Idempotency-Key",required=false)String key,@Valid @RequestBody Issue c){var result=attestations.issue(actor(p),context(ctx),id,key,new IssueAttestation(c.locale(),c.expectedEvidenceFingerprint()));return ResponseEntity.status(result.created()?201:200).header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(result.value());}
    @GetMapping("/attestations") ResponseEntity<AttestationPage> list(@AuthenticationPrincipal IdentityUserDetails p,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int pageSize){return response(attestations.list(actor(p),page,pageSize));}
    @GetMapping("/attestations/{id}") ResponseEntity<AttestationView> get(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable UUID id){return response(attestations.get(actor(p),id));}
    @GetMapping("/attestations/{id}/document") ResponseEntity<byte[]> document(@AuthenticationPrincipal IdentityUserDetails p,@PathVariable UUID id){var d=attestations.document(actor(p),id);return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(d.filename()).build().toString()).header("X-Content-Type-Options","nosniff").header("Referrer-Policy","no-referrer").header("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox").header("X-Content-SHA256",d.sha256()).contentType(MediaType.parseMediaType("text/html; charset=UTF-8")).contentLength(d.bytes().length).eTag("\"sha256-"+d.sha256()+"\"").body(d.bytes());}
    private static UUID actor(IdentityUserDetails p){if(p==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return p.getUserId();}
    private static <T>ResponseEntity<T> response(T value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(value);}
}
