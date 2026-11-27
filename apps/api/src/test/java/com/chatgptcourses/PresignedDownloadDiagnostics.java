package com.chatgptcourses;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;

/** Test-only, after-the-read metadata. Never returns a URL, body, identity or exception message. */
final class PresignedDownloadDiagnostics {
    private static final Set<String> S3_CODES=Set.of("AccessDenied","RequestTimeTooSkewed","SignatureDoesNotMatch",
        "ExpiredToken","RequestExpired","InvalidAccessKeyId");
    private static final DateTimeFormatter SIGNING_DATE=DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmmss'Z'")
        .withResolverStyle(ResolverStyle.STRICT);
    private PresignedDownloadDiagnostics(){}

    record Timing(Instant linkReceivedAt,Instant getStartedAt,Instant getFinishedAt,long linkToGetNanos,long getElapsedNanos){}
    @FunctionalInterface interface Sink{void accept(Map<String,Object> metadata)throws Exception;}

    static void captureIfUnexpected(int status,String dateHeader,byte[] body,URI signedUri,Timing timing,Sink sink){
        try{
            var metadata=collectIfUnexpected(status,dateHeader,body,signedUri,timing);
            if(metadata.isPresent())sink.accept(metadata.get());
        }catch(Exception unavailable){/* The original status assertion must remain authoritative. */}
    }

    static Optional<Map<String,Object>> collectIfUnexpected(int status,String dateHeader,byte[] body,URI signedUri,Timing timing){
        if(status==200)return Optional.empty();
        return Optional.of(collectObservation(status,dateHeader,body,signedUri,timing));
    }

    static Map<String,Object> collectObservation(int status,String dateHeader,byte[] body,URI signedUri,Timing timing){
        var report=new LinkedHashMap<String,Object>();report.put("httpStatus",status);
        report.put("linkReceivedAt",timing.linkReceivedAt().toString());
        report.put("getStartedAt",timing.getStartedAt().toString());
        report.put("getFinishedAt",timing.getFinishedAt().toString());
        report.put("linkToGetNanos",timing.linkToGetNanos());report.put("getElapsedNanos",timing.getElapsedNanos());
        report.put("s3DateAvailable",false);
        try{
            var date=ZonedDateTime.parse(dateHeader,DateTimeFormatter.RFC_1123_DATE_TIME).toInstant();
            report.put("s3Date",date.toString());report.put("s3DateAvailable",true);
        }catch(Exception unavailable){/* Never keep a raw header or parser message. */}
        report.put("signatureTimesAvailable",false);
        try{
            String date=null,expires=null;
            for(var pair:signedUri.getRawQuery().split("&")){
                int separator=pair.indexOf('=');if(separator<0)continue;
                String name=pair.substring(0,separator);
                if("X-Amz-Date".equals(name)){
                    if(date!=null)throw new IllegalArgumentException();
                    date=URLDecoder.decode(pair.substring(separator+1),StandardCharsets.UTF_8);
                }else if("X-Amz-Expires".equals(name)){
                    if(expires!=null)throw new IllegalArgumentException();
                    expires=URLDecoder.decode(pair.substring(separator+1),StandardCharsets.UTF_8);
                }
            }
            if(date==null||!date.matches("[0-9]{8}T[0-9]{6}Z")||expires==null||!expires.matches("[0-9]{1,6}"))throw new IllegalArgumentException();
            long seconds=Long.parseLong(expires);if(seconds>604800)throw new IllegalArgumentException();
            var signedAt=LocalDateTime.parse(date,SIGNING_DATE).toInstant(ZoneOffset.UTC);
            report.put("signedAt",signedAt.toString());report.put("signedExpiresAt",signedAt.plusSeconds(seconds).toString());
            report.put("signatureTimesAvailable",true);
        }catch(Exception unavailable){/* No other query parameter is decoded or retained. */}
        report.put("s3CodeAvailable",false);report.put("s3ExpiryIndicated",false);
        if(status<400)return Map.copyOf(report);
        try{
            if(body.length>65536)throw new IllegalArgumentException();
            var factory=DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities",false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities",false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");
            factory.setXIncludeAware(false);factory.setExpandEntityReferences(false);
            var parser=factory.newDocumentBuilder();
            parser.setErrorHandler(new DefaultHandler(){
                @Override public void error(SAXParseException failure)throws SAXException{throw failure;}
                @Override public void fatalError(SAXParseException failure)throws SAXException{throw failure;}
            });
            var document=parser.parse(new ByteArrayInputStream(body));
            var root=document.getDocumentElement();var codes=root.getElementsByTagName("Code");
            if(!"Error".equals(root.getTagName())||codes.getLength()!=1||codes.item(0).getParentNode()!=root)throw new IllegalArgumentException();
            String code=codes.item(0).getTextContent();
            if(S3_CODES.contains(code)){report.put("s3Code",code);report.put("s3CodeAvailable",true);}
            var messages=root.getElementsByTagName("Message");
            if("AccessDenied".equals(code)&&messages.getLength()==1&&messages.item(0).getParentNode()==root
                &&"Request has expired".equals(messages.item(0).getTextContent()))report.put("s3ExpiryIndicated",true);
        }catch(Exception unavailable){/* Never retain the XML, its Message, or parser diagnostics. */}
        return Map.copyOf(report);
    }
}
