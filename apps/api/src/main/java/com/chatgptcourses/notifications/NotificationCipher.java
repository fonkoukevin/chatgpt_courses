package com.chatgptcourses.notifications;

import static com.chatgptcourses.notifications.NotificationTypes.*;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class NotificationCipher {
    private final byte[] encryptionKey, fingerprintKey;
    private final ObjectMapper mapper;
    private final SecureRandom random = new SecureRandom();
    public NotificationCipher(OutboxSettings settings, ObjectMapper mapper) {
        this.mapper = mapper;
        byte[] master = Base64.getDecoder().decode(settings.encryptionKey());
        encryptionKey = hmac(master, "courses/notification/encryption/v1".getBytes(StandardCharsets.US_ASCII));
        fingerprintKey = hmac(master, "courses/notification/fingerprint/v1".getBytes(StandardCharsets.US_ASCII));
        Arrays.fill(master, (byte) 0);
    }
    byte[] encrypt(UUID id, Type type, String businessKey, Payload payload) {
        byte[] plain = mapper.writeValueAsBytes(payload), nonce = new byte[12]; random.nextBytes(nonce);
        try {
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(encryptionKey, "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(aad(id, type, businessKey));byte[] encrypted = cipher.doFinal(plain);
            byte[] result = Arrays.copyOf(nonce, nonce.length + encrypted.length);System.arraycopy(encrypted, 0, result, nonce.length, encrypted.length);return result;
        } catch (GeneralSecurityException failure) { throw new IllegalStateException("Notification encryption unavailable"); }
        finally { Arrays.fill(plain, (byte) 0); }
    }
    Payload decrypt(Claim claim) {
        byte[] encoded = claim.ciphertext();
        if (encoded == null || encoded.length < 28 || encoded.length > 32768) throw new IllegalStateException("Notification payload unavailable");
        byte[] plain = null;
        try {
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(encryptionKey, "AES"), new GCMParameterSpec(128, encoded, 0, 12));
            cipher.updateAAD(aad(claim.id(), claim.type(), claim.businessKey()));plain = cipher.doFinal(encoded, 12, encoded.length - 12);
            return mapper.readValue(plain, Payload.class);
        } catch (GeneralSecurityException | RuntimeException failure) { throw new IllegalStateException("Notification payload cannot be authenticated"); }
        finally { if (plain != null) Arrays.fill(plain, (byte) 0); }
    }
    byte[] fingerprint(Type type, Payload payload) { byte[] plain=mapper.writeValueAsBytes(new Fingerprint(type,payload));try{return hmac(fingerprintKey,plain);}finally{Arrays.fill(plain,(byte)0);} }
    private static byte[] aad(UUID id, Type type, String key) { return ("notification:v1:" + id + ":" + type + ":" + key).getBytes(StandardCharsets.UTF_8); }
    private static byte[] hmac(byte[] key, byte[] value) {
        try { var mac = Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key, "HmacSHA256"));return mac.doFinal(value); }
        catch (GeneralSecurityException failure) { throw new IllegalStateException("Notification cryptography unavailable"); }
    }
    private record Fingerprint(Type type, Payload payload) { @Override public String toString() { return "Fingerprint[redacted]"; } }
}
