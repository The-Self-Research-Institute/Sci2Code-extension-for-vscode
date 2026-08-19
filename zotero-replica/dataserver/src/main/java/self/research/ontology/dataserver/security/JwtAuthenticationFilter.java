package self.research.ontology.dataserver.security;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Validates the Authorization: Bearer JWT on every request. On ANY failure
 * (missing header, expired, bad signature, malformed, missing identity claim)
 * this filter simply does not populate the SecurityContext and lets the
 * request continue unauthenticated — SecurityConfig's authorizeHttpRequests
 * rules then reject it (401) for any non-public path.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final JwtService jwtService;

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
				AuthenticatedUser user = jwtService.parseAndValidate(token);

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