package self.research.ontology.dataserver.service;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import self.research.ontology.dataserver.dto.CollectionRequest;
import self.research.ontology.dataserver.exception.BadRequestException;
import self.research.ontology.dataserver.exception.ConflictException;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.exception.PreconditionFailedException;
import self.research.ontology.dataserver.exception.PreconditionRequiredException;
import self.research.ontology.dataserver.model.Item;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.model.LibraryCollection;
import self.research.ontology.dataserver.repository.CollectionRepository;
import self.research.ontology.dataserver.repository.ItemRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CollectionServiceTest {

	@Mock
	private CollectionRepository collectionRepository;

	@Mock
	private ItemRepository itemRepository;

	@Mock
	private LibraryService libraryService;

	@Mock
	private DeletedLogService deletedLogService;

	private CollectionService collectionService;
	private Library library;

	@BeforeEach
	void setUp() {
		collectionService = new CollectionService(collectionRepository, itemRepository, libraryService, deletedLogService);
		library = Library.forUser("owner@example.com");
		library.setId("lib1");
	}

	private LibraryCollection existingCollection(String key, long version, String parentKey) {
		LibraryCollection c = new LibraryCollection();
		c.setKey(key);
		c.setLibraryId("lib1");
		c.setName("Existing");
		c.setParentKey(parentKey);
		c.setVersion(version);
		return c;
	}

	@Test
	void createAtKey_generatesNoVersionRequirement_andBumpsLibraryVersion() {
		when(libraryService.bumpVersion(library)).thenReturn(1L);
		when(collectionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		LibraryCollection created = collectionService.createAtKey(library, "ABCD1234", new CollectionRequest("My Collection", null, null, null));

		assertThat(created.getKey()).isEqualTo("ABCD1234");
		assertThat(created.getVersion()).isEqualTo(1L);
		assertThat(created.getParentKey()).isNull();
	}

	@Test
	void createAtKey_withInvalidParent_throws409Conflict() {
		when(collectionRepository.findByLibraryIdAndKey("lib1", "NOPARENT")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> collectionService.createAtKey(library, "ABCD1234",
				new CollectionRequest("x", "NOPARENT", null, null)))
			.isInstanceOf(ConflictException.class);
	}

	@Test
	void get_notFound_throws404() {
		when(collectionRepository.findByLibraryIdAndKey("lib1", "MISSING")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> collectionService.get(library, "MISSING")).isInstanceOf(NotFoundException.class);
	}

	@Test
	void update_withoutVersion_throws428PreconditionRequired() {
		LibraryCollection existing = existingCollection("ABCD1234", 3, null);
		when(collectionRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		assertThatThrownBy(() -> collectionService.update(library, "ABCD1234",
				new CollectionRequest("Renamed", null, null, null), null))
			.isInstanceOf(PreconditionRequiredException.class);
	}

	@Test
	void update_withStaleVersion_throws412PreconditionFailed() {
		LibraryCollection existing = existingCollection("ABCD1234", 5, null);
		when(collectionRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		assertThatThrownBy(() -> collectionService.update(library, "ABCD1234",
				new CollectionRequest("Renamed", null, null, null), 3L))
			.isInstanceOf(PreconditionFailedException.class);
	}

	@Test
	void update_withCurrentVersion_succeeds() {
		LibraryCollection existing = existingCollection("ABCD1234", 3, null);
		when(collectionRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));
		when(libraryService.bumpVersion(library)).thenReturn(4L);
		when(collectionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		LibraryCollection updated = collectionService.update(library, "ABCD1234",
			new CollectionRequest("Renamed", null, null, null), 3L);

		assertThat(updated.getName()).isEqualTo("Renamed");
		assertThat(updated.getVersion()).isEqualTo(4L);
	}

	@Test
	void update_versionViaJsonProperty_insteadOfHeader_alsoWorks() {
		LibraryCollection existing = existingCollection("ABCD1234", 3, null);
		when(collectionRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));
		when(libraryService.bumpVersion(library)).thenReturn(4L);
		when(collectionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		// No header (null), but JSON body carries version=3.
		collectionService.update(library, "ABCD1234", new CollectionRequest("Renamed", null, 3L, null), null);
		// no exception = success
	}

	@Test
	void update_settingSelfAsParent_throwsBadRequest() {
		LibraryCollection existing = existingCollection("ABCD1234", 3, null);
		when(collectionRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		assertThatThrownBy(() -> collectionService.update(library, "ABCD1234",
				new CollectionRequest("x", "ABCD1234", null, null), 3L))
			.isInstanceOf(BadRequestException.class);
	}

	@Test
	void delete_withoutVersion_throws428() {
		LibraryCollection existing = existingCollection("ABCD1234", 3, null);
		when(collectionRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		assertThatThrownBy(() -> collectionService.delete(library, "ABCD1234", null))
			.isInstanceOf(PreconditionRequiredException.class);
	}

	@Test
	void delete_withCorrectVersion_succeeds_andBumpsLibrary() {
		LibraryCollection existing = existingCollection("ABCD1234", 3, null);
		when(collectionRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		collectionService.delete(library, "ABCD1234", 3L);

		org.mockito.Mockito.verify(collectionRepository).delete(existing);
		org.mockito.Mockito.verify(libraryService).bumpVersion(library);
	}

	@Test
	void listChildren_ofNonExistentParent_throws404() {
		when(collectionRepository.findByLibraryIdAndKey("lib1", "GHOST")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> collectionService.listChildren(library, "GHOST")).isInstanceOf(NotFoundException.class);
	}

	@Test
	void listChildren_returnsOnlyDirectChildren() {
		LibraryCollection parent = existingCollection("PARENT01", 1, null);
		when(collectionRepository.findByLibraryIdAndKey("lib1", "PARENT01")).thenReturn(Optional.of(parent));
		LibraryCollection child = existingCollection("CHILD001", 1, "PARENT01");
		when(collectionRepository.findByLibraryIdAndParentKey("lib1", "PARENT01")).thenReturn(List.of(child));

		List<LibraryCollection> children = collectionService.listChildren(library, "PARENT01");

		assertThat(children).hasSize(1);
		assertThat(children.get(0).getKey()).isEqualTo("CHILD001");
	}

	@Test
	void listTop_delegatesToParentKeyIsNullQuery() {
		when(collectionRepository.findByLibraryIdAndParentKeyIsNull("lib1")).thenReturn(List.of(existingCollection("TOP00001", 1, null)));

		List<LibraryCollection> top = collectionService.listTop(library);

		assertThat(top).hasSize(1);
	}

	@Test
	void createOrUpdateBatch_mixesCreateAndUpdate() {
		// req1 has no key -> create; req2 has a key that exists -> update
		when(collectionRepository.findByLibraryIdAndKey("lib1", "EXIST001")).thenReturn(Optional.of(existingCollection("EXIST001", 1, null)));
		when(libraryService.bumpVersion(library)).thenReturn(2L, 3L);
		when(collectionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		List<CollectionRequest> requests = List.of(
			new CollectionRequest("New One", null, null, null),
			new CollectionRequest("Updated One", null, 1L, "EXIST001")
		);

		var report = collectionService.createOrUpdateBatch(library, requests);

		assertThat(report.getSuccessful()).hasSize(2);
		assertThat(report.getFailed()).isEmpty();
		assertThat(report.getSuccessful().get("1").getName()).isEqualTo("Updated One");
	}

	@Test
	void createOrUpdateBatch_invalidEntryDoesNotAbortOthers_reportsFailureForThatEntryOnly() {
		when(collectionRepository.findByLibraryIdAndKey("lib1", "NOPARENT")).thenReturn(Optional.empty());
		when(libraryService.bumpVersion(library)).thenReturn(2L);
		when(collectionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		List<CollectionRequest> requests = List.of(
			new CollectionRequest("Bad One", "NOPARENT", null, null),
			new CollectionRequest("Good One", null, null, null)
		);

		var report = collectionService.createOrUpdateBatch(library, requests);

		assertThat(report.getFailed().get("0").code()).isEqualTo(409);
		assertThat(report.getSuccessful().get("1").getName()).isEqualTo("Good One");
	}

	@Test
	void deleteBatch_removesEachExistingKey_ignoresMissing() {
		when(collectionRepository.findByLibraryIdAndKey("lib1", "A")).thenReturn(Optional.of(existingCollection("A", 1, null)));
		when(collectionRepository.findByLibraryIdAndKey("lib1", "MISSING")).thenReturn(Optional.empty());

		collectionService.deleteBatch(library, List.of("A", "MISSING"), 0L);

		org.mockito.Mockito.verify(libraryService).bumpVersion(library);
	}

	@Test
	void deleteBatch_withoutVersion_succeeds_versionIsOptionalForBatchDelete() {
		LibraryCollection existing = existingCollection("A", 1, null);
		when(collectionRepository.findByLibraryIdAndKey("lib1", "A")).thenReturn(Optional.of(existing));

		collectionService.deleteBatch(library, List.of("A"), null);

		org.mockito.Mockito.verify(collectionRepository).delete(existing);
	}

	@Test
	void delete_cascadesToSubcollections_andPrunesItemsReferencingIt() {
		LibraryCollection parent = existingCollection("PARENT01", 3, null);
		LibraryCollection child = existingCollection("CHILD001", 1, "PARENT01");
		when(collectionRepository.findByLibraryIdAndKey("lib1", "PARENT01")).thenReturn(Optional.of(parent));
		when(collectionRepository.findByLibraryIdAndParentKey("lib1", "PARENT01")).thenReturn(List.of(child));
		when(collectionRepository.findByLibraryIdAndParentKey("lib1", "CHILD001")).thenReturn(List.of());
		when(libraryService.bumpVersion(library)).thenReturn(4L);

		Item item = new Item();
		item.setKey("ITEM0001");
		item.getCollections().add("PARENT01");
		when(itemRepository.findByLibraryIdAndCollectionsContaining("lib1", "PARENT01")).thenReturn(List.of(item));
		when(itemRepository.findByLibraryIdAndCollectionsContaining("lib1", "CHILD001")).thenReturn(List.of());

		collectionService.delete(library, "PARENT01", 3L);

		org.mockito.Mockito.verify(collectionRepository).delete(parent);
		org.mockito.Mockito.verify(collectionRepository).delete(child);
		assertThat(item.getCollections()).doesNotContain("PARENT01");
		org.mockito.Mockito.verify(itemRepository).save(item);
	}

	@Test
	void deleteBatch_withStaleVersion_throws412() {
		library.setVersion(5);
		assertThatThrownBy(() -> collectionService.deleteBatch(library, List.of("A"), 3L))
			.isInstanceOf(PreconditionFailedException.class);
	}

	@Test
	void deleteBatch_recordsDeletedLogTombstone() {
		when(collectionRepository.findByLibraryIdAndKey("lib1", "A")).thenReturn(Optional.of(existingCollection("A", 1, null)));
		when(libraryService.bumpVersion(library)).thenReturn(2L);

		collectionService.deleteBatch(library, List.of("A"), 0L);

		org.mockito.Mockito.verify(deletedLogService).record("lib1", "collection", "A", 2L);
	}

	@Test
	void delete_recordsDeletedLogTombstone() {
		LibraryCollection existing = existingCollection("ABCD1234", 3, null);
		when(collectionRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));
		when(libraryService.bumpVersion(library)).thenReturn(4L);

		collectionService.delete(library, "ABCD1234", 3L);

		org.mockito.Mockito.verify(deletedLogService).record("lib1", "collection", "ABCD1234", 4L);
	}

	@Test
	void filterSince_nullSince_returnsUnfiltered() {
		List<LibraryCollection> all = List.of(existingCollection("A", 1, null));
		assertThat(collectionService.filterSince(all, null)).isEqualTo(all);
	}

	@Test
	void filterSince_filtersOutOlderVersions() {
		LibraryCollection old = existingCollection("A", 1, null);
		LibraryCollection recent = existingCollection("B", 5, null);

		List<LibraryCollection> result = collectionService.filterSince(List.of(old, recent), 3L);

		assertThat(result).containsExactly(recent);
	}
}