package self.research.ontology.dataserver.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * A replica-owned account: the identity the dataserver's own AuthController
 * issues JWTs for. Distinct from Library (every user's personal Library is
 * still auto-vivified by email on first access via LibraryService) — this
 * document exists solely to hold credentials, so the replica can authenticate
 * users without depending on an external identity provider.
 */
@Document(collection = "ds_users")
@Getter
@Setter
@NoArgsConstructor
public class AppUser {

	@Id
	private String id;

	@Indexed(unique = true)
	private String email;

	private String passwordHash;

	private List<String> roles = new ArrayList<>();

	private Instant dateCreated = Instant.now();
}
