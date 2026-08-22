package self.research.ontology.dataserver.service;

import java.util.List;
import java.util.Map;

import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;

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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TagServiceTest {

	@Mock
	private ItemRepository itemRepository;

	@Mock
	private LibraryService libraryService;

	@Mock
	private MongoTemplate mongoTemplate;

	@Mock
	private DeletedLogService deletedLogService;

	private TagService tagService;
	private Library library;

	@BeforeEach
	void setUp() {
		tagService = new TagService(itemRepository, libraryService, mongoTemplate, deletedLogService);
		library = Library.forUser("owner@example.com");
		library.setId("lib1");
		library.setVersion(5);
	}

	@SuppressWarnings("unchecked")
	private void stubAggregation(Map<String, Object>... rows) {
		AggregationResults<Map> results = new AggregationResults<>(List.of(rows), new Document());
		when(mongoTemplate.aggregate(any(Aggregation.class), eq("ds_items"), eq(Map.class))).thenReturn(results);
	}

	@Test
	void listTags_returnsAllWhenNoFilters() {
		stubAggregation(Map.of("_id", "history", "numItems", 3), Map.of("_id", "physics", "numItems", 1));

		List<?> result = tagService.listTags(library, null, null, null, "title", "asc", null, null);

		assertThat(result).hasSize(2);
	}

	@Test
	void listTags_filtersByTagOrList() {
		stubAggregation(Map.of("_id", "history", "numItems", 3), Map.of("_id", "physics", "numItems", 1));

		var result = tagService.listTags(library, "physics", null, null, "title", "asc", null, null);

		assertThat(result).extracting(r -> r.tag()).containsExactly("physics");
	}

	@Test
	void listTags_filtersByQSubstring() {
		stubAggregation(Map.of("_id", "history", "numItems", 3), Map.of("_id", "physics", "numItems", 1));

		var result = tagService.listTags(library, null, "hist", null, "title", "asc", null, null);

		assertThat(result).extracting(r -> r.tag()).containsExactly("history");
	}

	@Test
	void listTags_sortsByNumItemsDescending() {
		stubAggregation(Map.of("_id", "history", "numItems", 1), Map.of("_id", "physics", "numItems", 3));

		var result = tagService.listTags(library, null, null, null, "numItems", "desc", null, null);

		assertThat(result).extracting(r -> r.tag()).containsExactly("physics", "history");
	}

	@Test
	void listTags_appliesStartAndLimit() {
		stubAggregation(Map.of("_id", "a", "numItems", 1), Map.of("_id", "b", "numItems", 1), Map.of("_id", "c", "numItems", 1));

		var result = tagService.listTags(library, null, null, null, "title", "asc", 1, 1);

		assertThat(result).extracting(r -> r.tag()).containsExactly("b");
	}

	@Test
	void getTag_found_returnsIt() {
		stubAggregation(Map.of("_id", "history", "numItems", 3));

		var result = tagService.getTag(library, "history");

		assertThat(result.tag()).isEqualTo("history");
		assertThat(result.meta().numItems()).isEqualTo(3);
	}

	@Test
	void getTag_notFound_throws404() {
		stubAggregation();

		assertThatThrownBy(() -> tagService.getTag(library, "missing")).isInstanceOf(NotFoundException.class);
	}

	@Test
	void deleteTags_withoutVersion_throws428() {
		assertThatThrownBy(() -> tagService.deleteTags(library, List.of("history"), null))
			.isInstanceOf(PreconditionRequiredException.class);
	}

	@Test
	void deleteTags_withStaleVersion_throws412() {
		assertThatThrownBy(() -> tagService.deleteTags(library, List.of("history"), 3L))
			.isInstanceOf(PreconditionFailedException.class);
	}

	@Test
	void deleteTags_removesTagFromMatchingItems_andBumpsTheirVersion() {
		Item item = new Item();
		item.setKey("ABCD1234");
		item.setLibraryId("lib1");
		item.getTags().add(new ItemTag("history", 0));
		item.getTags().add(new ItemTag("keep-me", 0));

		when(itemRepository.findByLibraryIdAndTagName("lib1", "history")).thenReturn(List.of(item));
		when(libraryService.bumpVersion(library)).thenReturn(6L);

		tagService.deleteTags(library, List.of("history"), 5L);

		assertThat(item.getTags()).extracting(ItemTag::getTag).containsExactly("keep-me");
		assertThat(item.getVersion()).isEqualTo(6L);
		verify(itemRepository).save(item);
		verify(deletedLogService).record("lib1", "tag", "history", 6L);
	}

	@Test
	void deleteTags_itemWithoutTheTag_isNotSaved_noTombstoneRecorded() {
		when(itemRepository.findByLibraryIdAndTagName("lib1", "ghost")).thenReturn(List.of());
		when(libraryService.bumpVersion(library)).thenReturn(6L);

		tagService.deleteTags(library, List.of("ghost"), 5L);

		verify(itemRepository, org.mockito.Mockito.never()).save(any());
		verify(deletedLogService, org.mockito.Mockito.never())
			.record(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyLong());
	}

	@Test
	void tagsFromItems_countsAcrossItems() {
		Item a = new Item();
		a.getTags().add(new ItemTag("history", 0));
		a.getTags().add(new ItemTag("shared", 0));
		Item b = new Item();
		b.getTags().add(new ItemTag("shared", 1));

		var result = tagService.tagsFromItems(List.of(a, b));

		assertThat(result).extracting(r -> r.tag()).containsExactly("history", "shared");
		assertThat(result.stream().filter(r -> r.tag().equals("shared")).findFirst().get().meta().numItems()).isEqualTo(2);
	}

	@Test
	void tagsFromItems_emptyList_returnsEmpty() {
		assertThat(tagService.tagsFromItems(List.of())).isEmpty();
	}

	@Test
	void renameTagAcrossLibrary_withoutVersion_throws428() {
		assertThatThrownBy(() -> tagService.renameTagAcrossLibrary(library, "old", "new", null))
			.isInstanceOf(PreconditionRequiredException.class);
	}

	@Test
	void renameTagAcrossLibrary_withStaleVersion_throws412() {
		assertThatThrownBy(() -> tagService.renameTagAcrossLibrary(library, "old", "new", 3L))
			.isInstanceOf(PreconditionFailedException.class);
	}

	@Test
	void renameTagAcrossLibrary_renamesOnEveryMatchingItem_leavesOtherTagsAlone() {
		Item a = new Item();
		a.setKey("A");
		a.getTags().add(new ItemTag("old", 1));
		a.getTags().add(new ItemTag("unrelated", 0));
		Item b = new Item();
		b.setKey("B");
		b.getTags().add(new ItemTag("old", 0));

		when(itemRepository.findByLibraryIdAndTagName("lib1", "old")).thenReturn(List.of(a, b));
		when(libraryService.bumpVersion(library)).thenReturn(6L);

		int renamed = tagService.renameTagAcrossLibrary(library, "old", "new", 5L);

		assertThat(renamed).isEqualTo(2);
		assertThat(a.getTags()).extracting(ItemTag::getTag).containsExactlyInAnyOrder("new", "unrelated");
		assertThat(a.getTags().stream().filter(t -> t.getTag().equals("new")).findFirst().get().getType()).isEqualTo(1);
		assertThat(b.getTags()).extracting(ItemTag::getTag).containsExactly("new");
		assertThat(a.getVersion()).isEqualTo(6L);
		assertThat(b.getVersion()).isEqualTo(6L);
		verify(itemRepository).save(a);
		verify(itemRepository).save(b);
	}

	@Test
	void renameTagAcrossLibrary_noMatchingItems_returnsZero_savesNothing() {
		when(itemRepository.findByLibraryIdAndTagName("lib1", "ghost")).thenReturn(List.of());
		when(libraryService.bumpVersion(library)).thenReturn(6L);

		int renamed = tagService.renameTagAcrossLibrary(library, "ghost", "new", 5L);

		assertThat(renamed).isZero();
		verify(itemRepository, org.mockito.Mockito.never()).save(any());
	}

	@Test
	void splitOrList_splitsOnDoublePipe_trimsWhitespace() {
		assertThat(TagService.splitOrList("a || b ||c")).containsExactly("a", "b", "c");
	}

	@Test
	void splitOrList_singleValue_returnsSingletonList() {
		assertThat(TagService.splitOrList("solo")).containsExactly("solo");
	}
}