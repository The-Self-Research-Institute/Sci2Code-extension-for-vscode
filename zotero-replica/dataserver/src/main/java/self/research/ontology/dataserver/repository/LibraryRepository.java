package self.research.ontology.dataserver.repository;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

import self.research.ontology.dataserver.model.Library;

public interface LibraryRepository extends MongoRepository<Library, String> {
	Optional<Library> findByOwnerEmail(String ownerEmail);
	Optional<Library> findByGroupId(String groupId);
}