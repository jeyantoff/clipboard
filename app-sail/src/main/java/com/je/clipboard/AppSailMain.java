package com.zoho.ai.helloapp;

import com.catalyst.config.ZCThreadLocal;
import com.zc.api.APIConstants;
import com.zoho.javalibrary.misc.app.AppManager;
import lombok.SneakyThrows;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.lang.reflect.Field;
import java.util.Collections;
import java.util.Map;

@SpringBootApplication
public class AppSailMain
{
    
    public static void partialInit()
    {
        ZCThreadLocal.putValue(APIConstants.USER_TYPE, "admin");
        
//        setEnv(Collections.singletonMap("X_ZOHO_CATALYST_ACCOUNTS_URL", "https://accounts.zoho.in"));
//        setEnv(Collections.singletonMap("X_ZOHO_CATALYST_CONSOLE_URL", "https://api.catalyst.zoho.in"));
        
        try
        {
            AppManager.set(AppManager::new);
        }
        catch (Exception ignored)
        {
        
        }
        AppManager.appStarted();
    }
    
    public static void init()
    {
        if(System.getenv("X_ZOHO_CATALYST_ACCOUNTS_URL")==null || System.getenv("X_ZOHO_CATALYST_ACCOUNTS_URL").isBlank())
        {
            throw new RuntimeException("X_ZOHO_CATALYST_ACCOUNTS_URL environment variable is not set");
        }
        if(System.getenv("X_ZOHO_CATALYST_CONSOLE_URL")==null || System.getenv("X_ZOHO_CATALYST_CONSOLE_URL").isBlank())
        {
            throw new RuntimeException("X_ZOHO_CATALYST_CONSOLE_URL environment variable is not set");
        }
        ZCThreadLocal.putValue(APIConstants.USER_TYPE, "admin");
        AppManager.set(AppManager::new);
        AppManager.appStarted();
    }
    
    //ENVIRONMENT VARIABLES TO BE SET
    //X_ZOHO_CATALYST_ACCOUNTS_URL=https://accounts.zoho.in;X_ZOHO_CATALYST_CONSOLE_URL=https://api.catalyst.zoho.in
    public static void main(String[] args)
    {
        String port = System.getenv().getOrDefault("X_ZOHO_CATALYST_LISTEN_PORT","3000");
        SpringApplication app = new SpringApplication(AppSailMain.class);
        app.setDefaultProperties(Collections.singletonMap("server.port", port));
        app.run(args);
        
        init();
        
//        SalesIQController.startAckThread();
    }
    
    @SneakyThrows
    protected static void setEnv(Map<String, String> newenv) {
        try {
            Class<?> processEnvironmentClass = Class.forName("java.lang.ProcessEnvironment");
            Field theEnvironmentField = processEnvironmentClass.getDeclaredField("theEnvironment");
            theEnvironmentField.setAccessible(true);
            Map<String, String> env = (Map<String, String>) theEnvironmentField.get(null);
            env.putAll(newenv);
            Field theCaseInsensitiveEnvironmentField = processEnvironmentClass.getDeclaredField("theCaseInsensitiveEnvironment");
            theCaseInsensitiveEnvironmentField.setAccessible(true);
            Map<String, String> cienv = (Map<String, String>) theCaseInsensitiveEnvironmentField.get(null);
            cienv.putAll(newenv);
        } catch (NoSuchFieldException e) {
            Class[] classes = Collections.class.getDeclaredClasses();
            Map<String, String> env = System.getenv();
            for(Class cl : classes) {
                if("java.util.Collections$UnmodifiableMap".equals(cl.getName())) {
                    Field field = cl.getDeclaredField("m");
                    field.setAccessible(true);
                    Object obj = field.get(env);
                    Map<String, String> map = (Map<String, String>) obj;
//                    map.clear();
                    map.putAll(newenv);
                }
            }
        }
    }
}
