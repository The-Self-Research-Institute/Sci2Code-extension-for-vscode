package self.research.ontology.dataserver.exception;

import org.springframework.http.HttpStatus;

/** E.g. group name/slug already in use. */
public class ConflictException extends DataserverException {
	public ConflictException(String message) {
		super(HttpStatus.CONFLICT, message);
	}
}