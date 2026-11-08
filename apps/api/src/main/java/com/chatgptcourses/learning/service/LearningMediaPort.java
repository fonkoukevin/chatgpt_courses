package com.chatgptcourses.learning.service;

import java.util.Optional;
import java.util.UUID;

/** P10 boundary: only a server-side registry/authorization adapter may resolve a media. No HTTP route or fake asset is provided in P08. */
public interface LearningMediaPort {
    Optional<AuthorizedMedia> resolve(UUID actor,UUID mediaId);
    record AuthorizedMedia(UUID mediaId,UUID activityVersionId,String locale,double durationSeconds) {
        public AuthorizedMedia {
            LearningValidation.check(mediaId!=null&&activityVersionId!=null&&Double.isFinite(durationSeconds)&&durationSeconds>0);
            LearningValidation.locale(locale);
        }
    }
    record MediaPosition(UUID mediaId,UUID activityVersionId,String locale,double durationSeconds,double positionSeconds) {
        public static MediaPosition forMedia(AuthorizedMedia authorized,double seconds) {
            LearningValidation.check(authorized!=null&&Double.isFinite(seconds)&&seconds>=0&&seconds<=authorized.durationSeconds());
            return new MediaPosition(authorized.mediaId(),authorized.activityVersionId(),authorized.locale(),authorized.durationSeconds(),seconds);
        }
    }
}
