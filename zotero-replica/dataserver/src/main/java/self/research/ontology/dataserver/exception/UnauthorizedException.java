package self.research.ontology.dataserver.exception;

import org.springframework.http.HttpStatus;

/** Invalid credentials on /auth/login — distinct from ForbiddenException (403, authenticated-but-lacks-permission). */
public class UnauthorizedException extends DataserverException {
	public UnauthorizedException(String message) {
		super(HttpStatus.UNAUTHORIZED, message);
	}
}
