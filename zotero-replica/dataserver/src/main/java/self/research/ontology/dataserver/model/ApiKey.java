package self.research.ontology.dataserver.model;

import java.time.Instant;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * A long-lived credential external clients (Sci2Code) use to authenticate to
 * this dataserver, as an alternative to the short-lived login JWT the
 * Replica webview/app itself uses. Only the SHA-256 digest of the raw key is
 * ever stored — the raw value is returned to the caller exactly once, at
 * generation time, and is not recoverable afterward (see ApiKeyService).
 * One active key per user, by design (see ApiKeyService#generate) — matches
 * the "don't over-engineer multi-key management" scope decision.
 */
@Document(collection = "ds_api_keys")
@Getter
@Setter
@NoArgsConstructor
public class ApiKey {

	@Id
	private String id;

	/** The owning AppUser's id (ds_users._id) — NOT the email, so a later email change doesn't orphan the key. */
	private String userId;

	@Indexed(unique = true)
	private String keyHash;

	private boolean revoked = false;

	private Instant createdAt = Instant.now();

	private Instant lastUsedAt;
}
