package self.research.ontology.dataserver.exception;

import org.springframework.http.HttpStatus;

/** PHP equivalent: ApiController::e404(). */
public class NotFoundException extends DataserverException {
	public NotFoundException(String message) {
		super(HttpStatus.NOT_FOUND, message);
	}
}