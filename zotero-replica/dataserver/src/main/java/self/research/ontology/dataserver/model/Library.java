package self.research.ontology.dataserver.model;

import java.time.Instant;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Every user and every group owns exactly one Library, which is the unit of
 * versioning/sync (mirrors PHP's {@code libraries} table). Ownership is by
 * email (our primary identity key — see AuthenticatedUser) for USER
 * libraries, or by groupId for GROUP libraries.
 */
@Document(collection = "ds_libraries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Library {

	@Id
	private String id;

	private LibraryType type;

	/** Set when type == USER. The durable owner key (email), never userId. */
	@Indexed(unique = true, sparse = true)
	private String ownerEmail;

	/** Set when type == GROUP. */
	@Indexed(unique = true, sparse = true)
	private String groupId;

	private long version;

	private Instant lastUpdated;

	public static Library forUser(String ownerEmail) {
		Library l = new Library();
		l.type = LibraryType.USER;
		l.ownerEmail = ownerEmail;
		l.version = 0;
		l.lastUpdated = Instant.now();
		return l;
	}

	public static Library forGroup(String groupId) {
		Library l = new Library();
		l.type = LibraryType.GROUP;
		l.groupId = groupId;
		l.version = 0;
		l.lastUpdated = Instant.now();
		return l;
	}
}