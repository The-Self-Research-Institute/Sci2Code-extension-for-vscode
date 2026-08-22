package self.research.ontology.dataserver.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A single tag on an {@link Item}, carrying Zotero's own manual/automatic
 * convention ({@code type}: 0/absent = manually assigned, 1 = automatic —
 * e.g. imported from a bibliography file). Replaces the earlier
 * {@code List<String> tags} representation, which had no field for this and
 * silently discarded it on every write — see the P1 blueprint's tag-model
 * migration entry and {@code self.research.ontology.dataserver.migration.TagMigrationRunner}
 * for the one-time conversion of existing documents.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ItemTag {
	private String tag;
	private int type;
}
