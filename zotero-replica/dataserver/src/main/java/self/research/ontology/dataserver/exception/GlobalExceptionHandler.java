package self.research.ontology.dataserver.exception;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;

/**
 * Error response shape mirrors ontology-auth's own GlobalExceptionHandler
 * ({timestamp, status, error, message, path}) — the richest, most consistent
 * error shape already established in the OntoCode monorepo. No shared base
 * class exists to extend (per the earlier investigation), so this is a fresh,
 * self-contained implementation following that same convention.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(DataserverException.class)
	public ResponseEntity<Map<String, Object>> handleDataserverException(DataserverException ex, WebRequest request) {
		return build(ex.getStatus(), ex.getStatus().getReasonPhrase(), ex.getMessage(), request);
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex, WebRequest request) {
		Map<String, Object> body = baseBody(HttpStatus.BAD_REQUEST, "Validation Failed", request);
		Map<String, String> errors = new LinkedHashMap<>();
		ex.getBindingResult().getFieldErrors().forEach(fe -> errors.put(fe.getField(), fe.getDefaultMessage()));
		body.put("errors", errors);
		body.put("message", "Request validation failed");
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
	}

	@ExceptionHandler(AccessDeniedException.class)
	public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex, WebRequest request) {
		return build(HttpStatus.FORBIDDEN, "Access Denied", "Forbidden", request);
	}

	@ExceptionHandler(AuthenticationException.class)
	public ResponseEntity<Map<String, Object>> handleAuthentication(AuthenticationException ex, WebRequest request) {
		return build(HttpStatus.UNAUTHORIZED, "Unauthorized", "Authentication required", request);
	}

	@ExceptionHandler(IllegalArgumentException.class)
	public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex, WebRequest request) {
		return build(HttpStatus.BAD_REQUEST, "Bad Request", ex.getMessage(), request);
	}

	/**
	 * A required {@code @RequestParam} that's missing (e.g. Phase 9's
	 * {@code ?since=} on {@code /deleted}, which PHP itself 400s on) would
	 * otherwise fall through to the generic Exception handler below and
	 * incorrectly report 500 instead of 400 — same class of gap as the
	 * NoResourceFoundException fix from the Phase 2 checkpoint.
	 */
	@ExceptionHandler(org.springframework.web.bind.MissingServletRequestParameterException.class)
	public ResponseEntity<Map<String, Object>> handleMissingParam(
			org.springframework.web.bind.MissingServletRequestParameterException ex, WebRequest request) {
		return build(HttpStatus.BAD_REQUEST, "Bad Request", ex.getMessage(), request);
	}

	/**
	 * Spring MVC throws this for any request matching no controller AND no
	 * static resource. Without this handler it would otherwise fall through to
	 * the generic Exception handler below and incorrectly report 500 instead
	 * of 404 — caught during Phase 2 testing, not a theoretical concern.
	 */
	@ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
	public ResponseEntity<Map<String, Object>> handleNoResourceFound(
			org.springframework.web.servlet.resource.NoResourceFoundException ex, WebRequest request) {
		return build(HttpStatus.NOT_FOUND, "Not Found", "No such endpoint", request);
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex, WebRequest request) {
		log.error("Unhandled exception", ex);
		return build(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error", "An error occurred", request);
	}

	private ResponseEntity<Map<String, Object>> build(HttpStatus status, String error, String message, WebRequest request) {
		Map<String, Object> body = baseBody(status, error, request);
		body.put("message", message);
		return ResponseEntity.status(status).body(body);
	}

	private Map<String, Object> baseBody(HttpStatus status, String error, WebRequest request) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("timestamp", LocalDateTime.now().toString());
		body.put("status", status.value());
		body.put("error", error);
		body.put("path", request.getDescription(false).replace("uri=", ""));
		return body;
	}
}