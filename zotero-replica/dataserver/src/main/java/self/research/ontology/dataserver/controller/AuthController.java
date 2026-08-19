package self.research.ontology.dataserver.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import self.research.ontology.dataserver.dto.AuthRequest;
import self.research.ontology.dataserver.dto.AuthResponse;
import self.research.ontology.dataserver.service.AuthService;

/**
 * Replica-owned authentication boundary — register/login issue a JWT the
 * dataserver's own JwtAuthenticationFilter accepts, exactly like a token
 * from any other issuer configured with the same jwt.secret. Public, matching
 * the permitAll list in SecurityConfig.
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

	private final AuthService authService;

	@PostMapping("/register")
	public ResponseEntity<AuthResponse> register(@Valid @RequestBody AuthRequest request) {
		return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request.email(), request.password()));
	}

	@PostMapping("/login")
	public AuthResponse login(@Valid @RequestBody AuthRequest request) {
		return authService.login(request.email(), request.password());
	}
}
