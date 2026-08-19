package self.research.ontology.dataserver.util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Adds PHP's {@code Total-Results} and {@code Link} (RFC 5988) response
 * headers to a list endpoint — see model/API.inc.php::multiResponse() /
 * buildLinkHeader(). DISCLOSED SIMPLIFICATION: only {@code rel=next} and
 * {@code rel=prev} are emitted, not {@code first}/{@code last} — the two
 * that matter for a client's changed-since sync loop to actually terminate;
 * PHP's fuller set is a convenience the sync protocol doesn't strictly
 * depend on.
 */
public final class PaginationUtil {

	private PaginationUtil() {
	}

	public static <T> ResponseEntity<List<T>> paginate(List<T> all, Integer start, Integer limit, HttpServletRequest request) {
		int total = all.size();
		int from = (start != null && start > 0) ? Math.min(start, total) : 0;
		int to = (limit != null && limit > 0) ? Math.min(from + limit, total) : total;
		List<T> page = new ArrayList<>(all.subList(from, to));

		HttpHeaders headers = new HttpHeaders();
		headers.add("Total-Results", String.valueOf(total));
		String link = buildLinkHeader(request, from, to, limit, total);
		if (link != null) {
			headers.add(HttpHeaders.LINK, link);
		}
		return ResponseEntity.ok().headers(headers).body(page);
	}

	private static String buildLinkHeader(HttpServletRequest request, int from, int to, Integer limit, int total) {
		if (limit == null || limit <= 0) {
			return null;
		}
		List<String> parts = new ArrayList<>();
		if (from > 0) {
			parts.add(linkFor(request, Math.max(0, from - limit), limit, "prev"));
		}
		if (to < total) {
			parts.add(linkFor(request, to, limit, "next"));
		}
		return parts.isEmpty() ? null : String.join(", ", parts);
	}

	private static String linkFor(HttpServletRequest request, int start, int limit, String rel) {
		Map<String, String[]> params = new LinkedHashMap<>(request.getParameterMap());
		UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(request.getRequestURL().toString());
		params.forEach((key, values) -> {
			if (!key.equals("start") && !key.equals("limit") && values.length > 0) {
				builder.queryParam(key, values[0]);
			}
		});
		builder.queryParam("start", start).queryParam("limit", limit);
		return "<" + builder.build().toUriString() + ">; rel=\"" + rel + "\"";
	}
}