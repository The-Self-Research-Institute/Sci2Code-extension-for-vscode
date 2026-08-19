package self.research.ontology.dataserver.repository;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

import self.research.ontology.dataserver.model.DeletedLogEntry;

public interface DeletedLogRepository extends MongoRepository<DeletedLogEntry, String> {
	List<DeletedLogEntry> findByLibraryIdAndObjectTypeAndVersionGreaterThan(String libraryId, String objectType, long since);
}