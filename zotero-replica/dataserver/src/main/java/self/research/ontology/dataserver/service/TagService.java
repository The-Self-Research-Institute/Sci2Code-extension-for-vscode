package self.research.ontology.dataserver.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import lombok.RequiredArgsConstructor;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.dto.TagResponse;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.model.Item;
import self.research.ontology.dataserver.model.ItemTag;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.repository.ItemRepository;
import self.research.ontology.dataserver.util.VersionGuard;

/**
 * Maps to PHP TagsController::tags() (#31-38). PHP allows only HEAD/GET/
 * DELETE on tags — there is no create/update endpoint; a tag is nothing but
 * "the set of items whose tags array contains this name," and it changes
 * only as a side effect of item writes (see ItemService). This is therefore
 * a read/delete-only aggregation over {@code ds_items} rather than a
 * separate {@code ds_tags} collection: no dual-write consistency problem,
 * and it matches the PHP behavior exactly rather than over-normalizing.
 */
@Service
@RequiredArgsConstructor
public class TagService {

	private final ItemRepository itemRepository;
	private final LibraryService libraryService;
	private final MongoTemplate mongoTemplate;
	private final DeletedLogService deletedLogService;

	/** #31/#33-38: library-wide tag listing with PHP's tag/q/qmode/sort/direction/start/limit params. */
	public List<TagResponse> listTags(Library library, String tagOrList, String q, String qmode,
			String sort, String direction, Integer start, Integer limit) {
		List<TagResponse> all = aggregateTagCounts(library.getId());

		if (tagOrList != null && !tagOrList.isBlank()) {
			Set<String> allowed = Set.copyOf(splitOrList(tagOrList));
			all = all.stream().filter(t -> allowed.contains(t.tag())).toList();
		}
		if (q != null && !q.isBlank()) {
			String needle = q.toLowerCase();
			boolean startsWith = "startswith".equalsIgnoreCase(qmode);
			all = all.stream()
				.filter(t -> startsWith ? t.tag().toLowerCase().startsWith(needle) : t.tag().toLowerCase().contains(needle))
				.toList();
		}

		Comparator<TagResponse> cmp = "numitems".equalsIgnoreCase(sort)
			? Comparator.comparingLong(t -> t.meta().numItems())
			: Comparator.comparing(t -> t.tag().toLowerCase());
		if ("desc".equalsIgnoreCase(direction)) {
			cmp = cmp.reversed();
		}
		List<TagResponse> sorted = new ArrayList<>(all);
		sorted.sort(cmp);

		int from = (start != null && start > 0) ? Math.min(start, sorted.size()) : 0;
		int to = (limit != null && limit > 0) ? Math.min(from + limit, sorted.size()) : sorted.size();
		return sorted.subList(from, to);
	}

	/** #32 */
	public TagResponse getTag(Library library, String name) {
		return aggregateTagCounts(library.getId()).stream()
			.filter(t -> t.tag().equals(name))
			.findFirst()
			.orElseThrow(() -> new NotFoundException("Tag not found"));
	}

	/**
	 * #37: batch delete by name (PHP's {@code ' || '}-separated OR-list),
	 * library-level version guard (PHP checks/bumps the LIBRARY version for
	 * this write, not a per-tag version, since tags have no version exposed
	 * in the response envelope). Linked items' own versions are also bumped
	 * to the same new library version, matching PHP's
	 * Zotero_Items::updateVersions() side effect of a tag deletion.
	 */
	public void deleteTags(Library library, List<String> names, Long ifUnmodifiedSinceVersion) {
		VersionGuard.requireForExisting(ifUnmodifiedSinceVersion, library.getVersion());
		long newVersion = libraryService.bumpVersion(library);
		for (String name : names) {
			boolean removedFromAtLeastOneItem = false;
			for (Item item : itemRepository.findByLibraryIdAndTagName(library.getId(), name)) {
				if (item.getTags().removeIf(t -> t.getTag().equals(name))) {
					item.setVersion(newVersion);
					itemRepository.save(item);
					removedFromAtLeastOneItem = true;
				}
			}
			if (removedFromAtLeastOneItem) {
				deletedLogService.record(library.getId(), "tag", name, newVersion);
			}
		}
	}

	/**
	 * P1 blueprint's one genuinely new endpoint: renames a tag across every
	 * item in the library atomically (well, per-item-document atomically;
	 * there is no multi-document transaction here, matching the rest of this
	 * project's disclosed no-transactions architecture). Existing per-item
	 * rename (useLibraryData.renameTag) only touches one item at a time and
	 * requires the caller to already have that item loaded - this is the
	 * library-wide equivalent, backing the "Manage Tags" screen.
	 */
	public int renameTagAcrossLibrary(Library library, String oldName, String newName, Long ifUnmodifiedSinceVersion) {
		VersionGuard.requireForExisting(ifUnmodifiedSinceVersion, library.getVersion());
		long newVersion = libraryService.bumpVersion(library);
		int renamedCount = 0;
		for (Item item : itemRepository.findByLibraryIdAndTagName(library.getId(), oldName)) {
			boolean changed = false;
			for (ItemTag t : item.getTags()) {
				if (t.getTag().equals(oldName)) {
					t.setTag(newName);
					changed = true;
				}
			}
			if (changed) {
				item.setVersion(newVersion);
				itemRepository.save(item);
				renamedCount++;
			}
		}
		return renamedCount;
	}

	/**
	 * Tags used within a given item subset (items/tags, items/top/tags,
	 * collection-scoped listings, a single item's own tags, ...). numItems
	 * is scoped to the given subset, not the whole library — a documented
	 * interpretation choice where the PHP source doesn't pin down the exact
	 * scoping of the returned count for these subset variants.
	 */
	public List<TagResponse> tagsFromItems(List<Item> items) {
		Map<String, Long> counts = new LinkedHashMap<>();
		for (Item item : items) {
			for (ItemTag tag : item.getTags()) {
				counts.merge(tag.getTag(), 1L, Long::sum);
			}
		}
		return counts.entrySet().stream()
			.sorted(Map.Entry.comparingByKey())
			.map(e -> TagResponse.of(e.getKey(), e.getValue()))
			.toList();
	}

	public static List<String> splitOrList(String raw) {
		List<String> result = new ArrayList<>();
		for (String part : raw.split("\\s*\\|\\|\\s*")) {
			if (!part.isBlank()) {
				result.add(part.trim());
			}
		}
		return result;
	}

	@SuppressWarnings("unchecked")
	private List<TagResponse> aggregateTagCounts(String libraryId) {
		// Group by "tags.tag" (the nested field), not the whole "tags"
		// embedded document - grouping by the whole document would incorrectly
		// split the same tag name into separate groups whenever it appears
		// with a different `type` on different items.
		Aggregation agg = Aggregation.newAggregation(
			Aggregation.match(Criteria.where("libraryId").is(libraryId)),
			Aggregation.unwind("tags"),
			Aggregation.group("tags.tag").count().as("numItems")
		);
		AggregationResults<Map> results = mongoTemplate.aggregate(agg, "ds_items", Map.class);
		List<TagResponse> out = new ArrayList<>();
		for (Map<String, Object> row : results.getMappedResults()) {
			String tag = String.valueOf(row.get("_id"));
			long numItems = ((Number) row.get("numItems")).longValue();
			out.add(TagResponse.of(tag, numItems));
		}
		return out;
	}
}