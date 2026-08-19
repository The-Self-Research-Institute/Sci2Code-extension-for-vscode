package self.research.ontology.dataserver.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.service.LibraryAccessResolver;

/**
 * Stamps every response with {@code Last-Modified-Version} — mirrors PHP's
 * ApiController.php, which sets this header on EVERY response (not just
 * writes) once a library has been resolved for the request. Reads the
 * Library stashed by LibraryAccessResolver#resolve rather than re-resolving
 * it, so this has zero extra permission/DB cost per request.
 */
@Component
public class LibraryVersionHeaderInterceptor implements HandlerInterceptor {

	@Override
	public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler,
			org.springframework.web.servlet.ModelAndView modelAndView) {
		Object attr = request.getAttribute(LibraryAccessResolver.RESOLVED_LIBRARY_ATTR);
		if (attr instanceof Library library) {
			response.setHeader("Last-Modified-Version", String.valueOf(library.getVersion()));
		}
	}
}