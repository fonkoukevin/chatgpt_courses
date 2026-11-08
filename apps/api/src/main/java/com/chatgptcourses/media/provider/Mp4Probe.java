package com.chatgptcourses.media.provider;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** Reads ISO BMFF movie metadata and checks a video track. It does not claim antivirus or transcode/decode media. */
public final class Mp4Probe {
    private Mp4Probe(){ }
    public record Metadata(double durationSeconds,long sizeBytes,String sha256){ }
    public static Metadata inspect(Path file,long maximum)throws IOException{
        long size=Files.size(file);if(size<32||size>maximum)throw invalid();
        double measuredDuration;
        try(var channel=FileChannel.open(file,StandardOpenOption.READ)){
            boolean ftyp=false,mdat=false,video=false;double duration=Double.NaN;long offset=0;int boxes=0;
            while(offset<size){if(++boxes>10000)throw invalid();Box box=box(channel,offset,size);switch(box.type()){
                case "ftyp"->ftyp=box.size()>=16;
                case "mdat"->mdat=box.size()>box.header();
                case "moov"->{long p=box.payload();while(p<box.end()){Box child=box(channel,p,box.end());if(child.type().equals("mvhd"))duration=duration(channel,child);if(child.type().equals("trak"))video|=videoTrack(channel,child);p=child.end();}}
                default->{ }
            }offset=box.end();}
            if(!ftyp||!mdat||!video||!Double.isFinite(duration)||duration<=0||duration>86400)throw invalid();
            measuredDuration=duration;
        }
        try{var digest=MessageDigest.getInstance("SHA-256");long actual=0;try(var input=Files.newInputStream(file)){byte[] buffer=new byte[65536];int read;while((read=input.read(buffer))>=0)if(read>0){actual+=read;if(actual>maximum||actual>size)throw invalid();digest.update(buffer,0,read);}}if(actual!=size||Files.size(file)!=size)throw invalid();return new Metadata(measuredDuration,size,HexFormat.of().formatHex(digest.digest()));}
        catch(NoSuchAlgorithmException unavailable){throw new IllegalStateException("SHA-256 unavailable");}
    }
    private static double readDuration(Path file)throws IOException{try(var channel=FileChannel.open(file,StandardOpenOption.READ)){long size=channel.size(),p=0;while(p<size){Box root=box(channel,p,size);if(root.type().equals("moov")){long q=root.payload();while(q<root.end()){Box child=box(channel,q,root.end());if(child.type().equals("mvhd"))return duration(channel,child);q=child.end();}}p=root.end();}throw invalid();}}
    private static double duration(FileChannel channel,Box box)throws IOException{
        int count=(int)Math.min(32,box.end()-box.payload());if(count<1)throw invalid();var data=read(channel,box.payload(),count);int version=Byte.toUnsignedInt(data.get());
        if(version==0){if(data.limit()<20)throw invalid();long scale=Integer.toUnsignedLong(data.getInt(12)),ticks=Integer.toUnsignedLong(data.getInt(16));if(scale==0)return Double.NaN;return (double)ticks/scale;}
        if(version==1){if(data.limit()<32)throw invalid();long scale=Integer.toUnsignedLong(data.getInt(20)),ticks=data.getLong(24);if(scale==0||ticks<0)return Double.NaN;return (double)ticks/scale;}throw invalid();
    }
    private static boolean videoTrack(FileChannel channel,Box track)throws IOException{
        long p=track.payload();while(p<track.end()){Box child=box(channel,p,track.end());if(child.type().equals("mdia")){long q=child.payload();while(q<child.end()){Box inner=box(channel,q,child.end());if(inner.type().equals("hdlr")&&inner.end()-inner.payload()>=12){var data=read(channel,inner.payload()+8,4);return StandardCharsets.US_ASCII.decode(data).toString().equals("vide");}q=inner.end();}}p=child.end();}return false;
    }
    private static Box box(FileChannel channel,long offset,long limit)throws IOException{
        if(offset<0||limit-offset<8)throw invalid();var head=read(channel,offset,8);long size=Integer.toUnsignedLong(head.getInt());byte[] type=new byte[4];head.get(type);int header=8;if(size==1){if(limit-offset<16)throw invalid();size=read(channel,offset+8,8).getLong();header=16;}else if(size==0)size=limit-offset;
        if(size<header||size>limit-offset)throw invalid();return new Box(new String(type,StandardCharsets.US_ASCII),offset,size,header);
    }
    private static ByteBuffer read(FileChannel channel,long offset,int size)throws IOException{if(size<0)throw invalid();var data=ByteBuffer.allocate(size).order(ByteOrder.BIG_ENDIAN);while(data.hasRemaining()){int read=channel.read(data,offset+data.position());if(read<0)throw invalid();if(read==0)throw invalid();}return data.flip();}
    private static IOException invalid(){return new IOException("Invalid local MP4 fixture");}
    private record Box(String type,long offset,long size,int header){long payload(){return offset+header;}long end(){return offset+size;}}
}
