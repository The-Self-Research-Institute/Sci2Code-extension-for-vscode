package self.research.ontology.dataserver.security;

import java.security.Key;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Exercises every JWT scenario called out in the Phase 2 requirements:
 * valid, invalid, expired, invalid signature, missing subject/email, with
 * userId, without userId, and tampered.
 */
class JwtServiceTest {

	// Matches src/test/resources/application.properties — test-only, never used in prod.
	private static final String SECRET_B64 =
		"ZGF0YXNlcnZlci10ZXN0LWp3dC1zZWNyZXQta2V5LWZvci11bml0LXRlc3RzLW9ubHktbm90LWZvci1wcm9k";
	private static final String OTHER_SECRET_B64 =
		java.util.Base64.getEncoder().encodeToString(
			"a-completely-different-secret-key-with-enough-bytes-too".getBytes());

	private JwtService jwtService;
	private Key signingKey;

	@BeforeEach
	void setUp() {
		jwtService = new JwtService(SECRET_B64);
		signingKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET_B64));
	}

	private String mint(Map<String, Object> claims, String subject, long expiresInMillis, Key key) {
		return Jwts.builder()
			.setClaims(claims)
			.setSubject(subject)
			.setIssuedAt(new Date())
			.setExpiration(new Date(System.currentTimeMillis() + expiresInMillis))
			.signWith(key, SignatureAlgorithm.HS256)
			.compact();
	}

	@Test
	void validJwt_withEmailAndUserId_parsesSuccessfully() {
		Map<String, Object> claims = new HashMap<>();
		claims.put("email", "researcher@example.com");
		claims.put("userId", "60f1a2b3c4d5e6f7a8b9c0d1");
		claims.put("roles", List.of("ROLE_USER"));
		String token = mint(claims, "researcher@example.com", 60_000, signingKey);

		AuthenticatedUser user = jwtService.parseAndValidate(token);

		assertThat(user.email()).isEqualTo("researcher@example.com");
		assertThat(user.userId()).isEqualTo("60f1a2b3c4d5e6f7a8b9c0d1");
		assertThat(user.hasUserId()).isTrue();
		assertThat(user.roles()).containsExactly("ROLE_USER");
	}

	@Test
	void validJwt_withoutUserId_parsesSuccessfully_userIdIsNull() {
		Map<String, Object> claims = new HashMap<>();
		claims.put("email", "researcher@example.com");
		claims.put("roles", List.of("ROLE_USER"));
		String token = mint(claims, "researcher@example.com", 60_000, signingKey);

		AuthenticatedUser user = jwtService.parseAndValidate(token);

		assertThat(user.email()).isEqualTo("researcher@example.com");
		assertThat(user.userId()).isNull();
		assertThat(user.hasUserId()).isFalse();
	}

	@Test
	void validJwt_emailFallsBackToSubject_whenEmailClaimAbsent() {
		Map<String, Object> claims = new HashMap<>();
		claims.put("roles", List.of("ROLE_USER"));
		String token = mint(claims, "fallback@example.com", 60_000, signingKey);

		AuthenticatedUser user = jwtService.parseAndValidate(token);

		assertThat(user.email()).isEqualTo("fallback@example.com");
	}

	@Test
	void invalidJwt_notAJwtAtAll_throws() {
		assertThatThrownBy(() -> jwtService.parseAndValidate("not-a-jwt-at-all"))
			.isInstanceOf(JwtException.class);
	}

	@Test
	void expiredJwt_throwsExpiredJwtException() {
		Map<String, Object> claims = new HashMap<>();
		claims.put("email", "researcher@example.com");
		// Already-expired: issued/expires in the past.
		String token = Jwts.builder()
			.setClaims(claims)
			.setSubject("researcher@example.com")
			.setIssuedAt(new Date(System.currentTimeMillis() - 120_000))
			.setExpiration(new Date(System.currentTimeMillis() - 60_000))
			.signWith(signingKey, SignatureAlgorithm.HS256)
			.compact();

		assertThatThrownBy(() -> jwtService.parseAndValidate(token))
			.isInstanceOf(io.jsonwebtoken.ExpiredJwtException.class);
	}

	@Test
	void invalidSignature_signedWithDifferentSecret_throws() {
		Key wrongKey = Keys.hmacShaKeyFor(
			java.util.Base64.getDecoder().decode(OTHER_SECRET_B64));
		Map<String, Object> claims = new HashMap<>();
		claims.put("email", "researcher@example.com");
		String token = mint(claims, "researcher@example.com", 60_000, wrongKey);

		assertThatThrownBy(() -> jwtService.parseAndValidate(token))
			.isInstanceOf(io.jsonwebtoken.security.SignatureException.class);
	}

	@Test
	void missingSubjectAndEmail_throwsMissingIdentityException() {
		Map<String, Object> claims = new HashMap<>();
		claims.put("roles", List.of("ROLE_USER"));
		// No subject, no email claim.
		String token = Jwts.builder()
			.setClaims(claims)
			.setIssuedAt(new Date())
			.setExpiration(new Date(System.currentTimeMillis() + 60_000))
			.signWith(signingKey, SignatureAlgorithm.HS256)
			.compact();

		assertThatThrownBy(() -> jwtService.parseAndValidate(token))
			.isInstanceOf(JwtService.MissingIdentityException.class);
	}

	@Test
	void blankEmailClaim_fallsBackToSubject() {
		Map<String, Object> claims = new HashMap<>();
		claims.put("email", "");
		String token = mint(claims, "sub-email@example.com", 60_000, signingKey);

		AuthenticatedUser user = jwtService.parseAndValidate(token);

		assertThat(user.email()).isEqualTo("sub-email@example.com");
	}

	@Test
	void tamperedJwt_payloadModifiedAfterSigning_throwsSignatureException() {
		Map<String, Object> claims = new HashMap<>();
		claims.put("email", "researcher@example.com");
		String token = mint(claims, "researcher@example.com", 60_000, signingKey);

		// Flip a character in the payload segment (index 1) to simulate tampering.
		String[] parts = token.split("\\.");
		char[] payloadChars = parts[1].toCharArray();
		payloadChars[payloadChars.length / 2] = payloadChars[payloadChars.length / 2] == 'A' ? 'B' : 'A';
		String tampered = parts[0] + "." + new String(payloadChars) + "." + parts[2];

		assertThatThrownBy(() -> jwtService.parseAndValidate(tampered))
			.isInstanceOf(JwtException.class);
	}

	@Test
	void constructor_rejectsBlankSecret() {
		assertThatThrownBy(() -> new JwtService(""))
			.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void constructor_rejectsNonBase64Secret() {
		assertThatThrownBy(() -> new JwtService("not valid base64!!! %%%"))
			.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void constructor_rejectsSecretShorterThan32Bytes() {
		String shortSecret = java.util.Base64.getEncoder().encodeToString("too-short".getBytes());
		assertThatThrownBy(() -> new JwtService(shortSecret))
			.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void generateToken_roundTripsThroughParseAndValidate() {
		String token = jwtService.generateToken("researcher@example.com", "user-1", List.of("ROLE_USER"));

		AuthenticatedUser user = jwtService.parseAndValidate(token);

		assertThat(user.email()).isEqualTo("researcher@example.com");
		assertThat(user.userId()).isEqualTo("user-1");
		assertThat(user.roles()).containsExactly("ROLE_USER");
	}
}