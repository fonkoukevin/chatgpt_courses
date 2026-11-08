package com.chatgptcourses.assets.storage;

public final class StorageObjectTooLargeException extends RuntimeException {
    public StorageObjectTooLargeException(){super("Object exceeds the permitted size");}
}
