package self.research.ontology.dataserver.model;

import java.time.Instant;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * A Zotero-style collection (folder). Named LibraryCollection (not
 * "Collection") to avoid any ambiguity with java.util.Collection in code that
 * imports both. Mirrors PHP's {@code collections} table; nesting is via
 * {@code parentKey} directly on the document rather than a separate join
 * table, since Mongo has no need for one.
 */
@Document(collection = "ds_collections")
@CompoundIndex(name = "library_key", def = "{'libraryId': 1, 'key': 1}", unique = true)
@Getter
@Setter
@NoArgsConstructor
public class LibraryCollection {

	@Id
	private String id;

	private String key;

	private String libraryId;

	private String name;

	/** Null/blank for a top-level collection. */
	private String parentKey;

	private long version;

	private Instant dateAdded = Instant.now();

	private Instant dateModified = Instant.now();
}