package self.research.ontology.dataserver.security;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import self.research.ontology.dataserver.service.ApiKeyService;

/**
 * Validates the Authorization: Bearer credential on every request. Accepts
 * TWO distinct credential types, both resolving to the same
 * {@link AuthenticatedUser} shape so no downstream controller/service needs
 * to care which one was used:
 * <ul>
 *   <li>a Replica login JWT (see JwtService) — used by the Replica webview/app itself</li>
 *   <li>a Replica API key (see ApiKeyService, prefixed {@value ApiKeyService#PREFIX}) —
 *       the credential intended for external clients such as Sci2Code</li>
 * </ul>
 * Dispatch is by prefix, not by "try JWT then fall back" — API keys are not
 * JWT-shaped at all, so attempting JWT parsing on one would just be wasted
 * work. On ANY failure (missing header, expired/invalid JWT, unknown/revoked
 * API key) this filter simply does not populate the SecurityContext and lets
 * the request continue unauthenticated — SecurityConfig's
 * authorizeHttpRequests rules then reject it (401) for any non-public path.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final JwtService jwtService;
	private final ApiKeyService apiKeyService;

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return request.getRequestURI().startsWith("/actuator/");
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
			throws ServletException, IOException {

		String authHeader = request.getHeader("Authorization");

		if (authHeader != null && authHeader.startsWith("Bearer ")) {
			String token = authHeader.substring(7);
			try {
				AuthenticatedUser user = token.startsWith(ApiKeyService.PREFIX)
					? apiKeyService.authenticate(token).orElseThrow(() -> new BadCredentialsException("Unknown or revoked API key"))
					: jwtService.parseAndValidate(token);

				List<GrantedAuthority> authorities = user.roles() == null
					? List.of()
					: user.roles().stream().map(SimpleGrantedAuthority::new).map(GrantedAuthority.class::cast).toList();

				UsernamePasswordAuthenticationToken authentication =
					new UsernamePasswordAuthenticationToken(user, null, authorities);
				SecurityContextHolder.getContext().setAuthentication(authentication);
			}
			catch (Exception e) {
				log.debug("JWT validation failed: {} - {}", e.getClass().getSimpleName(), e.getMessage());
				SecurityContextHolder.clearContext();
			}
		}

		filterChain.doFilter(request, response);
	}
}