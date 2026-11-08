package com.chatgptcourses.identity.service;

import com.chatgptcourses.identity.config.IdentitySettings;
import com.chatgptcourses.identity.model.UserAccount;
import com.chatgptcourses.identity.model.UserPreferences;
import com.chatgptcourses.identity.repository.UserAccountRepository;
import com.chatgptcourses.identity.repository.UserPreferencesRepository;
import com.chatgptcourses.identity.validation.AccountPasswordValidator;
import com.chatgptcourses.identity.validation.EmailAddresses;
import com.chatgptcourses.notifications.TransactionalNotifications;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import com.chatgptcourses.shared.http.RevisionPreconditions;
import jakarta.validation.Validator;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IdentityService {
    private final UserAccountRepository accounts;
    private final UserPreferencesRepository preferences;
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final SecureRandom random;
    private final IdentitySettings settings;
    private final TransactionalNotifications notifications;
    private final Validator validator;

    public IdentityService(UserAccountRepository accounts, UserPreferencesRepository preferences, JdbcTemplate jdbc,
                           PasswordEncoder encoder, SecureRandom random, IdentitySettings settings,
                           TransactionalNotifications notifications, Validator validator) {
        this.accounts = accounts; this.preferences = preferences; this.jdbc = jdbc; this.encoder = encoder;
        this.random = random; this.settings = settings; this.notifications = notifications; this.validator = validator;
    }

    @Transactional
    public AccountProfile register(String email, String password, String displayName, String locale) {
        String normalized = EmailAddresses.normalize(email);
        if (!validator.validate(new RegistrationFields(normalized, displayName, locale)).isEmpty()
                || !AccountPasswordValidator.isAcceptable(password)) throw new ApiException(ApiError.VALIDATION_FAILED);
        if (accounts.existsByNormalizedEmail(normalized)) throw new ApiException(ApiError.EMAIL_ALREADY_REGISTERED);
        var account = new UserAccount(normalized, encoder.encode(password), displayName);
        try { accounts.saveAndFlush(account); }
        catch (DataIntegrityViolationException failure) {
            if (isUniqueViolation(failure)) throw new ApiException(ApiError.EMAIL_ALREADY_REGISTERED);
            throw failure;
        }
        preferences.saveAndFlush(new UserPreferences(account.getId(), locale, "UTC"));
        jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code = 'LEARNER'",
                UUID.randomUUID(), account.getId());
        notifications.accountCreated(account.getId(),normalized,locale);
        return snapshot(account).orElseThrow(() -> new ApiException(ApiError.ACCOUNT_UNAVAILABLE)).profile();
    }

    @Transactional(readOnly = true)
    public Optional<CredentialSnapshot> findForAuthentication(String email) {
        String normalized = EmailAddresses.normalize(email);
        if (normalized == null || normalized.length() > 320) return Optional.empty();
        return accounts.findByNormalizedEmail(normalized).map(account -> new CredentialSnapshot(account.getId(),
                account.getNormalizedEmail(), account.getPasswordHash(), account.getStatus() == UserAccount.Status.ACTIVE,
                account.getAuthenticationVersion(), roles(account.getId()), permissions(account.getId())));
    }

    @Transactional(readOnly = true)
    public Optional<SessionUserSnapshot> loadSessionUser(UUID id) { return accounts.findById(id).flatMap(this::snapshot); }

    @Transactional(readOnly = true)
    public PreferencesView getPreferences(UUID owner) {
        requireActive(owner);
        return view(preferences.findByUserId(owner).orElseThrow(() -> new ApiException(ApiError.RESOURCE_NOT_FOUND)));
    }

    @Transactional
    public PreferencesView updatePreferences(UUID owner, String ifMatch, String locale) {
        requireActive(owner);
        if (!permissions(owner).contains("identity.preferences.write")) throw new AccessDeniedException("Action unavailable");
        if (locale == null || !Set.of("fr", "en").contains(locale)) throw new ApiException(ApiError.VALIDATION_FAILED);
        var preference = preferences.findByUserId(owner).orElseThrow(() -> new ApiException(ApiError.RESOURCE_NOT_FOUND));
        RevisionPreconditions.requireMatch(ifMatch, EntityTags.forRevision("preferences", preference.getId(), preference.getRevision()));
        preference.changeLocale(locale);
        preferences.flush();
        return view(preference);
    }

    /** Always completes neutrally for unknown, disabled and throttled email addresses. */
    @Transactional
    public void requestPasswordReset(String email, String locale) {
        String normalized = EmailAddresses.normalize(email);
        if (!validator.validate(new RegistrationFields(normalized, null, locale)).isEmpty()) throw new ApiException(ApiError.VALIDATION_FAILED);
        if (!allowResetRequest(normalized)) return;
        // Issuance and consumption share the account lock, so the issued epoch cannot be stale.
        var found = accounts.findByNormalizedEmailForUpdate(normalized);
        if (found.isEmpty() || found.get().getStatus() != UserAccount.Status.ACTIVE) return;
        var account = found.get();
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        var now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        var expires = now.plus(settings.resetTokenTtl());
        jdbc.update("INSERT INTO password_reset_tokens(user_id,token_hash,authentication_version,created_at,expires_at) VALUES (?,?,?,?,?)",
                account.getId(), digest(token), account.getAuthenticationVersion(), Timestamp.from(now), Timestamp.from(expires));
        notifications.passwordReset(account.getId(),digest(token),normalized,locale,token,expires);
    }

    @Transactional
    public void resetPassword(String token, String newPassword) {
        if (!AccountPasswordValidator.isAcceptable(newPassword)) throw new ApiException(ApiError.VALIDATION_FAILED);
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw new ApiException(ApiError.INVALID_RESET_TOKEN);
        String hash = digest(token);
        var owners = jdbc.query("SELECT user_id FROM password_reset_tokens WHERE token_hash = ?", (row, index) -> row.getObject(1, UUID.class), hash);
        if (owners.isEmpty()) throw new ApiException(ApiError.INVALID_RESET_TOKEN);
        // Every reset for one account takes the same user lock before its token lock.
        var account = accounts.findForUpdate(owners.getFirst()).orElseThrow(() -> new ApiException(ApiError.INVALID_RESET_TOKEN));
        var tokens = jdbc.query("SELECT authentication_version,expires_at,consumed_at FROM password_reset_tokens WHERE token_hash = ? FOR UPDATE",
                (row, index) -> new ResetState(row.getLong(1), row.getTimestamp(2).toInstant(), row.getTimestamp(3)), hash);
        if (tokens.isEmpty()) throw new ApiException(ApiError.INVALID_RESET_TOKEN);
        var reset = tokens.getFirst();
        var now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        if (account.getStatus() != UserAccount.Status.ACTIVE || reset.consumedAt() != null
                || !reset.expiresAt().isAfter(now) || reset.authenticationVersion() != account.getAuthenticationVersion()) {
            throw new ApiException(ApiError.INVALID_RESET_TOKEN);
        }
        account.replacePasswordHash(encoder.encode(newPassword));
        accounts.flush();
        jdbc.update("UPDATE password_reset_tokens SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL", Timestamp.from(now), account.getId());
        jdbc.update("DELETE FROM spring_session WHERE principal_name = ?", account.getId().toString());
    }

    private boolean allowResetRequest(String email) {
        var now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        var cutoff = now.minus(settings.resetWindow());
        var count = jdbc.queryForObject("""
                INSERT INTO identity_rate_limits(bucket_key,window_started_at,request_count) VALUES (?,?,1)
                ON CONFLICT (bucket_key) DO UPDATE SET
                  request_count = CASE WHEN identity_rate_limits.window_started_at <= ? THEN 1 ELSE least(identity_rate_limits.request_count + 1,1000000) END,
                  window_started_at = CASE WHEN identity_rate_limits.window_started_at <= ? THEN EXCLUDED.window_started_at ELSE identity_rate_limits.window_started_at END
                RETURNING request_count
                """, Integer.class, digest("password-reset:" + email), Timestamp.from(now), Timestamp.from(cutoff), Timestamp.from(cutoff));
        return count != null && count <= settings.resetRequestLimit();
    }

    private UserAccount requireActive(UUID id) {
        var account = accounts.findById(id).orElseThrow(() -> new ApiException(ApiError.ACCOUNT_UNAVAILABLE));
        if (account.getStatus() != UserAccount.Status.ACTIVE) throw new ApiException(ApiError.ACCOUNT_UNAVAILABLE);
        return account;
    }
    private Optional<SessionUserSnapshot> snapshot(UserAccount account) {
        var preference = preferences.findByUserId(account.getId());
        if (preference.isEmpty() && account.getStatus() == UserAccount.Status.ACTIVE) return Optional.empty();
        return Optional.of(new SessionUserSnapshot(account.getId(), account.getNormalizedEmail(), account.getDisplayName(),
                preference.map(UserPreferences::getLocale).orElse("fr"),
                account.getStatus() == UserAccount.Status.ACTIVE, account.getAuthenticationVersion(), roles(account.getId()), permissions(account.getId())));
    }
    private Set<String> roles(UUID id) {
        return Set.copyOf(jdbc.queryForList("SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? AND ur.revoked_at IS NULL", String.class, id));
    }
    private Set<String> permissions(UUID id) {
        return Set.copyOf(jdbc.queryForList("""
                SELECT DISTINCT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
                JOIN user_roles ur ON ur.role_id = rp.role_id WHERE ur.user_id = ? AND ur.revoked_at IS NULL AND rp.revoked_at IS NULL
                """, String.class, id));
    }
    private PreferencesView view(UserPreferences value) { return new PreferencesView(value.getId(), value.getLocale(), value.getRevision()); }
    private static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
    private static boolean isUniqueViolation(Throwable failure) {
        for (var cause = failure; cause != null; cause = cause.getCause()) if (cause instanceof SQLException sql && "23505".equals(sql.getSQLState())) return true;
        return false;
    }
    private record RegistrationFields(@NotBlank @Email @Size(max = 320) String email, @Size(max = 120) String displayName,
                                      @NotNull @Pattern(regexp = "fr|en") String locale) { }
    private record ResetState(long authenticationVersion, Instant expiresAt, Timestamp consumedAt) { }
}
