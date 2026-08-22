package self.research.ontology.dataserver.migration;

import java.util.ArrayList;
import java.util.List;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Updates;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

/**
 * One-time, idempotent migration for the P1 tag-model change: {@code
 * ds_items.tags} used to be a plain array of strings (see the prior
 * List&lt;String&gt; Item.tags field); it is now an array of {@code {tag,
 * type}} documents (see {@link self.research.ontology.dataserver.model.ItemTag}).
 * <p>
 * Runs against the RAW Mongo driver ({@link MongoCollection}&lt;{@link Document}&gt;),
 * deliberately bypassing Spring Data's typed {@code ItemRepository} — reading
 * an old-shape document through the new, typed {@code Item.tags:
 * List<ItemTag>} field would throw a mapping exception before this migration
 * ever got a chance to fix it. Safe to run on every startup: any document
 * whose first tag element is already a document (not a plain string) is left
 * untouched.
 * <p>
 * Historical tags are migrated with {@code type: 0} (manual) — there is no
 * way to recover which ones were originally imported, since that is exactly
 * the information the pre-migration bug discarded. This is disclosed, not
 * hidden.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class TagMigrationRunner implements ApplicationRunner {

	private static final String COLLECTION = "ds_items";

	private final MongoTemplate mongoTemplate;

	@Override
	public void run(ApplicationArguments args) {
		MongoCollection<Document> collection = mongoTemplate.getCollection(COLLECTION);
		int migrated = 0;

		for (Document doc : collection.find(Filters.exists("tags"))) {
			Object rawTags = doc.get("tags");
			if (!(rawTags instanceof List<?> list) || list.isEmpty()) {
				continue;
			}
			if (list.get(0) instanceof Document) {
				continue; // already migrated
			}

			List<Document> converted = new ArrayList<>();
			for (Object element : list) {
				if (element instanceof String tagName) {
					converted.add(new Document("tag", tagName).append("type", 0));
				}
			}

			collection.updateOne(Filters.eq("_id", doc.get("_id")), Updates.set("tags", converted));
			migrated++;
		}

		if (migrated > 0) {
			log.info("Tag model migration: rewrote {} item(s) in '{}' from string[] tags to {{tag,type}}[] tags.", migrated, COLLECTION);
		}
	}
}
