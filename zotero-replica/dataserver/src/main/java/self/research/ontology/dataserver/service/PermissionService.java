package self.research.ontology.dataserver.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.exception.ForbiddenException;
import self.research.ontology.dataserver.model.Group;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.model.LibraryType;
import self.research.ontology.dataserver.repository.GroupRepository;
import self.research.ontology.dataserver.security.AuthenticatedUser;

/**
 * Resolves canAccess/canWrite for a library purely from dataserver-owned data
 * (Group/Library documents) — NEVER from JWT claims. Mirrors the intent of
 * PHP's Zotero_Permissions::canAccess()/canWrite(), reconstructed from
 * GroupsController.php's observed field set (type/libraryEditing/
 * libraryReading), since Zotero_Permissions.inc.php itself was not part of
 * this migration's source inventory — this is a faithful, documented
 * reconstruction, not a guess at unrelated behavior.
 */
@Service
@RequiredArgsConstructor
public class PermissionService {

	private final GroupRepository groupRepository;

	public boolean canAccess(Library library, AuthenticatedUser caller) {
		if (library.getType() == LibraryType.USER) {
			return library.getOwnerEmail().equalsIgnoreCase(caller.email());
		}
		return groupOf(library).canBeReadBy(caller.email());
	}

	public boolean canWrite(Library library, AuthenticatedUser caller) {
		if (library.getType() == LibraryType.USER) {
			return library.getOwnerEmail().equalsIgnoreCase(caller.email());
		}
		return groupOf(library).canBeWrittenBy(caller.email());
	}

	public void requireAccess(Library library, AuthenticatedUser caller) {
		if (!canAccess(library, caller)) {
			throw new ForbiddenException("Access denied");
		}
	}

	public void requireWrite(Library library, AuthenticatedUser caller) {
		if (!canWrite(library, caller)) {
			throw new ForbiddenException("Write access denied");
		}
	}

	private Group groupOf(Library library) {
		return groupRepository.findById(library.getGroupId())
			.orElseThrow(() -> new IllegalStateException("Group library " + library.getId() + " has no backing Group document"));
	}
}