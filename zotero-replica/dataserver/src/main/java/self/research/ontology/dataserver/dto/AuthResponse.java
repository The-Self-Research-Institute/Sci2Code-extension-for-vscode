package self.research.ontology.dataserver.dto;

/** Response body for /auth/register and /auth/login. */
public record AuthResponse(String token, String userId, String email) {
}
