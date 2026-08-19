package self.research.ontology.dataserver.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Request body for /auth/register and /auth/login. */
public record AuthRequest(
	@NotBlank @Email String email,
	@NotBlank @Size(min = 8, max = 255) String password
) {
}
