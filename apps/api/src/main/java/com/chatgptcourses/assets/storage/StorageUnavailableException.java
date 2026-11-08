package com.chatgptcourses.assets.storage;

/** Deliberately omits provider messages, URLs, keys and response bodies. */
public final class StorageUnavailableException extends RuntimeException {
    public StorageUnavailableException(){super("Object storage unavailable");}
}
