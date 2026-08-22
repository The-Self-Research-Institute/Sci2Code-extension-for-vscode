package self.research.ontology.dataserver.service;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import self.research.ontology.dataserver.dto.ApiKeyResponse;
import self.research.ontology.dataserver.dto.ApiKeyStatusResponse;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.model.ApiKey;
import self.research.ontology.dataserver.model.AppUser;
import self.research.ontology.dataserver.repository.ApiKeyRepository;
import self.research.ontology.dataserver.repository.UserRepository;
import self.research.ontology.dataserver.security.AuthenticatedUser;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ApiKeyServiceTest {

	@Mock
	private ApiKeyRepository apiKeyRepository;

	@Mock
	private UserRepository userRepository;

	private ApiKeyService apiKeyService;

	private final AuthenticatedUser caller = new AuthenticatedUser("researcher@example.com", "user-1", List.of("ROLE_USER"));

	@BeforeEach
	void setUp() {
		apiKeyService = new ApiKeyService(apiKeyRepository, userRepository);
	}

	private AppUser user() {
		AppUser user = new AppUser();
		user.setId("user-1");
		user.setEmail("researcher@example.com");
		user.setRoles(List.of("ROLE_USER"));
		return user;
	}

	@Test
	void generate_returnsHighEntropyPrefixedKey_andPersistsOnlyItsHash() {
		when(userRepository.findByEmailIgnoreCase("researcher@example.com")).thenReturn(Optional.of(user()));
		when(apiKeyRepository.findByUserIdAndRevokedFalse("user-1")).thenReturn(List.of());
		when(apiKeyRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		ApiKeyResponse response = apiKeyService.generate(caller);

		assertThat(response.apiKey()).startsWith(ApiKeyService.PREFIX);
		assertThat(response.apiKey().length()).isGreaterThan(30); // 32 random bytes, base64url-encoded
		assertThat(response.createdAt()).isNotNull();

		ArgumentCaptor<ApiKey> captor = ArgumentCaptor.forClass(ApiKey.class);
		verify(apiKeyRepository).save(captor.capture());
		assertThat(captor.getValue().getUserId()).isEqualTo("user-1");
		assertThat(captor.getValue().getKeyHash()).isNotEqualTo(response.apiKey());
		assertThat(captor.getValue().getKeyHash()).hasSize(64); // hex-encoded SHA-256
		assertThat(captor.getValue().isRevoked()).isFalse();
	}

	@Test
	void generate_twice_revokesThePreviousActiveKey() {
		when(userRepository.findByEmailIgnoreCase("researcher@example.com")).thenReturn(Optional.of(user()));
		ApiKey existing = new ApiKey();
		existing.setUserId("user-1");
		existing.setKeyHash("old-hash");
		when(apiKeyRepository.findByUserIdAndRevokedFalse("user-1")).thenReturn(List.of(existing));
		when(apiKeyRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		apiKeyService.generate(caller);

		ArgumentCaptor<List<ApiKey>> captor = ArgumentCaptor.forClass(List.class);
		verify(apiKeyRepository).saveAll(captor.capture());
		assertThat(captor.getValue()).hasSize(1);
		assertThat(captor.getValue().get(0).isRevoked()).isTrue();
	}

	@Test
	void authenticate_validKey_resolvesToOwningUser() {
		when(apiKeyRepository.findByUserIdAndRevokedFalse("user-1")).thenReturn(List.of());
		when(userRepository.findByEmailIgnoreCase("researcher@example.com")).thenReturn(Optional.of(user()));
		when(apiKeyRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
		ApiKeyResponse generated = apiKeyService.generate(caller);

		ArgumentCaptor<ApiKey> savedCaptor = ArgumentCaptor.forClass(ApiKey.class);
		verify(apiKeyRepository).save(savedCaptor.capture());
		String storedHash = savedCaptor.getValue().getKeyHash();

		ApiKey persisted = new ApiKey();
		persisted.setUserId("user-1");
		persisted.setKeyHash(storedHash);
		when(apiKeyRepository.findByKeyHashAndRevokedFalse(storedHash)).thenReturn(Optional.of(persisted));
		when(userRepository.findById("user-1")).thenReturn(Optional.of(user()));

		Optional<AuthenticatedUser> resolved = apiKeyService.authenticate(generated.apiKey());

		assertThat(resolved).isPresent();
		assertThat(resolved.get().email()).isEqualTo("researcher@example.com");
		assertThat(resolved.get().userId()).isEqualTo("user-1");
	}

	@Test
	void authenticate_unknownKey_resolvesEmpty() {
		when(apiKeyRepository.findByKeyHashAndRevokedFalse(anyString())).thenReturn(Optional.empty());

		assertThat(apiKeyService.authenticate("rk_totally-made-up")).isEmpty();
	}

	@Test
	void authenticate_revokedKey_resolvesEmpty() {
		// A revoked key's hash no longer matches findByKeyHashAndRevokedFalse (revoked=true excluded by the query itself).
		when(apiKeyRepository.findByKeyHashAndRevokedFalse(anyString())).thenReturn(Optional.empty());

		assertThat(apiKeyService.authenticate("rk_was-valid-once")).isEmpty();
	}

	@Test
	void status_noActiveKey_reportsNotExists() {
		when(userRepository.findByEmailIgnoreCase("researcher@example.com")).thenReturn(Optional.of(user()));
		when(apiKeyRepository.findByUserIdAndRevokedFalse("user-1")).thenReturn(List.of());

		ApiKeyStatusResponse status = apiKeyService.status(caller);

		assertThat(status.exists()).isFalse();
		assertThat(status.createdAt()).isNull();
	}

	@Test
	void status_activeKey_reportsExistsWithoutExposingTheKey() {
		when(userRepository.findByEmailIgnoreCase("researcher@example.com")).thenReturn(Optional.of(user()));
		ApiKey existing = new ApiKey();
		existing.setUserId("user-1");
		existing.setKeyHash("some-hash");
		when(apiKeyRepository.findByUserIdAndRevokedFalse("user-1")).thenReturn(List.of(existing));

		ApiKeyStatusResponse status = apiKeyService.status(caller);

		assertThat(status.exists()).isTrue();
		assertThat(status.createdAt()).isEqualTo(existing.getCreatedAt());
	}

	@Test
	void generate_accountNoLongerExists_throwsNotFound() {
		when(userRepository.findByEmailIgnoreCase("researcher@example.com")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> apiKeyService.generate(caller)).isInstanceOf(NotFoundException.class);
	}
}
