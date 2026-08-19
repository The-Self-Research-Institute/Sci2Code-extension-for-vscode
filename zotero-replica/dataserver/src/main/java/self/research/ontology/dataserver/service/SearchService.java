package self.research.ontology.dataserver.service;

import java.time.Instant;
import java.util.List;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.dto.SearchRequest;
import self.research.ontology.dataserver.dto.SearchResponse;
import self.research.ontology.dataserver.dto.WriteReport;
import self.research.ontology.dataserver.exception.BadRequestException;
import self.research.ontology.dataserver.exception.DataserverException;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.model.SavedSearch;
import self.research.ontology.dataserver.repository.SearchRepository;
import self.research.ontology.dataserver.util.KeyGenerator;
import self.research.ontology.dataserver.util.VersionGuard;

/**
 * Maps to PHP SearchesController::searches() (#39-44). Saved searches are a
 * real first-class object with a full CRUD contract in PHP — unlike Tags,
 * which have none — so this mirrors CollectionService's shape closely.
 */
@Service
@RequiredArgsConstructor
public class SearchService {

	private final SearchRepository searchRepository;
	private final LibraryService libraryService;
	private final DeletedLogService deletedLogService;

	public SavedSearch get(Library library, String key) {
		return searchRepository.findByLibraryIdAndKey(library.getId(), key)
			.orElseThrow(() -> new NotFoundException("Saved search not found"));
	}

	public boolean exists(Library library, String key) {
		return searchRepository.findByLibraryIdAndKey(library.getId(), key).isPresent();
	}

	/** #40 (create branch) */
	public SavedSearch createAtKey(Library library, String key, SearchRequest req) {
		VersionGuard.requireForCreate();
		requireValidConditions(req);

		SavedSearch s = new SavedSearch();
		s.setKey(key != null ? key : KeyGenerator.generate());
		s.setLibraryId(library.getId());
		s.setName(req.name());
		s.setConditions(SearchResponse.toModel(req.conditions()));
		s.setVersion(libraryService.bumpVersion(library));
		return searchRepository.save(s);
	}

	/** #40 (update branch) */
	public SavedSearch update(Library library, String key, SearchRequest req, Long ifUnmodifiedSinceVersion) {
		SavedSearch existing = get(library, key);
		Long providedVersion = ifUnmodifiedSinceVersion != null ? ifUnmodifiedSinceVersion : req.version();
		VersionGuard.requireForExisting(providedVersion, existing.getVersion());
		requireValidConditions(req);

		existing.setName(req.name());
		existing.setConditions(SearchResponse.toModel(req.conditions()));
		existing.setDateModified(Instant.now());
		existing.setVersion(libraryService.bumpVersion(library));
		return searchRepository.save(existing);
	}

	/** #41. Records a delete-log tombstone (#45 sync support). */
	public void delete(Library library, String key, Long ifUnmodifiedSinceVersion) {
		SavedSearch existing = get(library, key);
		VersionGuard.requireForExisting(ifUnmodifiedSinceVersion, existing.getVersion());
		searchRepository.delete(existing);
		long newVersion = libraryService.bumpVersion(library);
		deletedLogService.record(library.getId(), "search", key, newVersion);
	}

	/**
	 * #41: batch delete by comma-separated key list (?searchKey=A,B,C).
	 * Library-level version guard is OPTIONAL, matching PHP's
	 * checkLibraryIfUnmodifiedSinceVersion($required=false) (same shared
	 * trait as Items'/Collections' bulk delete). Records a delete-log
	 * tombstone per deleted key.
	 */
	public void deleteBatch(Library library, List<String> keys, Long ifUnmodifiedSinceVersion) {
		VersionGuard.checkIfPresent(ifUnmodifiedSinceVersion, library.getVersion());
		long newVersion = libraryService.bumpVersion(library);
		for (String key : keys) {
			searchRepository.findByLibraryIdAndKey(library.getId(), key).ifPresent(s -> {
				searchRepository.delete(s);
				deletedLogService.record(library.getId(), "search", key, newVersion);
			});
		}
	}

	/** #42 */
	public List<SavedSearch> listAll(Library library) {
		return searchRepository.findByLibraryId(library.getId());
	}

	/** #45 support: saved searches changed since library version {@code since}. */
	public List<SavedSearch> filterSince(List<SavedSearch> searches, Long since) {
		if (since == null) {
			return searches;
		}
		return searches.stream().filter(s -> s.getVersion() > since).toList();
	}

	/** #40 (multi-object POST): batch create/update, mirrors Zotero_Searches::updateMultipleFromJSON. */
	public WriteReport<SavedSearch> createOrUpdateBatch(Library library, List<SearchRequest> requests) {
		WriteReport<SavedSearch> report = new WriteReport<>();
		for (int i = 0; i < requests.size(); i++) {
			SearchRequest req = requests.get(i);
			try {
				SavedSearch result = (req.key() != null && exists(library, req.key()))
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

	private void requireValidConditions(SearchRequest req) {
		if (req.conditions() == null || req.conditions().isEmpty()) {
			throw new BadRequestException("A saved search requires at least one condition");
		}
		for (SearchRequest.ConditionDto c : req.conditions()) {
			if (isBlank(c.condition()) || isBlank(c.operator()) || c.value() == null) {
				throw new BadRequestException("Each condition requires 'condition', 'operator', and 'value'");
			}
		}
	}

	private boolean isBlank(String s) {
		return s == null || s.isBlank();
	}
}