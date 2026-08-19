package self.research.ontology.dataserver.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

import self.research.ontology.dataserver.model.SavedSearch;

public interface SearchRepository extends MongoRepository<SavedSearch, String> {
	Optional<SavedSearch> findByLibraryIdAndKey(String libraryId, String key);
	List<SavedSearch> findByLibraryId(String libraryId);
}