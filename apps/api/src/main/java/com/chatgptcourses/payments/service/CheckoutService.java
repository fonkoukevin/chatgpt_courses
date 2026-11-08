package com.chatgptcourses.payments.service;

import static com.chatgptcourses.payments.service.PaymentTypes.*;
import com.chatgptcourses.commerce.service.CommerceAuthorization;
import com.chatgptcourses.commerce.service.CommerceTypes.OrderSnapshot;
import com.chatgptcourses.commerce.service.CoverageReader;
import com.chatgptcourses.commerce.service.OfferService;
import com.chatgptcourses.commerce.service.OrderService;
import com.chatgptcourses.commerce.service.PaymentGateway;
import com.chatgptcourses.payments.config.StripeSettings;
import com.chatgptcourses.payments.gateway.StripePaymentGateway;
import com.chatgptcourses.shared.config.RuntimeProperties;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.http.RevisionPreconditions;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/** Durable operation then network then acknowledgement. No provider request runs in a DB transaction. */
@Service
public class CheckoutService {
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final CommerceAuthorization auth;private final OfferService offers;private final OrderService orders;private final CoverageReader coverage;private final PaymentGateway gateway;private final StripeSettings settings;private final RuntimeProperties runtime;private final TransactionTemplate tx;
    public CheckoutService(JdbcTemplate jdbc,ObjectMapper mapper,CommerceAuthorization auth,OfferService offers,OrderService orders,CoverageReader coverage,PaymentGateway gateway,StripeSettings settings,RuntimeProperties runtime,PlatformTransactionManager manager){this.jdbc=jdbc;this.mapper=mapper;this.auth=auth;this.offers=offers;this.orders=orders;this.coverage=coverage;this.gateway=gateway;this.settings=settings;this.runtime=runtime;this.tx=new TransactionTemplate(manager);}

    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public CheckoutAccess checkout(UUID actor,UUID accountContext,UUID orderId,String ifMatch,String idempotencyKey,CreateCheckout command){
        UUID key=key(idempotencyKey);if(command==null||command.acceptedTermsVersion()==null||command.acceptedTermsVersion().isBlank()||command.acceptedTermsVersion().length()>100)throw error(ApiError.VALIDATION_FAILED);
        UUID operation=tx.execute(s->prepare(actor,accountContext,orderId,ifMatch,key,command));
        var claim=tx.execute(s->claim(actor,accountContext,orderId,operation));
        if(claim==null)return tx.execute(s->access(order(actor,orderId,false),operation(operation,false)));
        CreatedCheckout created=null;PaymentGatewayException failed=null;
        try{created=gateway.createCheckout(claim.parameters(),claim.providerKey());}catch(PaymentGatewayException failure){failed=failure;}catch(RuntimeException failure){failed=new PaymentGatewayException("PROVIDER_TRANSPORT_UNKNOWN",true);}
        final CreatedCheckout success=created;final PaymentGatewayException failure=failed;
        return tx.execute(s->finish(actor,orderId,claim,success,failure));
    }

    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public OrderPaymentStatus status(UUID actor,UUID orderId){return tx.execute(s->{
        var view=orders.get(actor,orderId);var order=order(actor,orderId,false);var op=order.operationId()==null?null:operation(order.operationId(),false);String reason=null;
        if(!gateway.configured())reason="PAYMENT_NOT_CONFIGURED";
        else if(!gateway.supportsAmount(order.snapshot().total().amountMinor(),order.snapshot().total().currency()))reason="AMOUNT_NOT_SUPPORTED";
        else if(op!=null){
            if(!settings.accountId().equals(op.account()))reason="RECONCILIATION_REQUIRED";
            else if(List.of("PROCESSING","PAID").contains(order.payment()))reason="PAYMENT_PENDING";
            else if(!retryable(op,now()))reason=List.of("FAILED","EXPIRED").contains(op.state())?"CHECKOUT_EXPIRED":"RECONCILIATION_REQUIRED";
        }else if(!"PREPARED".equals(order.state())||!order.expiresAt().isAfter(now()))reason="ORDER_NOT_PAYABLE";
        else try{var offer=offers.publicOffer(order.snapshot().offerId(),order.snapshot().locale());
            if(offer.revision()!=order.snapshot().offerRevision())reason="OFFER_CHANGED";
            else if(!"ACTIVE".equals(offer.state())||!offer.readiness().summaryReady())reason="OFFER_NOT_READY";
            else if("ALL".equals(coverage.coverage(actor,offer).status()))reason="ALREADY_ACCESSIBLE";
        }catch(ApiException unavailable){if(unavailable.error()!=ApiError.RESOURCE_NOT_FOUND)throw unavailable;reason="OFFER_NOT_READY";}
        return new OrderPaymentStatus(orderId,view.revision(),view.orderStatus(),view.paymentStatus(),view.fulfillmentStatus(),op==null?"NONE":op.state(),reason==null,reason,op==null?null:op.expiresAt(),op!=null&&reason==null&&retryable(op,now()),notification(actor,orderId));
    });}

    private UUID prepare(UUID actor,UUID context,UUID id,String ifMatch,UUID key,CreateCheckout command){
        auth.mutation(actor,context,"commerce.orders.write");lockOwner(actor);var order=order(actor,id,true);auth.mutation(actor,context,"commerce.orders.write");
        if(!gateway.configured())throw error(ApiError.PAYMENT_NOT_CONFIGURED);
        if(order.operationId()!=null&&!settings.accountId().equals(operation(order.operationId(),true).account()))throw error(ApiError.ORDER_NOT_PAYABLE);
        byte[] bodyHash=hash(id+"|"+command.acceptedTermsVersion());
        var previous=jdbc.query("SELECT order_id,operation_id,request_hash FROM checkout_idempotency_keys WHERE owner_id=? AND idempotency_key=?",(rs,n)->new Prior(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getBytes(3)),actor,key);
        if(!previous.isEmpty()){
            var p=previous.getFirst();if(!id.equals(p.order())||!MessageDigest.isEqual(bodyHash,p.hash()))throw error(ApiError.CONFLICT);
            var op=operation(p.operation(),true);replayTag(ifMatch,order,op);return op.id();
        }
        if(!command.acceptedTermsVersion().equals(order.acceptedTerms())||!command.acceptedTermsVersion().equals(order.snapshot().conditions().termsVersion()))throw error(ApiError.TERMS_CHANGED);
        if(order.operationId()!=null){var op=operation(order.operationId(),true);replayTag(ifMatch,order,op);remember(actor,key,id,op.id(),bodyHash);return op.id();}
        RevisionPreconditions.requireMatch(ifMatch,tag(order));
        if(!gateway.configured())throw error(ApiError.PAYMENT_NOT_CONFIGURED);
        if(!gateway.supportsAmount(order.snapshot().total().amountMinor(),order.snapshot().total().currency()))throw error(ApiError.PAYMENT_AMOUNT_NOT_SUPPORTED);
        if(!"PREPARED".equals(order.state())||!"NOT_STARTED".equals(order.payment())||!"NOT_STARTED".equals(order.fulfillment())||!order.expiresAt().isAfter(now()))throw error(ApiError.ORDER_NOT_PAYABLE);
        var offer=offers.lockForOrder(order.snapshot().offerId(),order.snapshot().offerRevision(),order.snapshot().locale());
        if(!order.snapshot().total().equals(offer.price())||!command.acceptedTermsVersion().equals(offer.conditions().termsVersion()))throw error(ApiError.OFFER_CHANGED);
        var currentCoverage=coverage.coverage(actor,offer);auth.mutation(actor,context,"commerce.orders.write");if("ALL".equals(currentCoverage.status()))throw error(ApiError.ALREADY_ACCESSIBLE);
        Instant created=now().truncatedTo(ChronoUnit.SECONDS),expires=created.plusSeconds(3600),retryUntil=created.plus(settings.recoveryWindow());UUID opId=UUID.randomUUID();String providerKey="cc-checkout-"+opId;
        String path="fr".equals(order.snapshot().locale())?"/fr/commandes/"+id+"/statut":"/en/orders/"+id+"/status";
        var parameters=new CheckoutParameters(opId,id,order.snapshot().offerRevisionId(),order.snapshot().locale(),order.snapshot().title(),order.snapshot().total().amountMinor(),order.snapshot().total().currency(),runtime.publicOrigin()+path+"?checkout=success",runtime.publicOrigin()+path+"?checkout=cancel",expires);String json=mapper.writeValueAsString(parameters);
        jdbc.update("""
            INSERT INTO checkout_operations(id,order_id,owner_id,order_revision,account_id,livemode,provider_idempotency_key,request_json,request_hash,amount_minor,currency,state,checkout_expires_at,retry_until,created_at,updated_at)
            VALUES(?,?,?,?,?,false,?,?::jsonb,?,?,?,'PREPARED',?,?,?,?)
            """,opId,id,actor,order.revision(),settings.accountId(),providerKey,json,hash(json),parameters.amountMinor(),parameters.currency(),Timestamp.from(expires),Timestamp.from(retryUntil),Timestamp.from(created),Timestamp.from(created));
        jdbc.update("UPDATE orders SET payment_operation_id=?,order_status='AWAITING_PAYMENT',payment_status='UNKNOWN',revision=revision+1 WHERE id=?",opId,id);
        remember(actor,key,id,opId,bodyHash);return opId;
    }
    private Claim claim(UUID actor,UUID context,UUID orderId,UUID operationId){
        lockOwner(actor);var order=order(actor,orderId,true);var op=operation(operationId,true);auth.mutation(actor,context,"commerce.orders.write");Instant now=now();
        if(!gateway.configured()||!settings.accountId().equals(op.account())||"OPEN".equals(op.state())||List.of("PAID","PROCESSING").contains(order.payment())||!retryable(op,now)||("CALLING".equals(op.state())&&op.leaseUntil()!=null&&op.leaseUntil().isAfter(now)))return null;
        UUID lease=UUID.randomUUID();jdbc.update("UPDATE checkout_operations SET state='CALLING',lease_token=?,lease_until=?,attempts=attempts+1,last_error_code=NULL,updated_at=greatest(updated_at,clock_timestamp()),revision=revision+1 WHERE id=?",lease,Timestamp.from(now.plusSeconds(30)),op.id());return new Claim(op.id(),lease,op.parameters(),op.providerKey());
    }
    private CheckoutAccess finish(UUID actor,UUID orderId,Claim claim,CreatedCheckout created,PaymentGatewayException failure){
        lockOwner(actor);var order=order(actor,orderId,true);var op=operation(claim.id(),true);
        // An early webhook may have completed the session before the create acknowledgement.
        if(!"CALLING".equals(op.state())||!claim.lease().equals(op.lease()))return access(order,op);
        if(failure==null&&(created==null||created.livemode()||!op.account().equals(created.accountId())||!op.expiresAt().equals(created.expiresAt())||!StripePaymentGateway.validCheckoutUrl(created.url())))failure=new PaymentGatewayException("PROVIDER_RESPONSE_INVALID",true);
        if(failure==null){
            jdbc.update("UPDATE checkout_operations SET state='OPEN',session_id=?,session_url=?,lease_token=NULL,lease_until=NULL,last_error_code=NULL,updated_at=greatest(updated_at,clock_timestamp()),revision=revision+1 WHERE id=?",created.sessionId(),created.url(),op.id());
            if(!List.of("PAID","PROCESSING").contains(order.payment()))jdbc.update("UPDATE orders SET order_status='AWAITING_PAYMENT',payment_status='REQUIRES_PAYMENT',revision=revision+1 WHERE id=?",orderId);
        }else{
            String state=failure.ambiguous()||"PROVIDER_RATE_LIMITED".equals(failure.reason())?"UNKNOWN":"NEEDS_REVIEW";
            jdbc.update("UPDATE checkout_operations SET state=?,lease_token=NULL,lease_until=NULL,last_error_code=?,updated_at=greatest(updated_at,clock_timestamp()),revision=revision+1 WHERE id=?",state,failure.reason(),op.id());
            if(!List.of("PAID","PROCESSING").contains(order.payment()))jdbc.update("UPDATE orders SET order_status=?,payment_status=?,revision=revision+1 WHERE id=?","UNKNOWN".equals(state)?"AWAITING_PAYMENT":"NEEDS_REVIEW","UNKNOWN".equals(state)?"UNKNOWN":"FAILED",orderId);
        }
        return access(order(actor,orderId,false),operation(op.id(),false));
    }
    private CheckoutAccess access(Order order,Op op){
        boolean pending=List.of("PAID","PROCESSING").contains(order.payment());String url=!pending&&"OPEN".equals(op.state())&&op.expiresAt().isAfter(now())?op.url():null;
        String reason=url!=null?null:pending?"PAYMENT_PENDING":"EXPIRED".equals(op.state())?"CHECKOUT_EXPIRED":"RECONCILIATION_REQUIRED";
        return new CheckoutAccess(order.id(),op.id(),op.state(),url,op.expiresAt(),List.of("CALLING","UNKNOWN","PREPARED").contains(op.state())?2:null,reason);
    }
    private static boolean retryable(Op op,Instant now){return op.attempts()<20&&op.expiresAt().isAfter(now)&&("OPEN".equals(op.state())||((List.of("PREPARED","UNKNOWN","CALLING").contains(op.state()))&&op.retryUntil().isAfter(now)));}
    private void replayTag(String ifMatch,Order order,Op op){try{RevisionPreconditions.requireMatch(ifMatch,tag(order));}catch(ApiException conflict){if(conflict.error()!=ApiError.REVISION_CONFLICT)throw conflict;RevisionPreconditions.requireMatch(ifMatch,EntityTags.forRevision("order",order.id(),op.orderRevision()));}}
    private void remember(UUID owner,UUID key,UUID order,UUID op,byte[] hash){jdbc.update("INSERT INTO checkout_idempotency_keys(owner_id,idempotency_key,order_id,operation_id,request_hash) VALUES(?,?,?,?,?)",owner,key,order,op,hash);}
    private String notification(UUID owner,UUID order){var values=jdbc.query("SELECT status FROM notification_outbox WHERE owner_id=? AND business_key=?",(rs,n)->rs.getString(1),owner,"access:activated:"+order);if(values.isEmpty())return "NONE";return switch(values.getFirst()){case "SENT"->"SENT";case "DEAD","INDETERMINATE"->"ISSUE";default->"PENDING";};}
    private void lockOwner(UUID owner){if(jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(rs,n)->rs.getObject(1,UUID.class),owner).isEmpty())throw error(ApiError.ACCOUNT_UNAVAILABLE);}
    private Order order(UUID owner,UUID id,boolean lock){var rows=jdbc.query("SELECT * FROM orders WHERE id=? AND owner_id=?"+(lock?" FOR UPDATE":""),(rs,n)->new Order(rs.getObject("id",UUID.class),rs.getLong("revision"),rs.getString("order_status"),rs.getString("payment_status"),rs.getString("fulfillment_status"),mapper.readValue(rs.getString("snapshot_json"),OrderSnapshot.class),rs.getString("accepted_terms_version"),rs.getTimestamp("expires_at").toInstant(),rs.getObject("payment_operation_id",UUID.class)),id,owner);if(rows.isEmpty())throw error(ApiError.RESOURCE_NOT_FOUND);return rows.getFirst();}
    private Op operation(UUID id,boolean lock){var rows=jdbc.query("SELECT * FROM checkout_operations WHERE id=?"+(lock?" FOR UPDATE":""),this::operation,id);if(rows.isEmpty())throw error(ApiError.RESOURCE_NOT_FOUND);return rows.getFirst();}
    private Op operation(ResultSet r,int n)throws SQLException{return new Op(r.getObject("id",UUID.class),r.getLong("order_revision"),r.getString("state"),r.getString("account_id"),mapper.readValue(r.getString("request_json"),CheckoutParameters.class),r.getString("provider_idempotency_key"),r.getString("session_url"),r.getTimestamp("checkout_expires_at").toInstant(),r.getTimestamp("retry_until").toInstant(),r.getObject("lease_token",UUID.class),r.getTimestamp("lease_until")==null?null:r.getTimestamp("lease_until").toInstant(),r.getInt("attempts"));}
    private Instant now(){return jdbc.queryForObject("SELECT clock_timestamp()",Timestamp.class).toInstant();}
    private static byte[] hash(String value){try{return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));}catch(java.security.NoSuchAlgorithmException missing){throw new IllegalStateException("SHA-256 unavailable");}}
    private static UUID key(String value){if(value==null||value.isBlank())throw error(ApiError.IDEMPOTENCY_KEY_REQUIRED);if(!value.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"))throw error(ApiError.VALIDATION_FAILED);return UUID.fromString(value);}
    private static String tag(Order order){return EntityTags.forRevision("order",order.id(),order.revision());}
    private static ApiException error(ApiError error){return new ApiException(error);}
    private record Order(UUID id,long revision,String state,String payment,String fulfillment,OrderSnapshot snapshot,String acceptedTerms,Instant expiresAt,UUID operationId){ }
    private record Op(UUID id,long orderRevision,String state,String account,CheckoutParameters parameters,String providerKey,String url,Instant expiresAt,Instant retryUntil,UUID lease,Instant leaseUntil,int attempts){@Override public String toString(){return "CheckoutOperation[redacted]";}}
    private record Claim(UUID id,UUID lease,CheckoutParameters parameters,String providerKey){@Override public String toString(){return "CheckoutClaim[redacted]";}}
    private record Prior(UUID order,UUID operation,byte[] hash){ }
}
