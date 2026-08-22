package self.research.ontology.dataserver.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.dto.ApiKeyResponse;
import self.research.ontology.dataserver.dto.ApiKeyStatusResponse;
import self.research.ontology.dataserver.model.ApiKey;
import self.research.ontology.dataserver.model.AppUser;
import self.research.ontology.dataserver.repository.ApiKeyRepository;
import self.research.ontology.dataserver.repository.UserRepository;
import self.research.ontology.dataserver.security.AuthenticatedUser;

/**
 * Long-lived API keys for external clients (Sci2Code) — a separate credential
 * from the Replica webview's own login JWT (see JwtService). Only ONE active
 * key per user is modeled: generating a new one revokes any existing one, so
 * there's never ambiguity about "which key is live" and no key-management UI
 * is needed beyond Generate/Revoke — the minimal lifecycle this project asked
 * for.
 * <p>
 * The raw key is never stored: only its SHA-256 digest ({@link #hash}) is
 * persisted, so a database read alone can never recover a usable credential.
 * SHA-256 (not BCrypt) is deliberate here — authentication needs an exact,
 * indexable lookup on every request, which a per-hash-salted algorithm like
 * BCrypt cannot provide; the key's own 256 bits of random entropy is what
 * makes this safe against offline guessing, not a slow hash.
 */
@Service
@RequiredArgsConstructor
public class ApiKeyService {

	/** Every generated key starts with this so JwtAuthenticationFilter can cheaply tell it apart from a JWT. */
	public static final String PREFIX = "rk_";

	private static final int TOKEN_ENTROPY_BYTES = 32;

	private final ApiKeyRepository apiKeyRepository;
	private final UserRepository userRepository;
	private final SecureRandom secureRandom = new SecureRandom();

	/** Revokes any existing active key for this user and issues a fresh one. Returns the RAW key — the only time it's ever available. */
	public ApiKeyResponse generate(AuthenticatedUser caller) {
		AppUser user = requireUser(caller);
		revokeAllFor(user.getId());

		String rawKey = PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes());

		ApiKey apiKey = new ApiKey();
		apiKey.setUserId(user.getId());
		apiKey.setKeyHash(hash(rawKey));
		apiKey.setCreatedAt(Instant.now());
		apiKeyRepository.save(apiKey);

		return new ApiKeyResponse(rawKey, apiKey.getCreatedAt());
	}

	/** Revokes the caller's active key(s) without issuing a new one. */
	public void revoke(AuthenticatedUser caller) {
		AppUser user = requireUser(caller);
		revokeAllFor(user.getId());
	}

	/** Whether the caller currently has an active key, and when it was created/last used — never the key itself. */
	public ApiKeyStatusResponse status(AuthenticatedUser caller) {
		AppUser user = requireUser(caller);
		List<ApiKey> active = apiKeyRepository.findByUserIdAndRevokedFalse(user.getId());
		if (active.isEmpty()) {
			return new ApiKeyStatusResponse(false, null, null);
		}
		ApiKey key = active.get(0);
		return new ApiKeyStatusResponse(true, key.getCreatedAt(), key.getLastUsedAt());
	}

	/**
	 * Resolves a presented raw API key to the identity it belongs to, in the
	 * SAME {@link AuthenticatedUser} shape a JWT resolves to — so every
	 * existing endpoint that reads {@code @AuthenticationPrincipal
	 * AuthenticatedUser} keeps working unchanged, regardless of which
	 * credential type authenticated the request. Empty if the key is unknown,
	 * revoked, or its owning account no longer exists.
	 */
	public Optional<AuthenticatedUser> authenticate(String rawKey) {
		Optional<ApiKey> found = apiKeyRepository.findByKeyHashAndRevokedFalse(hash(rawKey));
		if (found.isEmpty()) {
			return Optional.empty();
		}
		ApiKey apiKey = found.get();
		Optional<AppUser> user = userRepository.findById(apiKey.getUserId());
		if (user.isEmpty()) {
			return Optional.empty();
		}
		apiKey.setLastUsedAt(Instant.now());
		apiKeyRepository.save(apiKey);
		return Optional.of(new AuthenticatedUser(user.get().getEmail(), user.get().getId(), user.get().getRoles()));
	}

	private void revokeAllFor(String userId) {
		List<ApiKey> active = apiKeyRepository.findByUserIdAndRevokedFalse(userId);
		active.forEach(k -> k.setRevoked(true));
		apiKeyRepository.saveAll(active);
	}

	private AppUser requireUser(AuthenticatedUser caller) {
		return userRepository.findByEmailIgnoreCase(caller.email())
			.orElseThrow(() -> new self.research.ontology.dataserver.exception.NotFoundException("Account no longer exists"));
	}

	private byte[] randomBytes() {
		byte[] bytes = new byte[TOKEN_ENTROPY_BYTES];
		secureRandom.nextBytes(bytes);
		return bytes;
	}

	private static String hash(String rawKey) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			byte[] hashed = digest.digest(rawKey.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(hashed);
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256 not available", e);
		}
	}
}
