package self.research.ontology.dataserver.util;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class PaginationUtilTest {

	private MockHttpServletRequest request(String query) {
		MockHttpServletRequest req = new MockHttpServletRequest("GET", "/users/me/items");
		req.setScheme("http");
		req.setServerName("localhost");
		req.setServerPort(8089);
		if (query != null) {
			for (String pair : query.split("&")) {
				String[] kv = pair.split("=");
				req.addParameter(kv[0], kv.length > 1 ? kv[1] : "");
			}
		}
		return req;
	}

	@Test
	void paginate_noStartOrLimit_returnsFullListNoLinkHeader() {
		ResponseEntity<List<Integer>> resp = PaginationUtil.paginate(List.of(1, 2, 3), null, null, request(null));

		assertThat(resp.getBody()).containsExactly(1, 2, 3);
		assertThat(resp.getHeaders().getFirst("Total-Results")).isEqualTo("3");
		assertThat(resp.getHeaders().get(HttpHeaders.LINK)).isNull();
	}

	@Test
	void paginate_withLimit_slicesAndAddsNextLink() {
		ResponseEntity<List<Integer>> resp = PaginationUtil.paginate(List.of(1, 2, 3, 4, 5), 0, 2, request("limit=2"));

		assertThat(resp.getBody()).containsExactly(1, 2);
		assertThat(resp.getHeaders().getFirst("Total-Results")).isEqualTo("5");
		String link = resp.getHeaders().getFirst(HttpHeaders.LINK);
		assertThat(link).contains("rel=\"next\"").contains("start=2").contains("limit=2");
		assertThat(link).doesNotContain("rel=\"prev\"");
	}

	@Test
	void paginate_middlePage_hasPrevAndNextLinks() {
		ResponseEntity<List<Integer>> resp = PaginationUtil.paginate(List.of(1, 2, 3, 4, 5), 2, 2, request("start=2&limit=2"));

		assertThat(resp.getBody()).containsExactly(3, 4);
		String link = resp.getHeaders().getFirst(HttpHeaders.LINK);
		assertThat(link).contains("rel=\"prev\"").contains("rel=\"next\"");
	}

	@Test
	void paginate_lastPage_hasOnlyPrevLink() {
		ResponseEntity<List<Integer>> resp = PaginationUtil.paginate(List.of(1, 2, 3, 4, 5), 4, 2, request("start=4&limit=2"));

		assertThat(resp.getBody()).containsExactly(5);
		String link = resp.getHeaders().getFirst(HttpHeaders.LINK);
		assertThat(link).contains("rel=\"prev\"").doesNotContain("rel=\"next\"");
	}

	@Test
	void paginate_startBeyondSize_returnsEmptyPage() {
		ResponseEntity<List<Integer>> resp = PaginationUtil.paginate(List.of(1, 2, 3), 10, 2, request("start=10&limit=2"));

		assertThat(resp.getBody()).isEmpty();
	}
}