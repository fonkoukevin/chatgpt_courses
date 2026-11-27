package com.chatgptcourses;

import static org.junit.jupiter.api.Assertions.*;
import com.chatgptcourses.access.EntitlementAccess;
import com.chatgptcourses.shared.config.RuntimeProperties;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

/** Explicit SQL observation, not an HTTP/payment proof or a historical incident resolution.
 * Only this disposable database and dedicated reader connections resolve the instrumented clock.
 * The wrapper returns the actual PostgreSQL clock sample, but its writes/cost disable parallel plans.
 * Probe readers are read-write REPEATABLE READ: the actual production READ ONLY mode is not reproduced.
 */
@Testcontainers
class EntitlementDecisionObservation {
    @Container static final PostgreSQLContainer POSTGRES=new PostgreSQLContainer(DockerImageName.parse(
        "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    private static final AtomicInteger ORDINAL=new AtomicInteger();
    private static final ObjectMapper JSON=new ObjectMapper();
    private static Path output;

    @BeforeAll static void prepare()throws Exception{
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword()).load().migrate();
        var runtime=Path.of("../../.runtime").toAbsolutePath().normalize();Files.createDirectories(runtime);
        output=Files.createTempDirectory(runtime,"entitlement-decision-observation-");
        try(var connection=connect()){
            var db=jdbc(connection);
            db.execute("CREATE SCHEMA access_probe");
            db.execute("CREATE TABLE access_probe.clock_samples(id bigint GENERATED ALWAYS AS IDENTITY,observation integer NOT NULL,sampled_at timestamptz NOT NULL)");
            db.execute("""
                CREATE FUNCTION access_probe.clock_timestamp() RETURNS timestamptz LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE
                  SET search_path=pg_catalog,public AS $$
                DECLARE sampled timestamptz;
                BEGIN
                  sampled:=pg_catalog.clock_timestamp();
                  INSERT INTO access_probe.clock_samples(observation,sampled_at)
                    VALUES(current_setting('courses_access_probe.observation')::integer,sampled);
                  RETURN sampled;
                END; $$
                """);
        }
    }

    @Test void boundedFreshOriginsRetainTheClockSamplesUsedByTheirSingleDecisions()throws Exception{
        for(int round=0;round<3;round++){
            var fixture=fixture();
            try(var writer=connect()){grant(jdbc(writer),fixture);}
            for(var locale:List.of("fr","en"))try(var reader=reader()){
                var observation=observe(reader,fixture,locale,"FRESH_COMMITTED_"+locale.toUpperCase(),true,Map.of("fixtureRound",round));
                assertTrue(observation.written(),"A passing observation requires its durable safe facts");
                assertTrue(observation.covered(),"One real decision on a freshly committed origin; never replaced by a retry");
                assertTrue(observation.clockCount()>0,"The decision must have evaluated the instrumented clock");
            }
        }
    }

    @Test void anOlderSnapshotIsDistinguishedFromAClockComparisonAfterTheWriterCommits()throws Exception{
        var fixture=fixture();
        try(var writer=connect();var older=reader()){
            writer.setAutoCommit(false);grant(jdbc(writer),fixture);
            var initial=observe(older,fixture,"fr","INTENTIONAL_UNCOMMITTED_ORIGIN",false,Map.of("writerCommitCompleted",false));
            assertTrue(initial.written());assertFalse(initial.covered());
            writer.commit();
            boolean committedOutsideSnapshot;
            try(var outside=connect()){committedOutsideSnapshot=jdbc(outside).queryForObject("SELECT count(*) FROM access_grants WHERE owner_id=?",Integer.class,fixture.owner())==1;}
            assertTrue(committedOutsideSnapshot,"The independent connection must actually see the writer commit");
            var stale=observe(older,fixture,"fr","INTENTIONAL_OLDER_REPEATABLE_READ_SNAPSHOT",false,
                Map.of("writerCommitCompleted",true,"originVisibleOutsideReaderSnapshot",committedOutsideSnapshot));
            assertTrue(stale.written());assertFalse(stale.covered(),"An explicitly older snapshot keeps its controlled negative observation");
            assertEquals("ORIGIN_NOT_VISIBLE_IN_READER_SNAPSHOT",stale.classification());
        }
        try(var fresh=reader()){
            var observation=observe(fresh,fixture,"fr","DISTINCT_NEW_TRANSACTION_AFTER_COMMIT",true,Map.of("controlledSnapshotComparison",true));
            assertTrue(observation.written());assertTrue(observation.covered());
        }
    }

    @Test void revokedOriginDisabledOwnerAndWithdrawnPathHaveDifferentFacts()throws Exception{
        var revoked=fixture();try(var writer=connect()){
            var db=jdbc(writer);grant(db,revoked);db.update("UPDATE access_grants SET revoked_at=greatest(created_at,pg_catalog.clock_timestamp()) WHERE owner_id=?",revoked.owner());
        }
        try(var reader=reader()){
            var observation=observe(reader,revoked,"fr","INTENTIONAL_REVOKED_ORIGIN",false,Map.of());
            assertTrue(observation.written());assertFalse(observation.covered());assertEquals("ORIGIN_REVOKED",observation.classification());
        }
        var disabled=fixture();try(var writer=connect()){
            var db=jdbc(writer);grant(db,disabled);db.update("UPDATE user_accounts SET status='DISABLED' WHERE id=?",disabled.owner());
        }
        try(var reader=reader()){
            var observation=observe(reader,disabled,"fr","INTENTIONAL_DISABLED_OWNER",false,Map.of());
            assertTrue(observation.written());assertFalse(observation.covered());assertEquals("OWNER_INACTIVE",observation.classification());
        }
        var withdrawn=fixture();try(var writer=connect()){
            var db=jdbc(writer);grant(db,withdrawn);db.update("UPDATE content_translations SET editorial_state='ARCHIVED' WHERE pedagogical_version_id=? AND locale='fr'",withdrawn.activity().version());
        }
        try(var reader=reader()){
            var observation=observe(reader,withdrawn,"fr","INTENTIONAL_WITHDRAWN_PINNED_PATH",false,Map.of());
            assertTrue(observation.written());assertFalse(observation.covered());assertEquals("PUBLICATION_UNAVAILABLE",observation.classification());
        }
    }

    private static Observation observe(Connection connection,Fixture fixture,String locale,String role,boolean expected,Map<String,Object> context)throws Exception{
        int ordinal=ORDINAL.incrementAndGet();var db=jdbc(connection);
        db.queryForObject("SELECT set_config('courses_access_probe.observation',?,true)",String.class,Integer.toString(ordinal));
        assertTrue(Boolean.TRUE.equals(db.queryForObject("SELECT 'clock_timestamp()'::regprocedure::oid='access_probe.clock_timestamp()'::regprocedure::oid",Boolean.class)),"Only the dedicated probe connection must resolve its clock wrapper");
        var policy=new EntitlementAccess(db,new RuntimeProperties("test",URI.create("http://localhost:3000"),false));
        // Exactly one call: no retry, delay, backdating, policy SQL copy or authorization change.
        boolean covered=policy.covers(fixture.owner(),fixture.activity().resource(),fixture.activity().version(),locale);
        var samples=db.query("SELECT sampled_at FROM access_probe.clock_samples WHERE observation=? ORDER BY id",(rs,n)->rs.getTimestamp(1).toInstant(),ordinal);
        var ownerActive=db.queryForObject("SELECT status='ACTIVE' FROM user_accounts WHERE id=?",Boolean.class,fixture.owner());
        var grants=db.query("SELECT revoked_at IS NULL AS live,starts_at,expires_at,locales @> ?::jsonb AS locale_included FROM access_grants WHERE owner_id=? AND resource_id=? AND version_id=?",
            (rs,n)->new Origin(rs.getBoolean("live"),rs.getTimestamp("starts_at").toInstant(),rs.getTimestamp("expires_at").toInstant(),rs.getBoolean("locale_included")),"[\""+locale+"\"]",fixture.owner(),fixture.course().resource(),fixture.course().version());
        var nodes=new ArrayList<Map<String,Object>>();
        for(var node:List.of(fixture.course(),fixture.module(),fixture.activity()))nodes.add(db.queryForMap("""
            SELECT r.kind,r.archived_at IS NULL AS resource_available,t.id IS NOT NULL AS locale_present,
              coalesce(t.editorial_state NOT IN('ARCHIVED','STALE'),false) AS translation_available,
              e.id IS NOT NULL AND e.document_json IS NOT NULL AS published_document,
              t.id IS NOT NULL AND(t.source_translation_id IS NULL OR coalesce(t.published_source_revision_id=s.current_revision_id AND s.editorial_state NOT IN('ARCHIVED','STALE'),false)) AS source_fresh
            FROM pedagogical_versions v JOIN learning_resources r ON r.id=v.resource_id
            LEFT JOIN content_translations t ON t.pedagogical_version_id=v.id AND t.locale=?
            LEFT JOIN editorial_revisions e ON e.id=t.published_revision_id LEFT JOIN content_translations s ON s.id=t.source_translation_id
            WHERE v.id=?
            """,locale,node.version()));
        boolean publicationAvailable=nodes.stream().allMatch(node->List.of("resource_available","locale_present","translation_available","published_document","source_fresh").stream().allMatch(key->Boolean.TRUE.equals(node.get(key))));
        boolean backwards=false;for(int index=1;index<samples.size();index++)backwards|=samples.get(index).isBefore(samples.get(index-1));
        boolean sampleBeforeStart=!samples.isEmpty()&&grants.stream().anyMatch(origin->samples.stream().anyMatch(at->at.isBefore(origin.start())));
        String classification=covered?"COVERED":!Boolean.TRUE.equals(ownerActive)?"OWNER_INACTIVE":grants.isEmpty()?"ORIGIN_NOT_VISIBLE_IN_READER_SNAPSHOT":grants.stream().noneMatch(Origin::live)?"ORIGIN_REVOKED":!publicationAvailable?"PUBLICATION_UNAVAILABLE":sampleBeforeStart?"DECISION_CLOCK_BEFORE_ORIGIN_START":"UNEXPLAINED_REFUSAL";
        var report=new LinkedHashMap<String,Object>();report.put("captureContext","ISOLATED_INSTRUMENTED_ENTITLEMENT_OBSERVATION");report.put("readRole",role);report.put("observationOrdinal",ordinal);report.put("locale",locale);report.put("covered",covered);report.put("expectedCovered",expected);report.put("classification",classification);
        report.put("context",context);report.put("isolation",db.queryForObject("SHOW transaction_isolation",String.class));report.put("transactionReadOnly",db.queryForObject("SHOW transaction_read_only",String.class));report.put("readerSnapshot",db.queryForObject("SELECT pg_current_snapshot()::text",String.class));
        report.put("clockSamplesUsedByDecision",samples.stream().map(Instant::toString).toList());report.put("clockMovedBackwardsWithinDecision",backwards);report.put("samplePrecedesOriginStart",sampleBeforeStart);
        report.put("ownerActive",ownerActive);report.put("visibleOriginCount",grants.size());report.put("origins",grants.stream().map(origin->Map.of("notRevoked",origin.live(),"startsAt",origin.start().toString(),"expiresAt",origin.expiry().toString(),"localeIncluded",origin.locale())).toList());report.put("pinnedNodes",nodes);
        report.put("instrumentation",Map.of("productionQueryTextUnchanged",true,"wrapperReturnsActualPostgresClock",true,"dedicatedSearchPath",true,"parallelUnsafeProbeWrites",true,"sameRepeatableReadSnapshotForFacts",true,"readWriteRequiredForProbeLogs",true,"productionReadOnlyModeReproduced",false,"paymentFlow",false,"historicalCauseEstablished",false));
        boolean written=false;try{Files.write(output.resolve(String.format("%03d-%s.json",ordinal,role)),JSON.writeValueAsBytes(report),StandardOpenOption.CREATE_NEW,StandardOpenOption.WRITE);written=true;}catch(Exception unavailable){/* Original decision remains the first assertion. */}
        // Unexpected decisions are not replaced by later observations. Their safe facts are already attempted.
        assertTrue(covered==expected,"Single entitlement decision must match its declared control; inspect retained safe observation before any new run");
        return new Observation(covered,written,samples.size(),classification);
    }

    private static Fixture fixture()throws Exception{
        try(var connection=connect()){
            var db=jdbc(connection);UUID owner=UUID.randomUUID();db.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(?,?,'unusable','ACTIVE')",owner,owner+"@example.invalid");
            var activity=node(db,"ACTIVITY");var module=node(db,"MODULE");var course=node(db,"COURSE");
            db.update("INSERT INTO version_compositions(id,parent_version_id,child_version_id,position) VALUES(?,?,?,1),(?,?,?,1)",UUID.randomUUID(),course.version(),module.version(),UUID.randomUUID(),module.version(),activity.version());
            for(var node:List.of(activity,module,course)){db.update("UPDATE pedagogical_versions SET frozen_at=pg_catalog.clock_timestamp() WHERE id=?",node.version());publish(db,node);}
            return new Fixture(owner,course,module,activity);
        }
    }
    private static Node node(JdbcTemplate db,String kind){var resource=UUID.randomUUID();var version=UUID.randomUUID();db.update("INSERT INTO learning_resources(id,kind) VALUES(?,?)",resource,kind);db.update("INSERT INTO pedagogical_versions(id,resource_id,version_number,objectives,evaluation_definition) VALUES(?,?,1,'Isolated probe','Isolated predicate facts')",version,resource);return new Node(resource,version);}
    private static void publish(JdbcTemplate db,Node node){
        UUID fr=UUID.randomUUID(),en=UUID.randomUUID(),frRevision=UUID.randomUUID(),enRevision=UUID.randomUUID();
        db.update("INSERT INTO content_translations(id,pedagogical_version_id,locale,editorial_state) VALUES(?,?,'fr','DRAFT')",fr,node.version());
        revision(db,fr,frRevision);db.update("UPDATE content_translations SET current_revision_id=?,published_revision_id=?,editorial_state='PUBLISHED' WHERE id=?",frRevision,frRevision,fr);
        db.update("INSERT INTO content_translations(id,pedagogical_version_id,locale,editorial_state,source_translation_id,source_revision_id) VALUES(?,?,'en','DRAFT',?,?)",en,node.version(),fr,frRevision);
        revision(db,en,enRevision);db.update("UPDATE content_translations SET current_revision_id=?,published_revision_id=?,published_source_revision_id=?,editorial_state='PUBLISHED' WHERE id=?",enRevision,enRevision,frRevision,en);
    }
    private static void revision(JdbcTemplate db,UUID translation,UUID revision){db.update("INSERT INTO editorial_revisions(id,translation_id,revision_number,title,summary,body,document_json,reason) VALUES(?,?,1,'Isolated SQL probe','','','{}'::jsonb,'Technical fixture, never human editorial approval')",revision,translation);}
    private static void grant(JdbcTemplate db,Fixture fixture){
        Instant start=db.queryForObject("SELECT pg_catalog.clock_timestamp()",Timestamp.class).toInstant();
        db.update("INSERT INTO access_grants(id,owner_id,resource_id,version_id,origin_type,manual_origin_id,locales,version_policy,starts_at,expires_at) VALUES(?,?,?,?,'MANUAL_TEST',?,'[\"fr\",\"en\"]'::jsonb,'PINNED',?,?)",UUID.randomUUID(),fixture.owner(),fixture.course().resource(),fixture.course().version(),UUID.randomUUID(),Timestamp.from(start),Timestamp.from(start.plusSeconds(86400)));
    }
    private static Connection connect()throws Exception{return DriverManager.getConnection(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword());}
    private static Connection reader()throws Exception{var connection=connect();connection.setReadOnly(false);connection.setAutoCommit(false);connection.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);jdbc(connection).execute("SET LOCAL search_path=access_probe,public,pg_catalog");return connection;}
    private static JdbcTemplate jdbc(Connection connection){return new JdbcTemplate(new SingleConnectionDataSource(connection,true));}
    private record Node(UUID resource,UUID version){}
    private record Fixture(UUID owner,Node course,Node module,Node activity){}
    private record Origin(boolean live,Instant start,Instant expiry,boolean locale){}
    private record Observation(boolean covered,boolean written,int clockCount,String classification){}
}
