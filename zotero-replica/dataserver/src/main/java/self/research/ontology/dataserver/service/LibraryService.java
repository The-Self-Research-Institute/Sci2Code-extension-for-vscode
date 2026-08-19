package self.research.ontology.dataserver.service;

import java.time.Instant;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.repository.LibraryRepository;

/**
 * Resolves/auto-creates the Library backing a user or group — mirrors PHP's
 * Zotero_Users::getLibraryIDFromUserID() lazy-creation behavior (a personal
 * library is auto-vivified on first authenticated access, not via an
 * explicit "create library" endpoint, since none exists in the PHP API).
 */
@Service
@RequiredArgsConstructor
public class LibraryService {

	private final LibraryRepository libraryRepository;

	/** Auto-creates the caller's personal library on first access, matching PHP's lazy-creation behavior. */
	public Library resolvePersonalLibrary(String ownerEmail) {
		return libraryRepository.findByOwnerEmail(ownerEmail)
			.orElseGet(() -> libraryRepository.save(Library.forUser(ownerEmail)));
	}

	public Library getGroupLibrary(String groupId) {
		return libraryRepository.findByGroupId(groupId)
			.orElseThrow(() -> new NotFoundException("Library not found for group " + groupId));
	}

	public Library createGroupLibrary(String groupId) {
		return libraryRepository.save(Library.forGroup(groupId));
	}

	public Library getById(String libraryId) {
		return libraryRepository.findById(libraryId)
			.orElseThrow(() -> new NotFoundException("Library not found"));
	}

	/**
	 * Bumps the library's version and timestamp — mirrors
	 * Zotero_Libraries::updateVersionAndTimestamp(). Single-document update
	 * (atomic within Mongo's per-document guarantee; no multi-document
	 * transaction used, per the approved architecture).
	 */
	public long bumpVersion(Library library) {
		library.setVersion(library.getVersion() + 1);
		library.setLastUpdated(Instant.now());
		libraryRepository.save(library);
		return library.getVersion();
	}

	public void deleteGroupLibrary(String groupId) {
		libraryRepository.findByGroupId(groupId).ifPresent(libraryRepository::delete);
	}
}