package self.research.ontology.dataserver.security;

import java.util.List;

/**
 * The resolved identity of an authenticated caller.
 * <p>
 * {@code email} is the primary, always-present identity key (sourced from the
 * JWT's "email" claim, falling back to the "sub" claim). {@code userId} is the
 * optional user id claim (the replica's own ds_users document id when the
 * token was issued by AuthController) and must NEVER be required or assumed
 * present.
 */
public record AuthenticatedUser(String email, String userId, List<String> roles) {

	public boolean isAdmin() {
		return roles != null && roles.contains("ROLE_ADMIN");
	}

	public boolean hasUserId() {
		return userId != null && !userId.isBlank();
	}
}