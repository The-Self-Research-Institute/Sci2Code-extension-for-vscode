package self.research.ontology.dataserver.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.dto.ItemQueryParams;
import self.research.ontology.dataserver.dto.WriteReport;
import self.research.ontology.dataserver.exception.BadRequestException;
import self.research.ontology.dataserver.exception.DataserverException;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.model.Creator;
import self.research.ontology.dataserver.model.Item;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.repository.ItemRepository;
import self.research.ontology.dataserver.util.KeyGenerator;
import self.research.ontology.dataserver.util.VersionGuard;

/**
 * Maps to PHP ItemsController::items() (#3-16, excluding #17-21
 * Attachments/Files — Phase 7 — and the URL-translation sub-behavior of
 * #15, which depends on the separate Zotero translation-server subsystem,
 * out of scope for this batch).
 * <p>
 * Request/response bodies are handled as {@code Map<String,Object>} rather
 * than a fixed record — matching real Zotero item JSON, which flattens
 * schema-defined fields (title, date, url, ...) directly at the top level
 * alongside itemType/creators/tags/collections/relations, an open-ended
 * shape a static DTO can't represent without a "data" wrapper the real API
 * doesn't use in requests.
 */
@Service
@RequiredArgsConstructor
public class ItemService {

	private static final Set<String> RESERVED_KEYS = Set.of(
		"itemType", "key", "version", "creators", "tags", "collections", "relations", "parentItem", "deleted");

	private final ItemRepository itemRepository;
	private final LibraryService libraryService;
	private final SchemaService schemaService;
	private final AttachmentService attachmentService;
	private final DeletedLogService deletedLogService;

	public Item get(Library library, String key) {
		return itemRepository.findByLibraryIdAndKey(library.getId(), key)
			.orElseThrow(() -> new NotFoundException("Item not found"));
	}

	public boolean exists(Library library, String key) {
		return itemRepository.findByLibraryIdAndKey(library.getId(), key).isPresent();
	}

	/** #4 (create branch) */
	@SuppressWarnings("unchecked")
	public Item createAtKey(Library library, String key, Map<String, Object> body) {
		VersionGuard.requireForCreate();
		String itemType = requireString(body, "itemType", "'itemType' not provided");
		schemaService.requireValidItemType(itemType);

		Item item = new Item();
		item.setKey(key != null ? key : KeyGenerator.generate());
		item.setLibraryId(library.getId());
		item.setItemType(itemType);
		applyFields(item, body);

		String parentKey = (String) body.get("parentItem");
		if (parentKey != null && !parentKey.isBlank()) {
			get(library, parentKey); // 404 if parent doesn't exist
			item.setParentItemKey(parentKey);
		}

		item.setVersion(libraryService.bumpVersion(library));
		return itemRepository.save(item);
	}

	/** #4 (update branch) */
	public Item update(Library library, String key, Map<String, Object> body, Long ifUnmodifiedSinceVersion) {
		Item existing = get(library, key);
		Long providedVersion = ifUnmodifiedSinceVersion != null ? ifUnmodifiedSinceVersion : asLong(body.get("version"));
		VersionGuard.requireForExisting(providedVersion, existing.getVersion());

		if (body.containsKey("itemType")) {
			String itemType = (String) body.get("itemType");
			schemaService.requireValidItemType(itemType);
			existing.setItemType(itemType);
		}
		applyFields(existing, body);
		existing.setDateModified(Instant.now());
		existing.setVersion(libraryService.bumpVersion(library));
		return itemRepository.save(existing);
	}

	/**
	 * #5. Recursively deletes child notes/attachments/annotations too,
	 * matching PHP's Zotero_DataObjects::delete() cascade
	 * (model/DataObjects.inc.php:606-623) — previously this only removed the
	 * target item itself, orphaning its children. Single-object delete still
	 * REQUIRES the version header (PHP: ApiController.php:950-952, 428 if
	 * missing) — only the batch path (#16, below) treats it as optional.
	 */
	public void delete(Library library, String key, Long ifUnmodifiedSinceVersion) {
		Item existing = get(library, key);
		VersionGuard.requireForExisting(ifUnmodifiedSinceVersion, existing.getVersion());
		long newVersion = libraryService.bumpVersion(library);
		deleteItemAndChildren(library, existing, newVersion);
	}

	/**
	 * #16: bulk delete. Library-level version guard is OPTIONAL here, matching
	 * PHP's checkLibraryIfUnmodifiedSinceVersion($required=false) — confirmed
	 * directly against ItemsController.php:40-41 (only single-object delete
	 * requires it). Also cascades to each deleted item's children, same as
	 * delete() above.
	 */
	public void deleteBatch(Library library, List<String> keys, Long ifUnmodifiedSinceVersion) {
		VersionGuard.checkIfPresent(ifUnmodifiedSinceVersion, library.getVersion());
		long newVersion = libraryService.bumpVersion(library);
		for (String key : keys) {
			itemRepository.findByLibraryIdAndKey(library.getId(), key)
				.ifPresent(item -> deleteItemAndChildren(library, item, newVersion));
		}
	}

	/**
	 * Deletes {@code item} and, recursively, every item whose
	 * {@code parentItemKey} points to it — mirrors PHP's cascade (notes/
	 * attachments/annotations of a regular item; annotations of a file
	 * attachment; attachments of a note). Each deleted item gets its own
	 * GridFS file removed and its own delete-log tombstone, all stamped with
	 * the SAME library version (one bump per top-level delete call, matching
	 * the pattern already used for tag deletion's cascading item-version bump).
	 */
	private void deleteItemAndChildren(Library library, Item item, long version) {
		for (Item child : itemRepository.findByLibraryIdAndParentItemKey(library.getId(), item.getKey())) {
			deleteItemAndChildren(library, child, version);
		}
		attachmentService.deleteFileIfPresent(library.getId(), item.getKey());
		itemRepository.delete(item);
		deletedLogService.record(library.getId(), "item", item.getKey(), version);
	}

	/** #6 */
	public void removeFromCollection(Library library, String collectionKey, String itemKey) {
		Item item = get(library, itemKey);
		if (!item.getCollections().remove(collectionKey)) {
			throw new NotFoundException("Item not found in collection");
		}
		item.setVersion(libraryService.bumpVersion(library));
		itemRepository.save(item);
	}

	/** #12: bulk-attach existing items to a collection; rejects child items, matching the PHP reference. */
	public void addToCollection(Library library, String collectionKey, List<String> itemKeys) {
		for (String itemKey : itemKeys) {
			Item item = itemRepository.findByLibraryIdAndKey(library.getId(), itemKey)
				.orElseThrow(() -> new BadRequestException("Item '" + itemKey + "' not found in library"));
			if (item.getParentItemKey() != null) {
				throw new BadRequestException("Child items cannot be added to collections directly");
			}
			if (!item.getCollections().contains(collectionKey)) {
				item.getCollections().add(collectionKey);
				item.setVersion(libraryService.bumpVersion(library));
				itemRepository.save(item);
			}
		}
	}

	/** #7 */
	public List<Item> listTop(Library library) {
		return itemRepository.findByLibraryIdAndParentItemKeyIsNullAndDeletedFalse(library.getId());
	}

	/** #8 */
	public List<Item> listTrash(Library library) {
		return itemRepository.findByLibraryIdAndDeletedTrue(library.getId());
	}

	/** #9 */
	public List<Item> listChildren(Library library, String parentKey) {
		get(library, parentKey); // 404 if parent doesn't exist
		return itemRepository.findByLibraryIdAndParentItemKey(library.getId(), parentKey);
	}

	/** #11 (collection listing) */
	public List<Item> listByCollection(Library library, String collectionKey, boolean topOnly) {
		return topOnly
			? itemRepository.findByLibraryIdAndCollectionsContainingAndParentItemKeyIsNull(library.getId(), collectionKey)
			: itemRepository.findByLibraryIdAndCollectionsContaining(library.getId(), collectionKey);
	}

	/** #14 */
	public List<Item> listAll(Library library) {
		return itemRepository.findByLibraryIdAndDeletedFalse(library.getId());
	}

	/**
	 * Ad-hoc filtering/sorting — PHP's q/qmode/itemType/tag/since/sort/
	 * direction params on the items-listing endpoints. Applied in-memory
	 * over an already-scoped list (top/trash/collection/all) rather than
	 * as a Mongo query — dataset sizes here don't warrant a Criteria-builder
	 * rewrite, and this keeps every filter's semantics in one place,
	 * independent of which listing endpoint called it.
	 */
	public List<Item> applyQuery(List<Item> items, ItemQueryParams params) {
		if (params == null || params.isEmpty()) {
			return items;
		}
		List<Item> result = items;
		if (params.since() != null) {
			result = result.stream().filter(i -> i.getVersion() > params.since()).toList();
		}
		if (params.itemType() != null && !params.itemType().isBlank()) {
			result = filterByItemType(result, params.itemType());
		}
		if (params.tag() != null && !params.tag().isBlank()) {
			result = filterByTag(result, params.tag());
		}
		if (params.q() != null && !params.q().isBlank()) {
			result = filterByQuery(result, params.q(), params.qmode());
		}
		return sortItems(result, params.sort(), params.direction());
	}

	private List<Item> filterByItemType(List<Item> items, String itemTypeParam) {
		List<String> included = new ArrayList<>();
		List<String> excluded = new ArrayList<>();
		for (String raw : itemTypeParam.split(",")) {
			String v = raw.trim();
			if (v.startsWith("-")) {
				excluded.add(v.substring(1));
			}
			else if (!v.isEmpty()) {
				included.add(v);
			}
		}
		return items.stream()
			.filter(i -> included.isEmpty() || included.contains(i.getItemType()))
			.filter(i -> !excluded.contains(i.getItemType()))
			.toList();
	}

	private List<Item> filterByTag(List<Item> items, String tagParam) {
		List<String> included = new ArrayList<>();
		List<String> excluded = new ArrayList<>();
		for (String raw : TagService.splitOrList(tagParam)) {
			if (raw.startsWith("-")) {
				excluded.add(raw.substring(1));
			}
			else {
				included.add(raw);
			}
		}
		return items.stream()
			.filter(i -> included.isEmpty() || i.getTags().stream().anyMatch(included::contains))
			.filter(i -> excluded.isEmpty() || i.getTags().stream().noneMatch(excluded::contains))
			.toList();
	}

	/** Matches PHP's plain (non-"everything") quick search: title/creator/date substring. */
	private List<Item> filterByQuery(List<Item> items, String q, String qmode) {
		String needle = q.toLowerCase();
		boolean startsWith = "startswith".equalsIgnoreCase(qmode);
		return items.stream().filter(i -> {
			Object title = i.getData().get("title");
			if (title != null && matches(String.valueOf(title), needle, startsWith)) {
				return true;
			}
			Object date = i.getData().get("date");
			if (date != null && matches(String.valueOf(date), needle, startsWith)) {
				return true;
			}
			return i.getCreators().stream().anyMatch(c ->
				(c.getLastName() != null && matches(c.getLastName(), needle, startsWith))
					|| (c.getFirstName() != null && matches(c.getFirstName(), needle, startsWith)));
		}).toList();
	}

	private boolean matches(String haystack, String needleLower, boolean startsWith) {
		String h = haystack.toLowerCase();
		return startsWith ? h.startsWith(needleLower) : h.contains(needleLower);
	}

	private List<Item> sortItems(List<Item> items, String sort, String direction) {
		if (sort == null || sort.isBlank()) {
			return items;
		}
		Comparator<Item> cmp = switch (sort) {
			case "title" -> Comparator.comparing(i -> String.valueOf(i.getData().getOrDefault("title", "")).toLowerCase());
			case "dateAdded" -> Comparator.comparing(Item::getDateAdded);
			case "itemType" -> Comparator.comparing(Item::getItemType);
			default -> Comparator.comparing(Item::getDateModified);
		};
		if ("desc".equalsIgnoreCase(direction)) {
			cmp = cmp.reversed();
		}
		List<Item> sorted = new ArrayList<>(items);
		sorted.sort(cmp);
		return sorted;
	}

	/**
	 * #15 (bulk create — URL-translation sub-feature not implemented, see
	 * class javadoc). Returns a write-report ({@code successful}/{@code
	 * unchanged}/{@code failed} keyed by request index) instead of a flat
	 * array — matching PHP's Zotero_Results::generateReport() shape and its
	 * per-item failure isolation: one invalid item in the batch is reported
	 * as failed, not allowed to abort the other items' creation.
	 */
	public WriteReport<Item> createBatch(Library library, List<Map<String, Object>> bodies) {
		WriteReport<Item> report = new WriteReport<>();
		for (int i = 0; i < bodies.size(); i++) {
			Map<String, Object> body = bodies.get(i);
			Object keyObj = body.get("key");
			String key = keyObj instanceof String s ? s : null;
			try {
				report.addSuccess(i, createAtKey(library, key, body));
			}
			catch (DataserverException e) {
				report.addFailure(i, key, e.getStatus().value(), e.getMessage());
			}
			catch (RuntimeException e) {
				report.addFailure(i, key, 500, e.getMessage());
			}
		}
		return report;
	}

	private void applyFields(Item item, Map<String, Object> body) {
		Map<String, Object> dataFields = new LinkedHashMap<>();
		for (Map.Entry<String, Object> entry : body.entrySet()) {
			if (!RESERVED_KEYS.contains(entry.getKey())) {
				dataFields.put(entry.getKey(), entry.getValue());
			}
		}
		if (!dataFields.isEmpty()) {
			String type = item.getItemType();
			schemaService.validateFieldsForType(type, dataFields.keySet());
			item.getData().putAll(dataFields);
		}

		if (body.containsKey("creators")) {
			item.setCreators(parseCreators(body.get("creators")));
		}
		if (body.containsKey("tags")) {
			item.setTags(parseStringList(body.get("tags"), true));
		}
		if (body.containsKey("collections")) {
			item.setCollections(parseStringList(body.get("collections"), false));
		}
		if (body.containsKey("relations") && body.get("relations") instanceof Map<?, ?> rel) {
			Map<String, Object> relations = new LinkedHashMap<>();
			rel.forEach((k, v) -> relations.put(String.valueOf(k), v));
			item.setRelations(relations);
		}
		if (body.containsKey("deleted")) {
			Object d = body.get("deleted");
			item.setDeleted(Boolean.TRUE.equals(d) || "1".equals(String.valueOf(d)));
		}
	}

	@SuppressWarnings("unchecked")
	private List<Creator> parseCreators(Object raw) {
		List<Creator> creators = new ArrayList<>();
		if (raw instanceof List<?> list) {
			for (Object o : list) {
				if (o instanceof Map<?, ?> m) {
					Creator c = new Creator();
					c.setCreatorType(String.valueOf(m.get("creatorType")));
					c.setFirstName(m.get("firstName") != null ? String.valueOf(m.get("firstName")) : null);
					c.setLastName(m.get("lastName") != null ? String.valueOf(m.get("lastName")) : null);
					creators.add(c);
				}
			}
		}
		return creators;
	}

	private List<String> parseStringList(Object raw, boolean tagObjectsAllowed) {
		List<String> result = new ArrayList<>();
		if (raw instanceof List<?> list) {
			for (Object o : list) {
				if (o instanceof String s) {
					result.add(s);
				}
				else if (tagObjectsAllowed && o instanceof Map<?, ?> m && m.get("tag") != null) {
					result.add(String.valueOf(m.get("tag")));
				}
			}
		}
		return result;
	}

	private String requireString(Map<String, Object> body, String field, String errorMessage) {
		Object v = body.get(field);
		if (!(v instanceof String s) || s.isBlank()) {
			throw new BadRequestException(errorMessage);
		}
		return s;
	}

	private Long asLong(Object o) {
		if (o == null) {
			return null;
		}
		if (o instanceof Number n) {
			return n.longValue();
		}
		return Long.valueOf(String.valueOf(o));
	}
}