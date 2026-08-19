package self.research.ontology.dataserver.exception;

import org.springframework.http.HttpStatus;

/**
 * PHP equivalent: ApiController::e403(). Thrown when an authenticated caller
 * lacks the required access/write permission on a target library or group —
 * distinct from an authentication failure (no/invalid JWT), which yields 401.
 */
public class ForbiddenException extends DataserverException {
	public ForbiddenException(String message) {
		super(HttpStatus.FORBIDDEN, message);
	}
}