package self.research.ontology.dataserver.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.core.convert.MongoConverter;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;

/**
 * Named GridFS bucket for attachment binaries (backing collections
 * {@code ds_attachments.files} / {@code ds_attachments.chunks}) within the
 * replica's own dedicated MongoDB database, rather than dumping into the
 * default {@code fs} bucket.
 */
@Configuration
public class MongoConfig {

	@Bean
	public GridFsTemplate gridFsTemplate(MongoDatabaseFactory mongoDatabaseFactory, MongoConverter mongoConverter) {
		return new GridFsTemplate(mongoDatabaseFactory, mongoConverter, "ds_attachments");
	}
}