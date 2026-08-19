package self.research.ontology.dataserver.service;

import java.io.ByteArrayInputStream;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.gridfs.GridFsResource;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;

import com.mongodb.client.gridfs.model.GridFSFile;

import self.research.ontology.dataserver.exception.BadRequestException;
import self.research.ontology.dataserver.exception.NotFoundException;
import self.research.ontology.dataserver.exception.PreconditionFailedException;
import self.research.ontology.dataserver.exception.PreconditionRequiredException;
import self.research.ontology.dataserver.model.Item;
import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.repository.ItemRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AttachmentServiceTest {

	@Mock
	private GridFsTemplate gridFsTemplate;

	@Mock
	private ItemRepository itemRepository;

	@Mock
	private LibraryService libraryService;

	private AttachmentService attachmentService;
	private Library library;

	@BeforeEach
	void setUp() {
		attachmentService = new AttachmentService(gridFsTemplate, itemRepository, libraryService);
		library = Library.forUser("owner@example.com");
		library.setId("lib1");
	}

	private Item attachmentItem(String key, long version) {
		Item item = new Item();
		item.setKey(key);
		item.setLibraryId("lib1");
		item.setItemType("attachment");
		item.setVersion(version);
		return item;
	}

	@Test
	void upload_validAttachment_storesInGridFsAndUpdatesItem() {
		Item item = attachmentItem("ABCD1234", 1);
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(item));
		when(libraryService.bumpVersion(library)).thenReturn(2L);
		when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		Item result = attachmentService.upload(library, "ABCD1234", 1L,
			new ByteArrayInputStream("hello".getBytes()), "notes.pdf", "application/pdf");

		verify(gridFsTemplate).store(any(), any(), any(), any());
		assertThat(result.getData()).containsEntry("contentType", "application/pdf");
		assertThat(result.getData()).containsEntry("filename", "notes.pdf");
		assertThat(result.getData()).containsEntry("linkMode", "imported_file");
		assertThat(result.getData()).containsKey("md5");
		assertThat(result.getVersion()).isEqualTo(2L);
	}

	@Test
	void upload_itemNotFound_throws404() {
		when(itemRepository.findByLibraryIdAndKey("lib1", "GHOST")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> attachmentService.upload(library, "GHOST", 1L,
				new ByteArrayInputStream("x".getBytes()), "f.txt", "text/plain"))
			.isInstanceOf(NotFoundException.class);
	}

	@Test
	void upload_nonAttachmentItemType_throwsBadRequest() {
		Item item = attachmentItem("ABCD1234", 1);
		item.setItemType("book");
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(item));

		assertThatThrownBy(() -> attachmentService.upload(library, "ABCD1234", 1L,
				new ByteArrayInputStream("x".getBytes()), "f.txt", "text/plain"))
			.isInstanceOf(BadRequestException.class);
	}

	@Test
	void upload_linkedFileMode_throwsBadRequest() {
		Item item = attachmentItem("ABCD1234", 1);
		item.getData().put("linkMode", "linked_file");
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(item));

		assertThatThrownBy(() -> attachmentService.upload(library, "ABCD1234", 1L,
				new ByteArrayInputStream("x".getBytes()), "f.txt", "text/plain"))
			.isInstanceOf(BadRequestException.class);
	}

	@Test
	void upload_withoutVersion_throws428() {
		Item item = attachmentItem("ABCD1234", 3);
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(item));

		assertThatThrownBy(() -> attachmentService.upload(library, "ABCD1234", null,
				new ByteArrayInputStream("x".getBytes()), "f.txt", "text/plain"))
			.isInstanceOf(PreconditionRequiredException.class);
	}

	@Test
	void upload_withStaleVersion_throws412() {
		Item item = attachmentItem("ABCD1234", 5);
		when(itemRepository.findByLibraryIdAndKey("lib1", "ABCD1234")).thenReturn(Optional.of(item));

		assertThatThrownBy(() -> attachmentService.upload(library, "ABCD1234", 3L,
				new ByteArrayInputStream("x".getBytes()), "f.txt", "text/plain"))
			.isInstanceOf(PreconditionFailedException.class);
	}

	@Test
	void download_fileExists_returnsResource() {
		GridFSFile file = mockGridFsFile();
		when(gridFsTemplate.findOne(any(Query.class))).thenReturn(file);
		GridFsResource resource = org.mockito.Mockito.mock(GridFsResource.class);
		when(gridFsTemplate.getResource(file)).thenReturn(resource);

		assertThat(attachmentService.download(library, "ABCD1234")).isSameAs(resource);
	}

	@Test
	void download_fileMissing_throws404() {
		when(gridFsTemplate.findOne(any(Query.class))).thenReturn(null);

		assertThatThrownBy(() -> attachmentService.download(library, "ABCD1234")).isInstanceOf(NotFoundException.class);
	}

	@Test
	void getFileInfo_fileMissing_throws404() {
		when(gridFsTemplate.findOne(any(Query.class))).thenReturn(null);

		assertThatThrownBy(() -> attachmentService.getFileInfo(library, "ABCD1234")).isInstanceOf(NotFoundException.class);
	}

	@Test
	void deleteFileIfPresent_delegatesToGridFsDelete() {
		attachmentService.deleteFileIfPresent("lib1", "ABCD1234");

		verify(gridFsTemplate).delete(any(Query.class));
	}

	private GridFSFile mockGridFsFile() {
		return org.mockito.Mockito.mock(GridFSFile.class);
	}
}