package com.chatgptcourses.payments.inbox;

import static com.chatgptcourses.payments.inbox.PaymentInboxTypes.*;
import com.chatgptcourses.commerce.service.PaymentGateway;
import com.chatgptcourses.payments.service.PaymentGatewayException;
import com.chatgptcourses.payments.service.PaymentTypes.CheckoutFacts;
import com.chatgptcourses.payments.service.PaymentTypes.CheckoutParameters;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/** Durable claims commit before provider GETs. No path in this worker creates a Checkout Session. */
@Service
public class PaymentInboxWorker {
    private static final Logger LOG=LoggerFactory.getLogger(PaymentInboxWorker.class);
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final PaymentGateway gateway;private final PaymentReconciler reconciler;private final PaymentInboxSettings settings;private final TransactionTemplate tx;
    public PaymentInboxWorker(JdbcTemplate jdbc,ObjectMapper mapper,PaymentGateway gateway,PaymentReconciler reconciler,PaymentInboxSettings settings,PlatformTransactionManager manager){this.jdbc=jdbc;this.mapper=mapper;this.gateway=gateway;this.reconciler=reconciler;this.settings=settings;tx=new TransactionTemplate(manager);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);}
    @Scheduled(fixedDelayString="${courses.payments.inbox.poll-delay:1s}",scheduler="paymentInboxScheduler")
    void poll(){if(!settings.workerEnabled()||!gateway.configured())return;try{for(int i=0;i<8&&runOnce();i++){if(Thread.currentThread().isInterrupted())break;}}catch(RuntimeException unavailable){LOG.warn("Payment reconciliation worker is temporarily unavailable");}}
    public boolean runOnce(){
        if(!gateway.configured())return false;
        List<UUID> exhausted=tx.execute(status->maintenance());if(exhausted!=null)for(var operation:exhausted)if(operation!=null)reconciler.exhausted(operation);
        Claim claim=tx.execute(status->claim());if(claim==null)return false;
        try{
            CheckoutFacts facts;
            if(claim.sessionId()!=null)facts=gateway.retrieveCheckoutFacts(claim.sessionId());
            else{var parameters=jdbc.queryForObject("SELECT request_json::text FROM checkout_operations WHERE id=?",String.class,claim.operationId());facts=gateway.findCheckoutFacts(mapper.readValue(parameters,CheckoutParameters.class)).orElse(null);}
            if(facts==null){var outcome=reconciler.missingSession(claim);if(outcome!=PaymentReconciler.Outcome.LOST)finish(claim,outcome,null);return true;}
            var outcome=reconciler.apply(facts,claim);if(outcome!=PaymentReconciler.Outcome.LOST)finish(claim,outcome,facts);return true;
        }catch(PaymentReconciler.Failure failure){failed(claim,failure.code(),failure.retryable());return true;}
        catch(PaymentGatewayException failure){failed(claim,safeCode(failure.reason()),failure.ambiguous()||"PROVIDER_RATE_LIMITED".equals(failure.reason()));return true;}
        catch(RuntimeException unavailable){warnFailure(claim,unavailable);failed(claim,"RECONCILIATION_UNAVAILABLE",true);return true;}
    }
    private List<UUID> maintenance(){
        var lost=new java.util.ArrayList<UUID>();
        for(String table:List.of("stripe_event_inbox","payment_reconciliation_jobs"))lost.addAll(jdbc.query("UPDATE "+table+" SET state=CASE WHEN attempts+1>=? THEN 'DEAD' ELSE 'RETRY' END,attempts=attempts+1,next_attempt_at=CASE WHEN attempts+1>=? THEN NULL ELSE clock_timestamp() END,lease_id=NULL,lease_until=NULL,last_error_code='LEASE_EXPIRED',updated_at=clock_timestamp() WHERE state='PROCESSING' AND lease_until<=clock_timestamp()"+("stripe_event_inbox".equals(table)?" AND event_type IN('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired')":"")+" RETURNING CASE WHEN state='DEAD' THEN operation_id ELSE NULL END",(rs,n)->rs.getObject(1,UUID.class),settings.maxAttempts(),settings.maxAttempts()));
        jdbc.update("""
            INSERT INTO payment_reconciliation_jobs(id,operation_id,order_id,state,next_attempt_at,last_error_code)
            SELECT gen_random_uuid(),p.id,p.order_id,CASE WHEN p.state='NEEDS_REVIEW' THEN 'DEAD' ELSE 'PENDING' END,
              CASE WHEN p.state='NEEDS_REVIEW' THEN NULL ELSE clock_timestamp() END,p.last_error_code FROM checkout_operations p JOIN orders o ON o.id=p.order_id
              WHERE NOT EXISTS(SELECT 1 FROM payment_reconciliation_jobs j WHERE j.operation_id=p.id)
                AND NOT o.payment_refunded AND(p.state IN('PREPARED','UNKNOWN','OPEN','NEEDS_REVIEW') OR(p.state='CALLING' AND p.lease_until<=clock_timestamp())
                  OR(p.state='COMPLETE' AND(o.payment_status='PROCESSING' OR o.fulfillment_status IN('PENDING','RETRYING'))))
              ORDER BY p.created_at,p.id LIMIT 25 ON CONFLICT(operation_id) DO NOTHING
            """);return lost;
    }
    private Claim claim(){
        var events=jdbc.query("SELECT id,object_id,operation_id,order_id FROM stripe_event_inbox WHERE event_type IN('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired') AND state IN('PENDING','RETRY') AND next_attempt_at<=clock_timestamp() ORDER BY next_attempt_at,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",(rs,n)->new Claim(rs.getObject(1,UUID.class),"STRIPE_EVENT",UUID.randomUUID(),rs.getString(2),rs.getObject(3,UUID.class),rs.getObject(4,UUID.class)));
        if(!events.isEmpty()){var event=events.getFirst();claimed(event);return event;}
        var jobs=jdbc.query("""
            SELECT j.id,p.session_id,j.operation_id,j.order_id FROM payment_reconciliation_jobs j JOIN checkout_operations p ON p.id=j.operation_id
              WHERE j.state IN('PENDING','RETRY','WAITING') AND j.next_attempt_at<=clock_timestamp()
                AND(p.state<>'CALLING' OR p.lease_until<=clock_timestamp())
              ORDER BY j.next_attempt_at,j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED
            """,(rs,n)->new Claim(rs.getObject(1,UUID.class),"RECONCILIATION_JOB",UUID.randomUUID(),rs.getString(2),rs.getObject(3,UUID.class),rs.getObject(4,UUID.class)));
        if(jobs.isEmpty())return null;var job=jobs.getFirst();claimed(job);return job;
    }
    private void claimed(Claim claim){jdbc.update("UPDATE "+table(claim)+" SET state='PROCESSING',next_attempt_at=NULL,lease_id=?,lease_until=clock_timestamp()+(?*interval '1 millisecond'),total_claims=total_claims+1,updated_at=clock_timestamp() WHERE id=?",claim.leaseId(),settings.leaseDuration().toMillis(),claim.id());}
    private void finish(Claim claim,PaymentReconciler.Outcome outcome,CheckoutFacts facts){tx.executeWithoutResult(status->{
        String table=table(claim);boolean event="STRIPE_EVENT".equals(claim.kind()),waiting=!event&&outcome==PaymentReconciler.Outcome.WAITING;
        if(event&&facts!=null&&outcome!=PaymentReconciler.Outcome.IGNORED)jdbc.update("UPDATE stripe_event_inbox SET operation_id=?,order_id=? WHERE id=? AND lease_id=? AND state='PROCESSING'",facts.operationId(),facts.orderId(),claim.id(),claim.leaseId());
        String target=waiting?"WAITING":event&&outcome==PaymentReconciler.Outcome.IGNORED?"IGNORED":"PROCESSED";
        jdbc.update("UPDATE "+table+" SET state=?,attempts=0,next_attempt_at=CASE WHEN ? THEN clock_timestamp()+(?*interval '1 millisecond') ELSE NULL END,processed_at=CASE WHEN ? THEN NULL ELSE clock_timestamp() END,lease_id=NULL,lease_until=NULL,last_error_code=NULL,updated_at=clock_timestamp() WHERE id=? AND lease_id=? AND state='PROCESSING'",target,waiting,settings.waitingDelay().toMillis(),waiting,claim.id(),claim.leaseId());
        if(facts!=null&&(outcome==PaymentReconciler.Outcome.READY||outcome==PaymentReconciler.Outcome.DONE))jdbc.update("UPDATE payment_reconciliation_jobs SET state='PROCESSED',attempts=0,next_attempt_at=NULL,processed_at=clock_timestamp(),lease_id=NULL,lease_until=NULL,last_error_code=NULL,updated_at=clock_timestamp() WHERE operation_id=? AND state IN('PENDING','RETRY','WAITING')",facts.operationId());
    });}
    private void failed(Claim claim,String code,boolean retryable){Boolean exhausted=tx.execute(status->{
        var attempts=jdbc.query("SELECT attempts FROM "+table(claim)+" WHERE id=? AND state='PROCESSING' AND lease_id=? FOR UPDATE",(rs,n)->rs.getInt(1)+1,claim.id(),claim.leaseId());if(attempts.isEmpty())return false;
        int count=attempts.getFirst();boolean dead=!retryable||count>=settings.maxAttempts();long delay=Math.min(settings.retryMax().toMillis(),settings.retryBase().toMillis()*(1L<<Math.min(20,count-1)));
        jdbc.update("UPDATE "+table(claim)+" SET state=?,attempts=?,next_attempt_at=CASE WHEN ? THEN NULL ELSE clock_timestamp()+(?*interval '1 millisecond') END,lease_id=NULL,lease_until=NULL,last_error_code=?,updated_at=clock_timestamp() WHERE id=? AND lease_id=?",dead?"DEAD":"RETRY",count,dead,delay,safeCode(code),claim.id(),claim.leaseId());return dead;
    });if(Boolean.TRUE.equals(exhausted)){UUID operation=claim.operationId();if(operation==null&&"STRIPE_EVENT".equals(claim.kind()))operation=jdbc.queryForObject("SELECT operation_id FROM stripe_event_inbox WHERE id=?",UUID.class,claim.id());reconciler.exhausted(operation);}}
    private static String table(Claim claim){return "STRIPE_EVENT".equals(claim.kind())?"stripe_event_inbox":"payment_reconciliation_jobs";}
    private static void warnFailure(Claim claim,RuntimeException failure){
        String sqlState="NONE",constraint="NONE";Throwable cause=failure;
        for(int depth=0;cause!=null&&depth<8;depth++,cause=cause.getCause()){
            if(cause instanceof SQLException sql&&sql.getSQLState()!=null&&sql.getSQLState().matches("[A-Z0-9]{5}"))sqlState=sql.getSQLState();
            // The JDBC driver stays a runtime dependency. Read only these two diagnostic accessors.
            if("org.postgresql.util.PSQLException".equals(cause.getClass().getName()))try{
                var error=cause.getClass().getMethod("getServerErrorMessage").invoke(cause);
                var name=error==null?null:error.getClass().getMethod("getConstraint").invoke(error);
                if(name instanceof String value&&value.matches("[A-Za-z0-9_]{1,63}"))constraint=value;
            }catch(ReflectiveOperationException|RuntimeException ignored){/* No provider message or stack trace. */}
        }
        String exceptionClass=failure.getClass().getSimpleName();if(!exceptionClass.matches("[A-Za-z0-9_]{1,128}"))exceptionClass="UnknownException";
        String kind="STRIPE_EVENT".equals(claim.kind())?"STRIPE_EVENT":"RECONCILIATION_JOB";
        LOG.warn("Payment reconciliation failed workId={} kind={} exceptionClass={} sqlState={} constraint={}",claim.id(),kind,exceptionClass,sqlState,constraint);
    }
    private static String safeCode(String value){return value!=null&&value.matches("[A-Z][A-Z0-9_]{0,63}")?value:"RECONCILIATION_UNAVAILABLE";}
}
