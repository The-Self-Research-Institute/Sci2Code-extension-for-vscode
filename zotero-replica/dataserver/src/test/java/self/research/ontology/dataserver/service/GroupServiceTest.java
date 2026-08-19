package self.research.ontology.dataserver.service;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import self.research.ontology.dataserver.dto.GroupRequest;
import self.research.ontology.dataserver.dto.MemberRequest;
import self.research.ontology.dataserver.exception.BadRequestException;
import self.research.ontology.dataserver.exception.ForbiddenException;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.model.Group;
import self.research.ontology.dataserver.model.GroupMember;
import self.research.ontology.dataserver.model.GroupRole;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.repository.GroupRepository;
import self.research.ontology.dataserver.security.AuthenticatedUser;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GroupServiceTest {

	@Mock
	private GroupRepository groupRepository;

	@Mock
	private LibraryService libraryService;

	private GroupService groupService;

	private final AuthenticatedUser owner = new AuthenticatedUser("owner@example.com", null, List.of());
	private final AuthenticatedUser admin = new AuthenticatedUser("admin@example.com", null, List.of());
	private final AuthenticatedUser member = new AuthenticatedUser("member@example.com", null, List.of());
	private final AuthenticatedUser stranger = new AuthenticatedUser("stranger@example.com", null, List.of());

	@BeforeEach
	void setUp() {
		groupService = new GroupService(groupRepository, libraryService);
	}

	private Group groupWithAdminAndMember() {
		Group g = new Group();
		g.setId("g1");
		g.setName("Lab Group");
		g.setOwnerEmail(owner.email());
		g.getMembers().add(new GroupMember(admin.email(), GroupRole.ADMIN));
		g.getMembers().add(new GroupMember(member.email(), GroupRole.MEMBER));
		g.setVersion(1);
		return g;
	}

	@Test
	void createGroup_setsCallerAsOwner_andCreatesBackingLibrary() {
		when(groupRepository.save(any())).thenAnswer(inv -> {
			Group g = inv.getArgument(0);
			if (g.getId() == null) {
				g.setId("new-group-id");
			}
			return g;
		});
		Library fakeLibrary = Library.forGroup("new-group-id");
		fakeLibrary.setId("lib-1");
		when(libraryService.createGroupLibrary("new-group-id")).thenReturn(fakeLibrary);

		Group created = groupService.createGroup(owner, new GroupRequest("Lab Group", null, null, null, null, null));

		assertThat(created.getOwnerEmail()).isEqualTo("owner@example.com");
		assertThat(created.getLibraryId()).isEqualTo("lib-1");
		verify(libraryService).createGroupLibrary("new-group-id");
	}

	@Test
	void updateGroup_byOwner_succeeds() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));
		when(groupRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		Group updated = groupService.updateGroup("g1", owner, 1L, new GroupRequest("Renamed", null, null, null, null, null));

		assertThat(updated.getName()).isEqualTo("Renamed");
		assertThat(updated.getVersion()).isEqualTo(2);
	}

	@Test
	void updateGroup_byAdmin_succeeds() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));
		when(groupRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		Group updated = groupService.updateGroup("g1", admin, 1L, new GroupRequest("Renamed", null, null, null, null, null));

		assertThat(updated.getName()).isEqualTo("Renamed");
	}

	@Test
	void updateGroup_byPlainMember_throwsForbidden() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		assertThatThrownBy(() -> groupService.updateGroup("g1", member, 1L, new GroupRequest("x", null, null, null, null, null)))
			.isInstanceOf(ForbiddenException.class);
	}

	@Test
	void updateGroup_byStranger_throwsForbidden() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		assertThatThrownBy(() -> groupService.updateGroup("g1", stranger, 1L, new GroupRequest("x", null, null, null, null, null)))
			.isInstanceOf(ForbiddenException.class);
	}

	@Test
	void updateGroup_nonExistent_throwsNotFound() {
		when(groupRepository.findById("missing")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> groupService.updateGroup("missing", owner, 1L, new GroupRequest("x", null, null, null, null, null)))
			.isInstanceOf(NotFoundException.class);
	}

	@Test
	void updateGroup_withoutVersion_throws428() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		assertThatThrownBy(() -> groupService.updateGroup("g1", owner, null, new GroupRequest("x", null, null, null, null, null)))
			.isInstanceOf(self.research.ontology.dataserver.exception.PreconditionRequiredException.class);
	}

	@Test
	void updateGroup_withStaleVersion_throws412() {
		Group g = groupWithAdminAndMember();
		g.setVersion(5);
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		assertThatThrownBy(() -> groupService.updateGroup("g1", owner, 3L, new GroupRequest("x", null, null, null, null, null)))
			.isInstanceOf(self.research.ontology.dataserver.exception.PreconditionFailedException.class);
	}

	@Test
	void deleteGroup_byNonOwnerAdmin_throwsForbidden_onlyOwnerMayDelete() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		// Admin can update but NOT delete — only the owner can delete.
		assertThatThrownBy(() -> groupService.deleteGroup("g1", admin))
			.isInstanceOf(ForbiddenException.class);
	}

	@Test
	void deleteGroup_byOwner_succeeds() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		groupService.deleteGroup("g1", owner);

		verify(libraryService).deleteGroupLibrary("g1");
		verify(groupRepository).delete(g);
	}

	@Test
	void addMembers_byAdmin_succeeds_andRejectsOwnerRole() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));
		when(groupRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		groupService.addMembers("g1", admin, List.of(new MemberRequest("new@example.com", "member")));
		assertThat(g.findMember("new@example.com")).isNotNull();

		assertThatThrownBy(() -> groupService.addMembers("g1", admin, List.of(new MemberRequest("x@example.com", "owner"))))
			.isInstanceOf(BadRequestException.class);
	}

	@Test
	void addMembers_byPlainMember_throwsForbidden() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		assertThatThrownBy(() -> groupService.addMembers("g1", member, List.of(new MemberRequest("x@example.com", "member"))))
			.isInstanceOf(ForbiddenException.class);
	}

	@Test
	void setMemberRole_transferOwnership_reassignsOwner_andDemotesOldOwnerToAdmin() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));
		when(groupRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		groupService.setMemberRole("g1", owner, member.email(), "owner");

		assertThat(g.getOwnerEmail()).isEqualTo(member.email());
		assertThat(g.isOwner(member.email())).isTrue();
		// Old owner retains access as an admin (documented design choice).
		GroupMember demotedOldOwner = g.findMember(owner.email());
		assertThat(demotedOldOwner).isNotNull();
		assertThat(demotedOldOwner.getRole()).isEqualTo(GroupRole.ADMIN);
		// New owner removed from the members list (owner is tracked separately).
		assertThat(g.findMember(member.email())).isNull();
	}

	@Test
	void removeMember_cannotRemoveOwner() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		assertThatThrownBy(() -> groupService.removeMember("g1", owner, owner.email()))
			.isInstanceOf(BadRequestException.class);
	}

	@Test
	void removeMember_notAMember_throwsNotFound() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		assertThatThrownBy(() -> groupService.removeMember("g1", owner, "ghost@example.com"))
			.isInstanceOf(NotFoundException.class);
	}

	@Test
	void removeMember_byAdmin_succeeds() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));
		when(groupRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		groupService.removeMember("g1", admin, member.email());

		assertThat(g.findMember(member.email())).isNull();
	}

	@Test
	void listAllMembers_includesOwnerFirst_thenAdminsAndMembers() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		List<GroupMember> all = groupService.listAllMembers("g1");

		assertThat(all).hasSize(3);
		assertThat(all.get(0).getRole()).isEqualTo(GroupRole.OWNER);
		assertThat(all.get(0).getEmail()).isEqualTo(owner.email());
	}

	@Test
	void getMemberOrOwner_forOwner_returnsOwnerRole() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		GroupMember result = groupService.getMemberOrOwner("g1", owner.email());

		assertThat(result.getRole()).isEqualTo(GroupRole.OWNER);
	}

	@Test
	void getMemberOrOwner_forNonMember_throwsNotFound() {
		Group g = groupWithAdminAndMember();
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));

		assertThatThrownBy(() -> groupService.getMemberOrOwner("g1", stranger.email()))
			.isInstanceOf(NotFoundException.class);
	}
}