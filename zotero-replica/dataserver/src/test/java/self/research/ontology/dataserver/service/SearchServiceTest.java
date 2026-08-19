package self.research.ontology.dataserver.service;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import self.research.ontology.dataserver.dto.SearchRequest;
import self.research.ontology.dataserver.exception.BadRequestException;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.exception.PreconditionFailedException;
import self.research.ontology.dataserver.exception.PreconditionRequiredException;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.model.SavedSearch;
import self.research.ontology.dataserver.repository.SearchRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SearchServiceTest {

	@Mock
	private SearchRepository searchRepository;

	@Mock
	private LibraryService libraryService;

	@Mock
	private DeletedLogService deletedLogService;

	private SearchService searchService;
	private Library library;

	@BeforeEach
	void setUp() {
		searchService = new SearchService(searchRepository, libraryService, deletedLogService);
		library = Library.forUser("owner@example.com");
		library.setId("lib1");
	}

	private SearchRequest validRequest(String name) {
		return new SearchRequest(name, List.of(new SearchRequest.ConditionDto("title", "contains", "history")), null, null);
	}

	@Test
	void createAtKey_valid_savesWithConditions() {
		when(libraryService.bumpVersion(library)).thenReturn(1L);
		when(searchRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		SavedSearch created = searchService.createAtKey(library, "ABCD1234", validRequest("History"));

		assertThat(created.getKey()).isEqualTo("ABCD1234");
		assertThat(created.getName()).isEqualTo("History");
		assertThat(created.getConditions()).hasSize(1);
		assertThat(created.getVersion()).isEqualTo(1L);
	}

	@Test
	void createAtKey_noConditions_throwsBadRequest() {
		SearchRequest req = new SearchRequest("Empty", List.of(), null, null);
		assertThatThrownBy(() -> searchService.createAtKey(library, "ABCD1234", req)).isInstanceOf(BadRequestException.class);
	}

	@Test
	void createAtKey_conditionMissingOperator_throwsBadRequest() {
		SearchRequest req = new SearchRequest("Bad", List.of(new SearchRequest.ConditionDto("title", null, "x")), null, null);
		assertThatThrownBy(() -> searchService.createAtKey(library, "ABCD1234", req)).isInstanceOf(BadRequestException.class);
	}

	@Test
	void get_notFound_throws404() {
		when(searchRepository.findByLibraryIdAndKey("lib1", "MISSING")).thenReturn(Optional.empty());
		assertThatThrownBy(() -> searchService.get(library, "MISSING")).isInstanceOf(NotFoundException.class);
	}

	private SavedSearch existingSearch(String key, long version) {
		SavedSearch s = new SavedSearch();
		s.setKey(key);
		s.setLibraryId("lib1");
		s.setName("Old");
		s.setVersion(version);
		return s;
	}

	@Test
	void update_withoutVersion_throws428() {
		SavedSearch existing = existingSearch("ABCD1234", 3);
		when(searchRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		assertThatThrownBy(() -> searchService.update(library, "ABCD1234", validRequest("New"), null))
			.isInstanceOf(PreconditionRequiredException.class);
	}

	@Test
	void update_withStaleVersion_throws412() {
		SavedSearch existing = existingSearch("ABCD1234", 5);
		when(searchRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		assertThatThrownBy(() -> searchService.update(library, "ABCD1234", validRequest("New"), 3L))
			.isInstanceOf(PreconditionFailedException.class);
	}

	@Test
	void update_withCorrectVersion_updatesNameAndConditions() {
		SavedSearch existing = existingSearch("ABCD1234", 3);
		when(searchRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));
		when(libraryService.bumpVersion(library)).thenReturn(4L);
		when(searchRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		SavedSearch updated = searchService.update(library, "ABCD1234", validRequest("Renamed"), 3L);

		assertThat(updated.getName()).isEqualTo("Renamed");
		assertThat(updated.getVersion()).isEqualTo(4L);
	}

	@Test
	void delete_withCorrectVersion_removesAndBumpsLibrary() {
		SavedSearch existing = existingSearch("ABCD1234", 3);
		when(searchRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		searchService.delete(library, "ABCD1234", 3L);

		verify(searchRepository).delete(existing);
		verify(libraryService).bumpVersion(library);
	}

	@Test
	void deleteBatch_removesEachExisting_ignoresMissing() {
		SavedSearch existing = existingSearch("A", 1);
		when(searchRepository.findByLibraryIdAndKey("lib1", "A")).thenReturn(Optional.of(existing));
		when(searchRepository.findByLibraryIdAndKey("lib1", "MISSING")).thenReturn(Optional.empty());

		searchService.deleteBatch(library, List.of("A", "MISSING"), 0L);

		verify(searchRepository).delete(existing);
		verify(libraryService).bumpVersion(library);
	}

	@Test
	void createOrUpdateBatch_mixesCreateAndUpdate() {
		SavedSearch existing = existingSearch("EXIST001", 1);
		when(searchRepository.findByLibraryIdAndKey("lib1", "EXIST001")).thenReturn(Optional.of(existing));
		when(libraryService.bumpVersion(library)).thenReturn(2L, 3L);
		when(searchRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		List<SearchRequest> requests = List.of(
			new SearchRequest("New", List.of(new SearchRequest.ConditionDto("title", "contains", "x")), null, null),
			new SearchRequest("Updated", List.of(new SearchRequest.ConditionDto("title", "contains", "y")), 1L, "EXIST001")
		);

		var report = searchService.createOrUpdateBatch(library, requests);

		assertThat(report.getSuccessful()).hasSize(2);
		assertThat(report.getFailed()).isEmpty();
		assertThat(report.getSuccessful().get("0").getName()).isEqualTo("New");
		assertThat(report.getSuccessful().get("1").getName()).isEqualTo("Updated");
	}

	@Test
	void createOrUpdateBatch_invalidEntryDoesNotAbortOthers_reportsFailureForThatEntryOnly() {
		when(libraryService.bumpVersion(library)).thenReturn(2L);
		when(searchRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		List<SearchRequest> requests = List.of(
			new SearchRequest("Bad", List.of(), null, null),
			new SearchRequest("Good", List.of(new SearchRequest.ConditionDto("title", "contains", "x")), null, null)
		);

		var report = searchService.createOrUpdateBatch(library, requests);

		assertThat(report.getFailed().get("0").code()).isEqualTo(400);
		assertThat(report.getSuccessful().get("1").getName()).isEqualTo("Good");
	}

	@Test
	void deleteBatch_withoutVersion_succeeds_versionIsOptionalForBatchDelete() {
		SavedSearch existing = existingSearch("A", 1);
		when(searchRepository.findByLibraryIdAndKey("lib1", "A")).thenReturn(Optional.of(existing));

		searchService.deleteBatch(library, List.of("A"), null);

		verify(searchRepository).delete(existing);
	}

	@Test
	void deleteBatch_withStaleVersion_throws412_whenHeaderIsPresent() {
		library.setVersion(5);
		assertThatThrownBy(() -> searchService.deleteBatch(library, List.of("A"), 3L))
			.isInstanceOf(PreconditionFailedException.class);
	}

	@Test
	void delete_recordsDeletedLogTombstone() {
		SavedSearch existing = existingSearch("ABCD1234", 3);
		when(searchRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));
		when(libraryService.bumpVersion(library)).thenReturn(4L);

		searchService.delete(library, "ABCD1234", 3L);

		verify(deletedLogService).record("lib1", "search", "ABCD1234", 4L);
	}

	@Test
	void filterSince_nullSince_returnsUnfiltered() {
		List<SavedSearch> all = List.of(existingSearch("A", 1));
		assertThat(searchService.filterSince(all, null)).isEqualTo(all);
	}

	@Test
	void filterSince_filtersOutOlderVersions() {
		SavedSearch old = existingSearch("A", 1);
		SavedSearch recent = existingSearch("B", 5);

		assertThat(searchService.filterSince(List.of(old, recent), 3L)).containsExactly(recent);
	}
}
