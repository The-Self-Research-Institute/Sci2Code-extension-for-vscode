package self.research.ontology.dataserver.controller;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import self.research.ontology.dataserver.exception.BadRequestException;
import self.research.ontology.dataserver.service.SchemaService;

/**
 * Maps to PHP MappingsController (#76-82 in the API classification —
 * REQUIRED FOR COMPATIBILITY). No authentication required — verified
 * directly against the PHP source, which performs no permission check at
 * all for these endpoints (public reference/schema data). See SchemaService
 * for the disclosed schema-subset scoping decision.
 */
@RestController
@RequiredArgsConstructor
public class MappingsController {

	private final SchemaService schemaService;

	/** #76 */
	@GetMapping("/itemTypes")
	public List<Map<String, String>> itemTypes() {
		return schemaService.getItemTypes().stream().map(t -> Map.of("itemType", t, "localized", t)).toList();
	}

	/** #77 */
	@GetMapping("/itemTypeFields")
	public List<Map<String, String>> itemTypeFields(@RequestParam(required = false) String itemType) {
		if (itemType == null || itemType.isBlank()) {
			throw new BadRequestException("'itemType' not provided");
		}
		return schemaService.getFieldsForType(itemType).stream().map(f -> Map.of("field", f, "localized", f)).toList();
	}

	/** #78 */
	@GetMapping("/itemFields")
	public List<Map<String, String>> itemFields() {
		return schemaService.getAllFields().stream().map(f -> Map.of("field", f, "localized", f)).toList();
	}

	/** #79 */
	@GetMapping("/itemTypeCreatorTypes")
	public List<Map<String, String>> itemTypeCreatorTypes(@RequestParam(required = false) String itemType) {
		if (itemType == null || itemType.isBlank()) {
			throw new BadRequestException("'itemType' not provided");
		}
		if (itemType.equals("note") || itemType.equals("attachment")) {
			return List.of();
		}
		return schemaService.getCreatorTypesForType(itemType).stream()
			.map(c -> Map.of("creatorType", c, "localized", c)).toList();
	}

	/** #80 */
	@GetMapping("/creatorFields")
	public List<Map<String, String>> creatorFields() {
		return schemaService.getCreatorFields().stream().map(f -> Map.of("field", f, "localized", f)).toList();
	}

	/**
	 * #82 — In the PHP reference this is a static symlinked file (schema.json),
	 * bypassing PHP entirely. Reimplemented here as a real endpoint returning
	 * our schema subset (see SchemaService) as JSON — same purpose (a
	 * machine-readable type/field/creator-type document), not the exact same
	 * file format as Zotero's official schema.json (which also carries CSL
	 * mappings and full locale data, out of scope for this batch).
	 */
	@GetMapping("/schema")
	public Map<String, Object> schema() {
		Map<String, Object> itemTypesSection = new LinkedHashMap<>();
		for (String type : schemaService.getItemTypes()) {
			itemTypesSection.put(type, Map.of(
				"fields", schemaService.getFieldsForType(type),
				"creatorTypes", schemaService.getCreatorTypesForType(type)
			));
		}
		return Map.of("version", 1, "itemTypes", itemTypesSection);
	}

	/** #81 — blank item-JSON template for client "new item" forms. */
	@GetMapping("/items/new")
	public Map<String, Object> newItem(@RequestParam(required = false) String itemType) {
		if (itemType == null || itemType.isBlank()) {
			throw new BadRequestException("'itemType' not provided");
		}
		schemaService.requireValidItemType(itemType);

		Map<String, Object> json = new LinkedHashMap<>();
		json.put("itemType", itemType);
		for (String field : schemaService.getFieldsForType(itemType)) {
			json.put(field, "");
		}
		List<String> creatorTypes = schemaService.getCreatorTypesForType(itemType);
		if (!creatorTypes.isEmpty() && !itemType.equals("note") && !itemType.equals("attachment")) {
			json.put("creators", List.of(Map.of("creatorType", creatorTypes.get(0), "firstName", "", "lastName", "")));
		}
		if (itemType.equals("note") || itemType.equals("attachment")) {
			json.put("note", "");
		}
		json.put("tags", List.of());
		json.put("collections", List.of());
		json.put("relations", Map.of());
		return json;
	}
}