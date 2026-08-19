package self.research.ontology.dataserver;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * Meta-annotation for full-context controller/security integration tests.
 * <p>
 * Deliberately uses {@code @TestPropertySource} (an in-code property override)
 * rather than a {@code src/test/resources/application.properties} file: a
 * same-named file there SHADOWS (does not merge with) the main
 * {@code src/main/resources/application.properties} on the test classpath —
 * this was discovered the hard way during the Phase 2 checkpoint, when adding
 * one silently deleted the liveness/readiness health-group config and caused
 * a real, confusing test failure. This approach keeps the real configuration
 * intact and only overrides the one property tests must supply themselves
 * (the JWT secret, which in production comes from the JWT_SECRET env var and
 * must match ontology-auth's own secret — a value tests obviously can't have).
 * <p>
 * Also overrides {@code spring.data.mongodb.auto-index-creation} to {@code
 * false}. Production leaves it {@code true} (needed so the unique compound
 * indexes on {@code ds_collections}/{@code ds_items} actually get created),
 * but that setting makes {@code MongoTemplate} bean creation eagerly connect
 * to a real MongoDB at context startup to create those indexes — with it left
 * on, these context-loading tests would silently require a live, reachable
 * Mongo just to boot Security/MVC wiring that never touches persistence.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
	"jwt.secret=ZGF0YXNlcnZlci10ZXN0LWp3dC1zZWNyZXQta2V5LWZvci11bml0LXRlc3RzLW9ubHktbm90LWZvci1wcm9k",
	"spring.data.mongodb.auto-index-creation=false"
})
public @interface DataserverIntegrationTest {

	// Test-only secret (same value as the @TestPropertySource above) — never
	// used outside this test module. Exposed here so test classes that need to
	// mint their own tokens don't have to duplicate the literal.
	String TEST_JWT_SECRET =
		"ZGF0YXNlcnZlci10ZXN0LWp3dC1zZWNyZXQta2V5LWZvci11bml0LXRlc3RzLW9ubHktbm90LWZvci1wcm9k";
}