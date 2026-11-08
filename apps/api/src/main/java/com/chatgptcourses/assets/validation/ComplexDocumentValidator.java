package com.chatgptcourses.assets.validation;

/** A deployment may provide a real document parser/scanner. Absence never becomes a clean verdict. */
public interface ComplexDocumentValidator {
    boolean available();
    boolean acceptsPdf(byte[] bytes);
}
