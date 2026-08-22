package self.research.ontology.dataserver.service;

import java.util.Set;

import org.junit.jupiter.api.Test;

import self.research.ontology.dataserver.exception.BadRequestException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SchemaServiceTest {

	private final SchemaService schemaService = new SchemaService();

	@Test
	void itemTypes_includesCommonTypes() {
		assertThat(schemaService.getItemTypes()).contains("book", "journalArticle", "note", "attachment", "webpage");
	}

	@Test
	void getFieldsForType_book_includesTitleAndISBN() {
		assertThat(schemaService.getFieldsForType("book")).contains("title", "ISBN", "publisher");
	}

	@Test
	void getFieldsForType_invalidType_throwsBadRequest() {
		assertThatThrownBy(() -> schemaService.getFieldsForType("notAType")).isInstanceOf(BadRequestException.class);
	}

	@Test
	void getCreatorTypesForType_note_isEmpty() {
		assertThat(schemaService.getCreatorTypesForType("note")).isEmpty();
	}

	@Test
	void getCreatorTypesForType_book_includesAuthor() {
		assertThat(schemaService.getCreatorTypesForType("book")).contains("author", "editor");
	}

	@Test
	void validateFieldsForType_validFields_doesNotThrow() {
		schemaService.validateFieldsForType("book", Set.of("title", "ISBN"));
	}

	@Test
	void validateFieldsForType_unknownField_throwsBadRequest() {
		assertThatThrownBy(() -> schemaService.validateFieldsForType("book", Set.of("notAField")))
			.isInstanceOf(BadRequestException.class);
	}

	@Test
	void getAllFields_isSupersetOfPerTypeFields() {
		assertThat(schemaService.getAllFields()).contains("title", "ISBN", "DOI", "url");
	}

	@Test
	void itemTypes_includesBookSectionAndConferencePaper() {
		assertThat(schemaService.getItemTypes()).contains("bookSection", "conferencePaper");
	}

	@Test
	void getFieldsForType_note_includesNoteField() {
		assertThat(schemaService.getFieldsForType("note")).contains("note");
	}

	@Test
	void validateFieldsForType_bookSection_acceptsBookTitle() {
		schemaService.validateFieldsForType("bookSection", Set.of("title", "bookTitle"));
	}

	@Test
	void itemTypes_includesP1ExpansionTypes() {
		assertThat(schemaService.getItemTypes()).contains(
			"magazineArticle", "newspaperArticle", "letter", "manuscript", "presentation", "dataset", "document",
			"encyclopediaArticle", "dictionaryEntry", "computerProgram", "videoRecording", "audioRecording",
			"podcast", "blogPost", "email", "interview", "map", "patent");
	}

	@Test
	void itemTypes_totalCount_is27() {
		assertThat(schemaService.getItemTypes()).hasSize(27);
	}

	@Test
	void getFieldsForType_dataset_includesDOIAndRepository() {
		assertThat(schemaService.getFieldsForType("dataset")).contains("DOI", "repository", "versionNumber");
	}

	@Test
	void getCreatorTypesForType_videoRecording_includesDirector() {
		assertThat(schemaService.getCreatorTypesForType("videoRecording")).contains("director", "producer");
	}

	@Test
	void getCreatorTypesForType_podcast_includesPodcaster() {
		assertThat(schemaService.getCreatorTypesForType("podcast")).contains("podcaster", "guest");
	}
}