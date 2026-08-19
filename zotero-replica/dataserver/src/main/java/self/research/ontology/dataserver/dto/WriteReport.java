package self.research.ontology.dataserver.dto;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;

/**
 * Mirrors PHP's Zotero_Results::generateReport() batch-write response shape
 * — {@code {successful, unchanged, failed}}, each keyed by the request
 * array's index as a string (model/Results.inc.php:62-103). A failure on one
 * entry of a batch reports only that entry as failed; it does not abort the
 * whole request — this is the key behavioral property being preserved here
 * (previously, one bad item in a batch threw and aborted everything).
 * <p>
 * The deprecated v1 {@code success} alias (a plain key, not a full object)
 * is intentionally omitted — no v1 client target exists for this project,
 * consistent with every other disclosed v1-legacy omission already made.
 * <p>
 * "unchanged" is always empty in this implementation: PHP populates it when
 * a write had literally no effect (e.g. resubmitting identical data), which
 * would require a before/after diff this batch doesn't implement — a
 * disclosed, scoped-down simplification. The field is still present so the
 * envelope shape matches.
 */
public class WriteReport<T> {

	private final Map<String, T> successful = new LinkedHashMap<>();
	private final Map<String, T> unchanged = new LinkedHashMap<>();
	private final Map<String, FailureEntry> failed = new LinkedHashMap<>();

	public void addSuccess(int index, T value) {
		successful.put(String.valueOf(index), value);
	}

	public void addFailure(int index, String key, int code, String message) {
		failed.put(String.valueOf(index), new FailureEntry(key, code, message));
	}

	public Map<String, T> getSuccessful() {
		return successful;
	}

	public Map<String, T> getUnchanged() {
		return unchanged;
	}

	public Map<String, FailureEntry> getFailed() {
		return failed;
	}

	/** Re-maps successful values (e.g. domain object → Zotero-shaped response envelope) while keeping the same report shape. */
	public <R> WriteReport<R> map(Function<T, R> mapper) {
		WriteReport<R> out = new WriteReport<>();
		successful.forEach((k, v) -> out.successful.put(k, mapper.apply(v)));
		out.failed.putAll(failed);
		return out;
	}

	public record FailureEntry(String key, int code, String message) {
	}
}