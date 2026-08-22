package self.research.ontology.dataserver.service;

import java.time.Instant;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
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

	/**
	 * Auto-creates the caller's personal library on first access, matching
	 * PHP's lazy-creation behavior. CONFIRMED RACE (reproduced live): the
	 * frontend fires several requests in parallel right after login/register
	 * (items, trash, collections - see useLibraryData.ts's Promise.all), and
	 * on a brand-new account every one of them finds no library yet and tries
	 * to create it concurrently. Library.ownerEmail has a unique index, so
	 * only one concurrent save() wins; the rest previously threw an unhandled
	 * DuplicateKeyException, surfacing as a raw 500 to whichever request
	 * lost the race - never on a later login/refresh, since the library
	 * already exists by then. Catching it here and re-reading the winner's
	 * document is the standard fix for a find-or-create race guarded by a
	 * unique index, and is idempotent regardless of which caller wins.
	 */
	public Library resolvePersonalLibrary(String ownerEmail) {
		return libraryRepository.findByOwnerEmail(ownerEmail)
			.orElseGet(() -> {
				try {
					return libraryRepository.save(Library.forUser(ownerEmail));
				}
				catch (DuplicateKeyException e) {
					return libraryRepository.findByOwnerEmail(ownerEmail).orElseThrow(() -> e);
				}
			});
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