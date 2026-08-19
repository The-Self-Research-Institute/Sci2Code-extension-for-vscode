package self.research.ontology.dataserver.exception;

import org.springframework.http.HttpStatus;

/**
 * PHP equivalent: ApiController::e428(). Thrown when a required
 * If-Unmodified-Since-Version header (or JSON "version" property) is missing
 * on a write that requires one (e.g. DELETE).
 */
public class PreconditionRequiredException extends DataserverException {
	public PreconditionRequiredException(String message) {
		super(HttpStatus.PRECONDITION_REQUIRED, message);
	}
}