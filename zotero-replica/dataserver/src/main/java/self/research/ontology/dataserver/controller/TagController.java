package self.research.ontology.dataserver.controller;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import self.research.ontology.dataserver.dto.TagResponse;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.security.AuthenticatedUser;
import self.research.ontology.dataserver.service.ItemService;
import self.research.ontology.dataserver.service.LibraryAccessResolver;
import self.research.ontology.dataserver.service.PermissionService;
import self.research.ontology.dataserver.service.TagService;

/**
 * Maps to PHP TagsController::tags() (#31-38). PHP allows only HEAD/GET/
 * DELETE on tags — there is no create/update endpoint; tags change only via
 * item writes (see ItemController/ItemService).
 */
@RestController
@RequiredArgsConstructor
public class TagController {

	private final TagService tagService;
	private final ItemService itemService;
	private final LibraryAccessResolver libraryAccessResolver;
	private final PermissionService permissionService;

	/** #31 */
	@GetMapping({"/users/{ownerId}/tags", "/groups/{ownerId}/tags"})
	public List<TagResponse> listTags(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam(required = false) String tag,
			@RequestParam(required = false) String q,
			@RequestParam(required = false) String qmode,
			@RequestParam(required = false, defaultValue = "title") String sort,
			@RequestParam(required = false, defaultValue = "asc") String direction,
			@RequestParam(required = false) Integer start,
			@RequestParam(required = false) Integer limit) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return tagService.listTags(library, tag, q, qmode, sort, direction, start, limit);
	}

	/** #32 */
	@GetMapping({"/users/{ownerId}/tags/{name}", "/groups/{ownerId}/tags/{name}"})
	public TagResponse getTag(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String name,
			@AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return tagService.getTag(library, name);
	}

	/** #37 — PHP's format is a single query param, {@code ?tag=a || b || c} (OR-list), not repeated params. */
	@DeleteMapping({"/users/{ownerId}/tags", "/groups/{ownerId}/tags"})
	public ResponseEntity<Void> deleteTags(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@RequestParam("tag") String tagParam) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);
		tagService.deleteTags(library, TagService.splitOrList(tagParam), ifUnmodifiedSinceVersion);
		return ResponseEntity.noContent().build();
	}

	/** #33/#34/#35: tags used within all/top/trashed items. */
	@GetMapping({"/users/{ownerId}/items/tags", "/groups/{ownerId}/items/tags"})
	public List<TagResponse> tagsForAllItems(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return tagService.tagsFromItems(itemService.listAll(library));
	}

	@GetMapping({"/users/{ownerId}/items/top/tags", "/groups/{ownerId}/items/top/tags"})
	public List<TagResponse> tagsForTopItems(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return tagService.tagsFromItems(itemService.listTop(library));
	}

	@GetMapping({"/users/{ownerId}/items/trash/tags", "/groups/{ownerId}/items/trash/tags"})
	public List<TagResponse> tagsForTrashItems(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return tagService.tagsFromItems(itemService.listTrash(library));
	}

	/** #36: tags used within a collection's items (and its top-only variant). */
	@GetMapping({"/users/{ownerId}/collections/{collectionKey}/items/tags",
		"/groups/{ownerId}/collections/{collectionKey}/items/tags"})
	public List<TagResponse> tagsForCollectionItems(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String collectionKey,
			@AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return tagService.tagsFromItems(itemService.listByCollection(library, collectionKey, false));
	}

	@GetMapping({"/users/{ownerId}/collections/{collectionKey}/items/top/tags",
		"/groups/{ownerId}/collections/{collectionKey}/items/top/tags"})
	public List<TagResponse> tagsForCollectionTopItems(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String collectionKey,
			@AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return tagService.tagsFromItems(itemService.listByCollection(library, collectionKey, true));
	}

	/** #38: tags on a single collection (all its items) or a single item. */
	@GetMapping({"/users/{ownerId}/collections/{collectionKey}/tags",
		"/groups/{ownerId}/collections/{collectionKey}/tags"})
	public List<TagResponse> tagsForCollection(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String collectionKey,
			@AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return tagService.tagsFromItems(itemService.listByCollection(library, collectionKey, false));
	}

	@GetMapping({"/users/{ownerId}/items/{itemKey}/tags", "/groups/{ownerId}/items/{itemKey}/tags"})
	public List<TagResponse> tagsForItem(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String itemKey,
			@AuthenticationPrincipal AuthenticatedUser caller) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);
		return tagService.tagsFromItems(List.of(itemService.get(library, itemKey)));
	}
}