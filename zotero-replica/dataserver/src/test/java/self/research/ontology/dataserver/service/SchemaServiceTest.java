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
}