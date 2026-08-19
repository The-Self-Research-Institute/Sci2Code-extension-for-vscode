package self.research.ontology.dataserver.service;

import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;

import lombok.RequiredArgsConstructor;
import org.bson.Document;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.gridfs.GridFsResource;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;
import org.springframework.stereotype.Service;

import com.mongodb.client.gridfs.model.GridFSFile;

import self.research.ontology.dataserver.exception.BadRequestException;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.model.Item;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.repository.ItemRepository;
import self.research.ontology.dataserver.util.VersionGuard;

/**
 * Maps to PHP ItemsController::_handleFileRequest() (#17-21). DISCLOSED
 * COMPATIBILITY DECISION: PHP offloads bytes to S3 via a 3-step handshake
 * (authorize upload → client PUTs to S3 → register). We have no S3 — this
 * service IS the storage backend (MongoDB GridFS) — so replicating a
 * presigned-URL choreography would add protocol complexity with no real
 * compatibility benefit; upload/download are collapsed into direct,
 * single-request, streamed operations against GridFS. Same observable
 * contract otherwise: register→204+Last-Modified-Version, GET streams
 * bytes, {@code ?info=1} returns headers only, missing file→404, and
 * deletion is only ever a side effect of deleting the owning item (no
 * dedicated delete endpoint — matches PHP exactly, since PHP has none either).
 * <p>
 * Depends on {@link ItemRepository} directly (not {@link ItemService}) so
 * that ItemService can depend on this class for cascade-delete-on-item-
 * delete without creating a circular bean dependency.
 */
@Service
@RequiredArgsConstructor
public class AttachmentService {

	private final GridFsTemplate gridFsTemplate;
	private final ItemRepository itemRepository;
	private final LibraryService libraryService;

	/** #18/#19 (collapsed authorize+upload+register into one direct write). */
	public Item upload(Library library, String itemKey, Long ifUnmodifiedSinceVersion,
			InputStream content, String filename, String contentType) {
		Item item = itemRepository.findByLibraryIdAndKey(library.getId(), itemKey)
			.orElseThrow(() -> new NotFoundException("Item not found"));
		requireStorableAttachment(item);
		VersionGuard.requireForExisting(ifUnmodifiedSinceVersion, item.getVersion());

		// Re-upload replaces the previous file outright (no dedup-by-hash across
		// items, unlike PHP's S3-backed dedup — a disclosed simplification with
		// no observable client impact, since the client never sees the storage
		// layer either way).
		deleteExistingFile(library.getId(), itemKey);

		MessageDigest md5;
		try {
			md5 = MessageDigest.getInstance("MD5");
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("MD5 algorithm unavailable", e);
		}
		DigestInputStream digestStream = new DigestInputStream(content, md5);
		Document metadata = new Document("libraryId", library.getId()).append("itemKey", itemKey);
		gridFsTemplate.store(digestStream, filename, contentType, metadata);

		item.getData().putIfAbsent("linkMode", "imported_file");
		item.getData().put("contentType", contentType);
		item.getData().put("filename", filename);
		item.getData().put("md5", HexFormat.of().formatHex(md5.digest()));
		item.getData().put("mtime", Instant.now().toEpochMilli());
		item.setDateModified(Instant.now());
		item.setVersion(libraryService.bumpVersion(library));
		return itemRepository.save(item);
	}

	/** #20 */
	public GridFsResource download(Library library, String itemKey) {
		GridFSFile file = findFile(library.getId(), itemKey)
			.orElseThrow(() -> new NotFoundException("File not found"));
		return gridFsTemplate.getResource(file);
	}

	/** #20 ({@code ?info=1} headers-only variant). */
	public GridFSFile getFileInfo(Library library, String itemKey) {
		return findFile(library.getId(), itemKey)
			.orElseThrow(() -> new NotFoundException("File not found"));
	}

	/** Cascade hook for ItemService.delete()/deleteBatch() — no-ops if there is no file. */
	public void deleteFileIfPresent(String libraryId, String itemKey) {
		deleteExistingFile(libraryId, itemKey);
	}

	private void deleteExistingFile(String libraryId, String itemKey) {
		gridFsTemplate.delete(fileQuery(libraryId, itemKey));
	}

	private Optional<GridFSFile> findFile(String libraryId, String itemKey) {
		return Optional.ofNullable(gridFsTemplate.findOne(fileQuery(libraryId, itemKey)));
	}

	private Query fileQuery(String libraryId, String itemKey) {
		return Query.query(Criteria.where("metadata.libraryId").is(libraryId).and("metadata.itemKey").is(itemKey));
	}

	private void requireStorableAttachment(Item item) {
		if (!"attachment".equals(item.getItemType())) {
			throw new BadRequestException("Only attachment items can have file content");
		}
		Object linkMode = item.getData().get("linkMode");
		if ("linked_file".equals(linkMode) || "linked_url".equals(linkMode)) {
			throw new BadRequestException("Linked attachments do not accept uploaded file content");
		}
	}
}