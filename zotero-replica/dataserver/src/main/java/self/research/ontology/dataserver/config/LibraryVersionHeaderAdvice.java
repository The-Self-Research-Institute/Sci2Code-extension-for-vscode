package self.research.ontology.dataserver.config;

import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.service.LibraryAccessResolver;

/**
 * Stamps {@code Last-Modified-Version} on every response that actually
 * carries a JSON body — mirrors PHP's ApiController.php, which sets this
 * header on EVERY response once a library has been resolved for the
 * request. {@code ResponseBodyAdvice#beforeBodyWrite} runs immediately
 * before the message converter serializes the body, which is the reason
 * this exists SEPARATELY from {@link LibraryVersionHeaderInterceptor}:
 * {@code HandlerInterceptor#postHandle} runs after handler invocation, by
 * which point a JSON body may already be streaming as chunked output
 * (committing the response) — {@code response.setHeader(...)} in postHandle
 * then silently no-ops. This advice fixes that for every body-bearing
 * response; the interceptor still covers genuinely empty-body responses
 * (e.g. the {@code ?info=1} attachment metadata endpoint), where no
 * message-converter body write ever happens and postHandle is reliable.
 */
@ControllerAdvice
public class LibraryVersionHeaderAdvice implements ResponseBodyAdvice<Object> {

	@Override
	public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
		return true;
	}

	@Override
	public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType selectedContentType,
			Class<? extends HttpMessageConverter<?>> selectedConverterType, ServerHttpRequest request, ServerHttpResponse response) {
		if (request instanceof ServletServerHttpRequest servletRequest) {
			Object attr = servletRequest.getServletRequest().getAttribute(LibraryAccessResolver.RESOLVED_LIBRARY_ATTR);
			if (attr instanceof Library library) {
				response.getHeaders().set("Last-Modified-Version", String.valueOf(library.getVersion()));
			}
		}
		return body;
	}
}