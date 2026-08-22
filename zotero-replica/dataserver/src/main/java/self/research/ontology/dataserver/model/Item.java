package self.research.ontology.dataserver.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Denormalized item document — matches the PHP API's own JSON response shape
 * (embedded data/creators/tags/collections/relations) rather than the PHP
 * reference implementation's normalized SQL schema (separate itemData/
 * itemCreators/itemTags tables), per the approved MongoDB mapping approach.
 * Single-document atomicity: adding/removing a tag or a collection
 * membership is a single-document update, never a join-collection write.
 */
@Document(collection = "ds_items")
@CompoundIndex(name = "library_key", def = "{'libraryId': 1, 'key': 1}", unique = true)
@Getter
@Setter
@NoArgsConstructor
public class Item {

	@Id
	private String id;

	private String key;

	private String libraryId;

	private String itemType;

	/** Schema-defined fields (title, date, url, ...) — validated against SchemaService on write. */
	private Map<String, Object> data = new LinkedHashMap<>();

	private List<Creator> creators = new ArrayList<>();

	/** Each tag carries its own manual/automatic {@code type} - see {@link ItemTag}. */
	private List<ItemTag> tags = new ArrayList<>();

	private List<String> collections = new ArrayList<>();

	private Map<String, Object> relations = new LinkedHashMap<>();

	/** Null for a top-level item; set for notes/attachments/annotations attached to a parent. */
	private String parentItemKey;

	/** Trash flag — settable via update, distinct from a hard DELETE. */
	private boolean deleted = false;

	private long version;

	private Instant dateAdded = Instant.now();

	private Instant dateModified = Instant.now();
}