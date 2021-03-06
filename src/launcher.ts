import MinecraftController from "./mc-launch-core/minecraft_controller.js";

import {config, saveConfig} from "./config.js";
import builddata from "./builddata.js";
import { Configuration } from "./mc-launch-core/utils.js";

import { FabricHelper } from "./fabric.js"

import fs from "fs";
import path from "path";
import myconfig from "./myconfig.js";
import { RemoteConfig } from "./remote_schema.js";
import { GameVersionDetails } from "./mc-launch-core/schemas.js";

import fetch from "./mc-launch-core/better_fetch.js";

import {EventEmitter} from "events";

export async function checkFileExists(fpath: string){
    try{
        let stat = await fs.promises.stat(fpath);
        // console.log("Got stat",stat.isFile())
        return stat.isFile();
    }catch(err: any){
        // console.log("Error so no file");
        if(err.code == "ENOENT"){
            return false;
        }else{
            throw err;
        }
    }
}

function wait(ms){
    return new Promise((resolve, reject) => setTimeout(resolve,ms))
}

export class Launcher extends EventEmitter{
    controller: MinecraftController;
    config: Configuration;
    remoteConfig: RemoteConfig;
    fabric: FabricHelper;

    constructor(config){
        super();
        this.controller = new MinecraftController(config);
        this.config = config;
        if(myconfig.connectToServer){
            const split = myconfig.connectToServer.split(":");
            this.controller.config.customMinecraftArgs.push("--server");   
            this.controller.config.customMinecraftArgs.push(split[0]);
            if(split[1]){
                this.controller.config.customMinecraftArgs.push("--port");   
                this.controller.config.customMinecraftArgs.push(split[1]);
            }   
        }
    }

    async syncRemoteConfig(){
        if(!myconfig.remoteConfig) return;
        let tries = 0;
        let lastError;
        while(tries < 10){
            try{
                const resp = await fetch(myconfig.remoteConfig);
                this.remoteConfig = await resp.json();
                return;
            }catch(ex){
                lastError = ex;
                tries ++;
            }
        }
        throw lastError;
    }

    checkJavaBasic(){
        if(!this.config.javaPath){
            return false;
        }
        return true;
    }

    saveConfig(){
        let downloaderBackup = this.config.downloader;
        delete this.config.downloader;
        // Downloader is an eventemitter and internal state gets serialized. 
        saveConfig(this.config);
        this.config.downloader = downloaderBackup;
    }

    setLogging(enabled){
        this.controller.logging = enabled;
    }

    download(){
        return this.controller.download();
    }

    async applyMods(){
        if(this.remoteConfig){
            if(this.remoteConfig.loader == "fabric"){
                this.fabric = new FabricHelper();
                const installerPath = path.join(this.config.gameDirectory, "fabric-installer.jar");
                const versionPath = this.fabric.resolveVersion(this.config.gameDirectory,this.config.version, this.remoteConfig.loaderID);
                const jarPath = this.fabric.resolveJar(this.config.gameDirectory,this.config.version, this.remoteConfig.loaderID);
                if(!(await checkFileExists(jarPath) && await checkFileExists(versionPath))){
                    // Download
                    if(!(await checkFileExists(installerPath))){
                        await this.controller.downloader.download(this.remoteConfig.loaderInstallerUrl, installerPath);
                    }
                    // Install
                    await this.fabric.installVersion(this.config.javaPath, this.config.gameDirectory, installerPath, this.config.version, this.remoteConfig.loaderID);
                }
                // Apply
                let versionOverlay = await this.fabric.readVersionOverlay(this.config.gameDirectory,this.config.version,this.remoteConfig.loaderID);
                // console.log(versionOverlay);
                let transformedManifest = this.fabric.transformManifest(this.controller.versionDetails, versionOverlay);
                this.controller.setVersionDetails(transformedManifest);
                // console.log("Changed version details to",this.controller.versionDetails);
                // Now we need to redownload...
                await this.controller.downloadLibraries();
                this.controller.setVersionDetails(transformedManifest);
            }
            // Mods Sync
            if(this.remoteConfig.mods){
                // console.log("Download Mods Start");
                this.emit("preDownloadMods");
                for(let mod of this.remoteConfig.mods){
                    let modPath = path.join(this.config.gameDirectory, "mods", mod.filename);
                    if(!(await checkFileExists(modPath) || await checkFileExists(modPath + ".disabled"))){
                        await this.controller.downloader.download(mod.url, modPath);
                    }
                }
                this.emit("postDownloadMods");
                let remoteFilenames = new Set(this.remoteConfig.mods.map(m => m.filename));
                let modFiles = await fs.promises.readdir(path.join(this.config.gameDirectory, "mods"));
                if(!config["noDeleteRemovedRemoteFiles"]){
                    for(let modFilename of modFiles){
                        if(!remoteFilenames.has(modFilename) && !modFilename.endsWith(".disabled") && !modFilename.includes(".custom.")){
                            await fs.promises.unlink(path.join(this.config.gameDirectory, "mods", modFilename));
                        }
                    }
                }
            }
            return true;
        }else{
            return false;
        }
    }

    launch(){
        return this.controller.spawn();
    }
}