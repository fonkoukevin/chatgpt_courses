package com.chatgptcourses.shared.metrics;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Server-side observed facts only; no text, client analytics or inferred historical revisions. */
public class BusinessFactRecorder {
    private final JdbcTemplate jdbc;
    public BusinessFactRecorder(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public void activityStarted(UUID owner,UUID enrollment,UUID version){requireTransaction();jdbc.update("INSERT INTO operations_activity_starts(owner_id,enrollment_id,activity_version_id) VALUES(?,?,?) ON CONFLICT(enrollment_id,activity_version_id) DO NOTHING",owner,enrollment,version);}
    public void personalRevision(UUID owner,String type,UUID object,long revision,Instant savedAt){requireTransaction();if(!java.util.Set.of("METHOD","NOTE","PROJECT").contains(type)||savedAt==null)throw new IllegalArgumentException("Invalid business fact");jdbc.update("INSERT INTO operations_personal_revision_events(object_type,object_id,revision,owner_id,occurred_at) VALUES(?,?,?,?,?) ON CONFLICT(object_type,object_id,revision) DO NOTHING",type,object,revision,owner,Timestamp.from(savedAt));}
    private static void requireTransaction(){if(!TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("Business facts require their business transaction");}
}
