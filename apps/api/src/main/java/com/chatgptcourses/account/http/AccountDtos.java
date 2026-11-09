package com.chatgptcourses.account.http;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

public final class AccountDtos {
    private AccountDtos() { }
    public record ProfilePatch(@JsonProperty(value="displayName",required=true) @Size(max=120) String displayName) { @Override public String toString(){return "ProfilePatch[redacted]";} }
    public record DataRequest(@NotNull @Pattern(regexp="EXPORT|ERASURE|ACCOUNT_CLOSURE") String type,@NotBlank @Size(max=2000) String reason) { @Override public String toString(){return "DataRequest[redacted]";} }
    public record Cancellation(@NotBlank @Size(max=2000) String reason) { @Override public String toString(){return "Cancellation[redacted]";} }
}
