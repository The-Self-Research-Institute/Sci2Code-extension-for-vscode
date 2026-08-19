package self.research.ontology.dataserver.service;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import self.research.ontology.dataserver.dto.AuthResponse;
import self.research.ontology.dataserver.exception.ConflictException;
import self.research.ontology.dataserver.exception.UnauthorizedException;
import self.research.ontology.dataserver.model.AppUser;
import self.research.ontology.dataserver.repository.UserRepository;
import self.research.ontology.dataserver.security.JwtService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

	private static final String TEST_SECRET =
		"ZGF0YXNlcnZlci10ZXN0LWp3dC1zZWNyZXQta2V5LWZvci11bml0LXRlc3RzLW9ubHktbm90LWZvci1wcm9k";

	@Mock
	private UserRepository userRepository;

	private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
	private JwtService jwtService;
	private AuthService authService;

	@BeforeEach
	void setUp() {
		jwtService = new JwtService(TEST_SECRET);
		authService = new AuthService(userRepository, passwordEncoder, jwtService);
	}

	@Test
	void register_newEmail_createsUserAndReturnsToken() {
		when(userRepository.existsByEmailIgnoreCase("researcher@example.com")).thenReturn(false);
		when(userRepository.save(any())).thenAnswer(inv -> {
			AppUser saved = inv.getArgument(0);
			saved.setId("user-1");
			return saved;
		});

		AuthResponse response = authService.register("Researcher@Example.com", "correct-horse-battery");

		assertThat(response.email()).isEqualTo("researcher@example.com");
		assertThat(response.userId()).isEqualTo("user-1");
		assertThat(response.token()).isNotBlank();

		ArgumentCaptor<AppUser> captor = ArgumentCaptor.forClass(AppUser.class);
		verify(userRepository).save(captor.capture());
		assertThat(captor.getValue().getEmail()).isEqualTo("researcher@example.com");
		assertThat(passwordEncoder.matches("correct-horse-battery", captor.getValue().getPasswordHash())).isTrue();
		assertThat(captor.getValue().getRoles()).containsExactly("ROLE_USER");
	}

	@Test
	void register_existingEmail_throwsConflict() {
		when(userRepository.existsByEmailIgnoreCase("researcher@example.com")).thenReturn(true);

		assertThatThrownBy(() -> authService.register("researcher@example.com", "correct-horse-battery"))
			.isInstanceOf(ConflictException.class);
	}

	@Test
	void login_correctPassword_returnsToken() {
		AppUser user = new AppUser();
		user.setId("user-1");
		user.setEmail("researcher@example.com");
		user.setPasswordHash(passwordEncoder.encode("correct-horse-battery"));
		user.setRoles(List.of("ROLE_USER"));
		when(userRepository.findByEmailIgnoreCase("researcher@example.com")).thenReturn(Optional.of(user));

		AuthResponse response = authService.login("researcher@example.com", "correct-horse-battery");

		assertThat(response.userId()).isEqualTo("user-1");
		assertThat(response.email()).isEqualTo("researcher@example.com");
		assertThat(jwtService.parseAndValidate(response.token()).email()).isEqualTo("researcher@example.com");
	}

	@Test
	void login_wrongPassword_throwsUnauthorized() {
		AppUser user = new AppUser();
		user.setId("user-1");
		user.setEmail("researcher@example.com");
		user.setPasswordHash(passwordEncoder.encode("correct-horse-battery"));
		when(userRepository.findByEmailIgnoreCase("researcher@example.com")).thenReturn(Optional.of(user));

		assertThatThrownBy(() -> authService.login("researcher@example.com", "wrong-password"))
			.isInstanceOf(UnauthorizedException.class);
	}

	@Test
	void login_unknownEmail_throwsUnauthorized() {
		when(userRepository.findByEmailIgnoreCase("ghost@example.com")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> authService.login("ghost@example.com", "whatever"))
			.isInstanceOf(UnauthorizedException.class);
	}
}
