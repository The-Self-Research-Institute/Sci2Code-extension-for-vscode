package self.research.ontology.dataserver.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One row of a saved search's condition set — mirrors PHP's savedSearchConditions table. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SearchCondition {
	private String condition;
	private String operator;
	private String value;
}