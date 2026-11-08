package com.chatgptcourses.methods.service;

import static com.chatgptcourses.methods.service.MethodTypes.*;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import tools.jackson.databind.ObjectMapper;

public final class MethodValidation {
    private MethodValidation() { }
    public static void fields(MethodFields f,ObjectMapper mapper) {
        check(f!=null);text(f.title(),1,240);locale(f.locale());text(f.text(),1,32000);parameters(f.parameters());
        if(f.generatedFrom()!=null)parameters(f.generatedFrom());text(f.notes(),0,8000);if(f.category()!=null)text(f.category(),1,80);
        check(mapper.writeValueAsString(f).getBytes(StandardCharsets.UTF_8).length<=48*1024);
    }
    public static void parameters(MethodParameters p) {
        check(p!=null);for(String value:values(p))text(value,0,4000);
    }
    public static void definition(MethodDefinition d,ObjectMapper mapper) {
        check(d!=null);list(d.useCases());list(d.requiredInputs());list(d.steps());list(d.checks());list(d.limitations());
        text(d.starterInstruction(),0,4000);text(d.example(),0,8000);parameters(d.defaults());
        check(mapper.writeValueAsString(d).getBytes(StandardCharsets.UTF_8).length<=24*1024);
    }
    public static boolean complete(MethodDefinition d) {
        return d!=null&&!d.useCases().isEmpty()&&!d.requiredInputs().isEmpty()&&!d.steps().isEmpty()&&!d.checks().isEmpty()
            &&!d.limitations().isEmpty()&&!d.starterInstruction().isBlank()&&!d.example().isBlank();
    }
    public static List<String> values(MethodParameters p){return java.util.Arrays.asList(p.objective(),p.context(),p.availableData(),p.recipient(),p.format(),p.constraints(),p.clarifications());}
    public static void locale(String locale){check(locale!=null&&Set.of("fr","en").contains(locale));}
    public static void text(String value,int min,int max){
        check(value!=null&&value.length()<=max&&value.strip().length()>=min&&value.indexOf('\0')<0);
        for(int i=0;i<value.length();i++){char c=value.charAt(i);if(Character.isHighSurrogate(c))check(i+1<value.length()&&Character.isLowSurrogate(value.charAt(++i)));else check(!Character.isLowSurrogate(c));}
    }
    private static void list(List<String> values){check(values!=null&&values.size()<=20);for(String value:values)text(value,1,1000);}
    public static void check(boolean value){if(!value)throw new ApiException(ApiError.VALIDATION_FAILED);}
}
