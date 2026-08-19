package self.research.ontology.dataserver.repository;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

import self.research.ontology.dataserver.model.AppUser;

public interface UserRepository extends MongoRepository<AppUser, String> {
	Optional<AppUser> findByEmailIgnoreCase(String email);
	boolean existsByEmailIgnoreCase(String email);
}
