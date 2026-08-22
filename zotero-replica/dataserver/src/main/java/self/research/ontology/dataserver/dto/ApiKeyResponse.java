package self.research.ontology.dataserver.dto;

import java.time.Instant;

/** Response for POST /auth/api-key. {@code apiKey} is the RAW key — shown to the caller exactly this once. */
public record ApiKeyResponse(String apiKey, Instant createdAt) {
}
