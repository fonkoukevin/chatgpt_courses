package com.chatgptcourses.notifications;

import static com.chatgptcourses.notifications.NotificationTypes.*;
import com.chatgptcourses.identity.validation.EmailAddresses;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Enqueue only inside a real business transaction. No recipient or event can be supplied by an HTTP mail endpoint. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class TransactionalNotifications {
    private final JdbcTemplate jdbc;
    private final NotificationCipher cipher;
    private final OutboxSettings settings;
    public TransactionalNotifications(JdbcTemplate jdbc, NotificationCipher cipher, OutboxSettings settings) { this.jdbc=jdbc;this.cipher=cipher;this.settings=settings; }
    public UUID accountCreated(UUID userId, String email, String locale) {
        return enqueue(userId,"identity:registered:"+required(userId),Type.ACCOUNT_CREATED,new Payload(recipient(email),locale(locale),null,null,null,null));
    }
    public UUID passwordReset(UUID userId, String tokenHash, String email, String locale, String token, Instant expiresAt) {
        if(tokenHash==null||!tokenHash.matches("[a-f0-9]{64}")||token==null||!token.matches("[A-Za-z0-9_-]{43}")||expiresAt==null||!expiresAt.isAfter(Instant.now()))throw invalid();
        return enqueue(required(userId),"identity:password-reset:"+tokenHash,Type.PASSWORD_RESET,new Payload(recipient(email),locale(locale),token,expiresAt,null,null));
    }
    /** Called by a future committed entitlement event, never by an invented purchase operation. */
    public UUID accessActivated(UUID eventId, UUID userId, String email, String locale, String resourceTitle) {
        if(resourceTitle==null||resourceTitle.isBlank()||resourceTitle.length()>240||resourceTitle.indexOf('\r')>=0||resourceTitle.indexOf('\n')>=0||resourceTitle.indexOf('\0')>=0)throw invalid();
        return enqueue(required(userId),"access:activated:"+required(eventId),Type.ACCESS_ACTIVATED,new Payload(recipient(email),locale(locale),null,null,resourceTitle,null));
    }
    /** Notification metadata only: no support reply, production, note or attachment content. */
    public UUID supportReply(UUID eventId, UUID userId, String email, String locale, UUID ticketId) {
        return enqueue(required(userId),"support:reply:"+required(eventId),Type.SUPPORT_REPLY,new Payload(recipient(email),locale(locale),null,null,null,required(ticketId)));
    }
    public UUID refundUpdated(UUID operationId,UUID userId,String email,String locale){
        return enqueue(required(userId),"refund:confirmed:"+required(operationId),Type.REFUND_UPDATED,new Payload(recipient(email),locale(locale),null,null,null,operationId));
    }
    private UUID enqueue(UUID owner, String key, Type type, Payload payload) {
        if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM user_accounts WHERE id=? AND normalized_email=?)",Boolean.class,owner,payload.recipient())))throw invalid();
        UUID id=UUID.randomUUID();byte[] fingerprint=cipher.fingerprint(type,payload),encrypted=cipher.encrypt(id,type,key,payload);
        Instant expiry=Instant.now().plus(settings.payloadRetention());if(payload.tokenExpiresAt()!=null&&payload.tokenExpiresAt().isBefore(expiry))expiry=payload.tokenExpiresAt();
        int inserted=jdbc.update("INSERT INTO notification_outbox(id,owner_id,business_key,event_type,payload_fingerprint,payload_ciphertext,expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(business_key) DO NOTHING",id,owner,key,type.name(),fingerprint,encrypted,Timestamp.from(expiry));
        if(inserted==1)return id;
        var existing=jdbc.queryForMap("SELECT id,owner_id,event_type,payload_fingerprint FROM notification_outbox WHERE business_key=?",key);
        if(!owner.equals(existing.get("owner_id"))||!type.name().equals(existing.get("event_type"))||!MessageDigest.isEqual(fingerprint,(byte[])existing.get("payload_fingerprint")))throw new ApiException(ApiError.CONFLICT);
        return (UUID)existing.get("id");
    }
    private static UUID required(UUID id){if(id==null)throw invalid();return id;}
    private static String recipient(String email){String normalized=EmailAddresses.normalize(email);if(normalized==null||normalized.length()>320||!normalized.matches("[^\\s@]+@[^\\s@]+")||normalized.indexOf('\r')>=0||normalized.indexOf('\n')>=0)throw invalid();return normalized;}
    private static String locale(String value){if(value==null||!Set.of("fr","en").contains(value))throw invalid();return value;}
    private static ApiException invalid(){return new ApiException(ApiError.VALIDATION_FAILED);}
}
