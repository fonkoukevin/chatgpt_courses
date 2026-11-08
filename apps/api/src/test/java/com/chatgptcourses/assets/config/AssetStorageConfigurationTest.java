package com.chatgptcourses.assets.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import com.chatgptcourses.assets.storage.LocalStorageBootstrap;
import com.chatgptcourses.shared.config.RuntimeProperties;
import java.net.URI;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AssetStorageConfigurationTest {
    @Test void internalHostCannotBecomeBrowserEndpointAndProductionCannotAdvertiseInsecureStorage(){
        assertThat(catchThrowable(()->settings("http://s3:8333")) instanceof IllegalArgumentException).isTrue();
        assertThat(catchThrowable(()->settings("https://s3")) instanceof IllegalArgumentException).isTrue();
        var configuration=new AssetStorageConfiguration();
        assertThat(catchThrowable(()->configuration.objectStorage(settings("http://127.0.0.1:8333"),new RuntimeProperties("production",URI.create("https://courses.example.test"),true))) instanceof IllegalArgumentException).isTrue();
        assertThat(catchThrowable(()->LocalStorageBootstrap.initialize(Map.of("APP_ENV","production"))) instanceof IllegalArgumentException).isTrue();
    }
    private static AssetStorageProperties settings(String external){return new AssetStorageProperties(true,URI.create("http://s3:8333"),URI.create(external),"us-east-1","test-key","test-secret","editorial-test","private-test",true,5242880,10485760,10,20971520,300,60,16000000,4096,60);}
}
