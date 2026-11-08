package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;

import com.chatgptcourses.access.AccessPolicy;
import com.chatgptcourses.access.AccessResource;
import com.chatgptcourses.access.AccessSubject;
import com.chatgptcourses.access.DefaultAccessPolicy;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AccessPolicyTest {
    private final AccessPolicy policy = new DefaultAccessPolicy();
    private final UUID ownerId = UUID.randomUUID();
    private final UUID otherId = UUID.randomUUID();
    private final UUID resourceId = UUID.randomUUID();
    private final AccessSubject owner = new AccessSubject(ownerId, true, true, Set.of());

    @Test
    void publicReadRequiresExplicitPublishedTranslationAndNeverAllowsMutation() {
        var anonymous = AccessSubject.anonymous();
        assertThat(policy.decide(anonymous, new AccessResource.PublicContent(resourceId, true, true), AccessPolicy.Action.READ).allowed()).isTrue();
        assertThat(policy.decide(anonymous, new AccessResource.PublicContent(resourceId, null, true), AccessPolicy.Action.READ).allowed()).isFalse();
        assertThat(policy.decide(anonymous, new AccessResource.PublicContent(resourceId, true, null), AccessPolicy.Action.READ).allowed()).isFalse();
        assertThat(policy.decide(owner, new AccessResource.PublicContent(resourceId, true, true), AccessPolicy.Action.UPDATE).allowed()).isFalse();
    }

    @Test
    void authenticatedDoesNotGrantPremiumContentAndUnknownFactsFailClosed() {
        assertThat(policy.decide(owner, new AccessResource.PedagogicalContent(resourceId, true, true, null), AccessPolicy.Action.READ).allowed()).isFalse();
        assertThat(policy.decide(owner, new AccessResource.PedagogicalContent(resourceId, true, true, false), AccessPolicy.Action.READ).allowed()).isFalse();
        assertThat(policy.decide(owner, new AccessResource.PedagogicalContent(resourceId, true, true, true), AccessPolicy.Action.READ).allowed()).isTrue();
        assertThat(policy.decide(owner, new AccessResource.PedagogicalContent(resourceId, false, true, true), AccessPolicy.Action.READ).allowed()).isFalse();
        assertThat(policy.decide(owner, new AccessResource.PedagogicalContent(resourceId, true, false, true), AccessPolicy.Action.READ).allowed()).isFalse();
        var unknownAccount = new AccessSubject(ownerId, true, null, Set.of());
        assertThat(policy.decide(unknownAccount, new AccessResource.PedagogicalContent(resourceId, true, true, true), AccessPolicy.Action.READ).allowed()).isFalse();
    }

    @Test
    void ownershipControlsPersonalDataWithoutDependingOnCourseEntitlements() {
        var personal = new AccessResource.PersonalResource(resourceId, ownerId);
        for (var action : Set.of(AccessPolicy.Action.READ, AccessPolicy.Action.UPDATE, AccessPolicy.Action.DELETE)) {
            assertThat(policy.decide(owner, personal, action).allowed()).isTrue();
            assertThat(policy.decide(new AccessSubject(otherId, true, true, Set.of("ADMIN")), personal, action).allowed()).isFalse();
            assertThat(policy.decide(AccessSubject.anonymous(), personal, action).allowed()).isFalse();
        }
        assertThat(policy.decide(owner, new AccessResource.PersonalResource(resourceId, null), AccessPolicy.Action.READ).allowed()).isFalse();
        assertThat(policy.decide(owner, personal, AccessPolicy.Action.ADMINISTER).allowed()).isFalse();
    }

    @Test
    void editorialPermissionCannotAuthorizeFinanceOrUnconfiguredAdministrativeActions() {
        var editor = new AccessSubject(ownerId, true, true, Set.of("content:read", "content:edit"));
        var content = new AccessResource.AdministrativeResource(resourceId,
                Map.of(AccessPolicy.Action.READ, "content:read", AccessPolicy.Action.UPDATE, "content:edit"));
        var finance = new AccessResource.AdministrativeResource(resourceId,
                Map.of(AccessPolicy.Action.ADMINISTER, "commerce:refund"));
        assertThat(policy.decide(editor, content, AccessPolicy.Action.READ).allowed()).isTrue();
        assertThat(policy.decide(editor, content, AccessPolicy.Action.UPDATE).allowed()).isTrue();
        assertThat(policy.decide(editor, content, AccessPolicy.Action.DELETE).allowed()).isFalse();
        assertThat(policy.decide(editor, finance, AccessPolicy.Action.ADMINISTER).allowed()).isFalse();
        assertThat(policy.decide(new AccessSubject(ownerId, true, true, Set.of("ADMIN")), content, AccessPolicy.Action.READ).allowed()).isFalse();
    }

    @Test
    void missingSubjectResourceIdentityOrActionCannotBecomeAnAuthorization() {
        var personal = new AccessResource.PersonalResource(resourceId, ownerId);
        assertThat(policy.decide(null, personal, AccessPolicy.Action.READ).allowed()).isFalse();
        assertThat(policy.decide(owner, null, AccessPolicy.Action.READ).allowed()).isFalse();
        assertThat(policy.decide(owner, new AccessResource.PersonalResource(null, ownerId), AccessPolicy.Action.READ).allowed()).isFalse();
        assertThat(policy.decide(owner, personal, null).allowed()).isFalse();
        assertThat(policy.decide(new AccessSubject(null, true, true, Set.of()), personal, AccessPolicy.Action.READ).allowed()).isFalse();
    }
}
