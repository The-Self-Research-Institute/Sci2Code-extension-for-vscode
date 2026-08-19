package self.research.ontology.dataserver.controller;

import java.io.IOException;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.mongodb.client.gridfs.model.GridFSFile;

import self.research.ontology.dataserver.model.Item;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.security.AuthenticatedUser;
import self.research.ontology.dataserver.service.AttachmentService;
import self.research.ontology.dataserver.service.LibraryAccessResolver;
import self.research.ontology.dataserver.service.PermissionService;

import org.springframework.data.mongodb.gridfs.GridFsResource;

/**
 * Maps to PHP ItemsController::_handleFileRequest() (#17-21). See
 * AttachmentService's javadoc for the disclosed compatibility decision:
 * PHP's 3-step S3 handshake is collapsed into direct streamed upload/
 * download against GridFS, since this service is its own storage backend.
 * No dedicated delete endpoint — matches PHP; a file is only ever removed
 * as a side effect of deleting its owning item (see ItemService).
 */
@RestController
@RequiredArgsConstructor
public class AttachmentController {

	private final AttachmentService attachmentService;
	private final LibraryAccessResolver libraryAccessResolver;
	private final PermissionService permissionService;

	/** #18/#19 */
	@PostMapping({"/users/{ownerId}/items/{key}/file", "/groups/{ownerId}/items/{key}/file"})
	public ResponseEntity<Void> uploadFile(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestHeader(value = "If-Unmodified-Since-Version", required = false) Long ifUnmodifiedSinceVersion,
			@RequestParam("file") MultipartFile file) throws IOException {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireWrite(library, caller);

		String contentType = file.getContentType() != null ? file.getContentType() : MediaType.APPLICATION_OCTET_STREAM_VALUE;
		Item updated = attachmentService.upload(library, key, ifUnmodifiedSinceVersion,
			file.getInputStream(), file.getOriginalFilename(), contentType);

		return ResponseEntity.noContent()
			.header("Last-Modified-Version", String.valueOf(updated.getVersion()))
			.build();
	}

	/** #20 */
	@GetMapping({"/users/{ownerId}/items/{key}/file", "/groups/{ownerId}/items/{key}/file"})
	public ResponseEntity<InputStreamResource> downloadFile(
			HttpServletRequest request, @PathVariable String ownerId, @PathVariable String key,
			@AuthenticationPrincipal AuthenticatedUser caller,
			@RequestParam(value = "info", required = false) String info) throws IOException {
		Library library = libraryAccessResolver.resolve(request, ownerId, caller);
		permissionService.requireAccess(library, caller);

		if (info != null) {
			GridFSFile file = attachmentService.getFileInfo(library, key);
			return ResponseEntity.ok()
				.header("Content-Length", String.valueOf(file.getLength()))
				.header("X-Zotero-Filename", file.getFilename())
				.header("X-Zotero-Modification-Time", String.valueOf(file.getUploadDate().getTime()))
				.header("ETag", file.getObjectId().toString())
				.build();
		}

		GridFsResource resource = attachmentService.download(library, key);
		GridFSFile file = resource.getGridFSFile();
		String contentType = file.getMetadata() != null && file.getMetadata().getString("_contentType") != null
			? file.getMetadata().getString("_contentType") : MediaType.APPLICATION_OCTET_STREAM_VALUE;

		return ResponseEntity.ok()
			.contentType(MediaType.parseMediaType(contentType))
			.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.getFilename() + "\"")
			.contentLength(file.getLength())
			.body(new InputStreamResource(resource.getInputStream()));
	}
}