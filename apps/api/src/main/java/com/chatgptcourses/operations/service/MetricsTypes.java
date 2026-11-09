package com.chatgptcourses.operations.service;

import com.chatgptcourses.operations.service.OperationsTypes.OperationsPeriod;
import java.time.Instant;
import java.util.List;

public final class MetricsTypes {
    private MetricsTypes() { }
    public record MetricDefinition(String code,String unit,String source,String dateField,String deduplication,String denominator,String coverage,String limitation) { }
    public record CountMetric(String code,String value,String availability,String unavailableReason,MetricDefinition definition) { }
    public record CurrencyMetrics(String currency,String grossPaidMinor,String confirmedRefundedMinor,String netCollectedBeforeCostsMinor,String taxesMinor,String feesMinor,String variableCostsMinor,String supportCostMinor,String estimatedContributionMinor,List<String> unknownReasons) { }
    public record OperationsMetrics(OperationsPeriod period,Instant generatedAt,Instant revisionTrackingSince,List<CountMetric> counts,List<CurrencyMetrics> currencies,String recordedSupportMinutes,String supportMinutesAvailability) { }
    public record MetricsCsv(byte[] bytes,String filename,String sha256) { @Override public String toString(){return "MetricsCsv[aggregate]";} }
}
