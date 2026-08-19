package self.research.ontology.dataserver.config;

import java.util.List;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import self.research.ontology.dataserver.security.JwtAuthenticationFilter;

/**
 * Stateless JWT-based security (CSRF disabled — there's no cookie/session to
 * forge against; STATELESS sessions; JwtAuthenticationFilter before
 * UsernamePasswordAuthenticationFilter). Metadata/schema endpoints (itemTypes,
 * itemFields, etc.) and the replica's own /auth/** endpoints are public.
 * <p>
 * CORS is handled here (not by a gateway — the standalone replica frontend
 * talks directly to this dataserver) via a configurable allowed-origins list.
 */
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

	private final JwtAuthenticationFilter jwtAuthenticationFilter;

	@Value("${cors.allowed-origins:http://localhost:3010}")
	private String allowedOrigins;

	@Bean
	public PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}

	@Bean
	public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
		http
			.csrf(csrf -> csrf.disable())
			.cors(cors -> cors.configurationSource(corsConfigurationSource()))
			.sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(auth -> auth
				.requestMatchers(
					"/actuator/**",
					"/auth/register", "/auth/login",
					"/itemTypes", "/itemTypeFields", "/itemFields", "/itemTypeCreatorTypes",
					"/creatorFields", "/items/new", "/schema"
				).permitAll()
				.anyRequest().authenticated()
			)
			// Explicit 401 for "no/invalid identity" — Spring Security's own default
			// (Http403ForbiddenEntryPoint) would otherwise return 403 for anonymous
			// requests too, collapsing the authentication-vs-authorization distinction
			// this project's requirements explicitly call for. Authenticated-but-lacking-
			// permission cases (ForbiddenException, thrown by services) still map to 403
			// via GlobalExceptionHandler, untouched by this entry point.
			.exceptionHandling(ex -> ex.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
			.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
		return http.build();
	}

	private CorsConfigurationSource corsConfigurationSource() {
		CorsConfiguration configuration = new CorsConfiguration();
		configuration.setAllowedOrigins(List.of(allowedOrigins.split(",")).stream().map(String::trim).toList());
		configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "If-Unmodified-Since-Version"));
		configuration.setExposedHeaders(List.of("Last-Modified-Version", "Total-Results", "Link"));

		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", configuration);
		return source;
	}
}
