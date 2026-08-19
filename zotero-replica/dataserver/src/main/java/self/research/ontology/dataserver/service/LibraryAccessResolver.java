package self.research.ontology.dataserver.service;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.exception.ForbiddenException;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.security.AuthenticatedUser;

/**
 * Resolves the target Library for a request, shared by every controller that
 * mirrors the PHP dataserver's dual {@code /users/{id}/...} /
 * {@code /groups/{id}/...} path shape (Groups, Collections, Items, ...).
 * <p>
 * DELIBERATE COMPATIBILITY DECISION: the PHP dataserver lets any caller with
 * an appropriately-scoped API key access another user's library (Keys carry
 * per-library grants). Since the Keys API is explicitly DEFERRED in this
 * project (pending Sci2Code's integration contract), and OntoCode JWTs carry
 * no per-library grants at all, {@code /users/{id}/...} paths are restricted
 * to the caller's OWN library — {@code id} must equal either their JWT
 * `userId` claim (if present) or their email. This preserves the path SHAPE
 * for compatibility while the underlying access model is necessarily
 * self-service-only until Keys are implemented.
 */
@Service
@RequiredArgsConstructor
public class LibraryAccessResolver {

	/**
	 * Request attribute key the resolved Library is stashed under, read back
	 * by LibraryVersionHeaderInterceptor to stamp every response with
	 * Last-Modified-Version (see ApiController.php's equivalent behavior) —
	 * without re-resolving/re-checking permissions a second time per request.
	 */
	public static final String RESOLVED_LIBRARY_ATTR = "self.research.ontology.dataserver.resolvedLibrary";

	private final LibraryService libraryService;

	public Library resolveUserLibrary(String pathUserId, AuthenticatedUser caller) {
		requireSelf(pathUserId, caller);
		return libraryService.resolvePersonalLibrary(caller.email());
	}

	public Library resolveGroupLibrary(String groupId) {
		return libraryService.getGroupLibrary(groupId);
	}

	public void requireSelf(String pathUserId, AuthenticatedUser caller) {
		boolean matchesEmail = pathUserId.equalsIgnoreCase(caller.email());
		boolean matchesUserId = caller.hasUserId() && pathUserId.equals(caller.userId());
		if (!matchesEmail && !matchesUserId) {
			throw new ForbiddenException("You may only access your own user library");
		}
	}

	/**
	 * Dispatches on the request's own path prefix — lets a single controller
	 * method handle both {@code /users/{ownerId}/...} and
	 * {@code /groups/{ownerId}/...} mappings, exactly mirroring how a single
	 * PHP action method (e.g. CollectionsController::collections()) handles
	 * both via objectUserID/objectGroupID, without duplicating logic per prefix.
	 */
	public Library resolve(HttpServletRequest request, String ownerId, AuthenticatedUser caller) {
		Library library = request.getRequestURI().startsWith("/groups/")
			? resolveGroupLibrary(ownerId)
			: resolveUserLibrary(ownerId, caller);
		// Stashing the SAME object reference matters: any later bumpVersion()
		// call in this request mutates it in place, so the interceptor sees
		// the post-write version, not a stale snapshot.
		request.setAttribute(RESOLVED_LIBRARY_ATTR, library);
		return library;
	}
}