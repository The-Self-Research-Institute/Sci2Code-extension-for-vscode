package self.research.ontology.dataserver.controller;

import java.util.List;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import self.research.ontology.dataserver.dto.GroupMemberResponse;
import self.research.ontology.dataserver.dto.MemberRequest;
import self.research.ontology.dataserver.security.AuthenticatedUser;
import self.research.ontology.dataserver.service.GroupService;

/**
 * Maps to PHP GroupsController::groupUsers() (#50-54). See GroupService's
 * javadoc for the disclosed owner/admin-gated authorization deviation.
 * <p>
 * NOTE on #50/#54: the prior classification pass found these two PHP
 * operations reachable only via a subtle router quirk (a `continue 2` inside
 * a `switch`, which PHP treats as continuing the enclosing `for` loop rather
 * than abandoning the route, due to switch counting as a loop level). This
 * Java implementation exposes them as explicit, intentional operations —
 * preserving the OBSERVABLE behavior (same URL, method, request/response
 * shape), not the PHP router accident that happened to make them reachable.
 */
@RestController
@RequiredArgsConstructor
public class GroupMemberController {

	private final GroupService groupService;

	/** #50: bulk-add members. */
	@PostMapping("/groups/{groupId}/users")
	public List<GroupMemberResponse> addMembers(
			@PathVariable String groupId,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestBody List<@Valid MemberRequest> members) {
		return groupService.addMembers(groupId, caller, members).getMembers().stream()
			.map(GroupMemberResponse::from).toList();
	}

	/** #51: add/change a single member's role (role=OWNER transfers ownership). */
	@PutMapping("/groups/{groupId}/users/{email}")
	public GroupMemberResponse setMemberRole(
			@PathVariable String groupId,
			@PathVariable String email,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestBody MemberRequest request) {
		groupService.setMemberRole(groupId, caller, email, request.role());
		return GroupMemberResponse.from(groupService.getMemberOrOwner(groupId, email));
	}

	/** #52 */
	@DeleteMapping("/groups/{groupId}/users/{email}")
	public ResponseEntity<Void> removeMember(
			@PathVariable String groupId,
			@PathVariable String email,
			@AuthenticationPrincipal AuthenticatedUser caller) {
		groupService.removeMember(groupId, caller, email);
		return ResponseEntity.noContent().build();
	}

	/** #53 */
	@GetMapping("/groups/{groupId}/users/{email}")
	public GroupMemberResponse getMember(@PathVariable String groupId, @PathVariable String email) {
		return GroupMemberResponse.from(groupService.getMemberOrOwner(groupId, email));
	}

	/** #54 */
	@GetMapping("/groups/{groupId}/users")
	public List<GroupMemberResponse> listMembers(@PathVariable String groupId) {
		return groupService.listAllMembers(groupId).stream().map(GroupMemberResponse::from).toList();
	}
}