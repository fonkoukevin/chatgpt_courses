package com.chatgptcourses.assets.config;

import com.chatgptcourses.assets.storage.ObjectStorage;
import com.chatgptcourses.assets.storage.S3ObjectStorage;
import com.chatgptcourses.assets.storage.StorageUnavailableException;
import com.chatgptcourses.shared.config.RuntimeProperties;
import java.time.Duration;
import java.util.Optional;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods=false)
@EnableConfigurationProperties(AssetStorageProperties.class)
public class AssetStorageConfiguration {
    @Bean(destroyMethod="close")
    ObjectStorage objectStorage(AssetStorageProperties properties,RuntimeProperties runtime){
        if(properties.enabled()&&!java.util.Set.of("local","test").contains(runtime.environment())&&!"https".equals(properties.externalEndpoint().getScheme()))throw new IllegalArgumentException("External object storage requires HTTPS outside local/test");
        return properties.enabled()?new S3ObjectStorage(properties):new DisabledStorage();
    }
    private static final class DisabledStorage implements ObjectStorage,AutoCloseable {
        public Optional<Metadata> head(Location l){throw unavailable();}
        public byte[] read(Location l,long max){throw unavailable();}
        public void put(Location l,byte[] b,String type,String disposition){throw unavailable();}
        public SignedRequest presignPut(Location l,String type,long size,Duration ttl){throw unavailable();}
        public SignedRequest presignGet(Location l,String type,String disposition,Duration ttl){throw unavailable();}
        public void deleteStaging(Location l){throw unavailable();}
        public void close(){ }
        private StorageUnavailableException unavailable(){return new StorageUnavailableException();}
    }
}
