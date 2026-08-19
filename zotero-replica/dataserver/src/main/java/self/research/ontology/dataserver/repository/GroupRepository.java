package self.research.ontology.dataserver.repository;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

import self.research.ontology.dataserver.model.Group;

public interface GroupRepository extends MongoRepository<Group, String> {
	List<Group> findByOwnerEmail(String ownerEmail);
	List<Group> findByMembers_Email(String email);
}