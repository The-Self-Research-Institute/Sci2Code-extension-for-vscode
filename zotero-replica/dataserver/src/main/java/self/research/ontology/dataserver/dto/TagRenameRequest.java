package self.research.ontology.dataserver.dto;

/** Request body for PATCH /users/{id}/tags/{name} - library-wide tag rename. */
public record TagRenameRequest(String newName) {
}
