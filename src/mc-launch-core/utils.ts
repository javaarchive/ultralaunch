import os from "os";
import path from "path";
import {Downloader, NodeFetchDownloader} from "./downloader.js";

import fetch from "node-fetch";

function guessJavapath(){
    if(os.platform() === "win32"){
        return "C:/windows/Program Files (x86)/Minecraft/runtime/jre-legacy/windows-x64/jre-legacy/bin/java.exe";
    }else if(os.platform() === "linux"){
        return "/usr/bin/java";
    }else{
        return "/Applications"; // i don't use a mac
    }
}

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
};

const defaultConfig: Configuration = {
    version: "1.19.1",
    gameDirectory: path.join(os.homedir(),".minecraft_alt"),
    javaPath: guessJavapath(),
    hashChecks: true, // not implemented yet!
    parellelDownloads: 8,
    downloaderUserAgent: "mc-launch-core/1.0",
    initialMemoryMB: 256,
    maxMemoryMB: 4000,
    customJVMargs: [],
    customMinecraftArgs: [],
    lang: "en-US"
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

export { decodeBuffer, convertToFullConfig, defaultConfig };
export type { MapLike, Configuration };
