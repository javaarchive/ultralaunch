import { MapLike, MinecraftOptions } from "./utils";

// I made this a year ago and don't remeber it's intended purpose

class AssetHandler{
    configMap: MapLike<string>;
    extraOpts: MinecraftOptions;
    
    constructor(configMap: MapLike<string>, extraOpts: MinecraftOptions){
        this.configMap = configMap;
        this.extraOpts = extraOpts;
    }
}

export default AssetHandler;
export {AssetHandler};