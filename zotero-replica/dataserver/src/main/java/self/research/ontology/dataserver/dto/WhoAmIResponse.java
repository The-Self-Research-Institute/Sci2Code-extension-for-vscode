package self.research.ontology.dataserver.dto;

/**
 * Response for GET /auth/whoami — lets a caller authenticated by EITHER a
 * login JWT or an API key (see ApiKeyService/JwtAuthenticationFilter) learn
 * its own identity, so an external client (Sci2Code) never has to be told
 * the user's Mongo id out of band: it pastes an API key, calls this once,
 * and caches the returned userId for subsequent /users/{userId}/... calls.
 */
public record WhoAmIResponse(String userId, String email) {
}
