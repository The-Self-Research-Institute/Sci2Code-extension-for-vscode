package self.research.ontology.dataserver.dto;

import jakarta.validation.constraints.NotBlank;

public record MemberRequest(@NotBlank String email, @NotBlank String role) {
}