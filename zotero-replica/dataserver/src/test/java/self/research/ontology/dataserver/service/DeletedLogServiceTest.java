package self.research.ontology.dataserver.service;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import self.research.ontology.dataserver.model.DeletedLogEntry;
import self.research.ontology.dataserver.repository.DeletedLogRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DeletedLogServiceTest {

	@Mock
	private DeletedLogRepository deletedLogRepository;

	private DeletedLogService deletedLogService;

	@BeforeEach
	void setUp() {
		deletedLogService = new DeletedLogService(deletedLogRepository);
	}

	@Test
	void record_savesEntryWithGivenFields() {
		deletedLogService.record("lib1", "item", "ABCD1234", 7L);

		ArgumentCaptor<DeletedLogEntry> captor = ArgumentCaptor.forClass(DeletedLogEntry.class);
		verify(deletedLogRepository).save(captor.capture());

		DeletedLogEntry saved = captor.getValue();
		assertThat(saved.getLibraryId()).isEqualTo("lib1");
		assertThat(saved.getObjectType()).isEqualTo("item");
		assertThat(saved.getIdentifier()).isEqualTo("ABCD1234");
		assertThat(saved.getVersion()).isEqualTo(7L);
	}

	@Test
	void findSince_returnsIdentifiersOnly() {
		DeletedLogEntry e1 = new DeletedLogEntry(null, "lib1", "item", "A", 5L, null);
		DeletedLogEntry e2 = new DeletedLogEntry(null, "lib1", "item", "B", 6L, null);
		when(deletedLogRepository.findByLibraryIdAndObjectTypeAndVersionGreaterThan("lib1", "item", 3L))
			.thenReturn(List.of(e1, e2));

		List<String> result = deletedLogService.findSince("lib1", "item", 3L);

		assertThat(result).containsExactly("A", "B");
	}

	@Test
	void findSince_noMatches_returnsEmpty() {
		when(deletedLogRepository.findByLibraryIdAndObjectTypeAndVersionGreaterThan(any(), any(), anyLong()))
			.thenReturn(List.of());

		assertThat(deletedLogService.findSince("lib1", "tag", 0L)).isEmpty();
	}
}