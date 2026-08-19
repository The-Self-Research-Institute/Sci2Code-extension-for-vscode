package self.research.ontology.dataserver.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SearchRequest(
	@NotBlank @Size(max = 255) String name,
	List<ConditionDto> conditions,
	Long version, // optional JSON "version" property, alternative to If-Unmodified-Since-Version header
	String key    // batch-write only: present to update an existing search in the same request
) {
	public record ConditionDto(String condition, String operator, String value) {
	}
}