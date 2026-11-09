package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;

class S3CiDiagnosticTest {
    @Test void privateValuesAndArbitraryExceptionsCannotBecomeDiagnosticFields(){
        String privateValue="https://private.invalid/?token=private-sentinel";
        var snapshot=new S3CiDiagnostic.Snapshot(privateValue,privateValue,null,Long.MAX_VALUE);
        String diagnostic=S3CiDiagnostic.render(snapshot,S3CiDiagnostic.Phase.CONFIRM,-99,privateValue);
        assertThat(diagnostic).isEqualTo("P21_S3_DIAG_V1 phase=CONFIRM state=UNKNOWN rejection=OTHER expired=unknown elapsedMs=0 ageMs=120000 error=OTHER");
        var original=new IllegalStateException(privateValue);var frames=original.getStackTrace();
        new S3CiDiagnostic.Tracker(null,null,S3CiDiagnostic.Phase.FIRST_IMPORT).attach(original);
        assertThat(original.getMessage()).isEqualTo(privateValue);assertThat(original.getStackTrace()).isEqualTo(frames);
        assertThat(original.getSuppressed()).hasSize(1);assertThat(original.getSuppressed()[0].getStackTrace()).isEmpty();
        assertThat(original.getSuppressed()[0].getMessage()).doesNotContain(privateValue).contains("error=OTHER");
        assertThat(S3CiDiagnostic.category(new AssertionError(privateValue))).isEqualTo("ASSERTION");
    }
}
