package self.research.ontology.dataserver.controller;

import java.util.List;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import self.research.ontology.dataserver.dto.GroupRequest;
import self.research.ontology.dataserver.dto.GroupResponse;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.model.Group;
import self.research.ontology.dataserver.security.AuthenticatedUser;
import self.research.ontology.dataserver.service.GroupService;
import self.research.ontology.dataserver.service.LibraryAccessResolver;

/**
 * Maps to PHP GroupsController::groups() (#44-48 in the API classification).
 * See GroupService's javadoc for the disclosed owner/admin-gated authorization
 * deviation from PHP's isSuper()-only model.
 */
@RestController
@RequiredArgsConstructor
public class GroupController {

	private final GroupService groupService;
	private final LibraryAccessResolver libraryAccessResolver;

	/** #44 */
	@PostMapping("/groups")
	public ResponseEntity<GroupResponse> createGroup(
			@AuthenticationPrincipal AuthenticatedUser caller,
			@Valid @RequestBody GroupRequest request) {
		Group group = groupService.createGroup(caller, request);
		return ResponseEntity.status(HttpStatus.CREATED).body(GroupResponse.from(group));
	}

	/** #47 — 404 (not 403) on no access, matching PHP's existence-masking behavior. */
	@GetMapping("/groups/{groupId}")
	public GroupResponse getGroup(@PathVariable String groupId, @AuthenticationPrincipal AuthenticatedUser caller) {
		Group group = groupService.getGroupOrThrow(groupId);
		if (!group.canBeReadBy(caller.email())) {
			throw new NotFoundException("Group not found");
		}
		return GroupResponse.from(group);
	}

	/**
	 * #45. Requires If-Unmodified-Since-Version, 412 on stale version —
	 * previously missing entirely. Using our own established header name
	 * (consistent with every other single-object write in this API) rather
	 * than PHP's differently-named "If-Unmodified-Since" for this one
	 * endpoint — a disclosed internal-consistency choice.
	 */
	@PutMapping("/groups/{groupId}")
	public GroupResponse updateGroup(
			@PathVariable String groupId,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@Valid @RequestBody GroupRequest request) {
		return GroupResponse.from(groupService.updateGroup(groupId, caller, ifUnmodifiedSinceVersion, request));
	}

	/** #46 */
	@DeleteMapping("/groups/{groupId}")
	public ResponseEntity<Void> deleteGroup(@PathVariable String groupId, @AuthenticationPrincipal AuthenticatedUser caller) {
		groupService.deleteGroup(groupId, caller);
		return ResponseEntity.noContent().build();
	}

	/** #48 — self-service only (see LibraryAccessResolver javadoc). */
	@GetMapping("/users/{userId}/groups")
	public List<GroupResponse> listUserGroups(@PathVariable String userId, @AuthenticationPrincipal AuthenticatedUser caller) {
		libraryAccessResolver.requireSelf(userId, caller);
		return groupService.listGroupsForCaller(caller).stream().map(GroupResponse::from).toList();
	}
}