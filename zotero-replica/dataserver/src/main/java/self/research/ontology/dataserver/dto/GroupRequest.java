package self.research.ontology.dataserver.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for creating/updating a group. Deliberately JSON, not the PHP
 * API's XML — a disclosed, deliberate simplification (JSON is already a
 * legitimate supported representation in the PHP API for GET responses via
 * format=json; there is no requirement to support literal legacy Zotero XML
 * clients for writes).
 */
public record GroupRequest(
	@NotBlank @Size(max = 255) String name,
	String type,               // PublicOpen | PublicClosed | Private (defaults to Private)
	String libraryEditing,      // admins | members (defaults to admins)
	String libraryReading,      // members | all (defaults to members)
	String description,
	String url
) {
}