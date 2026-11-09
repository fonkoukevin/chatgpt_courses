package com.chatgptcourses.payments.inbox;

import static com.chatgptcourses.payments.inbox.PaymentInboxTypes.*;
import com.chatgptcourses.commerce.service.CommerceTypes.OrderSnapshot;
import com.chatgptcourses.notifications.TransactionalNotifications;
import com.chatgptcourses.payments.config.StripeSettings;
import com.chatgptcourses.payments.gateway.StripePaymentGateway;
import com.chatgptcourses.payments.refunds.RefundService;
import com.chatgptcourses.payments.service.PaymentTypes.CheckoutFacts;
import com.chatgptcourses.payments.service.PaymentTypes.CheckoutParameters;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/** Provider reads happen in the worker, outside these short, owner-serialized database transactions. */
@Service
public class PaymentReconciler {
    public enum Outcome { READY, WAITING, DONE, IGNORED, LOST }
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final TransactionalNotifications notifications;private final StripeSettings settings;private final TransactionTemplate tx;private final RefundService refunds;
    public PaymentReconciler(JdbcTemplate jdbc,ObjectMapper mapper,TransactionalNotifications notifications,StripeSettings settings,PlatformTransactionManager manager,RefundService refunds){this.jdbc=jdbc;this.mapper=mapper;this.notifications=notifications;this.settings=settings;this.refunds=refunds;tx=new TransactionTemplate(manager);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);}
    Outcome missingSession(Claim claim){return tx.execute(status->{
        if(claim==null||!"RECONCILIATION_JOB".equals(claim.kind())||claim.operationId()==null||claim.orderId()==null)return Outcome.IGNORED;
        var op=lock(claim.operationId(),claim.orderId());if(op==null)return Outcome.IGNORED;if(!claimCurrent(claim))return Outcome.LOST;
        var order=order(op.orderId());
        // Re-read after the network lookup: a concurrent acknowledgement may already have bound the session.
        if(terminal(order)||order.refunded())return Outcome.DONE;
        if(op.session()!=null||!"UNKNOWN".equals(order.payment()))return Outcome.WAITING;
        boolean expired=Boolean.TRUE.equals(jdbc.queryForObject("SELECT checkout_expires_at<=clock_timestamp() AND(state<>'CALLING' OR lease_until<=clock_timestamp()) FROM checkout_operations WHERE id=?",Boolean.class,op.id()));
        if(!expired)return Outcome.WAITING;
        String code="SESSION_NOT_FOUND_AFTER_EXPIRY";issue(op,order,code);
        jdbc.update("UPDATE payment_reconciliation_jobs SET state='DEAD',attempts=attempts+1,next_attempt_at=NULL,lease_id=NULL,lease_until=NULL,last_error_code=?,updated_at=greatest(updated_at,created_at,clock_timestamp()) WHERE id=? AND lease_id=? AND state='PROCESSING'",code,claim.id(),claim.leaseId());
        return Outcome.DONE;
    });}
    Outcome apply(CheckoutFacts facts,Claim claim){
        if(facts==null)throw new Failure("PROVIDER_FACTS_INVALID",false);
        Recognition result=tx.execute(status->recognize(facts,claim));
        if(result==null)throw new Failure("RECONCILIATION_UNAVAILABLE",true);
        if(result.issue()!=null)throw new Failure(result.issue(),false);
        if(result.outcome()!=Outcome.READY)return result.outcome();
        try{return tx.execute(status->fulfill(facts.operationId(),claim));}
        catch(Failure failure){tx.executeWithoutResult(status->fulfillmentIssue(facts.operationId(),failure.retryable()?"RETRYING":"NEEDS_REVIEW"));throw failure;}
        catch(RuntimeException unavailable){tx.executeWithoutResult(status->fulfillmentIssue(facts.operationId(),"RETRYING"));throw new Failure("FULFILLMENT_UNAVAILABLE",true);}
    }
    private Recognition recognize(CheckoutFacts f,Claim claim){
        if(f.operationId()==null||f.orderId()==null)return new Recognition(Outcome.IGNORED,null);
        var op=lock(f.operationId(),f.orderId());if(op==null)return new Recognition(Outcome.IGNORED,null);if(!claimCurrent(claim))return new Recognition(Outcome.LOST,null);
        if("STRIPE_EVENT".equals(claim.kind()))jdbc.update("UPDATE stripe_event_inbox SET operation_id=?,order_id=? WHERE id=? AND lease_id=?",op.id(),op.orderId(),claim.id(),claim.leaseId());
        var order=order(op.orderId());
        if(!matches(f,op,order)) {issue(op,order,"PAYMENT_FACTS_MISMATCH");return new Recognition(Outcome.DONE,"PAYMENT_FACTS_MISMATCH");}
        bind(op,f);
        if(f.refundedAmount()>0)refunds.observeCheckoutRefund(order.id(),f.refundedAmount());
        // Older concurrent reads cannot undo an already established financial success.
        if("PAID".equals(order.payment()))return new Recognition(Outcome.READY,null);
        if(succeeded(f,order)){
            if(terminal(order)){issue(op,order,"TERMINAL_ORDER_PAYMENT");return new Recognition(Outcome.DONE,"TERMINAL_ORDER_PAYMENT");}
            jdbc.update("UPDATE orders SET order_status='CONFIRMED',payment_status='PAID',paid_at=greatest(created_at,clock_timestamp()),fulfillment_status='PENDING',revision=revision+1 WHERE id=?",order.id());
            return new Recognition(Outcome.READY,null);
        }
        if("paid".equals(f.paymentStatus())||"succeeded".equals(f.paymentIntentStatus())){issue(op,order,"PAYMENT_CONFIRMATION_MISMATCH");return new Recognition(Outcome.DONE,"PAYMENT_CONFIRMATION_MISMATCH");}
        if("COMPLETE".equals(op.state())&&!"complete".equals(f.sessionStatus()))return new Recognition(Outcome.WAITING,null);
        if("expired".equals(f.sessionStatus())){
            if(!terminal(order))jdbc.update("UPDATE orders SET order_status='EXPIRED',payment_status='EXPIRED',fulfillment_status='NOT_STARTED',active_intention_key=NULL,revision=revision+1 WHERE id=?",order.id());
            operationState(op,"EXPIRED",null);return new Recognition(Outcome.DONE,null);
        }
        if("canceled".equals(f.paymentIntentStatus())||"requires_payment_method".equals(f.paymentIntentStatus())&&"complete".equals(f.sessionStatus())){
            if(!terminal(order))jdbc.update("UPDATE orders SET order_status='CANCELLED',payment_status='FAILED',fulfillment_status='NOT_STARTED',active_intention_key=NULL,revision=revision+1 WHERE id=?",order.id());
            operationState(op,"complete".equals(f.sessionStatus())||"COMPLETE".equals(op.state())?"COMPLETE":"FAILED",null);return new Recognition(Outcome.DONE,null);
        }
        if(terminal(order))return new Recognition(Outcome.DONE,null);
        String payment="processing".equals(f.paymentIntentStatus())||"complete".equals(f.sessionStatus())?"PROCESSING":"REQUIRES_PAYMENT";
        if(!payment.equals(order.payment())||!"AWAITING_PAYMENT".equals(order.state()))jdbc.update("UPDATE orders SET order_status='AWAITING_PAYMENT',payment_status=?,fulfillment_status='NOT_STARTED',revision=revision+1 WHERE id=?",payment,order.id());
        return new Recognition(Outcome.WAITING,null);
    }
    private boolean matches(CheckoutFacts f,Operation op,Order order){
        var p=op.parameters();var snapshot=order.snapshot();
        if(!settings.accountId().equals(f.accountId())||!op.account().equals(f.accountId())||f.livemode()||op.live()||!StripeSettings.API_VERSION.equals(f.apiVersion())||!"payment".equals(f.sessionMode())
            ||!op.orderId().equals(f.orderId())||!op.id().equals(f.operationId())||!op.orderId().toString().equals(f.clientReferenceId())||f.sessionId()==null||!f.sessionId().matches("cs_[A-Za-z0-9_]{1,251}")
            ||op.session()!=null&&!op.session().equals(f.sessionId())||f.amountTotal()==null||f.amountTotal()!=snapshot.total().amountMinor()||op.amount()!=snapshot.total().amountMinor()||!sameCurrency(f.currency(),snapshot.total().currency())||!sameCurrency(op.currency(),snapshot.total().currency())||f.refundedAmount()<0
            ||!("open".equals(f.sessionStatus())||"complete".equals(f.sessionStatus())||"expired".equals(f.sessionStatus()))||!("paid".equals(f.paymentStatus())||"unpaid".equals(f.paymentStatus()))
            ||f.expiresAt()==null||f.expiresAt().getEpochSecond()!=p.expiresAt().getEpochSecond())return false;
        if(!p.offerRevisionId().equals(snapshot.offerRevisionId())||p.amountMinor()!=snapshot.total().amountMinor()||!p.orderId().equals(order.id())||!p.operationId().equals(op.id())||f.lines().size()!=1)return false;
        var line=f.lines().getFirst();return line.quantity()==1&&line.amountMinor()==snapshot.total().amountMinor()&&sameCurrency(line.currency(),snapshot.total().currency())&&snapshot.offerRevisionId().toString().equals(line.productReference());
    }
    private static boolean succeeded(CheckoutFacts f,Order order){return "complete".equals(f.sessionStatus())&&"paid".equals(f.paymentStatus())&&f.paymentIntentId()!=null&&f.paymentIntentId().matches("pi_[A-Za-z0-9_]{1,251}")&&"succeeded".equals(f.paymentIntentStatus())&&f.amountReceived()!=null&&f.amountReceived()==order.snapshot().total().amountMinor();}
    private void bind(Operation op,CheckoutFacts f){
        String state="COMPLETE".equals(op.state())||"complete".equals(f.sessionStatus())?"COMPLETE":"expired".equals(f.sessionStatus())?"EXPIRED":"OPEN";
        String url=safeUrl(f.url());
        jdbc.update("UPDATE checkout_operations SET session_id=?,session_url=coalesce(session_url,?),payment_intent_id=coalesce(payment_intent_id,?),state=?,lease_token=NULL,lease_until=NULL,last_error_code=NULL,updated_at=greatest(created_at,clock_timestamp()),revision=revision+1 WHERE id=?",f.sessionId(),url,f.paymentIntentId(),state,op.id());
    }
    private Outcome fulfill(UUID operation,Claim claim){
        var ids=jdbc.query("SELECT order_id FROM checkout_operations WHERE id=?",(rs,n)->rs.getObject(1,UUID.class),operation);if(ids.isEmpty())return Outcome.IGNORED;
        var op=lock(operation,ids.getFirst());if(op==null)return Outcome.IGNORED;if(!claimCurrent(claim))return Outcome.LOST;var order=order(op.orderId());
        if(!"PAID".equals(order.payment()))return Outcome.DONE;
        if(refunds.activationBlocked(order.id())){if(!"READY".equals(order.fulfillment())&&!"NEEDS_REVIEW".equals(order.fulfillment()))jdbc.update("UPDATE orders SET fulfillment_status='NEEDS_REVIEW',revision=revision+1 WHERE id=?",order.id());return Outcome.DONE;}
        boolean revoked=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM access_grants g JOIN order_resources r ON r.id=g.order_resource_id WHERE r.order_id=? AND g.revoked_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM refund_access_blocks b WHERE b.order_resource_id=r.id))",Boolean.class,order.id()));
        if(revoked){if(!"NEEDS_REVIEW".equals(order.fulfillment()))jdbc.update("UPDATE orders SET fulfillment_status='NEEDS_REVIEW',revision=revision+1 WHERE id=?",order.id());return Outcome.DONE;}
        if("READY".equals(order.fulfillment()))return Outcome.READY;
        var resources=jdbc.queryForList("SELECT id,resource_id,version_id,locales::text AS languages FROM order_resources WHERE order_id=? ORDER BY id",order.id());var expected=order.snapshot().resources();
        if(resources.size()!=expected.size()||resources.isEmpty())throw new Failure("ORDER_RESOURCES_MISMATCH",false);
        var conditions=order.snapshot().conditions();if(conditions==null||conditions.access()==null||conditions.access().mode()==null||conditions.updates()==null||conditions.versionPolicy()==null)throw new Failure("ORDER_CONDITIONS_INVALID",false);
        Instant activation=now();Instant expiry="FIXED".equals(conditions.access().mode())?activation.plus(conditions.access().days(),ChronoUnit.DAYS):null;
        if(!"FIXED".equals(conditions.access().mode())&&!"UNLIMITED".equals(conditions.access().mode()))throw new Failure("ORDER_CONDITIONS_INVALID",false);
        Instant updates="PERIOD".equals(conditions.updates().mode())?activation.plus(conditions.updates().days(),ChronoUnit.DAYS):null;
        for(Map<String,Object> resource:resources){
            UUID id=(UUID)resource.get("id");var match=expected.stream().filter(r->r.id().equals(id)&&r.resourceId().equals(resource.get("resource_id"))&&r.versionId().equals(resource.get("version_id"))).findFirst().orElseThrow(()->new Failure("ORDER_RESOURCES_MISMATCH",false));
            if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM refund_access_blocks WHERE order_resource_id=?)",Boolean.class,id)))continue;
            if(!mapper.readTree(resource.get("languages").toString()).equals(mapper.valueToTree(match.locales())))throw new Failure("ORDER_RESOURCES_MISMATCH",false);
            jdbc.update("""
                INSERT INTO access_grants(id,owner_id,resource_id,version_id,origin_type,order_resource_id,locales,version_policy,starts_at,expires_at,updates_until)
                VALUES(?,?,?,?,'ORDER_LINE',?,?::jsonb,?,?,?,?) ON CONFLICT(order_resource_id,resource_id) WHERE order_resource_id IS NOT NULL DO NOTHING
                """,UUID.randomUUID(),order.owner(),match.resourceId(),match.versionId(),id,mapper.writeValueAsString(match.locales()),conditions.versionPolicy(),Timestamp.from(activation),expiry==null?null:Timestamp.from(expiry),updates==null?null:Timestamp.from(updates));
        }
        String email=jdbc.queryForObject("SELECT normalized_email FROM user_accounts WHERE id=?",String.class,order.owner());
        notifications.accessActivated(order.id(),order.owner(),email,order.snapshot().locale(),order.snapshot().title().replaceAll("\\s+"," ").strip());
        jdbc.update("UPDATE orders SET fulfillment_status='READY',revision=revision+1 WHERE id=?",order.id());return Outcome.READY;
    }
    private Operation lock(UUID operation,UUID order){
        var owners=jdbc.query("SELECT owner_id FROM checkout_operations WHERE id=? AND order_id=?",(rs,n)->rs.getObject(1,UUID.class),operation,order);if(owners.isEmpty())return null;
        jdbc.query("SELECT id FROM user_accounts WHERE id=? FOR NO KEY UPDATE",(rs,n)->rs.getObject(1,UUID.class),owners.getFirst());
        if(jdbc.query("SELECT id FROM orders WHERE id=? AND owner_id=? FOR UPDATE",(rs,n)->rs.getObject(1,UUID.class),order,owners.getFirst()).isEmpty())return null;
        return jdbc.queryForObject("SELECT * FROM checkout_operations WHERE id=? FOR UPDATE",(rs,n)->new Operation(rs.getObject("id",UUID.class),rs.getObject("order_id",UUID.class),rs.getObject("owner_id",UUID.class),rs.getString("account_id"),rs.getBoolean("livemode"),rs.getLong("amount_minor"),rs.getString("currency"),rs.getString("session_id"),rs.getString("state"),mapper.readValue(rs.getString("request_json"),CheckoutParameters.class)),operation);
    }
    private Order order(UUID id){return jdbc.queryForObject("SELECT * FROM orders WHERE id=?",(rs,n)->new Order(rs.getObject("id",UUID.class),rs.getObject("owner_id",UUID.class),rs.getString("order_status"),rs.getString("payment_status"),rs.getString("fulfillment_status"),rs.getBoolean("payment_refunded"),mapper.readValue(rs.getString("snapshot_json"),OrderSnapshot.class)),id);}
    private boolean claimCurrent(Claim claim){if(claim==null)return false;String table="STRIPE_EVENT".equals(claim.kind())?"stripe_event_inbox":"payment_reconciliation_jobs";return !jdbc.query("SELECT id FROM "+table+" WHERE id=? AND state='PROCESSING' AND lease_id=? AND lease_until>clock_timestamp() FOR UPDATE",(rs,n)->rs.getObject(1,UUID.class),claim.id(),claim.leaseId()).isEmpty();}
    private void issue(Operation op,Order order,String code){
        String state=terminal(order)?order.state():"NEEDS_REVIEW";String payment="PAID".equals(order.payment())?"PAID":"UNKNOWN";
        jdbc.update("UPDATE orders SET order_status=?,payment_status=?,fulfillment_status='NEEDS_REVIEW',revision=revision+1 WHERE id=?",state,payment,order.id());operationState(op,"COMPLETE".equals(op.state())?"COMPLETE":"NEEDS_REVIEW",code);
    }
    private void operationState(Operation op,String state,String code){jdbc.update("UPDATE checkout_operations SET state=?,lease_token=NULL,lease_until=NULL,last_error_code=?,updated_at=greatest(created_at,clock_timestamp()),revision=revision+1 WHERE id=?",state,code,op.id());}
    void exhausted(UUID operation){if(operation!=null)tx.executeWithoutResult(status->fulfillmentIssue(operation,"NEEDS_REVIEW"));}
    private void fulfillmentIssue(UUID operation,String state){var ids=jdbc.query("SELECT order_id FROM checkout_operations WHERE id=?",(rs,n)->rs.getObject(1,UUID.class),operation);if(ids.isEmpty())return;var op=lock(operation,ids.getFirst());if(op!=null)jdbc.update("UPDATE orders SET fulfillment_status=?,revision=revision+1 WHERE id=? AND payment_status='PAID' AND fulfillment_status<>'READY' AND NOT payment_refunded",state,op.orderId());}
    private String safeUrl(String value){return StripePaymentGateway.validCheckoutUrl(value)?value:null;}
    private Instant now(){return jdbc.queryForObject("SELECT clock_timestamp()",Timestamp.class).toInstant();}
    private static boolean terminal(Order order){return "EXPIRED".equals(order.state())||"CANCELLED".equals(order.state());}
    private static boolean sameCurrency(String first,String second){return first!=null&&second!=null&&first.equalsIgnoreCase(second);}
    private record Recognition(Outcome outcome,String issue){ }
    private record Operation(UUID id,UUID orderId,UUID owner,String account,boolean live,long amount,String currency,String session,String state,CheckoutParameters parameters){ }
    private record Order(UUID id,UUID owner,String state,String payment,String fulfillment,boolean refunded,OrderSnapshot snapshot){ }
    static final class Failure extends RuntimeException {private final String code;private final boolean retryable;Failure(String code,boolean retryable){super("Payment reconciliation unavailable");this.code=code;this.retryable=retryable;}String code(){return code;}boolean retryable(){return retryable;}}
}
