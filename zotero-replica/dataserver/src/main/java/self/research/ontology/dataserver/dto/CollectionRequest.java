package self.research.ontology.dataserver.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CollectionRequest(
	@NotBlank @Size(max = 255) String name,
	String parentCollection, // key of parent, or null/false for top-level (matches Zotero's parentCollection field)
	Long version,            // optional JSON "version" property, alternative to If-Unmodified-Since-Version header
	String key                // batch-write only: present to update an existing item in the same request
) {
}