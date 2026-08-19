package self.research.ontology.dataserver.service;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.exception.BadRequestException;

/**
 * Backs the PHP MappingsController::mappings()/newItem() endpoints (#76-81 —
 * REQUIRED FOR COMPATIBILITY). DISCLOSED SCOPE REDUCTION: this is a real but
 * intentionally small subset of Zotero's actual type/field/creator-type
 * schema (which in the PHP reference is generated from a large, versioned
 * schema.json with full CSL mappings and locale data — not present in, and
 * out of scope for, this Java batch). It covers enough common item types and
 * fields for Item creation/validation to genuinely work end-to-end, not a
 * stub — but it is not the complete official Zotero schema.
 */
@Service
public class SchemaService {

	private final Map<String, List<String>> itemTypeFields = new LinkedHashMap<>();
	private final Map<String, List<String>> itemTypeCreatorTypes = new LinkedHashMap<>();
	private final Set<String> allFields = new LinkedHashSet<>();
	private final Set<String> allCreatorFields = Set.of("firstName", "lastName", "name");

	public SchemaService() {
		define("book", List.of("title", "abstractNote", "series", "seriesNumber", "volume", "numberOfVolumes",
				"edition", "place", "publisher", "date", "numPages", "language", "ISBN", "shortTitle", "url",
				"accessDate", "archive", "archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"),
			List.of("author", "contributor", "editor", "seriesEditor", "translator"));

		define("journalArticle", List.of("title", "abstractNote", "publicationTitle", "volume", "issue", "pages",
				"date", "series", "seriesTitle", "seriesText", "journalAbbreviation", "language", "DOI", "ISSN",
				"shortTitle", "url", "accessDate", "archive", "archiveLocation", "libraryCatalog", "callNumber",
				"rights", "extra"),
			List.of("author", "contributor", "editor", "reviewedAuthor", "translator"));

		define("webpage", List.of("title", "abstractNote", "websiteTitle", "websiteType", "date", "shortTitle",
				"url", "accessDate", "language", "rights", "extra"),
			List.of("author", "contributor", "translator"));

		define("note", List.of(), List.of());

		define("attachment", List.of("title", "accessDate", "url", "linkMode", "contentType", "charset", "filename",
				"path", "md5", "mtime", "rights"), List.of());

		define("report", List.of("title", "abstractNote", "reportNumber", "reportType", "seriesTitle", "place",
				"institution", "date", "pages", "language", "shortTitle", "url", "accessDate", "archive",
				"archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"),
			List.of("author", "contributor", "seriesEditor", "translator"));

		define("thesis", List.of("title", "abstractNote", "thesisType", "university", "place", "date", "numPages",
				"language", "shortTitle", "url", "accessDate", "archive", "archiveLocation", "libraryCatalog",
				"callNumber", "rights", "extra"),
			List.of("author", "contributor"));

		itemTypeFields.values().forEach(allFields::addAll);
	}

	private void define(String itemType, List<String> fields, List<String> creatorTypes) {
		itemTypeFields.put(itemType, fields);
		itemTypeCreatorTypes.put(itemType, creatorTypes);
	}

	public List<String> getItemTypes() {
		return List.copyOf(itemTypeFields.keySet());
	}

	public boolean isValidItemType(String itemType) {
		return itemTypeFields.containsKey(itemType);
	}

	public void requireValidItemType(String itemType) {
		if (!isValidItemType(itemType)) {
			throw new BadRequestException("Invalid item type '" + itemType + "'");
		}
	}

	public List<String> getFieldsForType(String itemType) {
		requireValidItemType(itemType);
		return itemTypeFields.get(itemType);
	}

	public List<String> getAllFields() {
		return List.copyOf(allFields);
	}

	public List<String> getCreatorTypesForType(String itemType) {
		requireValidItemType(itemType);
		return itemTypeCreatorTypes.get(itemType);
	}

	public List<String> getCreatorFields() {
		return List.copyOf(allCreatorFields);
	}

	/** Used by ItemService to reject unknown fields on write (mirrors Zotero's schema-validated item data). */
	public void validateFieldsForType(String itemType, Set<String> fieldNames) {
		requireValidItemType(itemType);
		List<String> valid = itemTypeFields.get(itemType);
		for (String field : fieldNames) {
			if (!valid.contains(field)) {
				throw new BadRequestException("'" + field + "' is not a valid field for item type '" + itemType + "'");
			}
		}
	}
}