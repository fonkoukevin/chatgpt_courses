package com.chatgptcourses.learning.service;

import com.chatgptcourses.learning.service.LearningTypes.QuizPolicy;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import tools.jackson.databind.ObjectMapper;

public final class LearningValidation {
    private LearningValidation() { }
    public static QuizPolicy effectivePolicy(QuizPolicy policy) { return policy==null?new QuizPolicy(100,null):policy; }
    public static void policy(QuizPolicy policy) {
        var p=effectivePolicy(policy);check(p.passPercent()>=1&&p.passPercent()<=100&&(p.maxAttempts()==null||(p.maxAttempts()>=1&&p.maxAttempts()<=50)));
    }
    static void check(boolean condition) { if(!condition)throw new ApiException(ApiError.VALIDATION_FAILED); }
    static void locale(String locale) { check(locale!=null&&Set.of("fr","en").contains(locale)); }
    static void text(String value,int max) {
        check(value!=null&&value.length()<=max&&value.indexOf('\0')<0);
        for(int i=0;i<value.length();i++) {char c=value.charAt(i);if(Character.isHighSurrogate(c))check(i+1<value.length()&&Character.isLowSurrogate(value.charAt(++i)));else check(!Character.isLowSurrogate(c));}
    }
    static void noteText(String text,ObjectMapper mapper) {text(text,16000);check(mapper.writeValueAsString(new LearningTypes.UpdateActivityNote(text)).getBytes(StandardCharsets.UTF_8).length<=48*1024);}
    static void page(int page,int size) {check(page>=0&&page<=1_000_000&&size>=1&&size<=100);}
}
