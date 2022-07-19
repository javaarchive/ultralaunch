import { Configuration } from "./mc-launch-core/utils";

import myConfig from "./myconfig"; // Build-specific overrides
import conf from "./sharedconf"; // Shared conf object

import os from "os";
import fs from "fs";
import path from "path";

const username = conf.get("username") || myConfig.username || "prompt_for_username_this_is_not_valid";

export const config: Configuration = {
    version:  myConfig.version || conf.get("version") || "1.8.9",
    gameDirectory: myConfig.gameDirectory || conf.get("gameDirectory") || path.join(os.homedir(),".minecraft_alt"),
    javaPath: myConfig.javaPath || conf.get("javaPath"),
    hashChecks: true,
    customMinecraftArgs: myConfig.customMinecraftArgs || conf.get("customMinecraftArgs") || ["--ultralaunch"],
    downloaderUserAgent: "Ultralaunch/1.0"
}

function saveConfig(newConfig: Record<string,any>){
    for(const key in newConfig){
        conf.set(key,newConfig[key]);
    }
}