package com.chatgptcourses.payments.refunds.http;

import com.chatgptcourses.payments.refunds.RefundTypes;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

/** Explicit transport validation; no client score, owner or provider identifier is accepted. */
final class RefundDtos {
    private RefundDtos(){ }
    record Create(@NotBlank @Size(max=2000) String reason){RefundTypes.CreateRefundRequest value(){return new RefundTypes.CreateRefundRequest(reason);}@Override public String toString(){return "RefundCreate[redacted]";}}
    record Action(@NotBlank @Size(max=2000) String reason){RefundTypes.RefundAction value(){return new RefundTypes.RefundAction(reason);}@Override public String toString(){return "RefundAction[redacted]";}}
    record Allocation(@NotNull UUID orderResourceId,@NotNull @Min(0) @Max(99999999) Long amountMinor,@NotNull @Pattern(regexp="KEEP|REVOKE") String accessAction){RefundTypes.RefundAllocation value(){return new RefundTypes.RefundAllocation(orderResourceId,amountMinor,accessAction);}}
    record Preview(@NotNull @Min(1) @Max(99999999) Long amountMinor,@NotNull @Size(min=1,max=20) List<@NotNull @Valid Allocation> allocations){RefundTypes.PreviewRefund value(){return new RefundTypes.PreviewRefund(amountMinor,allocations.stream().map(Allocation::value).toList());}}
    record Decision(@NotNull @Pattern(regexp="APPROVE|REJECT") String outcome,@NotBlank @Size(max=2000) String reason,@Pattern(regexp="[a-f0-9]{64}") String previewFingerprint,@Min(1) @Max(99999999) Long amountMinor,@NotNull @Size(max=20) List<@NotNull @Valid Allocation> allocations){RefundTypes.DecideRefund value(){return new RefundTypes.DecideRefund(outcome,reason,previewFingerprint,amountMinor,allocations.stream().map(Allocation::value).toList());}@Override public String toString(){return "RefundDecision[redacted]";}}
    record AccessDecision(@NotBlank @Size(max=2000) String reason,@NotNull @Size(min=1,max=20) List<@NotNull @Valid Allocation> allocations){RefundTypes.ResolveExternalRefund value(){return new RefundTypes.ResolveExternalRefund(reason,allocations.stream().map(Allocation::value).toList());}@Override public String toString(){return "RefundAccessDecision[redacted]";}}
}
