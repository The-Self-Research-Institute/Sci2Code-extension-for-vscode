package self.research.ontology.dataserver.dto;

/**
 * Mirrors Zotero_Tag::toResponseJSON() — {tag, meta:{numItems}}. "type" and
 * "links" are disclosed, deliberate omissions: this replica has no
 * automatic-tagging source (so "type" would always be PHP's default, 0,
 * which PHP itself omits from the JSON when zero), and "links" (HATEOAS
 * navigation) carries no functional round-trip requirement — the same
 * omission CollectionResponse already makes, for the same reason.
 */
public record TagResponse(String tag, Meta meta) {
	public record Meta(long numItems) {
	}

	public static TagResponse of(String tag, long numItems) {
		return new TagResponse(tag, new Meta(numItems));
	}
}