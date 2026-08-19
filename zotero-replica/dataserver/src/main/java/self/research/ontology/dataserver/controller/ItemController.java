package self.research.ontology.dataserver.controller;

import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import self.research.ontology.dataserver.dto.ItemQueryParams;
import self.research.ontology.dataserver.dto.ItemResponseMapper;
import self.research.ontology.dataserver.dto.WriteReport;
import self.research.ontology.dataserver.model.Item;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.security.AuthenticatedUser;
import self.research.ontology.dataserver.service.ItemService;
import self.research.ontology.dataserver.service.LibraryAccessResolver;
import self.research.ontology.dataserver.service.PermissionService;
import self.research.ontology.dataserver.util.PaginationUtil;

/**
 * Maps to PHP ItemsController::items() (#3-16; #17-21 Attachments/Files are
 * implemented separately in AttachmentController/AttachmentService —
 * Phase 7; the URL-translation sub-behavior of #15 depends on the separate
 * Zotero translation-server subsystem, out of scope for this batch — bulk/
 * plain-JSON item creation is implemented).
 * <p>
 * Phase 8 adds ad-hoc filtering (q/qmode/itemType/tag/since/sort/direction —
 * see {@link ItemQueryParams}/{@code ItemService.applyQuery}) and pagination
 * (start/limit, Total-Results/Link headers — see {@link PaginationUtil}) to
 * every listing endpoint below. This is an additive change to Batch 1's
 * response shape (new optional query params, new response headers) — the
 * JSON body shape, URLs, and status codes are unchanged.
 */
@RestController
@RequiredArgsConstructor
public class ItemController {

	private final ItemService itemService;
	private final LibraryAccessResolver libraryAccessResolver;
	private final PermissionService permissionService;

	/** #3 */
	@GetMapping({"/users/{ownerId}/items/{key}", "/groups/{ownerId}/items/{key}"})
	public Map<String, Object> getItem(HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return ItemResponseMapper.toResponse(itemService.get(library, key), library);
	}

	/** #4 — create-or-update-at-key. */
	@PutMapping({"/users/{ownerId}/items/{key}", "/groups/{ownerId}/items/{key}"})
	public ResponseEntity<Map<String, Object>> putItem(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@RequestBody Map<String, Object> body) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);

		if (itemService.exists(library, key)) {
			Item updated = itemService.update(library, key, body, ifUnmodifiedSinceVersion);
			return ResponseEntity.ok(ItemResponseMapper.toResponse(updated, library));
		}
		Item created = itemService.createAtKey(library, key, body);
		return ResponseEntity.status(HttpStatus.CREATED).body(ItemResponseMapper.toResponse(created, library));
	}

	/** #4 — PATCH (partial semantics not modeled in this batch; same field-merge behavior as PUT on an existing item). */
	@PatchMapping({"/users/{ownerId}/items/{key}", "/groups/{ownerId}/items/{key}"})
	public Map<String, Object> patchItem(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@RequestBody Map<String, Object> body) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		return ItemResponseMapper.toResponse(itemService.update(library, key, body, ifUnmodifiedSinceVersion), library);
	}

	/** #5 */
	@DeleteMapping({"/users/{ownerId}/items/{key}", "/groups/{ownerId}/items/{key}"})
	public ResponseEntity<Void> deleteItem(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		itemService.delete(library, key, ifUnmodifiedSinceVersion);
		return ResponseEntity.noContent().build();
	}

	/** #6 */
	@DeleteMapping({"/users/{ownerId}/collections/{collectionKey}/items/{itemKey}",
		"/groups/{ownerId}/collections/{collectionKey}/items/{itemKey}"})
	public ResponseEntity<Void> removeFromCollection(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String collectionKey,
			@PathVariable String itemKey, @AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		itemService.removeFromCollection(library, collectionKey, itemKey);
		return ResponseEntity.noContent().build();
	}

	/** #7 */
	@GetMapping({"/users/{ownerId}/items/top", "/groups/{ownerId}/items/top"})
	public ResponseEntity<List<Map<String, Object>>> listTop(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam(required = false) String q, @RequestParam(required = false) String qmode,
			@RequestParam(required = false) String itemType, @RequestParam(required = false) String tag,
			@RequestParam(required = false) Long since, @RequestParam(required = false) String sort,
			@RequestParam(required = false) String direction, @RequestParam(required = false) Integer start,
			@RequestParam(required = false) Integer limit) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		List<Item> items = itemService.applyQuery(itemService.listTop(library),
			new ItemQueryParams(q, qmode, itemType, tag, since, sort, direction));
		return respond(items, library, start, limit, request);
	}

	/** #8 */
	@GetMapping({"/users/{ownerId}/items/trash", "/groups/{ownerId}/items/trash"})
	public ResponseEntity<List<Map<String, Object>>> listTrash(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam(required = false) String q, @RequestParam(required = false) String qmode,
			@RequestParam(required = false) String itemType, @RequestParam(required = false) String tag,
			@RequestParam(required = false) Long since, @RequestParam(required = false) String sort,
			@RequestParam(required = false) String direction, @RequestParam(required = false) Integer start,
			@RequestParam(required = false) Integer limit) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		List<Item> items = itemService.applyQuery(itemService.listTrash(library),
			new ItemQueryParams(q, qmode, itemType, tag, since, sort, direction));
		return respond(items, library, start, limit, request);
	}

	/** #9 */
	@GetMapping({"/users/{ownerId}/items/{key}/children", "/groups/{ownerId}/items/{key}/children"})
	public ResponseEntity<List<Map<String, Object>>> listChildren(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam(required = false) Integer start, @RequestParam(required = false) Integer limit) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return respond(itemService.listChildren(library, key), library, start, limit, request);
	}

	/** #11 */
	@GetMapping({"/users/{ownerId}/collections/{collectionKey}/items",
		"/groups/{ownerId}/collections/{collectionKey}/items"})
	public ResponseEntity<List<Map<String, Object>>> listByCollection(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String collectionKey,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam(required = false) String q, @RequestParam(required = false) String qmode,
			@RequestParam(required = false) String itemType, @RequestParam(required = false) String tag,
			@RequestParam(required = false) Long since, @RequestParam(required = false) String sort,
			@RequestParam(required = false) String direction, @RequestParam(required = false) Integer start,
			@RequestParam(required = false) Integer limit) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		List<Item> items = itemService.applyQuery(itemService.listByCollection(library, collectionKey, false),
			new ItemQueryParams(q, qmode, itemType, tag, since, sort, direction));
		return respond(items, library, start, limit, request);
	}

	/** #11 (top-only variant) */
	@GetMapping({"/users/{ownerId}/collections/{collectionKey}/items/top",
		"/groups/{ownerId}/collections/{collectionKey}/items/top"})
	public ResponseEntity<List<Map<String, Object>>> listByCollectionTop(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String collectionKey,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam(required = false) String q, @RequestParam(required = false) String qmode,
			@RequestParam(required = false) String itemType, @RequestParam(required = false) String tag,
			@RequestParam(required = false) Long since, @RequestParam(required = false) String sort,
			@RequestParam(required = false) String direction, @RequestParam(required = false) Integer start,
			@RequestParam(required = false) Integer limit) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		List<Item> items = itemService.applyQuery(itemService.listByCollection(library, collectionKey, true),
			new ItemQueryParams(q, qmode, itemType, tag, since, sort, direction));
		return respond(items, library, start, limit, request);
	}

	/** #12 */
	@PostMapping({"/users/{ownerId}/collections/{collectionKey}/items",
		"/groups/{ownerId}/collections/{collectionKey}/items"})
	public ResponseEntity<Void> addItemsToCollection(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String collectionKey,
			@AuthenticationPrincipal AuthenticatedUser caller, @RequestBody List<String> itemKeys) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		itemService.addToCollection(library, collectionKey, itemKeys);
		return ResponseEntity.noContent().build();
	}

	/** #14 */
	@GetMapping({"/users/{ownerId}/items", "/groups/{ownerId}/items"})
	public ResponseEntity<List<Map<String, Object>>> listAll(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam(required = false) String q, @RequestParam(required = false) String qmode,
			@RequestParam(required = false) String itemType, @RequestParam(required = false) String tag,
			@RequestParam(required = false) Long since, @RequestParam(required = false) String sort,
			@RequestParam(required = false) String direction, @RequestParam(required = false) Integer start,
			@RequestParam(required = false) Integer limit) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		List<Item> items = itemService.applyQuery(itemService.listAll(library),
			new ItemQueryParams(q, qmode, itemType, tag, since, sort, direction));
		return respond(items, library, start, limit, request);
	}

	/** #15 (bulk create; URL-translation sub-feature not implemented) */
	@PostMapping({"/users/{ownerId}/items", "/groups/{ownerId}/items"})
	public WriteReport<Map<String, Object>> createBatch(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestBody List<Map<String, Object>> bodies) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		return itemService.createBatch(library, bodies).map(i -> ItemResponseMapper.toResponse(i, library));
	}

	/** #16 */
	@DeleteMapping({"/users/{ownerId}/items", "/groups/{ownerId}/items"})
	public ResponseEntity<Void> deleteBatch(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@RequestParam("itemKey") String itemKeyParam) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		itemService.deleteBatch(library, List.of(itemKeyParam.split(",")), ifUnmodifiedSinceVersion);
		return ResponseEntity.noContent().build();
	}

	private ResponseEntity<List<Map<String, Object>>> respond(
			List<Item> items, Library library, Integer start, Integer limit, HttpServletRequest request) {
		List<Map<String, Object>> mapped = items.stream().map(i -> ItemResponseMapper.toResponse(i, library)).toList();
		return PaginationUtil.paginate(mapped, start, limit, request);
	}
}