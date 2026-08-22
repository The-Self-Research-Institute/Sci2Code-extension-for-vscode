package self.research.ontology.dataserver.dto;

/** Response body for PATCH /users/{id}/tags/{name} - how many items were touched. */
public record TagRenameResponse(int renamedCount) {
}
