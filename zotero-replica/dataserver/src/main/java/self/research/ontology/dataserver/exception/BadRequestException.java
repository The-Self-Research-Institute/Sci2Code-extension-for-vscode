package self.research.ontology.dataserver.exception;

import org.springframework.http.HttpStatus;

/** PHP equivalent: ApiController::e400(). */
public class BadRequestException extends DataserverException {
	public BadRequestException(String message) {
		super(HttpStatus.BAD_REQUEST, message);
	}
}