package com.chatgptcourses.commerce.service;

import static com.chatgptcourses.commerce.service.CommerceTypes.*;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** A preparation is neither payment nor entitlement. All snapshots are calculated from locked server facts. */
@Service
public class OrderService {
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final OfferService offers;private final CoverageReader coverage;private final CommerceAuthorization authorization;private final CommerceSettings settings;
    public OrderService(JdbcTemplate jdbc,ObjectMapper mapper,OfferService offers,CoverageReader coverage,CommerceAuthorization authorization,CommerceSettings settings){this.jdbc=jdbc;this.mapper=mapper;this.offers=offers;this.coverage=coverage;this.authorization=authorization;this.settings=settings;}
    @Transactional
    public PurchaseContext purchaseContext(UUID actor,UUID offerId,String locale){
        authorization.require(actor,"commerce.orders.read");lockOwner(actor);authorization.require(actor,"commerce.orders.read");expire(actor);
        var offer=offers.publicOffer(offerId,locale);return new PurchaseContext(offer,coverage.coverage(actor,offer),active(actor,offerId).stream().findFirst().map(OrderService::summary).orElse(null));
    }
    @Transactional
    public OrderCreationResult create(UUID actor,UUID accountContext,String idempotencyKey,CreateOrder command){
        authorization.mutation(actor,accountContext,"commerce.orders.write");validate(command);UUID key=key(idempotencyKey);byte[] requestHash=requestHash(command);
        lockOwner(actor);authorization.mutation(actor,accountContext,"commerce.orders.write");expire(actor);
        var prior=jdbc.query("SELECT request_hash,order_id FROM order_idempotency_keys WHERE owner_id=? AND idempotency_key=?",(rs,n)->new Prior(rs.getBytes(1),rs.getObject(2,UUID.class)),actor,key);
        if(!prior.isEmpty()){if(!MessageDigest.isEqual(requestHash,prior.getFirst().hash()))throw failure(ApiError.CONFLICT);return new OrderCreationResult(load(actor,prior.getFirst().order()),false);}
        var offer=offers.lockForOrder(command.offerId(),command.offerRevision(),command.locale());
        if(offer.conditions()==null||!command.acceptedTermsVersion().equals(offer.conditions().termsVersion()))throw failure(ApiError.TERMS_CHANGED);
        var currentCoverage=coverage.coverage(actor,offer);
        // Offer/curriculum locks and remote media checks may have been awaited.
        // A revoked permission must not survive that wait, even for a new replay key.
        authorization.mutation(actor,accountContext,"commerce.orders.write");
        if("ALL".equals(currentCoverage.status()))throw failure(ApiError.ALREADY_ACCESSIBLE);
        String intention=HexFormat.of().formatHex(requestHash);
        var existing=active(actor,offer.id());
        for(var value:existing){
            if(!"NOT_STARTED".equals(value.paymentStatus())||!"NOT_STARTED".equals(value.fulfillmentStatus()))throw failure(ApiError.ACTIVE_ORDER_EXISTS);
            if(intention.equals(intention(value.snapshot()))){remember(actor,key,requestHash,value.id());return new OrderCreationResult(value,false);}
        }
        // A different explicitly accepted revision/locale/terms replaces only a preparation without a payment.
        for(var value:existing)jdbc.update("UPDATE orders SET order_status='CANCELLED',active_intention_key=NULL,revision=revision+1 WHERE id=? AND order_status='PREPARED' AND payment_status='NOT_STARTED' AND fulfillment_status='NOT_STARTED'",value.id());
        UUID id=UUID.randomUUID(),revisionId=jdbc.queryForObject("SELECT current_revision_id FROM offers WHERE id=?",UUID.class,offer.id());
        var resources=offer.resources().stream().map(value->new OrderResource(UUID.randomUUID(),value.resourceId(),value.versionId(),value.versionNumber(),value.title(),value.slug(),List.copyOf(offer.locales()))).toList();
        var snapshot=new OrderSnapshot(offer.id(),offer.revision(),revisionId,offer.code(),offer.kind(),offer.locale(),offer.title(),resources,List.copyOf(offer.locales()),offer.price(),offer.tax(),offer.conditions());
        Instant now=now(),expires=now.plus(settings.orderTtl());
        jdbc.update("""
            INSERT INTO orders(id,owner_id,offer_id,offer_revision,offer_revision_id,locale,total_amount,currency,order_status,payment_status,fulfillment_status,snapshot_json,accepted_terms_version,accepted_at,created_at,expires_at,active_intention_key)
            VALUES(?,?,?,?,?,?,?,?,'PREPARED','NOT_STARTED','NOT_STARTED',?::jsonb,?,?,?,?,?)
            """,id,actor,offer.id(),offer.revision(),revisionId,offer.locale(),offer.price().amountMinor(),offer.price().currency(),mapper.writeValueAsString(snapshot),command.acceptedTermsVersion(),Timestamp.from(now),Timestamp.from(now),Timestamp.from(expires),intention);
        for(var resource:resources)jdbc.update("INSERT INTO order_resources(id,order_id,resource_id,version_id,locales) VALUES(?,?,?,?,?::jsonb)",resource.id(),id,resource.resourceId(),resource.versionId(),mapper.writeValueAsString(resource.locales()));
        remember(actor,key,requestHash,id);return new OrderCreationResult(load(actor,id),true);
    }
    @Transactional
    public OrderView get(UUID actor,UUID id){authorization.require(actor,"commerce.orders.read");lockOwner(actor);authorization.require(actor,"commerce.orders.read");expire(actor);return load(actor,id);}
    @Transactional
    public OrderPage list(UUID actor,int page,int pageSize){
        authorization.require(actor,"commerce.orders.read");if(page<0||page>1_000_000||pageSize<1||pageSize>100)throw failure(ApiError.VALIDATION_FAILED);
        lockOwner(actor);authorization.require(actor,"commerce.orders.read");expire(actor);
        long total=jdbc.queryForObject("SELECT count(*) FROM orders WHERE owner_id=?",Long.class,actor);
        var rows=jdbc.query("SELECT * FROM orders WHERE owner_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?",this::row,actor,pageSize,(long)page*pageSize);
        return new OrderPage(rows.stream().map(OrderService::summary).toList(),page,pageSize,total);
    }
    private void lockOwner(UUID actor){if(jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(rs,n)->rs.getObject(1,UUID.class),actor).isEmpty())throw failure(ApiError.ACCOUNT_UNAVAILABLE);}
    private void expire(UUID actor){jdbc.update("UPDATE orders SET order_status='EXPIRED',active_intention_key=NULL,revision=revision+1 WHERE owner_id=? AND order_status='PREPARED' AND payment_status='NOT_STARTED' AND fulfillment_status='NOT_STARTED' AND expires_at<=clock_timestamp()",actor);}
    private List<OrderView> active(UUID actor,UUID offer){return jdbc.query("SELECT * FROM orders WHERE owner_id=? AND offer_id=? AND active_intention_key IS NOT NULL ORDER BY created_at DESC,id",this::row,actor,offer);}
    private OrderView load(UUID actor,UUID id){var rows=jdbc.query("SELECT * FROM orders WHERE id=? AND owner_id=?",this::row,id,actor);if(rows.isEmpty())throw failure(ApiError.RESOURCE_NOT_FOUND);return rows.getFirst();}
    private OrderView row(ResultSet rs,int n)throws SQLException{return new OrderView(rs.getObject("id",UUID.class),rs.getLong("revision"),rs.getString("order_status"),rs.getString("payment_status"),rs.getString("fulfillment_status"),mapper.readValue(rs.getString("snapshot_json"),OrderSnapshot.class),rs.getString("accepted_terms_version"),rs.getTimestamp("accepted_at").toInstant(),rs.getTimestamp("created_at").toInstant(),rs.getTimestamp("expires_at").toInstant());}
    private void remember(UUID actor,UUID key,byte[] hash,UUID order){jdbc.update("INSERT INTO order_idempotency_keys(owner_id,idempotency_key,request_hash,order_id) VALUES(?,?,?,?)",actor,key,hash,order);}
    private static OrderSummary summary(OrderView value){var snapshot=value.snapshot();return new OrderSummary(value.id(),value.revision(),snapshot.offerId(),snapshot.offerRevision(),snapshot.locale(),snapshot.title(),snapshot.total(),value.orderStatus(),value.paymentStatus(),value.fulfillmentStatus(),value.createdAt(),value.expiresAt());}
    private static String intention(OrderSnapshot value){return HexFormat.of().formatHex(requestHash(new CreateOrder(value.offerId(),value.offerRevision(),value.locale(),value.conditions().termsVersion())));}
    private static byte[] requestHash(CreateOrder value){try{return MessageDigest.getInstance("SHA-256").digest((value.offerId()+"|"+value.offerRevision()+"|"+value.locale()+"|"+value.acceptedTermsVersion()).getBytes(StandardCharsets.UTF_8));}catch(NoSuchAlgorithmException unavailable){throw new IllegalStateException("SHA-256 unavailable");}}
    private static void validate(CreateOrder value){if(value==null||value.offerId()==null||value.offerRevision()<0||value.offerRevision()>9_007_199_254_740_991L||!("fr".equals(value.locale())||"en".equals(value.locale()))||value.acceptedTermsVersion()==null||value.acceptedTermsVersion().isBlank()||value.acceptedTermsVersion().length()>100)throw failure(ApiError.VALIDATION_FAILED);}
    private static UUID key(String value){if(value==null||value.isBlank())throw failure(ApiError.IDEMPOTENCY_KEY_REQUIRED);if(!value.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"))throw failure(ApiError.VALIDATION_FAILED);return UUID.fromString(value);}
    private Instant now(){return jdbc.queryForObject("SELECT clock_timestamp()",Timestamp.class).toInstant();}
    private static ApiException failure(ApiError error){return new ApiException(error);}
    private record Prior(byte[] hash,UUID order) { @Override public String toString(){return "PriorOrderRequest[redacted]";} }
}
