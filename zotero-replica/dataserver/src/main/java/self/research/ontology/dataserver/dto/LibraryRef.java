package self.research.ontology.dataserver.dto;

import self.research.ontology.dataserver.model.Library;

/** Minimal "library" sub-object in Zotero-shaped responses. */
public record LibraryRef(String id, String type) {
	public static LibraryRef from(Library library) {
		return new LibraryRef(library.getId(), library.getType().name().toLowerCase());
	}
}