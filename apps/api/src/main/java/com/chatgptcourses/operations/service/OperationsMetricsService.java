package com.chatgptcourses.operations.service;

import static com.chatgptcourses.account.service.AccountOperations.*;
import static com.chatgptcourses.operations.service.MetricsTypes.*;
import com.chatgptcourses.operations.service.OperationsTypes.OperationsPeriod;
import com.chatgptcourses.shared.http.ApiError;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OperationsMetricsService {
    private final OperationsStore db;
    public OperationsMetricsService(OperationsStore db){this.db=db;}
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public OperationsMetrics metrics(UUID actor,Instant from,Instant to,String currency){db.auth.require(actor,"operations.metrics.read");OperationsStore.period(from,to);OperationsStore.currency(currency);var period=new OperationsPeriod(from,to);Instant since=db.jdbc.queryForObject("SELECT installed_on AT TIME ZONE 'UTC' FROM flyway_schema_history WHERE version='017' AND success ORDER BY installed_rank DESC LIMIT 1",Timestamp.class).toInstant();boolean partial=from.isBefore(since);var counts=new ArrayList<CountMetric>();
        counts.add(new CountMetric("USEFUL_VISITS",null,"UNKNOWN","NOT_CONFIGURED",definition("USEFUL_VISITS","VISIT","NONE","NONE","NONE","NOT_RECORDED","NOT_CONFIGURED")));
        counts.add(count("ACTIVITY_STARTED","ENROLLMENT_ACTIVITY_VERSION","operations_activity_starts","occurred_at","enrollment_id,activity_version_id","FIRST_OBSERVED_SINCE_V017",partial?"NO_HISTORICAL_BACKFILL":"NO_VISITOR_ANALYTICS",scalar("SELECT count(*)::text FROM operations_activity_starts WHERE occurred_at>=? AND occurred_at<?",from,to,null),partial));
        counts.add(count("PERSONAL_REVISIONS_SAVED","PERSONAL_OBJECT_REVISION","operations_personal_revision_events","occurred_at","object_type,object_id,revision","FIRST_OBSERVED_SINCE_V017","NO_TEXT_RECORDED",scalar("SELECT count(*)::text FROM operations_personal_revision_events WHERE occurred_at>=? AND occurred_at<?",from,to,null),partial));
        String c=currency==null?"":" AND currency=?";
        counts.add(count("CHECKOUT_STARTED","CHECKOUT_OPERATION","checkout_operations","created_at","id","PERSISTED_OPERATIONS","NOT_PAYMENT_CONFIRMATION",scalar("SELECT count(*)::text FROM checkout_operations WHERE created_at>=? AND created_at<?"+c,from,to,currency),false));
        counts.add(count("PAYMENT_CONFIRMED","ORDER","orders","paid_at","id","CONFIRMED_PAYMENTS","NOT_CURRENT_ENTITLEMENT",scalar("SELECT count(*)::text FROM orders WHERE payment_status='PAID' AND paid_at>=? AND paid_at<?"+c,from,to,currency),false));
        counts.add(count("ACCESS_GRANTED","ACCESS_ORIGIN","access_grants JOIN order_resources JOIN orders","access_grants.created_at","access_grants.id","ORDER_LINE_ORIGINS","REVOCATION_DOES_NOT_ERASE_GRANT_FACT",scalar("SELECT count(*)::text FROM access_grants g JOIN order_resources r ON r.id=g.order_resource_id JOIN orders o ON o.id=r.order_id WHERE g.origin_type='ORDER_LINE' AND g.created_at>=? AND g.created_at<?"+(currency==null?"":" AND o.currency=?"),from,to,currency),false));
        counts.add(count("DECLARED_COMPLETION","ENROLLMENT_ACTIVITY_VERSION","learning_activity_progress","completed_at","enrollment_id,activity_version_id","CURRENT_DECLARATIONS","NOT_COMPETENCE_AND_DECLARATION_CAN_BE_WITHDRAWN",scalar("SELECT count(*)::text FROM learning_activity_progress WHERE completed_at>=? AND completed_at<?",from,to,null),false));
        counts.add(count("REFUND_CONFIRMED","REFUND_OPERATION","refund_operations","confirmed_at","id","HISTORICAL_CONFIRMATIONS","CONTRADICTION_REMAINS_CONFIRMED_AND_REQUIRES_REVIEW",scalar("SELECT count(*)::text FROM refund_operations WHERE confirmed_at>=? AND confirmed_at<?"+c,from,to,currency),false));
        List<String> currencies=currency==null?db.jdbc.query("SELECT currency FROM orders WHERE payment_status='PAID' AND paid_at>=? AND paid_at<? UNION SELECT currency FROM refund_operations WHERE confirmed_at>=? AND confirmed_at<? ORDER BY currency",(r,n)->r.getString(1),Timestamp.from(from),Timestamp.from(to),Timestamp.from(from),Timestamp.from(to)):List.of(currency);
        var money=new ArrayList<CurrencyMetrics>();for(String code:currencies){String gross=scalar("SELECT coalesce(sum(total_amount),0)::text FROM orders WHERE payment_status='PAID' AND paid_at>=? AND paid_at<? AND currency=?",from,to,code);String refunded=scalar("SELECT coalesce(sum(amount_minor),0)::text FROM refund_operations WHERE confirmed_at>=? AND confirmed_at<? AND currency=?",from,to,code);money.add(new CurrencyMetrics(code,gross,refunded,new BigInteger(gross).subtract(new BigInteger(refunded)).toString(),null,null,null,null,null,List.of("TAX_AMOUNT_NOT_RECORDED","FEES_NOT_RECORDED","VARIABLE_COSTS_NOT_RECORDED","SUPPORT_RATE_NOT_CONFIGURED","CONTRIBUTION_INCOMPLETE")));}
        String minutes=scalar("SELECT sum(minutes)::text FROM support_time_entries WHERE created_at>=? AND created_at<?",from,to,null);
        return new OperationsMetrics(period,db.now().toInstant(),since,counts,money,minutes,minutes==null?"UNKNOWN":"AVAILABLE");
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public MetricsCsv export(UUID actor,Instant from,Instant to,String currency){db.auth.require(actor,"operations.metrics.export");var metrics=metrics(actor,from,to,currency);var csv=new StringBuilder("Metric,Value,Availability,Unit,Currency,FromInclusive,ToExclusive,Source,DateField,Deduplication,Denominator,Coverage,Limitation\r\n");for(var count:metrics.counts()){var d=count.definition();row(csv,count.code(),count.value(),count.availability(),d.unit(),null,from,to,d.source(),d.dateField(),d.deduplication(),d.denominator(),d.coverage(),d.limitation());}for(var m:metrics.currencies()){
        row(csv,"GROSS_PAID",m.grossPaidMinor(),"AVAILABLE","MINOR_CURRENCY_UNIT",m.currency(),from,to,"orders","paid_at","id","NOT_A_RATIO","PERIOD_FLOWS","NOT_PROFIT");
        row(csv,"CONFIRMED_REFUNDED",m.confirmedRefundedMinor(),"AVAILABLE","MINOR_CURRENCY_UNIT",m.currency(),from,to,"refund_operations","confirmed_at","id","NOT_A_RATIO","PERIOD_FLOWS","HISTORICAL_CONFIRMATION");
        row(csv,"NET_COLLECTED_BEFORE_COSTS",m.netCollectedBeforeCostsMinor(),"AVAILABLE","MINOR_CURRENCY_UNIT",m.currency(),from,to,"orders/refund_operations","paid_at/confirmed_at","SOURCE_IDS","NOT_A_RATIO","PERIOD_FLOWS","NOT_COHORT_REVENUE_OR_PROFIT");
        for(String unknown:List.of("TAXES","FEES","VARIABLE_COSTS","SUPPORT_COST","ESTIMATED_CONTRIBUTION"))row(csv,unknown,null,"UNKNOWN","MINOR_CURRENCY_UNIT",m.currency(),from,to,"NOT_RECORDED","NONE","NONE","NOT_A_RATIO","UNKNOWN","MISSING_VALIDATED_DATA");
        }row(csv,"RECORDED_SUPPORT_MINUTES",metrics.recordedSupportMinutes(),metrics.supportMinutesAvailability(),"MINUTE",null,from,to,"support_time_entries","created_at","id","NOT_A_RATIO","EXPLICIT_ENTRIES_ONLY","NO_HOURLY_RATE_ASSUMED");byte[] bytes=csv.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>1024*1024)throw error(ApiError.EXPORT_TOO_LARGE);var date=DateTimeFormatter.ofPattern("yyyyMMdd").withZone(ZoneOffset.UTC);return new MetricsCsv(bytes,"operations-metrics-"+date.format(from)+"-"+date.format(to)+".csv",hex(digest(bytes)));}
    private String scalar(String sql,Instant from,Instant to,String currency){return db.jdbc.queryForObject(sql,String.class,currency==null?new Object[]{Timestamp.from(from),Timestamp.from(to)}:new Object[]{Timestamp.from(from),Timestamp.from(to),currency});}
    private static MetricDefinition definition(String code,String unit,String source,String date,String dedup,String coverage,String limitation){return new MetricDefinition(code,unit,source,date,dedup,"NOT_A_RATIO",coverage,limitation);}
    private static CountMetric count(String code,String unit,String source,String date,String dedup,String coverage,String limitation,String value,boolean partial){return new CountMetric(code,value,partial?"PARTIAL":"AVAILABLE",partial?"NO_HISTORICAL_BACKFILL":null,definition(code,unit,source,date,dedup,coverage,limitation));}
    private static void row(StringBuilder csv,Object... values){for(int i=0;i<values.length;i++){if(i>0)csv.append(',');String value=values[i]==null?"":values[i].toString();if(!value.matches("-?(0|[1-9][0-9]*)")&&value.matches("(?s)^[\\s]*[=+@-].*"))value="'"+value;csv.append('"').append(value.replace("\"","\"\"")).append('"');}csv.append("\r\n");}
}
