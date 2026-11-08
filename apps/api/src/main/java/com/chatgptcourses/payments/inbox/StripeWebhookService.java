package com.chatgptcourses.payments.inbox;

import static com.chatgptcourses.payments.inbox.PaymentInboxTypes.*;
import com.chatgptcourses.payments.config.StripeSettings;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.stripe.net.Webhook;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** SDK signature verification uses the unmodified UTF8 body; only minimized verified metadata is persisted. */
@Service
public class StripeWebhookService {
    static final Set<String> CHECKOUT_EVENTS=Set.of("checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.async_payment_failed","checkout.session.expired");
    private final StripeSettings settings;private final JdbcTemplate jdbc;private final ObjectMapper mapper;
    public StripeWebhookService(StripeSettings settings,JdbcTemplate jdbc,ObjectMapper mapper){this.settings=settings;this.jdbc=jdbc;this.mapper=mapper;}
    @Transactional
    public WebhookReceipt receive(byte[] body,String signature){
        if(!settings.enabled()||!"TEST".equals(settings.mode())||!settings.webhookSecret().startsWith("whsec_")||!settings.accountId().matches("acct_[A-Za-z0-9]{1,123}"))throw new ApiException(ApiError.PAYMENT_NOT_CONFIGURED);
        VerifiedEvent event=verify(body,signature);boolean supported=CHECKOUT_EVENTS.contains(event.type());
        int inserted=jdbc.update("""
            INSERT INTO stripe_event_inbox(id,account_id,livemode,event_id,event_type,object_id,api_version,event_created_at,canonical_hash,state,next_attempt_at,processed_at)
            VALUES(?,?,?,?,?,?,?,?,?,CASE WHEN ? THEN 'PENDING' ELSE 'IGNORED' END,CASE WHEN ? THEN clock_timestamp() ELSE NULL END,CASE WHEN ? THEN NULL ELSE clock_timestamp() END)
            ON CONFLICT(provider,account_id,livemode,event_id) DO NOTHING
            """,UUID.randomUUID(),event.accountId(),event.livemode(),event.eventId(),event.type(),event.objectId(),event.apiVersion(),java.sql.Timestamp.from(event.createdAt()),event.hash(),supported,supported,supported);
        if(inserted==0){byte[] previous=jdbc.queryForObject("SELECT canonical_hash FROM stripe_event_inbox WHERE provider='STRIPE' AND account_id=? AND livemode=? AND event_id=?",byte[].class,event.accountId(),event.livemode(),event.eventId());if(!MessageDigest.isEqual(previous,event.hash()))throw new ApiException(ApiError.CONFLICT);}
        return new WebhookReceipt(true);
    }
    private VerifiedEvent verify(byte[] body,String signature){
        if(body==null||body.length==0||body.length>65536||signature==null||signature.length()>8192)throw invalid();
        try{
            String raw=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(body)).toString();
            var event=Webhook.constructEvent(raw,signature,settings.webhookSecret(),300);
            if(event.getId()==null||!event.getId().matches("evt_[A-Za-z0-9_]{1,251}")||event.getType()==null||!event.getType().matches("[a-z][a-z0-9_.]{0,99}")||event.getCreated()==null||!Boolean.FALSE.equals(event.getLivemode())||!StripeSettings.API_VERSION.equals(event.getApiVersion())||event.getAccount()!=null&&!settings.accountId().equals(event.getAccount()))throw invalid();
            var tree=mapper.readTree(raw);var object=tree.path("data").path("object").path("id");String id=object.isString()?object.asText():null;
            if(id==null||!id.matches("[A-Za-z][A-Za-z0-9_]{0,254}")||CHECKOUT_EVENTS.contains(event.getType())&&!id.startsWith("cs_"))throw invalid();
            String canonical=event.getId()+"|"+event.getType()+"|"+id+"|false|"+settings.accountId()+"|"+event.getApiVersion()+"|"+event.getCreated();
            return new VerifiedEvent(event.getId(),event.getType(),id,false,settings.accountId(),event.getApiVersion(),Instant.ofEpochSecond(event.getCreated()),MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        }catch(ApiException invalid){throw invalid;}catch(Exception invalid){throw invalid();}
    }
    private static ApiException invalid(){return new ApiException(ApiError.STRIPE_WEBHOOK_INVALID);}
}
