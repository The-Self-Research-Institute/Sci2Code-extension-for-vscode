package self.research.ontology.dataserver.controller;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import self.research.ontology.dataserver.dto.SearchRequest;
import self.research.ontology.dataserver.dto.SearchResponse;
import self.research.ontology.dataserver.dto.WriteReport;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.model.SavedSearch;
import self.research.ontology.dataserver.security.AuthenticatedUser;
import self.research.ontology.dataserver.service.LibraryAccessResolver;
import self.research.ontology.dataserver.service.PermissionService;
import self.research.ontology.dataserver.service.SearchService;

/**
 * Maps to PHP SearchesController::searches() (#39-44). Same dual
 * {@code /users/{id}/...} / {@code /groups/{id}/...} shape as Collections.
 */
@RestController
@RequiredArgsConstructor
public class SearchController {

	private final SearchService searchService;
	private final LibraryAccessResolver libraryAccessResolver;
	private final PermissionService permissionService;

	/** #39 */
	@GetMapping({"/users/{ownerId}/searches/{key}", "/groups/{ownerId}/searches/{key}"})
	public SearchResponse getSearch(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return SearchResponse.from(searchService.get(library, key), library);
	}

	/** #40 — create-or-update-at-key. */
	@PutMapping({"/users/{ownerId}/searches/{key}", "/groups/{ownerId}/searches/{key}"})
	public ResponseEntity<SearchResponse> putSearch(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@Valid @RequestBody SearchRequest req) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);

		SavedSearch result;
		if (searchService.exists(library, key)) {
			result = searchService.update(library, key, req, ifUnmodifiedSinceVersion);
			return ResponseEntity.ok(SearchResponse.from(result, library));
		}
		result = searchService.createAtKey(library, key, req);
		return ResponseEntity.status(HttpStatus.CREATED).body(SearchResponse.from(result, library));
	}

	/** #40 — PATCH treated the same as PUT for an existing object. */
	@PatchMapping({"/users/{ownerId}/searches/{key}", "/groups/{ownerId}/searches/{key}"})
	public SearchResponse patchSearch(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@Valid @RequestBody SearchRequest req) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		return SearchResponse.from(searchService.update(library, key, req, ifUnmodifiedSinceVersion), library);
	}

	/** #41 */
	@DeleteMapping({"/users/{ownerId}/searches/{key}", "/groups/{ownerId}/searches/{key}"})
	public ResponseEntity<Void> deleteSearch(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		searchService.delete(library, key, ifUnmodifiedSinceVersion);
		return ResponseEntity.noContent().build();
	}

	/** #40 (multi-object POST): batch create/update. */
	@PostMapping({"/users/{ownerId}/searches", "/groups/{ownerId}/searches"})
	public WriteReport<SearchResponse> createOrUpdateBatch(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestBody List<@Valid SearchRequest> requests) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		return searchService.createOrUpdateBatch(library, requests).map(s -> SearchResponse.from(s, library));
	}

	/** #41 — PHP's format is a single comma-separated query param (?searchKey=A,B,C). */
	@DeleteMapping({"/users/{ownerId}/searches", "/groups/{ownerId}/searches"})
	public ResponseEntity<Void> deleteBatch(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@RequestParam("searchKey") String searchKeyParam) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		searchService.deleteBatch(library, List.of(searchKeyParam.split(",")), ifUnmodifiedSinceVersion);
		return ResponseEntity.noContent().build();
	}

	/** #42 */
	@GetMapping({"/users/{ownerId}/searches", "/groups/{ownerId}/searches"})
	public List<SearchResponse> listAll(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam(required = false) Long since) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return searchService.filterSince(searchService.listAll(library), since).stream()
			.map(s -> SearchResponse.from(s, library)).toList();
	}
}