package com.chatgptcourses;

import java.security.SecureRandom;
import java.util.Base64;

/** Ephemeral fixtures only. One key per test JVM; never used as a production default or printed. */
public final class NotificationTestKeys {
    private static final String KEY=create();
    private NotificationTestKeys() { }
    public static String randomKey(){return KEY;}
    private static String create(){byte[] key=new byte[32];new SecureRandom().nextBytes(key);return Base64.getEncoder().encodeToString(key);}
}
