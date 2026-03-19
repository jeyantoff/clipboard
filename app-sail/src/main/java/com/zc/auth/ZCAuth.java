//$Id$
package com.zc.auth;

import java.io.File;
import java.io.FileReader;
import java.util.HashMap;

import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;

import com.zc.api.APIConstants;
import com.zc.api.APIConstants.RequestMethod;
import com.zc.api.APIConstants.ZCUserScope;
import com.zc.api.APIRequest;
import com.zc.api.APIResponse;
import com.zc.exception.ZCClientException;
import com.zc.framework.ProjectMap;
import com.zc.validators.PreValidation;


public class ZCAuth {
	
	private static ZCAuth catalystAuth = null;
	
	private JSONObject oAuthParams ;
	
	static ZCAuthParam paramTokens ;

	private ZCUserScope scope = null;

	public ZCAuth(JSONObject oAuthParams)
	{
		this.oAuthParams = oAuthParams;
	}
	
	public static ZCAuth getMyInstance(JSONObject oAuthParams)
	{
		return getInstance(oAuthParams);
	}
	
	public static ZCAuth getInstance(JSONObject oAuthParams)
	{
		catalystAuth = new ZCAuth(oAuthParams);
		paramTokens = ZCAuthParam.getInstance(oAuthParams);
		return catalystAuth;
	}
	
	public static ZCAuth getInstance(File jsonFile)
	{
		JSONParser parser = new JSONParser();
        try
        {
            Object object = parser
                    .parse(new FileReader(jsonFile));
            JSONObject oAuthParams = (JSONObject)object;
            return getInstance(oAuthParams);
        }catch(Exception e)
        {
        	throw new IllegalArgumentException();
        }
	}
	
	public static ZCAuth getInstance(String jsonFilePath) throws ZCClientException 
	{
		  File jsonFile = new File(jsonFilePath);
		  if(jsonFile.exists())
		  {
			  try
			  {
				  JSONParser parser = new JSONParser();
		            Object object = parser
		                    .parse(new FileReader(jsonFile));
		            JSONObject oAuthParams = (JSONObject)object;
		         return getInstance(oAuthParams);
			  }catch(Exception e)
			  {
				  throw new ZCClientException("Invalid Json File");
			  } 
		  }
		  else
		  {
			  throw new ZCClientException("File","File not Found");
		  }
	}

	public ZCUserScope getScope() {
		return this.scope;
	}

	public ZCAuth setScope(ZCUserScope scope) {
		this.scope = scope;
		return this;
	}
	
	public Boolean isTicketAuthenticationEnabled()
	{
		if(oAuthParams != null)
		{
			if(oAuthParams.containsKey(APIConstants.TICKET))
			{
				return true;
			}
			return false;
		}
		
		return false;
	}
	
	public String getClientId()
	{
	   return paramTokens.getClientId();	
	}
	
	public String getClientSecret()
	{
	   return paramTokens.getClientSecret();	
	}
	
	public String getRedirectURL()
	{
		if(oAuthParams.containsKey("redirect_uri"))
		  {
			  return (String) oAuthParams.get("redirect_uri");
		  }
		  else 
		  {
			  return null;
		  }
	}
	
	public String getIAMURL()
	{
		return APIConstants.ACCOUNTS_URL;
	}
	
	public String getLoginWithZohoUrl()
	{
	   return getIAMURL() + "/oauth/v2/auth?scope=" + paramTokens.getScope() + "&client_id=" + paramTokens.getClientId() + "&client_secret=" + paramTokens.getClientSecret() + "&response_type=code&access_type=" + "offline" + "&redirect_uri=" + getRedirectURL();
	}
	
	public String getRefreshTokenURL()
	{
		return getIAMURL() + "/oauth/v2/token";
	}
	
	public String getTokenURL(){
		
		return getIAMURL() + "/oauth/v2/token";
	}
	
	public ZCAuthParam generateAccessToken(String code) throws Exception
	{
		if (code == null)
		{
		  throw new ZCClientException("Grant Token is not provided.");
		}
		try
		{
		  APIRequest request = new APIRequest();
		  HashMap<String, Object> params = new HashMap<>();
		  params.put("grant_type", "authorization_code");
		  params.put("code", code);
		  params.put("client_id", paramTokens.getClientId());
		  params.put("client_secret",paramTokens.getClientSecret());
		  request.setPostData(params);
		  request.setRequestMethod(RequestMethod.POST);
		  request.setUrl(getTokenURL());
		  request.setAuthNeeded(false);
		  APIResponse response = request.getResponse();
		  JSONParser parser = new JSONParser();
		  JSONObject responseJSON = (JSONObject) response.getResponseJSON().get(0);
		  if (responseJSON.containsKey("access_token"))
		  {
			  paramTokens.setAccessToken((String) responseJSON.get("access_token"));
			  paramTokens.setRefreshToken((String) responseJSON.get("refresh_token"));
			  paramTokens.setExpiresIn(System.currentTimeMillis() + ((Long) responseJSON.get("expires_in")) * 1000);
			  return paramTokens;
		  }
		  else
		  {
			  throw new ZCClientException("Error while generating Access token from Code");
		  }
		}catch(Exception e)
		{
			throw new ZCClientException("Error while generating Access token");
		}
	}
	
	public void refreshAccessToken(String refreshToken) throws Exception
	{
		PreValidation.checkNotNull(refreshToken, "Refresh token is not provided.");
		try
		{
		  APIRequest request = new APIRequest();
		  HashMap<String, Object> params = new HashMap<>();
		  params.put("grant_type", "refresh_token");
		  params.put("refresh_token", refreshToken);
		  params.put("client_id", paramTokens.getClientId());
		  params.put("client_secret",paramTokens.getClientSecret());
		  request.setPostData(params);
		  request.setRequestMethod(RequestMethod.POST);
		  request.setUrl(getRefreshTokenURL());
		  request.setAuthNeeded(false);
		  APIResponse response = request.getResponse();
		  JSONParser parser = new JSONParser();
		  JSONObject responseJSON = (JSONObject) response.getResponseJSON().get(0);
		  if (responseJSON.containsKey("access_token"))
		  {
		    paramTokens.setAccessToken((String) responseJSON.get("access_token"));
		    paramTokens.setRefreshToken(refreshToken);
		    paramTokens.setExpiresIn(System.currentTimeMillis()+ ((Long)responseJSON.get("expires_in"))*1000);
		  }
		  else
		  {
			  throw new ZCClientException("Exception while fetching access token from refresh token - " + responseJSON); //No I18N 
		  }
		}
		catch (Exception ex)
		{
		  throw new ZCClientException(ex);
		}
	}
	
	public String getAccessToken() throws Exception
	{
		if(paramTokens.getClientId() == null){
			return getDefaultAccessToken();
		}
		if(paramTokens.getExpiresIn() == null || paramTokens.getExpiresIn() <= System.currentTimeMillis())
		{
			refreshAccessToken(paramTokens.getRefreshToken());
		}
		return paramTokens.getAccessToken();
	}
	
	public String getDefaultAccessToken() throws Exception
	{
		PreValidation.checkArgument(!ProjectMap.getInstance().getIsDefault(), "Make sure you have Default Configurations while Initializing..");
		return paramTokens.getAccessToken();
	}
}
