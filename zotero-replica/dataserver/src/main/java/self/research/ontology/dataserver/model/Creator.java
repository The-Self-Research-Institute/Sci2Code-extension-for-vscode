package self.research.ontology.dataserver.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Creator {
	private String creatorType;
	private String firstName;
	private String lastName;
}