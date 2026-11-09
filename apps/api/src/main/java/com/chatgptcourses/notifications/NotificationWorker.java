package com.chatgptcourses.notifications;

import static com.chatgptcourses.notifications.NotificationTypes.*;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailParseException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Claim commits before SMTP. An abandoned or ambiguous claim never becomes an automatic duplicate. */
@Component
public class NotificationWorker {
    private static final Logger LOG=LoggerFactory.getLogger(NotificationWorker.class);
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final NotificationCipher cipher;
    private final NotificationSender sender;
    private final OutboxSettings settings;
    private final NotificationSettings mail;
    public NotificationWorker(JdbcTemplate jdbc,PlatformTransactionManager manager,NotificationCipher cipher,NotificationSender sender,OutboxSettings settings,NotificationSettings mail){
        this.jdbc=jdbc;this.cipher=cipher;this.sender=sender;this.settings=settings;this.mail=mail;
        transactions=new TransactionTemplate(manager);transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    @Scheduled(fixedDelayString="${courses.notifications.outbox.poll-delay:1s}",scheduler="notificationOutboxScheduler")
    void poll(){if(!settings.workerEnabled())return;try{for(int i=0;i<8&&runOnce();i++){/* bounded batch */}}catch(RuntimeException failure){LOG.warn("Notification worker is temporarily unavailable");}}
    public boolean runOnce(){
        transactions.executeWithoutResult(status->maintenance());
        if("disabled".equals(mail.mailMode()))return false;
        Claim claim=transactions.execute(status->claim());if(claim==null)return false;
        Payload payload;
        try{payload=cipher.decrypt(claim);}catch(RuntimeException failure){finish(claim,"DEAD","PAYLOAD_INVALID",false);return true;}
        if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM notification_outbox WHERE id=? AND status='PROCESSING' AND lease_id=? AND lease_until>clock_timestamp())",Boolean.class,claim.id(),claim.leaseId())))return true;
        // IdentityService validates reset-token expiry with the application clock. A lagging PostgreSQL
        // clock must not authorize delivery of a token that the application already rejects.
        if(!claim.expiresAt().isAfter(Instant.now())||!Boolean.TRUE.equals(jdbc.queryForObject("SELECT expires_at>clock_timestamp() FROM notification_outbox WHERE id=?",Boolean.class,claim.id()))){finish(claim,"DEAD","PAYLOAD_EXPIRED",false);return true;}
        try{sender.send(claim.id(),claim.type(),payload);}
        catch(RuntimeException failure){
            String code=classify(failure);
            if("SMTP_CONNECT".equals(code))finish(claim,"RETRY",code,true);
            else finish(claim,"SMTP_AUTH".equals(code)||"SMTP_INVALID".equals(code)?"DEAD":"INDETERMINATE",code,false);
            return true;
        }
        // A DB failure here leaves PROCESSING; lease recovery marks it INDETERMINATE, never auto-resends.
        transactions.executeWithoutResult(status->jdbc.update("UPDATE notification_outbox SET status='SENT',payload_ciphertext=NULL,(purged_at,sent_at,updated_at)=(SELECT stamp,stamp,stamp FROM (SELECT greatest(notification_outbox.updated_at,notification_outbox.created_at,clock_timestamp()) AS stamp) observed),lease_id=NULL,lease_until=NULL,next_attempt_at=NULL,last_error_code=NULL WHERE id=? AND status='PROCESSING' AND lease_id=?",claim.id(),claim.leaseId()));
        return true;
    }
    private void maintenance(){
        jdbc.update("UPDATE notification_outbox SET status='INDETERMINATE',last_error_code='LEASE_EXPIRED',lease_id=NULL,lease_until=NULL,next_attempt_at=NULL,updated_at=greatest(updated_at,created_at,clock_timestamp()) WHERE status='PROCESSING' AND lease_until<=clock_timestamp()");
        jdbc.update("UPDATE notification_outbox SET status=CASE WHEN status IN('PENDING','RETRY') THEN 'DEAD' ELSE status END,last_error_code=CASE WHEN status IN('PENDING','RETRY') THEN 'PAYLOAD_EXPIRED' ELSE last_error_code END,payload_ciphertext=NULL,(purged_at,updated_at)=(SELECT stamp,stamp FROM (SELECT greatest(notification_outbox.updated_at,notification_outbox.created_at,clock_timestamp()) AS stamp) observed),next_attempt_at=CASE WHEN status IN('PENDING','RETRY') THEN NULL ELSE next_attempt_at END WHERE payload_ciphertext IS NOT NULL AND expires_at<=clock_timestamp() AND status<>'PROCESSING'");
    }
    private Claim claim(){
        var rows=jdbc.query("SELECT id,event_type,business_key,payload_ciphertext,expires_at FROM notification_outbox WHERE status IN('PENDING','RETRY') AND next_attempt_at<=clock_timestamp() AND expires_at>clock_timestamp() AND payload_ciphertext IS NOT NULL ORDER BY next_attempt_at,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",(rs,n)->new Claim(rs.getObject("id",UUID.class),Type.valueOf(rs.getString("event_type")),UUID.randomUUID(),rs.getBytes("payload_ciphertext"),rs.getString("business_key"),rs.getTimestamp("expires_at").toInstant()));
        if(rows.isEmpty())return null;var row=rows.getFirst();
        int changed=jdbc.update("UPDATE notification_outbox SET status='PROCESSING',lease_id=?,lease_until=clock_timestamp()+(? * interval '1 millisecond'),next_attempt_at=NULL,attempts=attempts+1,cycle_attempts=cycle_attempts+1,updated_at=greatest(updated_at,created_at,clock_timestamp()) WHERE id=? AND expires_at>clock_timestamp()",row.leaseId(),settings.leaseDuration().toMillis(),row.id());return changed==1?row:null;
    }
    private void finish(Claim claim,String outcome,String code,boolean retryable){
        transactions.executeWithoutResult(status->{
            var rows=jdbc.query("SELECT cycle_attempts,expires_at FROM notification_outbox WHERE id=? AND status='PROCESSING' AND lease_id=? FOR UPDATE",(rs,n)->new Attempt(rs.getInt(1),rs.getTimestamp(2).toInstant()),claim.id(),claim.leaseId());
            if(rows.isEmpty())return;var attempt=rows.getFirst();boolean expired="PAYLOAD_EXPIRED".equals(code)||!attempt.expires().isAfter(Instant.now());
            String target=expired?"DEAD":retryable&&attempt.count()>=settings.maxAttempts()?"DEAD":outcome;
            long exponent=1L<<Math.min(20,Math.max(0,attempt.count()-1)),delay=Math.min(settings.retryMax().toMillis(),Math.multiplyExact(settings.retryBase().toMillis(),exponent));
            jdbc.update("UPDATE notification_outbox SET status=?,last_error_code=?,next_attempt_at=CASE WHEN ?='RETRY' THEN clock_timestamp()+(? * interval '1 millisecond') ELSE NULL END,lease_id=NULL,lease_until=NULL,payload_ciphertext=CASE WHEN ? THEN NULL ELSE payload_ciphertext END,(purged_at,updated_at)=(SELECT CASE WHEN ? THEN stamp ELSE notification_outbox.purged_at END,stamp FROM (SELECT greatest(notification_outbox.updated_at,notification_outbox.created_at,clock_timestamp()) AS stamp) observed) WHERE id=? AND lease_id=?",target,expired?"PAYLOAD_EXPIRED":code,target,delay,expired,expired,claim.id(),claim.leaseId());
        });
    }
    private static String classify(Throwable failure){
        if(failure instanceof MailAuthenticationException)return "SMTP_AUTH";if(failure instanceof MailParseException)return "SMTP_INVALID";
        for(Throwable current=failure;current!=null;current=current.getCause()){
            // A connect failure is before SMTP acceptance; a generic socket timeout may be after DATA and remains ambiguous.
            if(current instanceof ConnectException||current instanceof UnknownHostException||current.getClass().getSimpleName().equals("MailConnectException"))return "SMTP_CONNECT";
        }
        return "SMTP_UNCERTAIN";
    }
    private record Attempt(int count,Instant expires) { }
}
