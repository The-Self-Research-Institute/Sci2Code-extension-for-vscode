package self.research.ontology.dataserver.dto;

/**
 * Ad-hoc item filter/sort params — mirrors the subset of PHP's
 * model/API.inc.php::parseQueryParams()/model/Items.inc.php::search() that
 * this batch implements: q/qmode (title/creator/date substring match),
 * itemType (comma-separated, "-" prefix negates), tag (PHP's
 * {@code ' || '}-separated OR-list, "-" prefix negates), since
 * (changed-since-version), sort/direction. Pagination (start/limit) is
 * handled separately by {@code util.PaginationUtil} since it applies
 * uniformly to every list endpoint, not just filtered item queries.
 */
public record ItemQueryParams(String q, String qmode, String itemType, String tag, Long since, String sort, String direction) {

	public static ItemQueryParams empty() {
		return new ItemQueryParams(null, null, null, null, null, null, null);
	}

	public boolean isEmpty() {
		return q == null && itemType == null && tag == null && since == null && sort == null;
	}
}