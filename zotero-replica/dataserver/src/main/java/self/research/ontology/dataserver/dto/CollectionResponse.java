package self.research.ontology.dataserver.dto;

import java.util.Map;

import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.model.LibraryCollection;

/**
 * Mirrors the Zotero v3 API's response envelope (key/version/library/data) —
 * verified against CollectionsController.php's toResponseJSON() usage.
 * "links"/"meta" (HATEOAS navigation aids) are a disclosed, deliberate
 * omission — they carry no functional round-trip requirement.
 */
public record CollectionResponse(
	String key,
	long version,
	LibraryRef library,
	Data data
) {
	public record Data(String key, long version, String name, Object parentCollection, Map<String, Object> relations) {
	}

	public static CollectionResponse from(LibraryCollection c, Library library) {
		Object parent = (c.getParentKey() == null || c.getParentKey().isBlank()) ? false : c.getParentKey();
		return new CollectionResponse(
			c.getKey(),
			c.getVersion(),
			LibraryRef.from(library),
			new Data(c.getKey(), c.getVersion(), c.getName(), parent, Map.of())
		);
	}
}