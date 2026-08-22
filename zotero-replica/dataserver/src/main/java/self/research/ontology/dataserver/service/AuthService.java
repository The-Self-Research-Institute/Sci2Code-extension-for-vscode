package self.research.ontology.dataserver.service;

import java.util.List;

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.dto.AuthResponse;
import self.research.ontology.dataserver.exception.ConflictException;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.exception.UnauthorizedException;
import self.research.ontology.dataserver.model.AppUser;
import self.research.ontology.dataserver.repository.UserRepository;
import self.research.ontology.dataserver.security.AuthenticatedUser;
import self.research.ontology.dataserver.security.JwtService;

/**
 * Replica-owned account registration/login — the standalone authentication
 * boundary described in the decoupling architecture. Issues the same shape of
 * JWT (email/userId/roles claims) that JwtAuthenticationFilter already
 * validates, so no other service or controller needed to change to support
 * this as an identity source.
 */
@Service
@RequiredArgsConstructor
public class AuthService {

	private final UserRepository userRepository;
	private final PasswordEncoder passwordEncoder;
	private final JwtService jwtService;

	public AuthResponse register(String email, String rawPassword) {
		String normalizedEmail = email.trim().toLowerCase();
		if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
			throw new ConflictException("An account with this email already exists");
		}
		AppUser user = new AppUser();
		user.setEmail(normalizedEmail);
		user.setPasswordHash(passwordEncoder.encode(rawPassword));
		user.setRoles(List.of("ROLE_USER"));
		user = userRepository.save(user);
		return issueToken(user);
	}

	public AuthResponse login(String email, String rawPassword) {
		String normalizedEmail = email.trim().toLowerCase();
		AppUser user = userRepository.findByEmailIgnoreCase(normalizedEmail)
			.orElseThrow(() -> new UnauthorizedException("Invalid email or password"));
		if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
			throw new UnauthorizedException("Invalid email or password");
		}
		return issueToken(user);
	}

	/**
	 * Mints a fresh token for the already-authenticated caller, extending the
	 * session's effective lifetime without the user re-entering credentials -
	 * the "sliding" half of the persistent-login requirement (the VS Code
	 * extension host calls this proactively before the stored token's expiry;
	 * an already-expired token never reaches here at all, since
	 * JwtAuthenticationFilter would have rejected it first, correctly forcing
	 * a real re-login only once the session is genuinely stale).
	 */
	public AuthResponse refresh(AuthenticatedUser caller) {
		AppUser user = userRepository.findByEmailIgnoreCase(caller.email())
			.orElseThrow(() -> new NotFoundException("Account no longer exists"));
		return issueToken(user);
	}

	private AuthResponse issueToken(AppUser user) {
		String token = jwtService.generateToken(user.getEmail(), user.getId(), user.getRoles());
		return new AuthResponse(token, user.getId(), user.getEmail());
	}
}
