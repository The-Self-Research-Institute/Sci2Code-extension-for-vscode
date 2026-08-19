package self.research.ontology.dataserver.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

import self.research.ontology.dataserver.model.LibraryCollection;

public interface CollectionRepository extends MongoRepository<LibraryCollection, String> {
	Optional<LibraryCollection> findByLibraryIdAndKey(String libraryId, String key);
	List<LibraryCollection> findByLibraryId(String libraryId);
	List<LibraryCollection> findByLibraryIdAndParentKeyIsNull(String libraryId);
	List<LibraryCollection> findByLibraryIdAndParentKey(String libraryId, String parentKey);
	void deleteByLibraryIdAndKey(String libraryId, String key);
}