package self.research.ontology.dataserver.model;

import java.time.Instant;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Embedded (not a separate collection — matches the single-document-atomicity design). */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class GroupMember {
	private String email;
	private GroupRole role; // ADMIN or MEMBER (never OWNER — see GroupRole)
	private Instant joined;

	public GroupMember(String email, GroupRole role) {
		this.email = email;
		this.role = role;
		this.joined = Instant.now();
	}
}