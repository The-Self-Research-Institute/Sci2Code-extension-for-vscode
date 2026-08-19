package self.research.ontology.dataserver.util;

import org.junit.jupiter.api.Test;

import self.research.ontology.dataserver.exception.PreconditionFailedException;
import self.research.ontology.dataserver.exception.PreconditionRequiredException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VersionGuardTest {

	@Test
	void requireForCreate_neverThrows() {
		assertThatCode(VersionGuard::requireForCreate).doesNotThrowAnyException();
	}

	@Test
	void requireForExisting_nullVersion_throws428() {
		assertThatThrownBy(() -> VersionGuard.requireForExisting(null, 3L))
			.isInstanceOf(PreconditionRequiredException.class);
	}

	@Test
	void requireForExisting_staleVersion_throws412() {
		assertThatThrownBy(() -> VersionGuard.requireForExisting(3L, 5L))
			.isInstanceOf(PreconditionFailedException.class);
	}

	@Test
	void requireForExisting_currentVersion_doesNotThrow() {
		assertThatCode(() -> VersionGuard.requireForExisting(5L, 5L)).doesNotThrowAnyException();
	}

	@Test
	void checkIfPresent_nullVersion_doesNotThrow_headerIsOptional() {
		assertThatCode(() -> VersionGuard.checkIfPresent(null, 999L)).doesNotThrowAnyException();
	}

	@Test
	void checkIfPresent_presentAndStale_throws412() {
		assertThatThrownBy(() -> VersionGuard.checkIfPresent(3L, 5L))
			.isInstanceOf(PreconditionFailedException.class);
	}

	@Test
	void checkIfPresent_presentAndCurrent_doesNotThrow() {
		assertThatCode(() -> VersionGuard.checkIfPresent(5L, 5L)).doesNotThrowAnyException();
	}
}