package self.research.ontology.dataserver.service;

import java.time.Instant;
import java.util.List;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.model.DeletedLogEntry;
import self.research.ontology.dataserver.repository.DeletedLogRepository;

/**
 * Backs PHP's {@code syncDeleteLogKeys} table / DeletedController::deleted().
 * See DeletedLogEntry's javadoc for the disclosed non-transactional caveat.
 */
@Service
@RequiredArgsConstructor
public class DeletedLogService {

	private final DeletedLogRepository deletedLogRepository;

	public void record(String libraryId, String objectType, String identifier, long version) {
		deletedLogRepository.save(new DeletedLogEntry(null, libraryId, objectType, identifier, version, Instant.now()));
	}

	public List<String> findSince(String libraryId, String objectType, long since) {
		return deletedLogRepository.findByLibraryIdAndObjectTypeAndVersionGreaterThan(libraryId, objectType, since)
			.stream().map(DeletedLogEntry::getIdentifier).toList();
	}
}