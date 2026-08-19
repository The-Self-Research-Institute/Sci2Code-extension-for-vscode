package self.research.ontology.dataserver.util;

import self.research.ontology.dataserver.exception.PreconditionFailedException;
import self.research.ontology.dataserver.exception.PreconditionRequiredException;

/**
 * Optimistic-concurrency check shared by Collections and Items, modeled on
 * PHP's ApiController::checkSingleObjectWriteVersion() — simplified,
 * disclosed scope reduction: the deprecated apiVersion&lt;2 If-Match/ETag path
 * is not implemented (no legacy Zotero client target exists for this
 * project), and the PATCH-vs-PUT-at-version-0 creation nuance is condensed
 * into a single "no version required to create" rule. The core behavior —
 * require If-Unmodified-Since-Version on update/delete of an EXISTING
 * object, 428 if missing, 412 if stale — is preserved.
 */
public final class VersionGuard {

	private VersionGuard() {
	}

	/** For creating a brand-new object at a caller-chosen key: no version required. */
	public static void requireForCreate() {
		// No-op — documented for symmetry/readability at call sites.
	}

	/** For updating or deleting an EXISTING object. */
	public static void requireForExisting(Long ifUnmodifiedSinceVersion, long currentVersion) {
		if (ifUnmodifiedSinceVersion == null) {
			throw new PreconditionRequiredException("If-Unmodified-Since-Version must be provided");
		}
		if (currentVersion > ifUnmodifiedSinceVersion) {
			throw new PreconditionFailedException(
				"Object has been modified since specified version (expected " + ifUnmodifiedSinceVersion + ", found " + currentVersion + ")");
		}
	}

	/**
	 * For multi-object (batch) writes, where PHP's
	 * checkLibraryIfUnmodifiedSinceVersion() is called with $required=false —
	 * confirmed directly against ItemsController.php:40-41 for bulk item
	 * delete, and inherited by Collections/Searches from the same shared
	 * Zotero_DataObjects trait. Unlike {@link #requireForExisting}, a missing
	 * header is NOT an error here — it simply skips the check. A present
	 * header is still enforced (412 if stale).
	 */
	public static void checkIfPresent(Long ifUnmodifiedSinceVersion, long currentVersion) {
		if (ifUnmodifiedSinceVersion != null && currentVersion > ifUnmodifiedSinceVersion) {
			throw new PreconditionFailedException(
				"Object has been modified since specified version (expected " + ifUnmodifiedSinceVersion + ", found " + currentVersion + ")");
		}
	}
}