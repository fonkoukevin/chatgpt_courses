package com.chatgptcourses.identity.validation;

import java.util.Locale;

public final class EmailAddresses {
    private EmailAddresses() { }
    /** Keeps dots, plus suffixes and all other address characters intact. */
    public static String normalize(String value) { return value == null ? null : value.strip().toLowerCase(Locale.ROOT); }
}
