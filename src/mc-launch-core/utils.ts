import os from "os";
import path from "path";
import {Downloader, NodeFetchDownloader} from "./downloader.js";

import {DownloadRule} from "./schemas.js";

import fetch from "./better_fetch.js";

interface Configuration {
    downloader?: Downloader;
    username?: string;
    uuid?: string;
    accessToken?: string;
    customVersionURL?: string;
    modded?: boolean;
    version?: string;
    javaPath?: string;
    gameDirectory?: string;
    hashChecks?: boolean;
    parellelDownloads?: number;
    downloaderUserAgent?: string;
    initialMemoryMB?: number;
    maxMemoryMB?: number;
    customJVMargs?: string[];
    customMinecraftArgs?: string[];
    lang?: string;
    accountType?: string;
    extendedFolderStructure?: boolean;
};

const defaultConfig: Configuration = {
    version: "1.19.1",
    gameDirectory: path.join(os.homedir(),".minecraft_alt"),
    javaPath: null,
    hashChecks: true, // not implemented yet!
    parellelDownloads: 2,
    downloaderUserAgent: "mc-launch-core/1.0",
    initialMemoryMB: 256,
    maxMemoryMB: 4000,
    customJVMargs: [],
    customMinecraftArgs: [],
    lang: "en-US",
    accountType: "msa", // mojang to fake mojang
    extendedFolderStructure: true
}

interface MapLike<T> {
    get(key: string): T;
    has(key: string): boolean;
}

function convertToFullConfig(incompleteConfig: Configuration): Configuration{
    const config = {
        ...defaultConfig,
        ...incompleteConfig
    };

    return config;
}

function decodeBuffer(buf: Buffer){
    return buf.toString("utf8");
}

function processRule(platform: string, rules: DownloadRule[]){
    let works = false;
    for(let rule of rules){
        if(rule.action == "disallow"){
            if(rule.os.name == platform){
                works = false;
            }
        }else{
            if(rule.os && rule.os.name == platform){
                works = true;
            }else if(!rule.os){
                works = true;
            }
        }
    }
    return works;
}

export { decodeBuffer, convertToFullConfig, defaultConfig, processRule };

export type { MapLike, Configuration };
