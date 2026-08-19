package self.research.ontology.dataserver.dto;

import java.util.List;

import self.research.ontology.dataserver.model.Group;

public record GroupResponse(
	String id,
	String name,
	String owner,
	String type,
	String libraryEditing,
	String libraryReading,
	String description,
	String url,
	long version,
	List<GroupMemberResponse> members
) {
	public static GroupResponse from(Group g) {
		return new GroupResponse(
			g.getId(),
			g.getName(),
			g.getOwnerEmail(),
			g.getType().name(),
			g.getLibraryEditing().name(),
			g.getLibraryReading().name(),
			g.getDescription(),
			g.getUrl(),
			g.getVersion(),
			g.getMembers().stream().map(GroupMemberResponse::from).toList()
		);
	}
}