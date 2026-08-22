package self.research.ontology.dataserver.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import self.research.ontology.dataserver.dto.ApiKeyResponse;
import self.research.ontology.dataserver.dto.ApiKeyStatusResponse;
import self.research.ontology.dataserver.dto.AuthRequest;
import self.research.ontology.dataserver.dto.AuthResponse;
import self.research.ontology.dataserver.dto.WhoAmIResponse;
import self.research.ontology.dataserver.security.AuthenticatedUser;
import self.research.ontology.dataserver.service.ApiKeyService;
import self.research.ontology.dataserver.service.AuthService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Replica-owned authentication boundary — register/login issue a JWT the
 * dataserver's own JwtAuthenticationFilter accepts, exactly like a token
 * from any other issuer configured with the same jwt.secret. Only /register
 * and /login are public (matching SecurityConfig's permitAll list) — refresh,
 * api-key, and whoami all require a currently-valid credential (JWT or API
 * key, see JwtAuthenticationFilter) since they act on/reveal an existing
 * identity.
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

	private final AuthService authService;
	private final ApiKeyService apiKeyService;

	@PostMapping("/register")
	public ResponseEntity<AuthResponse> register(@Valid @RequestBody AuthRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request.email(), request.password()));
	}

	@PostMapping("/login")
	public AuthResponse login(@Valid @RequestBody AuthRequest request) {
		return authService.login(request.email(), request.password());
	}

	/**
	 * Requires a currently-valid token (not in SecurityConfig's permitAll list,
	 * so JwtAuthenticationFilter/the "authenticated()" rule already reject an
	 * expired/invalid one with 401 before this method ever runs) and mints a
	 * new one with a fresh expiry. Callers refresh proactively, before expiry,
	 * to keep a session alive indefinitely without the user re-entering
	 * credentials - see AuthService.refresh's javadoc.
	 */
	@PostMapping("/refresh")
	public AuthResponse refresh(@AuthenticationPrincipal AuthenticatedUser caller) {
		return authService.refresh(caller);
	}

	/**
	 * Issues a fresh Replica API key for the caller (the credential external
	 * clients such as Sci2Code use — see ApiKeyService's javadoc), revoking any
	 * previously issued key. Requires a currently-valid Replica login JWT — an
	 * API key cannot be used to generate another API key, only to read/write
	 * library data (see JwtAuthenticationFilter). The raw key is returned in
	 * this response ONLY — it cannot be retrieved again afterward.
	 */
	@PostMapping("/api-key")
	public ApiKeyResponse generateApiKey(@AuthenticationPrincipal AuthenticatedUser caller) {
		return apiKeyService.generate(caller);
	}

	/** Revokes the caller's active API key without issuing a new one. */
	@DeleteMapping("/api-key")
	public ResponseEntity<Void> revokeApiKey(@AuthenticationPrincipal AuthenticatedUser caller) {
		apiKeyService.revoke(caller);
		return ResponseEntity.noContent().build();
	}

	/** Whether the caller has an active API key, and when it was created/last used — never the key itself. */
	@GetMapping("/api-key")
	public ApiKeyStatusResponse apiKeyStatus(@AuthenticationPrincipal AuthenticatedUser caller) {
		return apiKeyService.status(caller);
	}

	/**
	 * Lets a caller authenticated by EITHER a login JWT or an API key learn its
	 * own identity — specifically the {@code userId} needed to build
	 * {@code /users/{userId}/...} URLs — without ever asking the user to
	 * manually supply their Mongo id.
	 */
	@GetMapping("/whoami")
	public WhoAmIResponse whoami(@AuthenticationPrincipal AuthenticatedUser caller) {
		return new WhoAmIResponse(caller.userId(), caller.email());
	}
}
