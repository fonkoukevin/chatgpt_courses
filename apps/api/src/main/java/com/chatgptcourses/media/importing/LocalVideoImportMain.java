package com.chatgptcourses.media.importing;

import com.chatgptcourses.media.config.MediaProperties;
import com.chatgptcourses.media.provider.LocalVideoPlaybackProvider;
import com.chatgptcourses.media.service.LocalVideoRegistry;
import com.chatgptcourses.shared.http.ApiException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/** Explicit local/test import after CMS creation. No application, web server, mail worker, migration or seed is started. */
public final class LocalVideoImportMain {
    private LocalVideoImportMain(){ }
    public static void main(String[] args){
        try{int count=run(args);System.out.println("{\"provider\":\"LOCAL_TEST\",\"processed\":"+count+"}");}
        catch(ApiException failure){System.err.println("Local video import failed: "+failure.error().name());System.exit(2);}
        catch(AccessDeniedException failure){System.err.println("Local video import failed: ACCESS_DENIED");System.exit(2);}
        catch(Exception failure){System.err.println("Local video import failed: invalid configuration, manifest or MP4");System.exit(2);}
    }
    static int run(String[] args)throws Exception{
        if(args.length!=1)throw new IllegalArgumentException();String environment=env("APP_ENV");if(!Set.of("local","test").contains(environment)||!"true".equals(System.getenv("VIDEO_ENABLED")))throw new IllegalArgumentException();
        Path manifest=Path.of(args[0]).toRealPath();if(Files.size(manifest)>262144)throw new IllegalArgumentException();Path sourceRoot=manifest.getParent().toRealPath();
        var tree=new ObjectMapper().readTree(Files.readString(manifest));if(!tree.isObject()||tree.size()!=2||!tree.has("actorId")||!tree.path("items").isArray()||tree.path("items").size()>100)throw new IllegalArgumentException();UUID actor=UUID.fromString(tree.path("actorId").asText());
        var properties=new MediaProperties(true,env("VIDEO_PROVIDER"),Path.of(env("VIDEO_LOCAL_ROOT")),null,integer("VIDEO_LINK_TTL_SECONDS",60),integer("VIDEO_MAX_BYTES",20971520));
        var provider=new LocalVideoPlaybackProvider(properties,environment);String host=env("POSTGRES_HOST"),database=env("POSTGRES_DB");if(!host.matches("[A-Za-z0-9.:-]+")||!database.matches("[A-Za-z0-9_]+"))throw new IllegalArgumentException();
        int port=integer("POSTGRES_PORT",5432);if(port<1||port>65535)throw new IllegalArgumentException();var connectionProperties=new Properties();connectionProperties.setProperty("user",env("POSTGRES_USER"));connectionProperties.setProperty("password",env("POSTGRES_PASSWORD"));connectionProperties.setProperty("logServerErrorDetail","false");connectionProperties.setProperty("connectTimeout","3");connectionProperties.setProperty("socketTimeout","10");
        try(var connection=DriverManager.getConnection("jdbc:postgresql://"+host+":"+port+"/"+database,connectionProperties)){
            var source=new SingleConnectionDataSource(connection,true);var jdbc=new JdbcTemplate(source);var transactions=new TransactionTemplate(new DataSourceTransactionManager(source));var registry=new LocalVideoRegistry(jdbc,provider);
            for(var item:tree.path("items")){
                if(!item.isObject()||item.size()<5||item.size()>7)throw new IllegalArgumentException();var names=item.propertyNames();for(var name:names)if(!Set.of("id","resourceId","versionId","locale","file","transcript","captionsVtt").contains(name))throw new IllegalArgumentException();
                UUID id=UUID.fromString(item.path("id").asText()),resource=UUID.fromString(item.path("resourceId").asText()),version=UUID.fromString(item.path("versionId").asText());String locale=item.path("locale").asText();Path relative=Path.of(item.path("file").asText());if(relative.isAbsolute())throw new IllegalArgumentException();Path file=sourceRoot.resolve(relative).normalize().toRealPath();if(!file.startsWith(sourceRoot))throw new IllegalArgumentException();
                String transcript=item.path("transcript").isMissingNode()||item.path("transcript").isNull()?null:item.path("transcript").asText();String captions=item.path("captionsVtt").isMissingNode()||item.path("captionsVtt").isNull()?null:item.path("captionsVtt").asText();
                transactions.executeWithoutResult(status->registry.register(actor,id,resource,version,locale,file,transcript,captions));
            }
            return tree.path("items").size();
        }
    }
    private static String env(String name){String value=System.getenv(name);if(value==null||value.isBlank())throw new IllegalArgumentException();return value;}
    private static int integer(String name,int fallback){String value=System.getenv(name);return value==null||value.isBlank()?fallback:Integer.parseInt(value);}
}
