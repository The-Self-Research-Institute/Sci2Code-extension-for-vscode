package self.research.ontology.dataserver.dto;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import self.research.ontology.dataserver.model.Creator;
import self.research.ontology.dataserver.model.Item;
import self.research.ontology.dataserver.model.ItemTag;
import self.research.ontology.dataserver.model.Library;

/**
 * Builds the Zotero-shaped response envelope for an Item. A plain utility
 * (not a record) because an Item's "data" is an open-ended field map, not a
 * fixed set of properties.
 */
public final class ItemResponseMapper {

	private ItemResponseMapper() {
	}

	public static Map<String, Object> toResponse(Item item, Library library) {
		Map<String, Object> data = new LinkedHashMap<>();
		data.put("key", item.getKey());
		data.put("version", item.getVersion());
		data.put("itemType", item.getItemType());
		data.putAll(item.getData());

		List<Map<String, String>> creators = new ArrayList<>();
		for (Creator c : item.getCreators()) {
			Map<String, String> cm = new LinkedHashMap<>();
			cm.put("creatorType", c.getCreatorType());
			if (c.getFirstName() != null) {
				cm.put("firstName", c.getFirstName());
			}
			if (c.getLastName() != null) {
				cm.put("lastName", c.getLastName());
			}
			creators.add(cm);
		}
		data.put("creators", creators);
		// Round-trips the manual/automatic distinction (see ItemTag's javadoc) -
		// previously this was `Map.of("tag", t)` over a List<String>, which had
		// no `type` to return at all: the confirmed root cause of imported and
		// manually-typed tags becoming visually indistinguishable after any
		// refresh (P1 blueprint's tag-model migration entry).
		List<Map<String, Object>> tagList = new ArrayList<>();
		for (ItemTag t : item.getTags()) {
			Map<String, Object> tm = new LinkedHashMap<>();
			tm.put("tag", t.getTag());
			tm.put("type", t.getType());
			tagList.add(tm);
		}
		data.put("tags", tagList);
		data.put("collections", item.getCollections());
		data.put("relations", item.getRelations());
		if (item.getParentItemKey() != null) {
			data.put("parentItem", item.getParentItemKey());
		}
		if (item.isDeleted()) {
			data.put("deleted", true);
		}

		Map<String, Object> response = new LinkedHashMap<>();
		response.put("key", item.getKey());
		response.put("version", item.getVersion());
		response.put("library", LibraryRef.from(library));
		response.put("data", data);
		return response;
	}
}