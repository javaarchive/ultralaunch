import { MinecraftOptions, UserConfig } from "./mc-launch-core/utils";

import myConfig from "./myconfig"; // Build-specific overrides
import conf from "./sharedconf"; // Shared config

export const userConfig: UserConfig = {    
    
}

const username = conf.get("username") || myConfig.username || "prompt_for_username_this_is_not_valid";

export const minecraftOptions: MinecraftOptions = {
    username: username,
    accessToken: "no",
    uuid: require('uuid-js').fromBinary(username),
    modded: true
}