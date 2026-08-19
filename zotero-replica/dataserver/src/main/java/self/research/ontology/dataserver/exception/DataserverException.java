package self.research.ontology.dataserver.exception;

import org.springframework.http.HttpStatus;

/**
 * Base for all dataserver-specific error conditions. Every subclass carries the
 * HTTP status that {@link GlobalExceptionHandler} should respond with, mirroring
 * the PHP ApiController::eXXX() shortcut methods' status/behavior without
 * reproducing their implementation.
 */
public abstract class DataserverException extends RuntimeException {

	private final HttpStatus status;

	protected DataserverException(HttpStatus status, String message) {
		super(message);
		this.status = status;
	}

	public HttpStatus getStatus() {
		return status;
	}
}