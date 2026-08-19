package self.research.ontology.dataserver.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Dataserver-owned Zotero-style shared library (group). Deliberately its own
 * collection/model, NOT a reuse of OntoCode's Workspace — Workspace carries
 * OntoCode-specific billing/subscription concerns that don't belong here
 * (per explicit project decision). Members are embedded (matches the
 * single-document-atomicity strategy, and mirrors the embedded-members shape
 * already used by OntoCode's own Workspace.members, confirmed via the earlier
 * ontology-auth investigation, as a proven in-repo precedent).
 */
@Document(collection = "ds_groups")
@Getter
@Setter
@NoArgsConstructor
public class Group {

	@Id
	private String id;

	private String name;

	private GroupVisibility type = GroupVisibility.PRIVATE;

	/** The durable owner key — email, never userId. */
	private String ownerEmail;

	private String libraryId;

	private LibraryEditing libraryEditing = LibraryEditing.ADMINS;

	private LibraryReading libraryReading = LibraryReading.MEMBERS;

	private String description = "";

	private String url = "";

	private List<GroupMember> members = new ArrayList<>();

	private long version;

	private Instant dateAdded = Instant.now();

	private Instant dateModified = Instant.now();

	public boolean isOwner(String email) {
		return ownerEmail != null && ownerEmail.equalsIgnoreCase(email);
	}

	public GroupMember findMember(String email) {
		return members.stream().filter(m -> m.getEmail().equalsIgnoreCase(email)).findFirst().orElse(null);
	}

	public boolean isMember(String email) {
		return isOwner(email) || findMember(email) != null;
	}

	public boolean isAdminOrOwner(String email) {
		if (isOwner(email)) {
			return true;
		}
		GroupMember m = findMember(email);
		return m != null && m.getRole() == GroupRole.ADMIN;
	}

	public boolean canBeReadBy(String email) {
		return isMember(email) || libraryReading == LibraryReading.ALL;
	}

	public boolean canBeWrittenBy(String email) {
		if (isOwner(email)) {
			return true;
		}
		GroupMember m = findMember(email);
		if (m == null) {
			return false;
		}
		return m.getRole() == GroupRole.ADMIN || libraryEditing == LibraryEditing.MEMBERS;
	}
}