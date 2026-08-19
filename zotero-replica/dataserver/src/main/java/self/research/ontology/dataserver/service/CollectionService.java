package self.research.ontology.dataserver.service;

import java.time.Instant;
import java.util.List;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.dto.CollectionRequest;
import self.research.ontology.dataserver.dto.WriteReport;
import self.research.ontology.dataserver.exception.BadRequestException;
import self.research.ontology.dataserver.exception.ConflictException;
import self.research.ontology.dataserver.exception.DataserverException;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.model.Item;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.model.LibraryCollection;
import self.research.ontology.dataserver.repository.CollectionRepository;
import self.research.ontology.dataserver.repository.ItemRepository;
import self.research.ontology.dataserver.util.KeyGenerator;
import self.research.ontology.dataserver.util.VersionGuard;

/**
 * Maps to PHP CollectionsController::collections() (#23-30). See
 * util/VersionGuard for the disclosed version-check simplification.
 */
@Service
@RequiredArgsConstructor
public class CollectionService {

	private final CollectionRepository collectionRepository;
	private final ItemRepository itemRepository;
	private final LibraryService libraryService;
	private final DeletedLogService deletedLogService;

	public LibraryCollection get(Library library, String key) {
		return collectionRepository.findByLibraryIdAndKey(library.getId(), key)
			.orElseThrow(() -> new NotFoundException("Collection not found"));
	}

	public boolean exists(Library library, String key) {
		return collectionRepository.findByLibraryIdAndKey(library.getId(), key).isPresent();
	}

	/** #24 (create branch) — PUT to a caller-chosen key that doesn't exist yet. */
	public LibraryCollection createAtKey(Library library, String key, CollectionRequest req) {
		VersionGuard.requireForCreate();
		validateParent(library, req.parentCollection());

		LibraryCollection c = new LibraryCollection();
		c.setKey(key != null ? key : KeyGenerator.generate());
		c.setLibraryId(library.getId());
		c.setName(req.name());
		c.setParentKey(normalizeParent(req.parentCollection()));
		c.setVersion(libraryService.bumpVersion(library));
		return collectionRepository.save(c);
	}

	/** #24 (update branch) */
	public LibraryCollection update(Library library, String key, CollectionRequest req, Long ifUnmodifiedSinceVersion) {
		LibraryCollection existing = get(library, key);
		Long providedVersion = ifUnmodifiedSinceVersion != null ? ifUnmodifiedSinceVersion : req.version();
		VersionGuard.requireForExisting(providedVersion, existing.getVersion());
		validateParent(library, req.parentCollection());

		if (req.parentCollection() != null && key.equals(normalizeParent(req.parentCollection()))) {
			throw new BadRequestException("A collection cannot be its own parent");
		}

		existing.setName(req.name());
		existing.setParentKey(normalizeParent(req.parentCollection()));
		existing.setDateModified(Instant.now());
		existing.setVersion(libraryService.bumpVersion(library));
		return collectionRepository.save(existing);
	}

	/**
	 * #25. Recursively deletes sub-collections too, matching PHP's DB-level
	 * {@code ON DELETE CASCADE} on {@code parentCollectionID}
	 * (misc/shard.sql:383-388). Items that were in any deleted collection are
	 * only unlinked (their {@code collections} key list is pruned), never
	 * themselves deleted — matching PHP, where only the join row cascades.
	 * Single-object delete still REQUIRES the version header (unchanged).
	 */
	public void delete(Library library, String key, Long ifUnmodifiedSinceVersion) {
		LibraryCollection existing = get(library, key);
		VersionGuard.requireForExisting(ifUnmodifiedSinceVersion, existing.getVersion());
		long newVersion = libraryService.bumpVersion(library);
		deleteCollectionAndChildren(library, existing, newVersion);
	}

	/**
	 * #29: batch delete by comma-separated key list. Library-level version
	 * guard is OPTIONAL here, matching PHP's
	 * checkLibraryIfUnmodifiedSinceVersion($required=false) (same shared
	 * Zotero_DataObjects trait Items' bulk delete uses). Also cascades to
	 * sub-collections, same as delete() above.
	 */
	public void deleteBatch(Library library, List<String> keys, Long ifUnmodifiedSinceVersion) {
		VersionGuard.checkIfPresent(ifUnmodifiedSinceVersion, library.getVersion());
		long newVersion = libraryService.bumpVersion(library);
		for (String key : keys) {
			collectionRepository.findByLibraryIdAndKey(library.getId(), key)
				.ifPresent(c -> deleteCollectionAndChildren(library, c, newVersion));
		}
	}

	/**
	 * Deletes {@code collection} and, recursively, every collection whose
	 * {@code parentKey} points to it. Before removing it, prunes its key out
	 * of every item that currently references it, so no item is left with a
	 * dangling collection reference.
	 */
	private void deleteCollectionAndChildren(Library library, LibraryCollection collection, long version) {
		for (LibraryCollection child : collectionRepository.findByLibraryIdAndParentKey(library.getId(), collection.getKey())) {
			deleteCollectionAndChildren(library, child, version);
		}
		for (Item item : itemRepository.findByLibraryIdAndCollectionsContaining(library.getId(), collection.getKey())) {
			item.getCollections().remove(collection.getKey());
			item.setVersion(version);
			itemRepository.save(item);
		}
		collectionRepository.delete(collection);
		deletedLogService.record(library.getId(), "collection", collection.getKey(), version);
	}

	/** #45 support: collections changed since library version {@code since}. */
	public List<LibraryCollection> filterSince(List<LibraryCollection> collections, Long since) {
		if (since == null) {
			return collections;
		}
		return collections.stream().filter(c -> c.getVersion() > since).toList();
	}

	/** #27 */
	public List<LibraryCollection> listTop(Library library) {
		return collectionRepository.findByLibraryIdAndParentKeyIsNull(library.getId());
	}

	/** #26 */
	public List<LibraryCollection> listChildren(Library library, String parentKey) {
		get(library, parentKey); // 404 if parent doesn't exist
		return collectionRepository.findByLibraryIdAndParentKey(library.getId(), parentKey);
	}

	/** #30 */
	public List<LibraryCollection> listAll(Library library) {
		return collectionRepository.findByLibraryId(library.getId());
	}

	/**
	 * #28: batch create/update. Write-report shape (see WriteReport javadoc)
	 * — one invalid entry in the batch is reported as failed rather than
	 * aborting the other entries.
	 */
	public WriteReport<LibraryCollection> createOrUpdateBatch(Library library, List<CollectionRequest> requests) {
		WriteReport<LibraryCollection> report = new WriteReport<>();
		for (int i = 0; i < requests.size(); i++) {
			CollectionRequest req = requests.get(i);
			try {
				LibraryCollection result = (req.key() != null && exists(library, req.key()))
					? update(library, req.key(), req, req.version())
					: createAtKey(library, req.key(), req);
				report.addSuccess(i, result);
			}
			catch (DataserverException e) {
				report.addFailure(i, req.key(), e.getStatus().value(), e.getMessage());
			}
			catch (RuntimeException e) {
				report.addFailure(i, req.key(), 500, e.getMessage());
			}
		}
		return report;
	}

	/** #24/#28: non-existent parent → 409, matching PHP's Z_ERROR_COLLECTION_NOT_FOUND (Errors.inc.php:113,120-127). */
	private void validateParent(Library library, String parentCollection) {
		String parent = normalizeParent(parentCollection);
		if (parent != null && collectionRepository.findByLibraryIdAndKey(library.getId(), parent).isEmpty()) {
			throw new ConflictException("Parent collection '" + parent + "' not found");
		}
	}

	private String normalizeParent(String parentCollection) {
		if (parentCollection == null || parentCollection.isBlank() || parentCollection.equals("false")) {
			return null;
		}
		return parentCollection;
	}
}