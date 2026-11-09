package com.chatgptcourses.editorial.service;

import java.util.UUID;

/** A configured server-side registry verifies a media in the publication's exact language/version context. */
public interface EditorialMediaRegistry {
    boolean ready(UUID resourceId,UUID versionId,String locale,UUID mediaId,String kind);
    default boolean readySolution(UUID resourceId,UUID versionId,String locale,UUID mediaId){return false;}
    default boolean privateSolution(UUID mediaId){return false;}
}
