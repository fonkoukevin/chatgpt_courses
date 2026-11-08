package com.chatgptcourses.assets.validation;

import com.chatgptcourses.assets.config.AssetStorageProperties;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

@Component
public final class AssetContentValidator {
    private final AssetStorageProperties properties;
    private final ComplexDocumentValidator complex;
    public AssetContentValidator(AssetStorageProperties properties,ObjectProvider<ComplexDocumentValidator> complex){this.properties=properties;this.complex=complex.getIfAvailable();}
    public boolean pdfAvailable(){return complex!=null&&complex.available();}
    public record Result(byte[] bytes,String contentType,String rejectionCode){public boolean accepted(){return rejectionCode==null;}@Override public String toString(){return "ValidationResult[redacted]";}}
    public Result validate(byte[] bytes,String contentType){
        if("text/plain".equals(contentType))return text(bytes);
        if("application/pdf".equals(contentType))return pdfAvailable()&&bytes.length>=8&&new String(bytes,0,5,StandardCharsets.US_ASCII).equals("%PDF-")&&complex.acceptsPdf(bytes)?new Result(bytes,contentType,null):rejected("DOCUMENT_VALIDATOR_UNAVAILABLE");
        if("image/png".equals(contentType)||"image/jpeg".equals(contentType))return image(bytes,contentType);
        return rejected("FORMAT_NOT_ALLOWED");
    }
    private Result text(byte[] bytes){
        try{String value=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
            if(value.codePoints().anyMatch(c->c==0||c<32&&c!='\n'&&c!='\r'&&c!='\t'||c==127))return rejected("INVALID_TEXT");
            return new Result(bytes,"text/plain",null);
        }catch(CharacterCodingException e){return rejected("INVALID_UTF8");}
    }
    private Result image(byte[] bytes,String type){
        boolean png="image/png".equals(type);byte[] signature=png?new byte[]{(byte)137,80,78,71,13,10,26,10}:new byte[]{(byte)255,(byte)216,(byte)255};
        if(bytes.length<signature.length||!Arrays.equals(signature,Arrays.copyOf(bytes,signature.length)))return rejected("INVALID_SIGNATURE");
        try(var input=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))){
            var readers=ImageIO.getImageReaders(input);if(!readers.hasNext())return rejected("INVALID_IMAGE");var reader=readers.next();
            try{reader.setInput(input,true,true);int width=reader.getWidth(0),height=reader.getHeight(0);
                if(width<1||height<1||width>properties.maxImageDimension()||height>properties.maxImageDimension()||(long)width*height>properties.maxImagePixels())return rejected("IMAGE_DIMENSIONS_EXCEEDED");
                BufferedImage image=reader.read(0);if(image==null)return rejected("INVALID_IMAGE");var output=new ByteArrayOutputStream();
                if(!ImageIO.write(image,png?"png":"jpeg",output))return rejected("INVALID_IMAGE");byte[] sanitized=output.toByteArray();
                if(sanitized.length>properties.maxImageBytes())return rejected("SIZE_EXCEEDED");return new Result(sanitized,type,null);
            }finally{reader.dispose();}
        }catch(Exception e){return rejected("INVALID_IMAGE");}
    }
    private static Result rejected(String code){return new Result(null,null,code);}
}
