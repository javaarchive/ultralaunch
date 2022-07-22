import child_process from "child_process";
import path from "path";
import fs from "fs";
import {GameVersionDetails} from "./mc-launch-core/schemas.js";

import fetch from "./mc-launch-core/better_fetch.js";
import { Downloader } from "./mc-launch-core/downloader.js";

export class FabricHelper{
    resolveJar(gameDirectory: string,mcVersion: string,loaderVersion: string){
        const combinedVersion = "fabric-loader" + "-" + loaderVersion + "-" + mcVersion;
        return path.join(gameDirectory,"versions", combinedVersion, combinedVersion + ".jar");
    }

    resolveVersion(gameDirectory: string,mcVersion:string,loaderVersion: string){
        const combinedVersion = "fabric-loader" + "-" + loaderVersion + "-" + mcVersion;
        return path.join(gameDirectory,"versions",combinedVersion, combinedVersion+ ".json");
    }

    async readVersionOverlay(gameDirectory: string,mcVersion:string, loaderVersion: string){
        return JSON.parse(await fs.promises.readFile(this.resolveVersion(gameDirectory,mcVersion, loaderVersion), {
            encoding: "utf8"
        }));
    }

    transformManifest(baseManifest: GameVersionDetails, fabricManifest: GameVersionDetails): GameVersionDetails{
        const manifest = {...baseManifest};
        if(manifest.arguments && fabricManifest.arguments){
            if(manifest.arguments.game &&  baseManifest.arguments){
                manifest.arguments.game = baseManifest.arguments.game.concat(fabricManifest.arguments.game);
            }
            if(manifest.arguments.jvm && baseManifest.arguments.jvm){
                manifest.arguments.jvm = baseManifest.arguments.jvm.concat(fabricManifest.arguments.jvm);
            }
        }
        manifest.mainClass = fabricManifest.mainClass || baseManifest.mainClass;
        manifest.type = fabricManifest.type || baseManifest.type;
        manifest.id = fabricManifest.id || baseManifest.id;
        manifest.time = fabricManifest.time || baseManifest.time;
        manifest.releaseTime = fabricManifest.releaseTime || baseManifest.releaseTime;
        if(fabricManifest.libraries){
            manifest.libraries = manifest.libraries.concat(fabricManifest.libraries);
        }
        return manifest;
    }

    installVersion(javaPath: string,gameDirectory: string, installerPath: string, mcVersion: string, versionID: string){
        return new Promise<void>((resolve, reject) => {
            const proc = child_process.spawn(javaPath,["-jar",installerPath,"client", "-noprofile","-dir",gameDirectory,"-mcversion", mcVersion, "-loader", versionID],{
                stdio: "inherit"
            });
            proc.on("error",reject);
            proc.on("exit", (code) => {
                if(code === 0){
                    resolve();
                }else{
                    reject(code);
                }
            })
        });
    }
}