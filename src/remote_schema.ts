interface Mod{
    name: string;
    version?: string;
    url: string;
}

interface RemoteConfig{
    loader?: string;
    loaderID?: string;
    loaderInstallerUrl?: string;
    mods?: Mod[];
}

export {Mod, RemoteConfig};