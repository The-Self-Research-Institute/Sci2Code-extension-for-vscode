package self.research.ontology.dataserver;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Full HTTP-layer proof of the API-key authentication architecture described
 * in the "Replace Zotero API Key with a Replica-Generated API Key" task:
 * register -> generate an API key with the login JWT -> use ONLY the API key
 * (never the JWT again) to call /auth/whoami and the existing
 * /users/{id}/items endpoint -> revoke it -> confirm it's rejected -> confirm
 * one user's key cannot read another user's library. Requires a REAL
 * reachable MongoDB (unlike SecurityConfigTest's other cases, which
 * deliberately avoid needing one) — run via the project's Docker Maven
 * pattern with a Mongo container on the same network.
 */
@DataserverIntegrationTest
class ApiKeyIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private ObjectMapper objectMapper;

	private JsonNode registerAndGetTokenBody(String email) throws Exception {
		MvcResult result = mockMvc.perform(post("/auth/register")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"" + email + "\",\"password\":\"correct-horse-battery\"}"))
			.andExpect(status().isCreated())
			.andReturn();
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	private String generateApiKey(String jwt) throws Exception {
		MvcResult result = mockMvc.perform(post("/auth/api-key").header("Authorization", "Bearer " + jwt))
			.andExpect(status().isOk())
			.andReturn();
		return objectMapper.readTree(result.getResponse().getContentAsString()).get("apiKey").asText();
	}

	@Test
	void fullApiKeyLifecycle_generateAuthenticateRevoke() throws Exception {
		String email = "api-key-lifecycle-" + System.nanoTime() + "@example.com";
		JsonNode registered = registerAndGetTokenBody(email);
		String jwt = registered.get("token").asText();
		String userId = registered.get("userId").asText();

		// --- Generate: a real, high-entropy, prefixed key is returned ---
		String apiKey = generateApiKey(jwt);
		assertThat(apiKey).startsWith("rk_");
		assertThat(apiKey.length()).isGreaterThan(30);

		// --- Status: dataserver now reports an active key exists, without exposing it ---
		mockMvc.perform(get("/auth/api-key").header("Authorization", "Bearer " + jwt))
			.andExpect(status().isOk())
			.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.exists").value(true));

		// --- The API key (NOT the JWT) resolves identity via /auth/whoami ---
		MvcResult whoami = mockMvc.perform(get("/auth/whoami").header("Authorization", "Bearer " + apiKey))
			.andExpect(status().isOk())
			.andReturn();
		JsonNode whoamiBody = objectMapper.readTree(whoami.getResponse().getContentAsString());
		assertThat(whoamiBody.get("userId").asText()).isEqualTo(userId);
		assertThat(whoamiBody.get("email").asText()).isEqualToIgnoringCase(email);

		// --- The SAME API key authenticates against an EXISTING, unmodified library endpoint ---
		mockMvc.perform(get("/users/" + userId + "/items").header("Authorization", "Bearer " + apiKey))
			.andExpect(status().isOk());

		// --- An unrelated, made-up key is rejected ---
		mockMvc.perform(get("/auth/whoami").header("Authorization", "Bearer rk_totally-made-up-and-never-issued"))
			.andExpect(status().isUnauthorized());

		// --- Missing Authorization header entirely is rejected ---
		mockMvc.perform(get("/auth/whoami")).andExpect(status().isUnauthorized());

		// --- Revoke, using the ORIGINAL JWT (not the API key) ---
		mockMvc.perform(delete("/auth/api-key").header("Authorization", "Bearer " + jwt))
			.andExpect(status().isNoContent());

		// --- The now-revoked key is rejected everywhere ---
		mockMvc.perform(get("/auth/whoami").header("Authorization", "Bearer " + apiKey))
			.andExpect(status().isUnauthorized());
		mockMvc.perform(get("/users/" + userId + "/items").header("Authorization", "Bearer " + apiKey))
			.andExpect(status().isUnauthorized());

		// --- Status now correctly reports no active key ---
		mockMvc.perform(get("/auth/api-key").header("Authorization", "Bearer " + jwt))
			.andExpect(status().isOk())
			.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.exists").value(false));
	}

	@Test
	void generatingASecondKey_revokesTheFirstOne() throws Exception {
		String email = "api-key-regenerate-" + System.nanoTime() + "@example.com";
		String jwt = registerAndGetTokenBody(email).get("token").asText();

		String firstKey = generateApiKey(jwt);
		String secondKey = generateApiKey(jwt);

		assertThat(secondKey).isNotEqualTo(firstKey);
		mockMvc.perform(get("/auth/whoami").header("Authorization", "Bearer " + firstKey))
			.andExpect(status().isUnauthorized());
		mockMvc.perform(get("/auth/whoami").header("Authorization", "Bearer " + secondKey))
			.andExpect(status().isOk());
	}

	@Test
	void apiKeyForUserA_cannotAccessUserBsLibrary() throws Exception {
		JsonNode userA = registerAndGetTokenBody("api-key-user-a-" + System.nanoTime() + "@example.com");
		JsonNode userB = registerAndGetTokenBody("api-key-user-b-" + System.nanoTime() + "@example.com");

		String apiKeyA = generateApiKey(userA.get("token").asText());
		String userBId = userB.get("userId").asText();

		mockMvc.perform(get("/users/" + userBId + "/items").header("Authorization", "Bearer " + apiKeyA))
			.andExpect(status().isForbidden());
	}
}
