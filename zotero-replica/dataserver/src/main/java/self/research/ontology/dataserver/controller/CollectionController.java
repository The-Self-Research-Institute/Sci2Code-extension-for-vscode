package self.research.ontology.dataserver.controller;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import self.research.ontology.dataserver.dto.CollectionRequest;
import self.research.ontology.dataserver.dto.CollectionResponse;
import self.research.ontology.dataserver.dto.WriteReport;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.model.LibraryCollection;
import self.research.ontology.dataserver.security.AuthenticatedUser;
import self.research.ontology.dataserver.service.CollectionService;
import self.research.ontology.dataserver.service.LibraryAccessResolver;
import self.research.ontology.dataserver.service.PermissionService;

/**
 * Maps to PHP CollectionsController::collections() (#23-30 in the API
 * classification). A single controller handles both {@code /users/{id}/...}
 * and {@code /groups/{id}/...} via LibraryAccessResolver#resolve, mirroring
 * how the PHP action method handles both via objectUserID/objectGroupID.
 */
@RestController
@RequiredArgsConstructor
public class CollectionController {

	private final CollectionService collectionService;
	private final LibraryAccessResolver libraryAccessResolver;
	private final PermissionService permissionService;

	/** #23 */
	@GetMapping({"/users/{ownerId}/collections/{key}", "/groups/{ownerId}/collections/{key}"})
	public CollectionResponse getCollection(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return CollectionResponse.from(collectionService.get(library, key), library);
	}

	/** #24 — create-or-update-at-key (Zotero's key-based PUT semantics). */
	@PutMapping({"/users/{ownerId}/collections/{key}", "/groups/{ownerId}/collections/{key}"})
	public ResponseEntity<CollectionResponse> putCollection(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@Valid @RequestBody CollectionRequest req) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);

		LibraryCollection result;
		if (collectionService.exists(library, key)) {
			result = collectionService.update(library, key, req, ifUnmodifiedSinceVersion);
			return ResponseEntity.ok(CollectionResponse.from(result, library));
		}
		result = collectionService.createAtKey(library, key, req);
		return ResponseEntity.status(HttpStatus.CREATED).body(CollectionResponse.from(result, library));
	}

	/** #24 — PATCH treated the same as PUT for an existing object (partial semantics not modeled in this batch). */
	@PatchMapping({"/users/{ownerId}/collections/{key}", "/groups/{ownerId}/collections/{key}"})
	public CollectionResponse patchCollection(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@Valid @RequestBody CollectionRequest req) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		return CollectionResponse.from(collectionService.update(library, key, req, ifUnmodifiedSinceVersion), library);
	}

	/** #25 */
	@DeleteMapping({"/users/{ownerId}/collections/{key}", "/groups/{ownerId}/collections/{key}"})
	public ResponseEntity<Void> deleteCollection(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		collectionService.delete(library, key, ifUnmodifiedSinceVersion);
		return ResponseEntity.noContent().build();
	}

	/** #26 */
	@GetMapping({"/users/{ownerId}/collections/{parentKey}/collections", "/groups/{ownerId}/collections/{parentKey}/collections"})
	public List<CollectionResponse> listChildren(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String parentKey,
			@AuthenticationPrincipal AuthenticatedUser caller, @RequestParam(required = false) Long since) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return collectionService.filterSince(collectionService.listChildren(library, parentKey), since).stream()
			.map(c -> CollectionResponse.from(c, library)).toList();
	}

	/** #27 */
	@GetMapping({"/users/{ownerId}/collections/top", "/groups/{ownerId}/collections/top"})
	public List<CollectionResponse> listTop(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam(required = false) Long since) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return collectionService.filterSince(collectionService.listTop(library), since).stream()
			.map(c -> CollectionResponse.from(c, library)).toList();
	}

	/** #28 */
	@PostMapping({"/users/{ownerId}/collections", "/groups/{ownerId}/collections"})
	public WriteReport<CollectionResponse> createOrUpdateBatch(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestBody List<@Valid CollectionRequest> requests) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		return collectionService.createOrUpdateBatch(library, requests).map(c -> CollectionResponse.from(c, library));
	}

	/** #29 — PHP's format is a single comma-separated query param (?collectionKey=A,B,C), not repeated params. */
	@DeleteMapping({"/users/{ownerId}/collections", "/groups/{ownerId}/collections"})
	public ResponseEntity<Void> deleteBatch(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@RequestParam("collectionKey") String collectionKeyParam) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		collectionService.deleteBatch(library, List.of(collectionKeyParam.split(",")), ifUnmodifiedSinceVersion);
		return ResponseEntity.noContent().build();
	}

	/** #30 */
	@GetMapping({"/users/{ownerId}/collections", "/groups/{ownerId}/collections"})
	public List<CollectionResponse> listAll(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam(required = false) Long since) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return collectionService.filterSince(collectionService.listAll(library), since).stream()
			.map(c -> CollectionResponse.from(c, library)).toList();
	}
}