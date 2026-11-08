package com.chatgptcourses.commerce.service;

import static com.chatgptcourses.commerce.service.CommerceTypes.*;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import tools.jackson.databind.ObjectMapper;

public final class OfferValidation {
    private OfferValidation(){ }
    public static final long MAX=9_007_199_254_740_991L;
    public static void fields(OfferFields f,ObjectMapper mapper){
        check(f!=null);list(f.copies(),2);list(f.resources(),20);list(f.locales(),2);
        unique(f.copies().stream().map(OfferCopy::locale).toList());unique(f.locales());
        for(var c:f.copies()){check(c!=null);locale(c.locale());text(c.title(),180);text(c.summary(),2000);}
        var ids=new HashSet<java.util.UUID>();
        for(var r:f.resources()){check(r!=null&&r.resourceId()!=null&&r.versionId()!=null&&ids.add(r.resourceId()));}
        for(var l:f.locales())locale(l);
        if(f.price()!=null)check(f.price().amountMinor()>=0&&f.price().amountMinor()<=MAX&&f.price().currency()!=null&&CommerceSettings.SUPPORTED_CURRENCIES.contains(f.price().currency()));
        if(f.tax()!=null){nullableChoice(f.tax().mode(),Set.of("INCLUSIVE","EXEMPT","EXCLUSIVE"));localized(f.tax().notices(),2000);}
        var c=f.conditions();if(c!=null){period(c.access(),Set.of("FIXED","UNLIMITED"));period(c.updates(),Set.of("NONE","PERIOD"));nullableChoice(c.versionPolicy(),Set.of("PINNED","UPDATES_DURING_PERIOD"));
            if(c.support()!=null){nullableChoice(c.support().mode(),Set.of("NONE","ASYNC"));localized(c.support().descriptions(),2000);}
            if(c.termsVersion()!=null)check(c.termsVersion().length()<=100&&c.termsVersion().indexOf('\0')<0);localized(c.terms(),8000);
        }
        check(mapper.writeValueAsBytes(f).length<=48*1024);
    }
    private static void period(OfferPeriod p,Set<String> modes){if(p==null)return;nullableChoice(p.mode(),modes);if(p.days()!=null)check(p.days()>=1&&p.days()<=36500);check(p.days()==null||"FIXED".equals(p.mode())||"PERIOD".equals(p.mode()));}
    private static void localized(List<LocalizedText> v,int max){list(v,2);unique(v.stream().map(LocalizedText::locale).toList());for(var x:v){check(x!=null);locale(x.locale());text(x.text(),max);}}
    private static void unique(List<String> v){check(new HashSet<>(v).size()==v.size());}
    private static void nullableChoice(String value,Set<String> options){check(value==null||options.contains(value));}
    private static void list(List<?> v,int max){check(v!=null&&v.size()<=max&&v.stream().noneMatch(java.util.Objects::isNull));}
    public static void locale(String v){check("fr".equals(v)||"en".equals(v));}
    public static void reason(String r){check(r!=null&&!r.isBlank());text(r,1000);}
    public static void text(String t,int max){check(t!=null&&t.length()<=max&&t.indexOf('\0')<0);}
    public static void check(boolean v){if(!v)throw new ApiException(ApiError.VALIDATION_FAILED);}
}
