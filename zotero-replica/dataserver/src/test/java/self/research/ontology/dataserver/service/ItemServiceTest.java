package self.research.ontology.dataserver.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import self.research.ontology.dataserver.dto.ItemQueryParams;
import self.research.ontology.dataserver.exception.BadRequestException;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.exception.PreconditionFailedException;
import self.research.ontology.dataserver.exception.PreconditionRequiredException;
import self.research.ontology.dataserver.model.Item;
import self.research.ontology.dataserver.model.ItemTag;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.repository.ItemRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItemServiceTest {

	@Mock
	private ItemRepository itemRepository;

	@Mock
	private LibraryService libraryService;

	@Mock
	private AttachmentService attachmentService;

	@Mock
	private DeletedLogService deletedLogService;

	private ItemService itemService;
	private Library library;

	@BeforeEach
	void setUp() {
		itemService = new ItemService(itemRepository, libraryService, new SchemaService(), attachmentService, deletedLogService);
		library = Library.forUser("owner@example.com");
		library.setId("lib1");
	}

	private Item existingItem(String key, long version) {
		Item i = new Item();
		i.setKey(key);
		i.setLibraryId("lib1");
		i.setItemType("book");
		i.setVersion(version);
		return i;
	}

	@Test
	void createAtKey_validBook_savesWithDataFieldsAndCreators() {
		when(libraryService.bumpVersion(library)).thenReturn(1L);
		when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		Map<String, Object> body = Map.of(
			"itemType", "book",
			"title", "My Book",
			"creators", List.of(Map.of("creatorType", "author", "firstName", "Jane", "lastName", "Doe")),
			"tags", List.of("history"),
			"collections", List.of()
		);

		Item created = itemService.createAtKey(library, "ABCD1234", body);

		assertThat(created.getKey()).isEqualTo("ABCD1234");
		assertThat(created.getItemType()).isEqualTo("book");
		assertThat(created.getData()).containsEntry("title", "My Book");
		assertThat(created.getCreators()).hasSize(1);
		assertThat(created.getCreators().get(0).getFirstName()).isEqualTo("Jane");
		assertThat(created.getTags()).extracting(ItemTag::getTag).containsExactly("history");
		assertThat(created.getTags().get(0).getType()).isZero();
		assertThat(created.getVersion()).isEqualTo(1L);
	}

	@Test
	void createAtKey_missingItemType_throwsBadRequest() {
		assertThatThrownBy(() -> itemService.createAtKey(library, "ABCD1234", Map.of("title", "x")))
			.isInstanceOf(BadRequestException.class);
	}

	@Test
	void createAtKey_invalidItemType_throwsBadRequest() {
		assertThatThrownBy(() -> itemService.createAtKey(library, "ABCD1234", Map.of("itemType", "notAType")))
			.isInstanceOf(BadRequestException.class);
	}

	@Test
	void createAtKey_invalidFieldForType_throwsBadRequest() {
		assertThatThrownBy(() -> itemService.createAtKey(library, "ABCD1234",
				Map.of("itemType", "book", "notAField", "x")))
			.isInstanceOf(BadRequestException.class);
	}

	@Test
	void createAtKey_withNonExistentParent_throws404() {
		when(itemRepository.findByLibraryIdAndKey("lib1", "GHOST0001")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> itemService.createAtKey(library, "CHILD0001",
				Map.of("itemType", "note", "parentItem", "GHOST0001")))
			.isInstanceOf(NotFoundException.class);
	}

	@Test
	void get_notFound_throws404() {
		when(itemRepository.findByLibraryIdAndKey("lib1", "MISSING1")).thenReturn(Optional.empty());
		assertThatThrownBy(() -> itemService.get(library, "MISSING1")).isInstanceOf(NotFoundException.class);
	}

	@Test
	void update_withoutVersion_throws428() {
		Item existing = existingItem("ABCD1234", 3);
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		assertThatThrownBy(() -> itemService.update(library, "ABCD1234", Map.of("title", "New"), null))
			.isInstanceOf(PreconditionRequiredException.class);
	}

	@Test
	void update_withStaleVersion_throws412() {
		Item existing = existingItem("ABCD1234", 5);
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		assertThatThrownBy(() -> itemService.update(library, "ABCD1234", Map.of("title", "New"), 3L))
			.isInstanceOf(PreconditionFailedException.class);
	}

	@Test
	void update_withCorrectVersion_updatesDataFields() {
		Item existing = existingItem("ABCD1234", 3);
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));
		when(libraryService.bumpVersion(library)).thenReturn(4L);
		when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		Item updated = itemService.update(library, "ABCD1234", Map.of("title", "Updated Title"), 3L);

		assertThat(updated.getData()).containsEntry("title", "Updated Title");
		assertThat(updated.getVersion()).isEqualTo(4L);
	}

	@Test
	void update_settingDeletedTrue_marksTrash() {
		Item existing = existingItem("ABCD1234", 3);
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));
		when(libraryService.bumpVersion(library)).thenReturn(4L);
		when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		Item updated = itemService.update(library, "ABCD1234", Map.of("deleted", true), 3L);

		assertThat(updated.isDeleted()).isTrue();
	}

	@Test
	void delete_withCorrectVersion_removesAndBumpsLibrary() {
		Item existing = existingItem("ABCD1234", 3);
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		itemService.delete(library, "ABCD1234", 3L);

		verify(itemRepository).delete(existing);
		verify(libraryService).bumpVersion(library);
	}

	@Test
	void delete_alsoCascadesToAnyGridFsFileOwnedByTheItem() {
		Item existing = existingItem("ABCD1234", 3);
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		itemService.delete(library, "ABCD1234", 3L);

		verify(attachmentService).deleteFileIfPresent("lib1", "ABCD1234");
	}

	@Test
	void deleteBatch_alsoCascadesToGridFsFilesOfEachDeletedItem() {
		Item existing = existingItem("A", 1);
		when(itemRepository.findByLibraryIdAndKey("lib1", "A")).thenReturn(Optional.of(existing));
		when(itemRepository.findByLibraryIdAndKey("lib1", "MISSING")).thenReturn(Optional.empty());

		itemService.deleteBatch(library, List.of("A", "MISSING"), 0L);

		verify(attachmentService).deleteFileIfPresent("lib1", "A");
		verify(attachmentService, org.mockito.Mockito.never()).deleteFileIfPresent("lib1", "MISSING");
	}

	@Test
	void deleteBatch_withoutVersion_succeeds_versionIsOptionalForBatchDelete() {
		Item existing = existingItem("A", 1);
		when(itemRepository.findByLibraryIdAndKey("lib1", "A")).thenReturn(Optional.of(existing));

		itemService.deleteBatch(library, List.of("A"), null);

		verify(itemRepository).delete(existing);
	}

	@Test
	void deleteBatch_withStaleVersion_throws412_whenHeaderIsPresent() {
		library.setVersion(5);
		assertThatThrownBy(() -> itemService.deleteBatch(library, List.of("A"), 3L))
			.isInstanceOf(PreconditionFailedException.class);
	}

	@Test
	void delete_cascadesToChildren() {
		Item parent = existingItem("PARENT01", 3);
		Item child1 = existingItem("CHILD001", 1);
		child1.setParentItemKey("PARENT01");
		Item grandchild = existingItem("GRAND001", 1);
		grandchild.setParentItemKey("CHILD001");
		when(itemRepository.findByLibraryIdAndKey("lib1", "PARENT01")).thenReturn(Optional.of(parent));
		when(itemRepository.findByLibraryIdAndParentItemKey("lib1", "PARENT01")).thenReturn(List.of(child1));
		when(itemRepository.findByLibraryIdAndParentItemKey("lib1", "CHILD001")).thenReturn(List.of(grandchild));
		when(itemRepository.findByLibraryIdAndParentItemKey("lib1", "GRAND001")).thenReturn(List.of());
		when(libraryService.bumpVersion(library)).thenReturn(4L);

		itemService.delete(library, "PARENT01", 3L);

		verify(itemRepository).delete(parent);
		verify(itemRepository).delete(child1);
		verify(itemRepository).delete(grandchild);
		verify(attachmentService).deleteFileIfPresent("lib1", "PARENT01");
		verify(attachmentService).deleteFileIfPresent("lib1", "CHILD001");
		verify(attachmentService).deleteFileIfPresent("lib1", "GRAND001");
		verify(deletedLogService).record("lib1", "item", "PARENT01", 4L);
		verify(deletedLogService).record("lib1", "item", "CHILD001", 4L);
		verify(deletedLogService).record("lib1", "item", "GRAND001", 4L);
	}

	@Test
	void deleteBatch_cascadesToChildrenOfEachDeletedItem() {
		Item parent = existingItem("PARENT01", 1);
		Item child = existingItem("CHILD001", 1);
		child.setParentItemKey("PARENT01");
		when(itemRepository.findByLibraryIdAndKey("lib1", "PARENT01")).thenReturn(Optional.of(parent));
		when(itemRepository.findByLibraryIdAndParentItemKey("lib1", "PARENT01")).thenReturn(List.of(child));
		when(itemRepository.findByLibraryIdAndParentItemKey("lib1", "CHILD001")).thenReturn(List.of());
		when(libraryService.bumpVersion(library)).thenReturn(2L);

		itemService.deleteBatch(library, List.of("PARENT01"), null);

		verify(itemRepository).delete(parent);
		verify(itemRepository).delete(child);
	}

	@Test
	void deleteBatch_recordsDeletedLogTombstoneForEachDeletedItem() {
		Item existing = existingItem("A", 1);
		when(itemRepository.findByLibraryIdAndKey("lib1", "A")).thenReturn(Optional.of(existing));
		when(libraryService.bumpVersion(library)).thenReturn(2L);

		itemService.deleteBatch(library, List.of("A"), 0L);

		verify(deletedLogService).record("lib1", "item", "A", 2L);
	}

	@Test
	void removeFromCollection_notInCollection_throws404() {
		Item existing = existingItem("ABCD1234", 1);
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));

		assertThatThrownBy(() -> itemService.removeFromCollection(library, "COLL0001", "ABCD1234"))
			.isInstanceOf(NotFoundException.class);
	}

	@Test
	void removeFromCollection_success() {
		Item existing = existingItem("ABCD1234", 1);
		existing.getCollections().add("COLL0001");
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(existing));
		when(libraryService.bumpVersion(library)).thenReturn(2L);
		when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		itemService.removeFromCollection(library, "COLL0001", "ABCD1234");

		assertThat(existing.getCollections()).doesNotContain("COLL0001");
	}

	@Test
	void addToCollection_childItem_rejected() {
		Item child = existingItem("CHILD0001", 1);
		child.setParentItemKey("PARENT01");
		when(itemRepository.findByLibraryIdAndKey("lib1", "CHILD0001")).thenReturn(Optional.of(child));

		assertThatThrownBy(() -> itemService.addToCollection(library, "COLL0001", List.of("CHILD0001")))
			.isInstanceOf(BadRequestException.class)
			.hasMessageContaining("Child items cannot be added");
	}

	@Test
	void addToCollection_nonExistentItem_rejected() {
		when(itemRepository.findByLibraryIdAndKey("lib1", "GHOST0001")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> itemService.addToCollection(library, "COLL0001", List.of("GHOST0001")))
			.isInstanceOf(BadRequestException.class);
	}

	@Test
	void addToCollection_topLevelItem_succeeds() {
		Item item = existingItem("ABCD1234", 1);
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(item));
		when(libraryService.bumpVersion(library)).thenReturn(2L);
		when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		itemService.addToCollection(library, "COLL0001", List.of("ABCD1234"));

		assertThat(item.getCollections()).contains("COLL0001");
	}

	@Test
	void createBatch_createsEachItem_asWriteReportSuccessEntries() {
		when(libraryService.bumpVersion(library)).thenReturn(1L, 2L);
		when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var report = itemService.createBatch(library, List.of(
			Map.of("itemType", "book", "title", "Book One"),
			Map.of("itemType", "webpage", "title", "Page One")
		));

		assertThat(report.getSuccessful()).hasSize(2);
		assertThat(report.getFailed()).isEmpty();
		assertThat(report.getSuccessful().get("0").getData()).containsEntry("title", "Book One");
		assertThat(report.getSuccessful().get("1").getItemType()).isEqualTo("webpage");
	}

	@Test
	void createBatch_invalidItemDoesNotAbortOtherItems_reportsFailureForThatEntryOnly() {
		when(libraryService.bumpVersion(library)).thenReturn(1L);
		when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		var report = itemService.createBatch(library, List.of(
			Map.of("itemType", "notAType", "title", "Bad One"),
			Map.of("itemType", "book", "title", "Good One")
		));

		assertThat(report.getFailed()).containsKey("0");
		assertThat(report.getFailed().get("0").code()).isEqualTo(400);
		assertThat(report.getSuccessful()).containsKey("1");
		assertThat(report.getSuccessful().get("1").getData()).containsEntry("title", "Good One");
	}

	@Test
	void deleteBatch_removesEachExisting_ignoresMissing() {
		Item existing = existingItem("A", 1);
		when(itemRepository.findByLibraryIdAndKey("lib1", "A")).thenReturn(Optional.of(existing));
		when(itemRepository.findByLibraryIdAndKey("lib1", "MISSING")).thenReturn(Optional.empty());

		itemService.deleteBatch(library, List.of("A", "MISSING"), 0L);

		verify(itemRepository).delete(existing);
		verify(libraryService).bumpVersion(library);
	}

	@Test
	void listChildren_ofNonExistentParent_throws404() {
		when(itemRepository.findByLibraryIdAndKey("lib1", "GHOST0001")).thenReturn(Optional.empty());
		assertThatThrownBy(() -> itemService.listChildren(library, "GHOST0001")).isInstanceOf(NotFoundException.class);
	}

	private Item itemWithTitleAndType(String key, String title, String itemType) {
		Item i = existingItem(key, 1);
		i.setItemType(itemType);
		i.getData().put("title", title);
		return i;
	}

	@Test
	void applyQuery_nullParams_returnsUnfiltered() {
		List<Item> items = List.of(itemWithTitleAndType("A", "Physics", "book"));
		assertThat(itemService.applyQuery(items, null)).isEqualTo(items);
	}

	@Test
	void applyQuery_filtersByItemType() {
		List<Item> items = List.of(
			itemWithTitleAndType("A", "Physics", "book"),
			itemWithTitleAndType("B", "Web Page", "webpage"));

		var result = itemService.applyQuery(items, new ItemQueryParams(
			null, null, "webpage", null, null, null, null));

		assertThat(result).extracting(Item::getKey).containsExactly("B");
	}

	@Test
	void applyQuery_itemTypeNegation_excludesMatchingType() {
		List<Item> items = List.of(
			itemWithTitleAndType("A", "Physics", "book"),
			itemWithTitleAndType("B", "Web Page", "webpage"));

		var result = itemService.applyQuery(items, new ItemQueryParams(
			null, null, "-webpage", null, null, null, null));

		assertThat(result).extracting(Item::getKey).containsExactly("A");
	}

	@Test
	void applyQuery_filtersByTag() {
		Item a = itemWithTitleAndType("A", "Physics", "book");
		a.getTags().add(new ItemTag("science", 0));
		Item b = itemWithTitleAndType("B", "Web Page", "webpage");
		b.getTags().add(new ItemTag("internet", 0));

		var result = itemService.applyQuery(List.of(a, b), new ItemQueryParams(
			null, null, null, "science", null, null, null));

		assertThat(result).extracting(Item::getKey).containsExactly("A");
	}

	@Test
	void applyQuery_filtersByQTitleSubstring() {
		List<Item> items = List.of(
			itemWithTitleAndType("A", "Physics Today", "book"),
			itemWithTitleAndType("B", "Web Page", "webpage"));

		var result = itemService.applyQuery(items, new ItemQueryParams(
			"physics", null, null, null, null, null, null));

		assertThat(result).extracting(Item::getKey).containsExactly("A");
	}

	@Test
	void applyQuery_filtersBySinceVersion() {
		Item a = itemWithTitleAndType("A", "Old", "book");
		a.setVersion(1);
		Item b = itemWithTitleAndType("B", "New", "book");
		b.setVersion(5);

		var result = itemService.applyQuery(List.of(a, b), new ItemQueryParams(
			null, null, null, null, 3L, null, null));

		assertThat(result).extracting(Item::getKey).containsExactly("B");
	}

	@Test
	void applyQuery_sortsByTitleDescending() {
		List<Item> items = List.of(
			itemWithTitleAndType("A", "Alpha", "book"),
			itemWithTitleAndType("B", "Beta", "book"));

		var result = itemService.applyQuery(items, new ItemQueryParams(
			null, null, null, null, null, "title", "desc"));

		assertThat(result).extracting(Item::getKey).containsExactly("B", "A");
	}
}