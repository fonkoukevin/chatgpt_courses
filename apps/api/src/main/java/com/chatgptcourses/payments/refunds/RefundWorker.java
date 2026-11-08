package com.chatgptcourses.payments.refunds;

import com.chatgptcourses.commerce.service.PaymentGateway;
import com.chatgptcourses.payments.config.StripeSettings;
import com.chatgptcourses.payments.service.PaymentGatewayException;
import java.util.List;
import java.util.UUID;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Durable, bounded reconciliation. This worker never calls a financial POST. */
@Service
public class RefundWorker {
    private static final String EVENTS="'refund.created','refund.updated','refund.failed','charge.refunded'";
    private final RefundStore db;private final RefundService refunds;private final PaymentGateway gateway;private final RefundSettings settings;private final StripeSettings stripe;private final TransactionTemplate tx;
    public RefundWorker(RefundStore db,RefundService refunds,PaymentGateway gateway,RefundSettings settings,StripeSettings stripe,PlatformTransactionManager manager){this.db=db;this.refunds=refunds;this.gateway=gateway;this.settings=settings;this.stripe=stripe;tx=new TransactionTemplate(manager);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);}
    @Scheduled(fixedDelayString="${courses.payments.refunds.poll-delay:2s}",scheduler="refundScheduler")
    void poll(){if(!settings.workerEnabled()||!gateway.configured())return;try{for(int i=0;i<4&&runOnce();i++)if(Thread.currentThread().isInterrupted())break;}catch(RuntimeException unavailable){LoggerFactory.getLogger(RefundWorker.class).warn("Refund reconciliation temporarily unavailable");}}
    public boolean runOnce(){if(!gateway.configured())return false;maintenance();Work work=tx.execute(status->claim());if(work==null)return false;
        try{
            UUID order=work.order();
            if(work.event()){
                var facts=gateway.retrieveRefundPayment(work.object(),work.type());var matches=db.jdbc.query("SELECT order_id FROM checkout_operations WHERE payment_intent_id=? AND account_id=? AND NOT livemode",(rs,n)->rs.getObject(1,UUID.class),facts.paymentIntentId(),stripe.accountId());
                if(matches.size()!=1){failed(work,"REFUND_ORDER_UNMAPPED",true);return true;}order=matches.getFirst();refunds.applyFacts(order,facts);
            }else refunds.refreshOrder(order);
            final UUID target=order;tx.executeWithoutResult(status->{
                if(work.event())db.jdbc.update("UPDATE stripe_event_inbox SET state='PROCESSED',order_id=?,operation_id=(SELECT payment_operation_id FROM orders WHERE id=?),attempts=0,lease_id=NULL,lease_until=NULL,next_attempt_at=NULL,last_error_code=NULL,processed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=? AND state='PROCESSING' AND lease_id=?",target,target,work.id(),work.lease());
                else db.jdbc.update("UPDATE refund_reconciliation_jobs SET state='WAITING',attempts=0,lease_id=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+(?*interval '1 millisecond'),last_error_code=NULL,updated_at=clock_timestamp() WHERE id=? AND state='PROCESSING' AND lease_id=?",settings.retryDelay().toMillis(),work.id(),work.lease());
                // A real order lookup can unblock a previously unmapped provider envelope.
                db.jdbc.update("UPDATE stripe_event_inbox SET next_attempt_at=clock_timestamp() WHERE event_type IN("+EVENTS+") AND state='RETRY' AND last_error_code='REFUND_ORDER_UNMAPPED'");
            });return true;
        }catch(PaymentGatewayException failure){failed(work,RefundService.safeCode(failure.reason()),failure.ambiguous()||"PROVIDER_RATE_LIMITED".equals(failure.reason()));return true;}
        catch(RuntimeException unavailable){failed(work,"REFUND_RECONCILIATION_UNAVAILABLE",true);return true;}
    }
    private void maintenance(){
        var expired=db.jdbc.query("SELECT id,owner_id,order_id FROM refund_operations WHERE state='CALLING' AND lease_until<=clock_timestamp() ORDER BY owner_id,order_id,id LIMIT 25",(rs,n)->new Expired(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class)));
        for(var candidate:expired)tx.executeWithoutResult(status->{
            // The read above acquires no operation lock. Revalidate only after the canonical parent locks.
            db.lockOwner(candidate.owner());db.order(candidate.order(),true);
            int changed=db.jdbc.update("UPDATE refund_operations SET state='UNKNOWN',lease_id=NULL,lease_until=NULL,last_error_code='REFUND_SUBMISSION_LEASE_EXPIRED',updated_at=greatest(created_at,updated_at,clock_timestamp()),revision=revision+1 WHERE id=? AND state='CALLING' AND lease_until<=clock_timestamp()",candidate.id());
            if(changed==1)db.enqueue(candidate.order());
        });
        tx.executeWithoutResult(status->{
            db.jdbc.update("UPDATE refund_reconciliation_jobs SET state=CASE WHEN attempts+1>=? THEN 'DEAD' ELSE 'RETRY' END,attempts=attempts+1,lease_id=NULL,lease_until=NULL,next_attempt_at=CASE WHEN attempts+1>=? THEN NULL ELSE clock_timestamp() END,last_error_code='REFUND_LEASE_EXPIRED',updated_at=clock_timestamp() WHERE state='PROCESSING' AND lease_until<=clock_timestamp()",settings.maxAttempts(),settings.maxAttempts());
            db.jdbc.update("UPDATE stripe_event_inbox SET state=CASE WHEN attempts+1>=? THEN 'DEAD' ELSE 'RETRY' END,attempts=attempts+1,lease_id=NULL,lease_until=NULL,next_attempt_at=CASE WHEN attempts+1>=? THEN NULL ELSE clock_timestamp() END,last_error_code='REFUND_LEASE_EXPIRED',updated_at=clock_timestamp() WHERE event_type IN("+EVENTS+") AND state='PROCESSING' AND lease_until<=clock_timestamp()",settings.maxAttempts(),settings.maxAttempts());
        });
        var undiscovered=db.jdbc.query("SELECT o.id,o.owner_id FROM orders o JOIN checkout_operations p ON p.id=o.payment_operation_id WHERE o.payment_status='PAID' AND p.account_id=? AND NOT p.livemode AND NOT EXISTS(SELECT 1 FROM refund_reconciliation_jobs j WHERE j.order_id=o.id) ORDER BY o.owner_id,o.id LIMIT 25",(rs,n)->new Expired(null,rs.getObject(2,UUID.class),rs.getObject(1,UUID.class)),stripe.accountId());
        for(var candidate:undiscovered)tx.executeWithoutResult(status->{db.lockOwner(candidate.owner());db.order(candidate.order(),true);db.jdbc.update("INSERT INTO refund_reconciliation_jobs(id,order_id,state,next_attempt_at) VALUES(?,?,'PENDING',clock_timestamp()) ON CONFLICT(order_id) DO NOTHING",UUID.randomUUID(),candidate.order());});
    }
    private Work claim(){
        var events=db.jdbc.query("SELECT id,object_id,event_type,order_id FROM stripe_event_inbox WHERE event_type IN("+EVENTS+") AND state IN('PENDING','RETRY') AND next_attempt_at<=clock_timestamp() ORDER BY next_attempt_at,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",(rs,n)->new Work(rs.getObject(1,UUID.class),true,rs.getObject(4,UUID.class),rs.getString(2),rs.getString(3),UUID.randomUUID()));
        if(!events.isEmpty()){var w=events.getFirst();db.jdbc.update("UPDATE stripe_event_inbox SET state='PROCESSING',lease_id=?,lease_until=clock_timestamp()+(?*interval '1 millisecond'),next_attempt_at=NULL,total_claims=total_claims+1,updated_at=clock_timestamp() WHERE id=?",w.lease(),settings.leaseDuration().toMillis(),w.id());return w;}
        var jobs=db.jdbc.query("SELECT id,order_id FROM refund_reconciliation_jobs WHERE state IN('PENDING','WAITING','RETRY') AND next_attempt_at<=clock_timestamp() ORDER BY next_attempt_at,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",(rs,n)->new Work(rs.getObject(1,UUID.class),false,rs.getObject(2,UUID.class),null,null,UUID.randomUUID()));
        if(jobs.isEmpty())return null;var w=jobs.getFirst();db.jdbc.update("UPDATE refund_reconciliation_jobs SET state='PROCESSING',lease_id=?,lease_until=clock_timestamp()+(?*interval '1 millisecond'),next_attempt_at=NULL,updated_at=clock_timestamp() WHERE id=?",w.lease(),settings.leaseDuration().toMillis(),w.id());return w;
    }
    private void failed(Work w,String code,boolean retryable){tx.executeWithoutResult(status->{RefundStore.Order order=null;if(w.order()!=null){order=db.order(w.order(),false);db.lockOwner(order.owner());order=db.order(order.id(),true);}String table=w.event()?"stripe_event_inbox":"refund_reconciliation_jobs";var count=db.jdbc.query("SELECT attempts FROM "+table+" WHERE id=? AND state='PROCESSING' AND lease_id=? FOR UPDATE",(rs,n)->rs.getInt(1)+1,w.id(),w.lease());if(count.isEmpty())return;boolean dead=!retryable||count.getFirst()>=settings.maxAttempts();db.jdbc.update("UPDATE "+table+" SET state=?,attempts=?,lease_id=NULL,lease_until=NULL,next_attempt_at=CASE WHEN ? THEN NULL ELSE clock_timestamp()+(?*interval '1 millisecond') END,last_error_code=?,updated_at=clock_timestamp() WHERE id=? AND lease_id=?",dead?"DEAD":"RETRY",count.getFirst(),dead,settings.retryDelay().toMillis(),code,w.id(),w.lease());
            if(dead&&order!=null&&!order.review())db.jdbc.update("UPDATE orders SET refund_review_required=true,revision=revision+1 WHERE id=?",order.id());
        });}
    private record Work(UUID id,boolean event,UUID order,String object,String type,UUID lease){ }
    private record Expired(UUID id,UUID owner,UUID order){ }
}
