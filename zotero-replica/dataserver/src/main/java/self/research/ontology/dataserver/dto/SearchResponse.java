package self.research.ontology.dataserver.dto;

import java.util.List;

import self.research.ontology.dataserver.model.Library;
import self.research.ontology.dataserver.model.SavedSearch;
import self.research.ontology.dataserver.model.SearchCondition;

/** Mirrors PHP's Zotero_Search::toJSON() response envelope. */
public record SearchResponse(
	String key,
	long version,
	LibraryRef library,
	Data data
) {
	public record Data(String key, long version, String name, List<ConditionOut> conditions) {
	}

	public record ConditionOut(String condition, String operator, String value) {
	}

	public static SearchResponse from(SavedSearch s, Library library) {
		List<ConditionOut> conditions = s.getConditions().stream()
			.map(c -> new ConditionOut(c.getCondition(), c.getOperator(), c.getValue()))
			.toList();
		return new SearchResponse(
			s.getKey(),
			s.getVersion(),
			LibraryRef.from(library),
			new Data(s.getKey(), s.getVersion(), s.getName(), conditions)
		);
	}

	public static List<SearchCondition> toModel(List<SearchRequest.ConditionDto> dtos) {
		if (dtos == null) {
			return List.of();
		}
		return dtos.stream().map(d -> new SearchCondition(d.condition(), d.operator(), d.value())).toList();
	}
}