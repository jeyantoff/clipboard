package com.zoho.ai.helloapp;

import com.catalyst.config.ZCThreadLocal;
import com.zc.api.APIConstants;
import com.zc.auth.ZCAuth;
import com.zc.common.ZCProject;
import com.zc.common.ZCProjectConfig;
import lombok.SneakyThrows;
import org.json.simple.JSONObject;

import java.util.logging.Logger;

import static com.zc.api.APIConstants.ZCUserScope.ADMIN;

public class Project
{
    private static final Logger LOGGER = Logger.getLogger(Project.class.getName());
    
    public static ZCProject AI_CHAT_FRAMEWORK()
    {
        if(!isAppSail())
        {
            LOGGER.info("Initializing AI-in-SalesIQ through ZCProject.initProject");
            return ZCProject.initProject("AI-in-SalesIQ", ADMIN);
        }
        else
        {
            LOGGER.info("Initializing AI-in-SalesIQ through ZCProject.initProject in AppSail");
            return initAppThroughAPI();
        }
    }
    
    /**
     * Scopes: ZohoCatalyst.projects.READ, ZohoCatalyst.projects.CREATE, ZohoCatalyst.projects.UPDATE, ZohoCatalyst.projects.DELETE, ZohoCatalyst.projects.users.READ, ZohoCatalyst.projects.users.CREATE, ZohoCatalyst.projects.users.DELETE, ZohoCatalyst.tables.READ, ZohoCatalyst.tables.rows.READ, ZohoCatalyst.tables.rows.CREATE, ZohoCatalyst.tables.rows.UPDATE, ZohoCatalyst.tables.rows.DELETE, ZohoCatalyst.tables.columns.READ, ZohoCatalyst.folders.READ, ZohoCatalyst.folders.CREATE, ZohoCatalyst.folders.UPDATE, ZohoCatalyst.folders.DELETE, ZohoCatalyst.files.READ, ZohoCatalyst.files.CREATE, ZohoCatalyst.files.DELETE, ZohoCatalyst.cache.READ, ZohoCatalyst.cache.CREATE, ZohoCatalyst.cache.DELETE,ZohoCatalyst.cron.READ, ZohoCatalyst.cron.CREATE, ZohoCatalyst.cron.UPDATE, ZohoCatalyst.cron.DELETE, ZohoCatalyst.zcql.CREATE, ZohoCatalyst.functions.EXECUTE, ZohoCatalyst.circuits.EXECUTE, ZohoCatalyst.search.READ, ZohoCatalyst.email.CREATE, ZohoCatalyst.notifications.web, ZohoCatalyst.notifications.mobile.register, ZohoCatalyst.notifications.mobile, ZohoCatalyst.mlkit.READ, QuickML.deployment.READ, ZohoCatalyst.pdfshot.execute, ZohoCatalyst.dataverse.execute, ZohoCatalyst.buckets.READ, ZohoCatalyst.buckets.objects.READ, ZohoCatalyst.buckets.objects.CREATE, ZohoCatalyst.buckets.objects.UPDATE, ZohoCatalyst.buckets.objects.DELETE, Stratus.fileop.READ, Stratus.fileop.CREATE, ZohoCatalyst.jobpool.READ, ZohoCatalyst.job.CREATE, ZohoCatalyst.job.READ, ZohoCatalyst.job.DELETE, ZohoCatalyst.cron.READ, ZohoCatalyst.cron.CREATE, ZohoCatalyst.cron.UPDATE, ZohoCatalyst.cron.DELETE, ZohoCatalyst.segments.WRITE,ZohoCatalyst.segments.READ,ZohoCatalyst.segments.DELETE
     * @return
     */
    @SneakyThrows
    private static ZCProject initAppThroughAPI()
    {
        ZCThreadLocal.putValue("user_type", "admin");
        JSONObject oAuthParams = new JSONObject();
        oAuthParams.put("client_id", "1000.1BKMNFOC9LTSNFGLXEQVCUTRBHRIHH");
        oAuthParams.put("client_secret", "2504f70b3393835820d1caa90e1c6548164d86df81");
        oAuthParams.put("refresh_token", "1000.2266672281b5facb8e30a207ae84ee51.9bfffcfc535f017aee95d14006043bf1");
        oAuthParams.put("grant_type", "refresh_token");
        
        ZCAuth auth = ZCAuth.getMyInstance(oAuthParams);
        auth.setScope(APIConstants.ZCUserScope.ADMIN);
        ZCProjectConfig config = ZCProjectConfig.newBuilder()
                                                .setProjectId(4823000000326577L)
                                                .setProjectKey("50032944588")
                                                .setZcAuth(auth)
                                                .setProjectDomain("https://api.catalyst.zoho.in")
                                                .setEnvironment("Development")
                                                .build();
        return ZCProject.initProject(config, true, "AI-in-SalesIQ");
    }
    
    public static boolean isAppSail()
    {
        return true;
    }
}