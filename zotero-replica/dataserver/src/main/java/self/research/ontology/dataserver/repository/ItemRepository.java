package self.research.ontology.dataserver.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import self.research.ontology.dataserver.model.Item;

public interface ItemRepository extends MongoRepository<Item, String> {
	Optional<Item> findByLibraryIdAndKey(String libraryId, String key);
	List<Item> findByLibraryId(String libraryId);
	List<Item> findByLibraryIdAndDeletedFalse(String libraryId);
	List<Item> findByLibraryIdAndDeletedTrue(String libraryId);
	List<Item> findByLibraryIdAndParentItemKeyIsNullAndDeletedFalse(String libraryId);
	List<Item> findByLibraryIdAndParentItemKey(String libraryId, String parentItemKey);
	List<Item> findByLibraryIdAndCollectionsContaining(String libraryId, String collectionKey);
	List<Item> findByLibraryIdAndCollectionsContainingAndParentItemKeyIsNull(String libraryId, String collectionKey);

	/** Matches items where any tag's `tag` field equals the given name - tags is now List<ItemTag>, not List<String>, so a plain "Containing" derived query no longer applies. */
	@Query("{ 'libraryId': ?0, 'tags.tag': ?1 }")
	List<Item> findByLibraryIdAndTagName(String libraryId, String tagName);
}