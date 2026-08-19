package self.research.ontology.dataserver.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.dto.GroupRequest;
import self.research.ontology.dataserver.dto.MemberRequest;
import self.research.ontology.dataserver.exception.BadRequestException;
import self.research.ontology.dataserver.exception.ForbiddenException;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.model.Group;
import self.research.ontology.dataserver.model.GroupMember;
import self.research.ontology.dataserver.model.GroupRole;
import self.research.ontology.dataserver.model.GroupVisibility;
import self.research.ontology.dataserver.model.LibraryEditing;
import self.research.ontology.dataserver.model.LibraryReading;
import self.research.ontology.dataserver.repository.GroupRepository;
import self.research.ontology.dataserver.security.AuthenticatedUser;
import self.research.ontology.dataserver.util.VersionGuard;

/**
 * Group (shared-library) CRUD and membership management.
 * <p>
 * DELIBERATE, DISCLOSED COMPATIBILITY DEVIATION from the PHP reference: the
 * PHP GroupsController/groupUsers() gate every write behind
 * {@code $this->permissions->isSuper()} (Zotero's own super-user concept,
 * tied to its now-replaced authentication system). Since OntoCode has no
 * equivalent "Zotero super-user" concept, and per the explicit architecture
 * decision that the dataserver owns its own authorization data rather than
 * trusting JWT claims, group management here is instead owner/admin-gated —
 * any authenticated user may create their own group; only its owner/admins
 * may manage it thereafter. This preserves the OBSERVABLE shape (paths,
 * methods, status codes, response structure) while replacing the underlying
 * authorization model, per the "preserve behavior, not implementation
 * accidents" principle already established for the group-membership
 * endpoints in the prior classification pass.
 */
@Service
@RequiredArgsConstructor
public class GroupService {

	private final GroupRepository groupRepository;
	private final LibraryService libraryService;

	public Group createGroup(AuthenticatedUser caller, GroupRequest req) {
		Group group = new Group();
		group.setName(req.name());
		group.setOwnerEmail(caller.email());
		group.setType(parseVisibility(req.type()));
		group.setLibraryEditing(parseEditing(req.libraryEditing()));
		group.setLibraryReading(parseReading(req.libraryReading()));
		group.setDescription(req.description() != null ? req.description() : "");
		group.setUrl(req.url() != null ? req.url() : "");
		group.setVersion(1);
		group = groupRepository.save(group);

		var library = libraryService.createGroupLibrary(group.getId());
		group.setLibraryId(library.getId());
		return groupRepository.save(group);
	}

	public Group getGroupOrThrow(String groupId) {
		return groupRepository.findById(groupId).orElseThrow(() -> new NotFoundException("Group not found"));
	}

	/** #45: version guard added — previously missing entirely. */
	public Group updateGroup(String groupId, AuthenticatedUser caller, Long ifUnmodifiedSinceVersion, GroupRequest req) {
		Group group = getGroupOrThrow(groupId);
		requireOwnerOrAdmin(group, caller);
		VersionGuard.requireForExisting(ifUnmodifiedSinceVersion, group.getVersion());

		if (req.name() != null && !req.name().isBlank()) {
			group.setName(req.name());
		}
		if (req.type() != null) {
			group.setType(parseVisibility(req.type()));
		}
		if (req.libraryEditing() != null) {
			group.setLibraryEditing(parseEditing(req.libraryEditing()));
		}
		if (req.libraryReading() != null) {
			group.setLibraryReading(parseReading(req.libraryReading()));
		}
		if (req.description() != null) {
			group.setDescription(req.description());
		}
		if (req.url() != null) {
			group.setUrl(req.url());
		}
		group.setVersion(group.getVersion() + 1);
		group.setDateModified(java.time.Instant.now());
		return groupRepository.save(group);
	}

	public void deleteGroup(String groupId, AuthenticatedUser caller) {
		Group group = getGroupOrThrow(groupId);
		if (!group.isOwner(caller.email())) {
			throw new ForbiddenException("Only the group owner may delete the group");
		}
		libraryService.deleteGroupLibrary(groupId);
		groupRepository.delete(group);
	}

	public List<Group> listGroupsForCaller(AuthenticatedUser caller) {
		List<Group> result = new ArrayList<>(groupRepository.findByOwnerEmail(caller.email()));
		for (Group g : groupRepository.findByMembers_Email(caller.email())) {
			if (result.stream().noneMatch(existing -> existing.getId().equals(g.getId()))) {
				result.add(g);
			}
		}
		return result;
	}

	// ---- Membership ----

	/** #50: bulk-add members. */
	public Group addMembers(String groupId, AuthenticatedUser caller, List<MemberRequest> requests) {
		Group group = getGroupOrThrow(groupId);
		requireOwnerOrAdmin(group, caller);

		for (MemberRequest r : requests) {
			GroupRole role = parseRole(r.role());
			if (role == GroupRole.OWNER) {
				throw new BadRequestException("Cannot add a member with role OWNER via this endpoint — use PUT .../users/{email} to transfer ownership");
			}
			if (group.isOwner(r.email())) {
				continue; // already implicitly a member (the owner)
			}
			GroupMember existing = group.findMember(r.email());
			if (existing != null) {
				existing.setRole(role);
			}
			else {
				group.getMembers().add(new GroupMember(r.email(), role));
			}
		}
		group.setVersion(group.getVersion() + 1);
		return groupRepository.save(group);
	}

	/** #51: add/change a single member's role, including OWNER (ownership transfer). */
	public Group setMemberRole(String groupId, AuthenticatedUser caller, String targetEmail, String roleStr) {
		Group group = getGroupOrThrow(groupId);
		requireOwnerOrAdmin(group, caller);
		GroupRole role = parseRole(roleStr);

		if (role == GroupRole.OWNER) {
			if (!group.isOwner(targetEmail)) {
				String oldOwner = group.getOwnerEmail();
				group.getMembers().removeIf(m -> m.getEmail().equalsIgnoreCase(targetEmail));
				group.setOwnerEmail(targetEmail);
				// The outgoing owner keeps access as an admin — a documented, deliberate
				// design choice filling a gap in the PHP reference (its ownership-transfer
				// path reassigns ownerUserID but does not specify what happens to the
				// outgoing owner's own access), not a literal translation of unclear PHP behavior.
				if (oldOwner != null && group.findMember(oldOwner) == null) {
					group.getMembers().add(new GroupMember(oldOwner, GroupRole.ADMIN));
				}
			}
		}
		else {
			GroupMember existing = group.findMember(targetEmail);
			if (existing != null) {
				existing.setRole(role);
			}
			else {
				group.getMembers().add(new GroupMember(targetEmail, role));
			}
		}
		group.setVersion(group.getVersion() + 1);
		return groupRepository.save(group);
	}

	/** #52: remove a member. Cannot remove the owner via this endpoint. */
	public void removeMember(String groupId, AuthenticatedUser caller, String targetEmail) {
		Group group = getGroupOrThrow(groupId);
		requireOwnerOrAdmin(group, caller);

		if (group.isOwner(targetEmail)) {
			throw new BadRequestException("Cannot remove the group owner");
		}
		GroupMember existing = group.findMember(targetEmail);
		if (existing == null) {
			throw new NotFoundException("User is not a member of this group");
		}
		group.getMembers().remove(existing);
		group.setVersion(group.getVersion() + 1);
		groupRepository.save(group);
	}

	/** #53: single member (owner included, reported with role OWNER). */
	public GroupMember getMemberOrOwner(String groupId, String targetEmail) {
		Group group = getGroupOrThrow(groupId);
		if (group.isOwner(targetEmail)) {
			return new GroupMember(targetEmail, GroupRole.OWNER);
		}
		GroupMember m = group.findMember(targetEmail);
		if (m == null) {
			throw new NotFoundException("User is not a member of this group");
		}
		return m;
	}

	/** #54: all members, owner first. */
	public List<GroupMember> listAllMembers(String groupId) {
		Group group = getGroupOrThrow(groupId);
		List<GroupMember> all = new ArrayList<>();
		all.add(new GroupMember(group.getOwnerEmail(), GroupRole.OWNER));
		all.addAll(group.getMembers());
		return all;
	}

	// ---- helpers ----

	private void requireOwnerOrAdmin(Group group, AuthenticatedUser caller) {
		if (!group.isAdminOrOwner(caller.email())) {
			throw new ForbiddenException("Only the group owner or an admin may perform this action");
		}
	}

	private GroupVisibility parseVisibility(String s) {
		if (s == null || s.isBlank()) {
			return GroupVisibility.PRIVATE;
		}
		return switch (s.toLowerCase(Locale.ROOT)) {
			case "publicopen" -> GroupVisibility.PUBLIC_OPEN;
			case "publicclosed" -> GroupVisibility.PUBLIC_CLOSED;
			case "private" -> GroupVisibility.PRIVATE;
			default -> throw new BadRequestException("Invalid group type '" + s + "'");
		};
	}

	private LibraryEditing parseEditing(String s) {
		if (s == null || s.isBlank()) {
			return LibraryEditing.ADMINS;
		}
		return switch (s.toLowerCase(Locale.ROOT)) {
			case "admins" -> LibraryEditing.ADMINS;
			case "members" -> LibraryEditing.MEMBERS;
			default -> throw new BadRequestException("Invalid libraryEditing '" + s + "'");
		};
	}

	private LibraryReading parseReading(String s) {
		if (s == null || s.isBlank()) {
			return LibraryReading.MEMBERS;
		}
		return switch (s.toLowerCase(Locale.ROOT)) {
			case "members" -> LibraryReading.MEMBERS;
			case "all" -> LibraryReading.ALL;
			default -> throw new BadRequestException("Invalid libraryReading '" + s + "'");
		};
	}

	private GroupRole parseRole(String s) {
		if (s == null || s.isBlank()) {
			throw new BadRequestException("Role not provided");
		}
		return switch (s.toLowerCase(Locale.ROOT)) {
			case "owner" -> GroupRole.OWNER;
			case "admin" -> GroupRole.ADMIN;
			case "member" -> GroupRole.MEMBER;
			default -> throw new BadRequestException("Invalid role '" + s + "'");
		};
	}
}