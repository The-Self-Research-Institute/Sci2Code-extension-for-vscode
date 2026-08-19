package self.research.ontology.dataserver.controller;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.security.AuthenticatedUser;
import self.research.ontology.dataserver.service.DeletedLogService;
import self.research.ontology.dataserver.service.LibraryAccessResolver;
import self.research.ontology.dataserver.service.PermissionService;

/**
 * Maps to PHP DeletedController::deleted() (#45). {@code since} is required
 * (PHP 400s if missing — see GlobalExceptionHandler's MissingServletRequest
 * ParameterException handler, added for exactly this endpoint). "settings"
 * is always an empty array: Settings/preferences sync is confirmed optional
 * client-side data in the PHP reference (not a dependency of core item/
 * collection/tag/search sync) and is out of scope for this batch.
 */
@RestController
@RequiredArgsConstructor
public class DeletedController {

	private final DeletedLogService deletedLogService;
	private final LibraryAccessResolver libraryAccessResolver;
	private final PermissionService permissionService;

	@GetMapping({"/users/{ownerId}/deleted", "/groups/{ownerId}/deleted"})
	public Map<String, Object> getDeleted(
			HttpServletRequest request, @PathVariable String ownerId, @AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam("since") long since) {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);

		Map<String, Object> result = new LinkedHashMap<>();
		result.put("collections", deletedLogService.findSince(library.getId(), "collection", since));
		result.put("items", deletedLogService.findSince(library.getId(), "item", since));
		result.put("searches", deletedLogService.findSince(library.getId(), "search", since));
		result.put("tags", deletedLogService.findSince(library.getId(), "tag", since));
		result.put("settings", List.<String>of());
		return result;
	}
}