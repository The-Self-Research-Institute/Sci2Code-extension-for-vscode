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

		// Added for import compatibility (core/import/*'s BibTeX/RIS/EndNote/CSL-JSON
		// parsers already produce these two item types) - previously undefined here,
		// so importing an @inbook/@inproceedings-shaped record 400'd against a live
		// dataserver even though the client-side parser happily produced it.
		define("bookSection", List.of("title", "abstractNote", "bookTitle", "publicationTitle", "series",
				"seriesNumber", "volume", "numberOfVolumes", "edition", "place", "publisher", "date", "pages",
				"language", "ISBN", "shortTitle", "url", "accessDate", "archive", "archiveLocation", "libraryCatalog",
				"callNumber", "rights", "extra"),
			List.of("author", "contributor", "editor", "seriesEditor", "translator", "bookAuthor"));

		define("conferencePaper", List.of("title", "abstractNote", "bookTitle", "publicationTitle", "date", "place",
				"publisher", "volume", "issue", "pages", "series", "language", "DOI", "ISBN", "shortTitle", "url",
				"accessDate", "archive", "archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"),
			List.of("author", "contributor", "editor", "translator"));

		// "note" carries its text content in the `note` field (matches Zotero's own
		// convention) - Sci2Code/Replica UI note-taking (added once the frontend
		// stopped being local-storage-only) needs this to actually round-trip.
		define("note", List.of("note"), List.of());

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

		// P1 item-type expansion (blueprint §05/§10 Phase 4) — a real but
		// intentionally bounded extension of the subset above: the types most
		// requested there by name (magazineArticle, newspaperArticle, letter,
		// manuscript, presentation, dataset, document) plus other high-frequency
		// Zotero types, bringing coverage from 9 to 27 of Zotero's ~36 regular
		// item types. Field lists follow Zotero's public schema; a handful of
		// rarer types (bill, case, forumPost, hearing, instantMessage,
		// radioBroadcast, statute, tvBroadcast, artwork, preprint) are
		// deliberately left out of this batch rather than guessed at without
		// the authoritative schema.json to check against — the same disclosed-
		// subset approach this class's own javadoc already establishes.
		define("magazineArticle", List.of("title", "abstractNote", "publicationTitle", "volume", "issue", "date",
				"pages", "language", "ISSN", "shortTitle", "url", "accessDate", "archive", "archiveLocation",
				"libraryCatalog", "callNumber", "rights", "extra"),
			List.of("author", "contributor", "translator"));

		define("newspaperArticle", List.of("title", "abstractNote", "publicationTitle", "place", "edition", "date",
				"section", "pages", "language", "ISSN", "shortTitle", "url", "accessDate", "archive",
				"archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"),
			List.of("author", "contributor", "translator"));

		define("letter", List.of("title", "abstractNote", "letterType", "date", "language", "shortTitle", "url",
				"accessDate", "archive", "archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"),
			List.of("author", "contributor", "recipient"));

		define("manuscript", List.of("title", "abstractNote", "manuscriptType", "place", "date", "numPages",
				"language", "shortTitle", "url", "accessDate", "archive", "archiveLocation", "libraryCatalog",
				"callNumber", "rights", "extra"),
			List.of("author", "contributor", "translator"));

		define("presentation", List.of("title", "abstractNote", "presentationType", "date", "place", "meetingName",
				"url", "accessDate", "language", "shortTitle", "rights", "extra"),
			List.of("presenter", "contributor"));

		define("dataset", List.of("title", "abstractNote", "date", "publisher", "edition", "versionNumber", "DOI",
				"identifier", "repository", "citationKey", "url", "accessDate", "language", "shortTitle", "archive",
				"archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"),
			List.of("author", "contributor"));

		define("document", List.of("title", "abstractNote", "publisher", "date", "language", "shortTitle", "url",
				"accessDate", "archive", "archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"),
			List.of("author", "contributor", "editor", "translator", "reviewedAuthor"));

		define("encyclopediaArticle", List.of("title", "abstractNote", "encyclopediaTitle", "series", "seriesNumber",
				"volume", "numberOfVolumes", "edition", "place", "publisher", "date", "pages", "ISBN", "shortTitle",
				"url", "accessDate", "language", "archive", "archiveLocation", "libraryCatalog", "callNumber",
				"rights", "extra"),
			List.of("author", "contributor", "editor", "translator"));

		define("dictionaryEntry", List.of("title", "abstractNote", "dictionaryTitle", "series", "seriesNumber",
				"volume", "numberOfVolumes", "edition", "place", "publisher", "date", "pages", "ISBN", "shortTitle",
				"url", "accessDate", "language", "archive", "archiveLocation", "libraryCatalog", "callNumber",
				"rights", "extra"),
			List.of("author", "contributor", "editor", "translator"));

		define("computerProgram", List.of("title", "abstractNote", "seriesTitle", "versionNumber", "date", "system",
				"place", "company", "programmingLanguage", "ISBN", "shortTitle", "url", "accessDate", "rights",
				"extra", "libraryCatalog", "callNumber", "archive", "archiveLocation"),
			List.of("programmer", "contributor"));

		define("videoRecording", List.of("title", "abstractNote", "seriesTitle", "volume", "numberOfVolumes", "place",
				"studio", "date", "runningTime", "language", "ISBN", "shortTitle", "url", "accessDate", "archive",
				"archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"),
			List.of("director", "producer", "scriptwriter", "contributor"));

		define("audioRecording", List.of("title", "abstractNote", "seriesTitle", "volume", "numberOfVolumes", "place",
				"label", "date", "runningTime", "language", "ISBN", "shortTitle", "url", "accessDate", "archive",
				"archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"),
			List.of("performer", "contributor", "composer"));

		define("podcast", List.of("title", "abstractNote", "seriesTitle", "episodeNumber", "audioFileType",
				"runningTime", "url", "accessDate", "language", "shortTitle", "rights", "extra"),
			List.of("podcaster", "contributor", "guest"));

		define("blogPost", List.of("title", "abstractNote", "blogTitle", "websiteType", "date", "url", "accessDate",
				"language", "shortTitle", "rights", "extra"),
			List.of("author", "contributor", "commenter"));

		define("email", List.of("title", "date", "language", "shortTitle", "url", "accessDate", "rights", "extra"),
			List.of("author", "contributor", "recipient"));

		define("interview", List.of("title", "abstractNote", "interviewMedium", "date", "language", "shortTitle",
				"url", "accessDate", "archive", "archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"),
			List.of("interviewee", "interviewer", "translator", "contributor"));

		define("map", List.of("title", "abstractNote", "mapType", "scale", "seriesTitle", "edition", "place",
				"publisher", "date", "language", "ISBN", "shortTitle", "url", "accessDate", "archive",
				"archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"),
			List.of("cartographer", "contributor", "seriesEditor"));

		define("patent", List.of("title", "abstractNote", "place", "country", "assignee", "issuingAuthority",
				"patentNumber", "filingDate", "pages", "applicationNumber", "priorityNumbers", "issueDate",
				"references", "legalStatus", "date", "shortTitle", "url", "accessDate", "rights", "extra", "language"),
			List.of("inventor", "attorneyAgent", "contributor"));

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