package self.research.ontology.dataserver.dto;

import java.time.Instant;

/** Response for GET /auth/api-key — never carries the key or its hash, only whether one exists. */
public record ApiKeyStatusResponse(boolean exists, Instant createdAt, Instant lastUsedAt) {
}
