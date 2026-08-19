package self.research.ontology.dataserver.util;

import java.security.SecureRandom;

/**
 * Generates Zotero-style 8-character object keys. Zotero's own key alphabet
 * excludes visually-ambiguous characters (0/O, 1/I) — 23456789ABCDEFGHIJKLMNPQRSTUVWXYZ
 * (32 chars, so each character carries exactly 5 bits of randomness).
 */
public final class KeyGenerator {

	private static final String ALPHABET = "23456789ABCDEFGHIJKLMNPQRSTUVWXYZ";
	private static final int KEY_LENGTH = 8;
	private static final SecureRandom RANDOM = new SecureRandom();

	private KeyGenerator() {
	}

	public static String generate() {
		StringBuilder sb = new StringBuilder(KEY_LENGTH);
		for (int i = 0; i < KEY_LENGTH; i++) {
			sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
		}
		return sb.toString();
	}

	/** Mirrors PHP's Zotero_ID::isValidKey(): exactly 8 chars from the key alphabet. */
	public static boolean isValid(String key) {
		if (key == null || key.length() != KEY_LENGTH) {
			return false;
		}
		for (int i = 0; i < key.length(); i++) {
			if (ALPHABET.indexOf(key.charAt(i)) < 0) {
				return false;
			}
		}
		return true;
	}
}