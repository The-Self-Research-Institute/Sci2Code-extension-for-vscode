package self.research.ontology.dataserver.exception;

import org.springframework.http.HttpStatus;

/**
 * PHP equivalent: ApiController::e412(). Thrown when a version-conditional
 * write (If-Unmodified-Since-Version, or a JSON "version" property) does not
 * match the object's/library's current version.
 */
public class PreconditionFailedException extends DataserverException {
	public PreconditionFailedException(String message) {
		super(HttpStatus.PRECONDITION_FAILED, message);
	}
}