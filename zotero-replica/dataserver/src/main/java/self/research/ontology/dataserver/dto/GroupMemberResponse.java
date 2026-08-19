package self.research.ontology.dataserver.dto;

import self.research.ontology.dataserver.model.GroupMember;

public record GroupMemberResponse(String email, String role) {
	public static GroupMemberResponse from(GroupMember m) {
		return new GroupMemberResponse(m.getEmail(), m.getRole().name());
	}

	public static GroupMemberResponse owner(String email) {
		return new GroupMemberResponse(email, "OWNER");
	}
}