package self.research.ontology.dataserver.model;

import java.time.Instant;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * A tombstone for a hard-deleted item/collection/tag/search — mirrors PHP's
 * {@code syncDeleteLogKeys} table, which DeletedController::deleted() reads
 * from. Written at the SAME version the owning library was just bumped to
 * (matching PHP's "log write happens in the same request as the version
 * bump" behavior) — not inside a Mongo transaction (none are used anywhere
 * in this project), so the tombstone write and the delete itself are two
 * separate single-document operations, an accepted, disclosed risk under
 * the approved no-multi-document-transactions architecture.
 */
@Document(collection = "ds_deleted_log")
@CompoundIndex(name = "library_type_version", def = "{'libraryId': 1, 'objectType': 1, 'version': 1}")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class DeletedLogEntry {

	@Id
	private String id;

	private String libraryId;

	/** "item" | "collection" | "tag" | "search". */
	private String objectType;

	/** The deleted object's key, or the tag's name (tags have no client-visible key). */
	private String identifier;

	private long version;

	private Instant deletedAt = Instant.now();
}