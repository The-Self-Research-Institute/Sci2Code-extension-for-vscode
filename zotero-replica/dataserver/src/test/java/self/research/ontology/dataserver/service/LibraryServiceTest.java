package self.research.ontology.dataserver.service;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.repository.LibraryRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LibraryServiceTest {

	@Mock
	private LibraryRepository libraryRepository;

	private LibraryService libraryService;

	@BeforeEach
	void setUp() {
		libraryService = new LibraryService(libraryRepository);
	}

	@Test
	void resolvePersonalLibrary_alreadyExists_returnsItWithoutSaving() {
		Library existing = Library.forUser("owner@example.com");
		when(libraryRepository.findByOwnerEmail("owner@example.com")).thenReturn(Optional.of(existing));

		Library result = libraryService.resolvePersonalLibrary("owner@example.com");

		assertThat(result).isSameAs(existing);
		verify(libraryRepository, org.mockito.Mockito.never()).save(any());
	}

	@Test
	void resolvePersonalLibrary_doesNotExist_createsIt() {
		when(libraryRepository.findByOwnerEmail("new@example.com")).thenReturn(Optional.empty());
		Library created = Library.forUser("new@example.com");
		when(libraryRepository.save(any(Library.class))).thenReturn(created);

		Library result = libraryService.resolvePersonalLibrary("new@example.com");

		assertThat(result).isSameAs(created);
	}

	/**
	 * Reproduces the confirmed registration race (live-verified against the
	 * running dataserver: 22/30 concurrent-first-load attempts failed with a
	 * raw 500 before this fix): findByOwnerEmail() finds nothing, this
	 * request's own save() loses a concurrent race to another request for
	 * the same brand-new user and throws DuplicateKeyException (the unique
	 * index on Library.ownerEmail) - the fix re-reads the winner's document
	 * instead of letting the exception propagate as an unhandled 500.
	 */
	@Test
	void resolvePersonalLibrary_concurrentCreateRace_recoversByRereadingWinner() {
		Library winner = Library.forUser("racing@example.com");
		when(libraryRepository.findByOwnerEmail("racing@example.com"))
			.thenReturn(Optional.empty())
			.thenReturn(Optional.of(winner));
		when(libraryRepository.save(any(Library.class))).thenThrow(new DuplicateKeyException("E11000 duplicate key"));

		Library result = libraryService.resolvePersonalLibrary("racing@example.com");

		assertThat(result).isSameAs(winner);
	}

	@Test
	void resolvePersonalLibrary_concurrentCreateRace_reallyLosingBothWays_rethrowsOriginalException() {
		DuplicateKeyException original = new DuplicateKeyException("E11000 duplicate key");
		when(libraryRepository.findByOwnerEmail("gone@example.com")).thenReturn(Optional.empty());
		when(libraryRepository.save(any(Library.class))).thenThrow(original);

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> libraryService.resolvePersonalLibrary("gone@example.com"))
			.isSameAs(original);
	}
}
