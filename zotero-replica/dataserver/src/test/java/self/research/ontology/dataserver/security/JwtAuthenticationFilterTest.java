package self.research.ontology.dataserver.security;

import java.util.List;
import java.util.Optional;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;

import self.research.ontology.dataserver.service.ApiKeyService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Verifies the filter dispatches on credential shape (JWT vs. {@code rk_}-
 * prefixed API key) to the SAME authenticated-or-not outcome a real request
 * would see — this is the closest thing to "invalid/valid API key -> 401/200"
 * that's testable without a running HTTP server (see JwtAuthenticationFilter's
 * class javadoc for the full contract this exercises).
 */
@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

	private static final String TEST_SECRET =
		"ZGF0YXNlcnZlci10ZXN0LWp3dC1zZWNyZXQta2V5LWZvci11bml0LXRlc3RzLW9ubHktbm90LWZvci1wcm9k";

	@Mock
	private ApiKeyService apiKeyService;

	@Mock
	private HttpServletRequest request;

	@Mock
	private HttpServletResponse response;

	@Mock
	private FilterChain filterChain;

	private JwtService jwtService;
	private JwtAuthenticationFilter filter;

	@BeforeEach
	void setUp() {
		jwtService = new JwtService(TEST_SECRET);
		filter = new JwtAuthenticationFilter(jwtService, apiKeyService);
	}

	@AfterEach
	void clearContext() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void validJwt_authenticatesAsClaimedUser() throws Exception {
		String token = jwtService.generateToken("researcher@example.com", "user-1", List.of("ROLE_USER"));
		when(request.getHeader("Authorization")).thenReturn("Bearer " + token);

		filter.doFilterInternal(request, response, filterChain);

		AuthenticatedUser principal = (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
		assertThat(principal.email()).isEqualTo("researcher@example.com");
		assertThat(principal.userId()).isEqualTo("user-1");
		verify(filterChain).doFilter(request, response);
	}

	@Test
	void validApiKey_authenticatesAsTheKeysOwner_viaApiKeyServiceNotJwtParsing() throws Exception {
		String apiKey = ApiKeyService.PREFIX + "some-generated-token";
		when(request.getHeader("Authorization")).thenReturn("Bearer " + apiKey);
		when(apiKeyService.authenticate(apiKey))
			.thenReturn(Optional.of(new AuthenticatedUser("researcher@example.com", "user-1", List.of("ROLE_USER"))));

		filter.doFilterInternal(request, response, filterChain);

		AuthenticatedUser principal = (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
		assertThat(principal.email()).isEqualTo("researcher@example.com");
		verify(filterChain).doFilter(request, response);
	}

	@Test
	void unknownOrRevokedApiKey_leavesRequestUnauthenticated() throws Exception {
		String apiKey = ApiKeyService.PREFIX + "revoked-or-fake";
		when(request.getHeader("Authorization")).thenReturn("Bearer " + apiKey);
		when(apiKeyService.authenticate(apiKey)).thenReturn(Optional.empty());

		filter.doFilterInternal(request, response, filterChain);

		assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
		verify(filterChain).doFilter(request, response); // still proceeds; SecurityConfig's authorizeHttpRequests rejects with 401
	}

	@Test
	void missingAuthorizationHeader_leavesRequestUnauthenticated() throws Exception {
		when(request.getHeader("Authorization")).thenReturn(null);

		filter.doFilterInternal(request, response, filterChain);

		assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
	}

	@Test
	void malformedJwt_leavesRequestUnauthenticated() throws Exception {
		when(request.getHeader("Authorization")).thenReturn("Bearer not-a-real-jwt");

		filter.doFilterInternal(request, response, filterChain);

		assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
	}
}
