package self.research.ontology.dataserver.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

import self.research.ontology.dataserver.model.ApiKey;

public interface ApiKeyRepository extends MongoRepository<ApiKey, String> {
	Optional<ApiKey> findByKeyHashAndRevokedFalse(String keyHash);
	List<ApiKey> findByUserIdAndRevokedFalse(String userId);
}
