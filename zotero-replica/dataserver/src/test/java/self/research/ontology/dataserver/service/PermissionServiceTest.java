package self.research.ontology.dataserver.service;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import self.research.ontology.dataserver.model.Group;
import self.research.ontology.dataserver.model.GroupMember;
import self.research.ontology.dataserver.model.GroupRole;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.model.LibraryEditing;
import self.research.ontology.dataserver.model.LibraryReading;
import self.research.ontology.dataserver.repository.GroupRepository;
import self.research.ontology.dataserver.security.AuthenticatedUser;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PermissionServiceTest {

	@Mock
	private GroupRepository groupRepository;

	private PermissionService permissionService;

	private final AuthenticatedUser owner = new AuthenticatedUser("owner@example.com", null, List.of());
	private final AuthenticatedUser admin = new AuthenticatedUser("admin@example.com", null, List.of());
	private final AuthenticatedUser member = new AuthenticatedUser("member@example.com", null, List.of());
	private final AuthenticatedUser stranger = new AuthenticatedUser("stranger@example.com", null, List.of());

	private PermissionService service() {
		return new PermissionService(groupRepository);
	}

	@Test
	void userLibrary_onlyOwnerCanAccessOrWrite() {
		Library lib = Library.forUser(owner.email());
		lib.setId("lib1");
		PermissionService s = service();

		assertThat(s.canAccess(lib, owner)).isTrue();
		assertThat(s.canWrite(lib, owner)).isTrue();
		assertThat(s.canAccess(lib, stranger)).isFalse();
		assertThat(s.canWrite(lib, stranger)).isFalse();
	}

	private Group defaultGroup() {
		Group g = new Group();
		g.setId("g1");
		g.setOwnerEmail(owner.email());
		g.getMembers().add(new GroupMember(admin.email(), GroupRole.ADMIN));
		g.getMembers().add(new GroupMember(member.email(), GroupRole.MEMBER));
		// defaults: libraryEditing=ADMINS, libraryReading=MEMBERS
		return g;
	}

	@Test
	void groupLibrary_defaultSettings_memberCanReadButNotWrite() {
		Group g = defaultGroup();
		Library lib = Library.forGroup("g1");
		lib.setId("lib1");
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));
		PermissionService s = service();

		assertThat(s.canAccess(lib, member)).isTrue();
		assertThat(s.canWrite(lib, member)).isFalse(); // libraryEditing=ADMINS by default
	}

	@Test
	void groupLibrary_defaultSettings_adminCanReadAndWrite() {
		Group g = defaultGroup();
		Library lib = Library.forGroup("g1");
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));
		PermissionService s = service();

		assertThat(s.canAccess(lib, admin)).isTrue();
		assertThat(s.canWrite(lib, admin)).isTrue();
	}

	@Test
	void groupLibrary_defaultSettings_strangerCannotReadOrWrite() {
		Group g = defaultGroup();
		Library lib = Library.forGroup("g1");
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));
		PermissionService s = service();

		assertThat(s.canAccess(lib, stranger)).isFalse();
		assertThat(s.canWrite(lib, stranger)).isFalse();
	}

	@Test
	void groupLibrary_libraryEditingMembers_memberCanWrite() {
		Group g = defaultGroup();
		g.setLibraryEditing(LibraryEditing.MEMBERS);
		Library lib = Library.forGroup("g1");
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));
		PermissionService s = service();

		assertThat(s.canWrite(lib, member)).isTrue();
	}

	@Test
	void groupLibrary_libraryReadingAll_strangerCanReadButNotWrite() {
		Group g = defaultGroup();
		g.setLibraryReading(LibraryReading.ALL);
		Library lib = Library.forGroup("g1");
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));
		PermissionService s = service();

		assertThat(s.canAccess(lib, stranger)).isTrue();
		assertThat(s.canWrite(lib, stranger)).isFalse();
	}

	@Test
	void requireAccess_throwsForbidden_whenDenied() {
		Group g = defaultGroup();
		Library lib = Library.forGroup("g1");
		when(groupRepository.findById("g1")).thenReturn(Optional.of(g));
		PermissionService s = service();

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> s.requireAccess(lib, stranger))
			.isInstanceOf(self.research.ontology.dataserver.exception.ForbiddenException.class);
	}
}