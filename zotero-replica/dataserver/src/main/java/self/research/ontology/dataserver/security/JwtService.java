package self.research.ontology.dataserver.security;

import java.security.Key;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Issues and validates this replica's own JWTs (HMAC-SHA256, Base64-encoded
 * secret). The replica's own AuthController is the normal issuer for local/
 * standalone use (see {@link #generateToken}); {@link #parseAndValidate}
 * accepts ANY token signed with the configured secret, so a future external
 * identity provider (e.g. OntoCode's ontology-auth) can be wired in later
 * simply by signing with the same {@code jwt.secret} and the same claim shape
 * (email/userId/roles) — no dataserver code changes required for that swap.
 * <p>
 * Constructor injection (rather than field + @PostConstruct) so this class can
 * be unit-tested directly with {@code new JwtService(secret)}, without needing
 * a Spring context.
 */
@Component
public class JwtService {

	private static final Logger log = LoggerFactory.getLogger(JwtService.class);

	/** 7 days, matching the default of jwt.expiration-ms. */
	private static final long DEFAULT_EXPIRATION_MS = 604_800_000L;

	private final String secret;
	private final Key signingKey;
	private final long expirationMs;

	/** Convenience constructor for direct unit-testing (no Spring context needed). */
	public JwtService(String secret) {
		this(secret, DEFAULT_EXPIRATION_MS);
	}

	@Autowired
	public JwtService(@Value("${jwt.secret}") String secret,
			@Value("${jwt.expiration-ms:604800000}") long expirationMs) {
		if (secret == null || secret.isBlank()) {
			throw new IllegalStateException(
				"jwt.secret (JWT_SECRET) must be set. Generate one with: openssl rand -base64 48");
		}
		byte[] decoded;
		try {
			decoded = Decoders.BASE64.decode(secret);
		}
		catch (Exception e) {
			throw new IllegalStateException("jwt.secret is not valid Base64.");
		}
		if (decoded.length < 32) {
			throw new IllegalStateException(
				"jwt.secret must decode to at least 256 bits (32 bytes). Current length: " + decoded.length + " bytes.");
		}
		this.secret = secret;
		this.signingKey = Keys.hmacShaKeyFor(decoded);
		this.expirationMs = expirationMs;
		log.info("JWT secret validated — {} bytes.", decoded.length);
	}

	/** Issues a token for a replica-owned account (see AuthService/AuthController). */
	public String generateToken(String email, String userId, List<String> roles) {
		Map<String, Object> claims = new HashMap<>();
		claims.put("email", email);
		claims.put("userId", userId);
		claims.put("roles", roles == null ? List.of() : roles);

		Date now = new Date();
		return Jwts.builder()
			.setClaims(claims)
			.setSubject(email)
			.setIssuedAt(now)
			.setExpiration(new Date(now.getTime() + expirationMs))
			.signWith(signingKey, SignatureAlgorithm.HS256)
			.compact();
	}

	/**
	 * Parses and validates the token's signature and expiry, then resolves the
	 * caller's identity. Throws {@code io.jsonwebtoken.JwtException} (or a
	 * subtype: ExpiredJwtException, SignatureException, MalformedJwtException,
	 * UnsupportedJwtException) on any structural/signature/expiry problem, and
	 * {@link MissingIdentityException} if the token is validly signed but
	 * carries neither an "email" claim nor a non-blank "sub".
	 */
	public AuthenticatedUser parseAndValidate(String token) {
		Claims claims = Jwts.parser()
			.setSigningKey(signingKey)
			.build()
			.parseClaimsJws(token)
			.getBody();

		Object emailClaim = claims.get("email");
		String email = (emailClaim instanceof String s && !s.isBlank()) ? s : claims.getSubject();
		if (email == null || email.isBlank()) {
			throw new MissingIdentityException("JWT has neither an 'email' claim nor a non-blank subject");
		}

		String userId = claims.get("userId", String.class);

		List<String> roles = new ArrayList<>();
		Object rolesClaim = claims.get("roles");
		if (rolesClaim instanceof List<?> list) {
			for (Object r : list) {
				if (r instanceof String s) {
					roles.add(s);
				}
			}
		}

		return new AuthenticatedUser(email, userId, roles);
	}

	/** Thrown when a JWT is validly signed but carries no usable identity claim. */
	public static class MissingIdentityException extends RuntimeException {
		public MissingIdentityException(String message) {
			super(message);
		}
	}
}