// Authentication Section
// This whole library might be a stupid idea cause
// https://github.com/PrismarineJS/node-yggdrasil
// is a thing already
// and also uses node-fetch

import constants from "./constants.js";
import fetch from "node-fetch";
import {defaultConfig} from "./utils.js";
import {AuthenticateEndpointResponse, RefreshEndpointResponse, UserProfile} from "./schemas.js";

function somethingWentWrong(json: any): boolean{
    return ("error" in json || "errorMessage" in json || "cause" in json);
}

class Authenticator{
    clientToken = "00000000-1111-1111-1111-000000000000"; // default?
    accessToken: string = "";
    userAgent = defaultConfig.downloaderUserAgent!;
    authServerURL = constants.AUTH_URL;
    validAccount = false;
    lastAuthResponse?: AuthenticateEndpointResponse;
    lastRefreshResponse?: RefreshEndpointResponse;
    profile?: UserProfile;
    profileListing: UserProfile[] = [];

    constructor(opts: any){
        if(opts.clientToken){
            this.clientToken = opts.clientToken;
        }else{
            console.warn("You should not be using the default client token");
        }
    }

    setAccessToken(accessToken: string){
        this.accessToken = accessToken;
    }

    async updateWithAccessToken(accessToken: string){
        this.accessToken = accessToken;
        let {status,data} = await this.getJson("https://api.minecraftservices.com/minecraft/profile",{
            "Authorization": "Bearer " + accessToken
        });
        if(status != 200){
            throw new Error("Got status " + status + " from server during profile fetch for access token change");
        }
        this.setProfile(data as UserProfile);
        this.validAccount = true;
    }

    setAuthServerURL(authServerURL: string){
        this.authServerURL = authServerURL;
    }

    hasAccessToken(){
        if(this.accessToken){
            return true;
        }else{
            return false;
        }
    }

    setProfile(newProfile: UserProfile){
        this.profile = newProfile;
    }

    async postJson(url: string, postData: any, extraHeaders?: Record<string,string>){
        let resp = await fetch(url, {
            method: "POST",
            body: JSON.stringify(postData),
            headers:{
                "Content-Type": "application/json",
                "User-Agent": this.userAgent,
                ...extraHeaders
            }
        });
        let data = null;
        try{
            data = await resp.json();
        }catch(ex){
            // pass
        }
        return {
            status: resp.status,
            data: data
        };
    }

    async getJson(url: string, extraHeaders?: Record<string,string>){
        let resp = await fetch(url, {
            headers:{
                "User-Agent": this.userAgent,
                ...extraHeaders
            }
        });
        let data = null;
        try{
            data = await resp.json();
        }catch(ex){
            // pass
        }
        return {
            status: resp.status,
            data: data
        };
    }

    async postToAuthServer(path: string, postData: any, minimalist: boolean = true, shouldHandleStatusErrors: boolean = true){
        let {data,status} = await this.postJson(this.authServerURL + path, postData);
        if(status >= 500){
            throw new Error("Got error " + status + " from server. Most likely something went wrong on the server side.");
        }else if(shouldHandleStatusErrors && (status < 200 || status >= 300)){
            if(data && somethingWentWrong(data)){
                throw new Error("Server sent an error with code " + status + ", " + data.error + ": " + data.errorMessage); // TODO: Add cause details?
            }
            throw new Error('Got non 2xx status code from server: ' + status);
        }
        if(minimalist){
            return data;
        }else{
            return {
                data,
                status
            }
        }
    }

    async authenticate(usernameOrEmail: string, password:string): Promise<void>{
        let respData = await this.postToAuthServer("/authenticate", {
            agent:{
                name: constants.GAME_ID,
                version: 1 // TODO: not hardcode?
            },
            username: usernameOrEmail,
            password: password,
            clientToken: this.clientToken,
            requestUser: true
        });
        let authResponse: AuthenticateEndpointResponse = (respData as AuthenticateEndpointResponse);
        this.lastAuthResponse = authResponse;
        this.profileListing = authResponse.availableProfiles;
        this.setProfile(authResponse.selectedProfile);
        this.validAccount = true;
        this.setAccessToken(authResponse.accessToken);
    }

    async refresh(){
        this.validAccount = false;
        let respData = await this.postToAuthServer("/refresh", {
            accessToken: this.accessToken,
            clientToken: this.clientToken,
            selectedProfile:this.profile,
            requestUser: true
        });
        let refreshResponse: RefreshEndpointResponse = (respData as RefreshEndpointResponse);
        this.lastRefreshResponse = refreshResponse;
        this.validAccount = true;
        this.setAccessToken(refreshResponse.accessToken);
        this.setProfile(refreshResponse.selectedProfile);
    }

    async validate(){
        this.validAccount = ((await this.postToAuthServer("/validate",{
            accessToken: this.accessToken,
            clientToken: this.clientToken
        }, false, false)).status == 204);
        return this.validAccount;
    }

    async signout(usernameOrPassword: string, password: string){
        await this.postToAuthServer("/signout",{
            username: usernameOrPassword,
            password
        });
        this.validAccount = false;
        return true;
    }

    async invalidate(){
        await this.postToAuthServer("/invalidate", {
            accessToken: this.accessToken,
            clientToken: this.clientToken
        });
        this.validAccount = false;
        return true;
    }

    getMinecraftUsername(): string | null{
        // Gets the minecraft username of the currently selected profile
        if(!this.profile){
            return null;
        }
        return this.profile!.name;
    }

    getLoginUsernameOrEmail(): string | null{
        if(this.lastRefreshResponse){
            return this.lastRefreshResponse.user.username;
        }else if(this.lastAuthResponse){
            return this.lastAuthResponse.user.username;
        }else{
            return null;
        }
    }
}


export {Authenticator, somethingWentWrong};
export default Authenticator;