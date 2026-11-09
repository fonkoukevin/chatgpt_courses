package com.chatgptcourses.editorial.importing;

import com.chatgptcourses.access.*;
import com.chatgptcourses.assets.config.AssetStorageProperties;
import com.chatgptcourses.assets.service.*;
import com.chatgptcourses.assets.storage.S3ObjectStorage;
import com.chatgptcourses.assets.validation.*;
import com.chatgptcourses.catalog.service.PublicCatalogueService;
import com.chatgptcourses.editorial.service.*;
import com.chatgptcourses.learning.service.LearningService;
import com.chatgptcourses.methods.service.MethodService;
import com.chatgptcourses.projects.service.ProjectService;
import com.chatgptcourses.shared.config.RuntimeProperties;
import com.chatgptcourses.shared.http.ApiException;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.*;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/** No Spring Boot context/server, Flyway, scheduler, mail, role provisioning or publication is started. */
public final class ContentImportMain {
    private ContentImportMain(){ }
    public static void main(String[] args){
        try{System.out.println(new ObjectMapper().writeValueAsString(run(args)));}
        catch(ApiException e){System.err.println("Content import failed: "+e.error().name());System.exit(2);}
        catch(AccessDeniedException e){System.err.println("Content import failed: ACCESS_DENIED");System.exit(2);}
        catch(Exception e){System.err.println("Content import failed: invalid configuration, manifest or source ("+e.getClass().getSimpleName()+")");System.exit(2);}
    }
    private static EditorialImportService.Report run(String[] args)throws Exception{
        UUID actor=null;Path manifest=null;boolean apply=false,mode=false;
        for(int i=0;i<args.length;i++)switch(args[i]){case "--actor"->{if(actor!=null||++i>=args.length)throw new IllegalArgumentException();actor=UUID.fromString(args[i]);}case "--manifest"->{if(manifest!=null||++i>=args.length)throw new IllegalArgumentException();manifest=Path.of(args[i]);}case "--apply","--plan"->{if(mode)throw new IllegalArgumentException();mode=true;apply=args[i].equals("--apply");}default->throw new IllegalArgumentException();}
        if(actor==null||manifest==null||!Set.of("local","test").contains(env("APP_ENV")))throw new IllegalArgumentException();
        var environment=new StandardEnvironment();for(var source:new YamlPropertySourceLoader().load("application",new ClassPathResource("application.yml")))environment.getPropertySources().addLast(source);
        var properties=Binder.get(environment).bind("courses.assets",AssetStorageProperties.class).orElseThrow(IllegalArgumentException::new);
        var runtime=Binder.get(environment).bind("courses.runtime",RuntimeProperties.class).orElseThrow(IllegalArgumentException::new);
        if(!runtime.environment().equals(env("APP_ENV"))||!properties.enabled()||!loopback(properties.internalEndpoint())||!loopback(properties.externalEndpoint()))throw new IllegalArgumentException();
        String host=System.getenv().getOrDefault("POSTGRES_HOST","localhost"),database=env("POSTGRES_DB");if(!Set.of("localhost","127.0.0.1","::1").contains(host)||!database.matches("[A-Za-z0-9_]+"))throw new IllegalArgumentException();int port=Integer.parseInt(System.getenv().getOrDefault("POSTGRES_PORT","5432"));if(port<1||port>65535)throw new IllegalArgumentException();
        var connectionProperties=new Properties();connectionProperties.setProperty("user",env("POSTGRES_USER"));connectionProperties.setProperty("password",env("POSTGRES_PASSWORD"));connectionProperties.setProperty("logServerErrorDetail","false");connectionProperties.setProperty("connectTimeout","3");connectionProperties.setProperty("socketTimeout","30");
        try(var connection=DriverManager.getConnection("jdbc:postgresql://"+host+":"+port+"/"+database,connectionProperties);var storage=new S3ObjectStorage(properties)){
            var source=new SingleConnectionDataSource(connection,true);var jdbc=new JdbcTemplate(source);var tx=new TransactionTemplate(new DataSourceTransactionManager(source));var mapper=new ObjectMapper();
            var catalogue=new PublicCatalogueService(jdbc,mapper);var entitlements=new EntitlementAccess(jdbc,runtime);var members=new MemberContentService(jdbc,mapper,catalogue,entitlements);var methods=new MethodService(jdbc,mapper,catalogue);var learning=new LearningService(jdbc,mapper,catalogue,methods,members,entitlements);var projects=new ProjectService(jdbc,mapper,catalogue,learning,members);
            var policy=new AssetAccessPolicy(jdbc,catalogue,learning,new DefaultAccessPolicy(),members,entitlements);var validator=new AssetContentValidator(properties,new StaticListableBeanFactory().getBeanProvider(ComplexDocumentValidator.class));var assets=new AssetService(jdbc,policy,storage,properties,validator,projects);var editorial=new EditorialService(jdbc,mapper,List.of(assets));
            return new EditorialImportService(jdbc,mapper,editorial,assets,storage,tx,properties.maxFileBytes(),runtime.environment()).run(manifest,actor,apply);
        }
    }
    private static boolean loopback(java.net.URI value){return value!=null&&Set.of("localhost","127.0.0.1","[::1]","::1").contains(value.getHost());}
    private static String env(String key){var value=System.getenv(key);if(value==null||value.isBlank())throw new IllegalArgumentException();return value;}
}
