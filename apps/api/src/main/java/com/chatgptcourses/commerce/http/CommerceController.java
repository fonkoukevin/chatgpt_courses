package com.chatgptcourses.commerce.http;

import com.chatgptcourses.commerce.service.CommerceTypes;
import com.chatgptcourses.commerce.service.OfferService;
import com.chatgptcourses.commerce.service.OrderService;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.methods.http.MethodDtos;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
class CommerceController {
    private final OfferService offers;private final OrderService orders;
    CommerceController(OfferService offers,OrderService orders){this.offers=offers;this.orders=orders;}
    @GetMapping("/offers")
    ResponseEntity<CommerceDtos.OfferPage> publicList(@RequestParam @Pattern(regexp="fr|en")String locale,@RequestParam(defaultValue="0")@Min(0)@Max(1000000)int page,@RequestParam(defaultValue="20")@Min(1)@Max(100)int pageSize){return response(CommerceDtos.OfferPage.from(offers.listPublic(new CommerceTypes.OfferQuery(null,null,null,locale,page,pageSize))));}
    @GetMapping("/offers/{id}")
    ResponseEntity<CommerceDtos.PublicOffer> publicOffer(@PathVariable UUID id,@RequestParam @Pattern(regexp="fr|en")String locale){return response(CommerceDtos.PublicOffer.from(offers.publicOffer(id,locale)));}
    @GetMapping("/admin/offers")
    ResponseEntity<CommerceDtos.OfferPage> adminList(@AuthenticationPrincipal IdentityUserDetails principal,@RequestParam(required=false)@Size(max=240)String q,@RequestParam(required=false)@Pattern(regexp="DRAFT|ACTIVE|INACTIVE")String state,@RequestParam(required=false)@Pattern(regexp="COURSE|PACK")String kind,@RequestParam @Pattern(regexp="fr|en")String locale,@RequestParam(defaultValue="0")@Min(0)@Max(1000000)int page,@RequestParam(defaultValue="20")@Min(1)@Max(100)int pageSize){return response(CommerceDtos.OfferPage.from(offers.listAdmin(actor(principal),new CommerceTypes.OfferQuery(q,state,kind,locale,page,pageSize))));}
    @PostMapping("/admin/offers")
    ResponseEntity<CommerceDtos.OfferView> createOffer(@AuthenticationPrincipal IdentityUserDetails principal,@RequestHeader(value="X-Account-Context",required=false)@Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN)String account,@Valid @RequestBody CommerceDtos.CreateOffer body){return offer(offers.create(actor(principal),context(account),body.command()),HttpStatus.CREATED);}
    @GetMapping("/admin/offers/{id}")
    ResponseEntity<CommerceDtos.OfferView> adminOffer(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id){return offer(offers.get(actor(principal),id),HttpStatus.OK);}
    @PatchMapping("/admin/offers/{id}")
    ResponseEntity<CommerceDtos.OfferView> saveOffer(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id,@RequestHeader(value="X-Account-Context",required=false)@Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN)String account,@RequestHeader(value=HttpHeaders.IF_MATCH,required=false)String ifMatch,@Valid @RequestBody CommerceDtos.SaveOffer body){return offer(offers.save(actor(principal),context(account),id,ifMatch,body.command()),HttpStatus.OK);}
    @GetMapping("/admin/offers/{id}/readiness")
    ResponseEntity<CommerceDtos.OfferReadiness> readiness(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id){return response(CommerceDtos.OfferReadiness.from(offers.readiness(actor(principal),id)));}
    @PostMapping("/admin/offers/{id}/activate")
    ResponseEntity<CommerceDtos.OfferView> activate(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id,@RequestHeader(value="X-Account-Context",required=false)@Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN)String account,@RequestHeader(value=HttpHeaders.IF_MATCH,required=false)String ifMatch,@Valid @RequestBody CommerceDtos.ChangeOfferState body){return offer(offers.activate(actor(principal),context(account),id,ifMatch,body.command()),HttpStatus.OK);}
    @PostMapping("/admin/offers/{id}/deactivate")
    ResponseEntity<CommerceDtos.OfferView> deactivate(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id,@RequestHeader(value="X-Account-Context",required=false)@Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN)String account,@RequestHeader(value=HttpHeaders.IF_MATCH,required=false)String ifMatch,@Valid @RequestBody CommerceDtos.ChangeOfferState body){return offer(offers.deactivate(actor(principal),context(account),id,ifMatch,body.command()),HttpStatus.OK);}
    @GetMapping("/me/offers/{id}/purchase-context")
    ResponseEntity<CommerceDtos.PurchaseContext> purchase(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id,@RequestParam @Pattern(regexp="fr|en")String locale){return response(CommerceDtos.PurchaseContext.from(orders.purchaseContext(actor(principal),id,locale)));}
    @GetMapping("/me/orders")
    ResponseEntity<CommerceDtos.OrderPage> listOrders(@AuthenticationPrincipal IdentityUserDetails principal,@RequestParam(defaultValue="0")@Min(0)@Max(1000000)int page,@RequestParam(defaultValue="20")@Min(1)@Max(100)int pageSize){return response(CommerceDtos.OrderPage.from(orders.list(actor(principal),page,pageSize)));}
    @GetMapping("/me/orders/{id}")
    ResponseEntity<CommerceDtos.OrderView> getOrder(@AuthenticationPrincipal IdentityUserDetails principal,@PathVariable UUID id){return order(orders.get(actor(principal),id),HttpStatus.OK);}
    @PostMapping("/me/orders")
    ResponseEntity<CommerceDtos.OrderView> createOrder(@AuthenticationPrincipal IdentityUserDetails principal,@RequestHeader(value="X-Account-Context",required=false)@Pattern(regexp=MethodDtos.ACCOUNT_CONTEXT_PATTERN)String account,@RequestHeader(value="Idempotency-Key",required=false)String key,@Valid @RequestBody CommerceDtos.CreateOrder body){var result=orders.create(actor(principal),context(account),key,body.command());return order(result.value(),result.created()?HttpStatus.CREATED:HttpStatus.OK);}
    private static UUID actor(IdentityUserDetails principal){if(principal==null)throw new ApiException(ApiError.AUTHENTICATION_REQUIRED);return principal.getUserId();}
    private static UUID context(String value){return value==null?null:UUID.fromString(value);}
    private static ResponseEntity<CommerceDtos.OfferView> offer(CommerceTypes.OfferView value,HttpStatus status){return ResponseEntity.status(status).header(HttpHeaders.CACHE_CONTROL,"private, no-store").eTag(EntityTags.forRevision("offer",value.id(),value.revision())).body(CommerceDtos.OfferView.from(value));}
    private static ResponseEntity<CommerceDtos.OrderView> order(CommerceTypes.OrderView value,HttpStatus status){return ResponseEntity.status(status).header(HttpHeaders.CACHE_CONTROL,"private, no-store").eTag(EntityTags.forRevision("order",value.id(),value.revision())).body(CommerceDtos.OrderView.from(value));}
    private static <T>ResponseEntity<T> response(T value){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(value);}
}
