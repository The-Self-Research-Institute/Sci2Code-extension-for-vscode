package self.research.ontology.dataserver.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * A Zotero saved search — a first-class object with its own key/version,
 * mirrors PHP's {@code savedSearches}/{@code savedSearchConditions} tables.
 * Unlike Tags, saved searches DO have a real create/update/delete API in
 * PHP (SearchesController), so — unlike Phase 6's aggregation-only Tags —
 * this genuinely needs its own collection.
 */
@Document(collection = "ds_searches")
@CompoundIndex(name = "library_key", def = "{'libraryId': 1, 'key': 1}", unique = true)
@Getter
@Setter
@NoArgsConstructor
public class SavedSearch {

	@Id
	private String id;

	private String key;

	private String libraryId;

	private String name;

	private List<SearchCondition> conditions = new ArrayList<>();

	private long version;

	private Instant dateAdded = Instant.now();

	private Instant dateModified = Instant.now();
}