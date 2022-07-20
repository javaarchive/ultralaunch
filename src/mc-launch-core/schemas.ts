interface VersionDescriptor{
    id: string;
    type: "snapshot" | "release" | "old_alpha" | "old_beta";
    // New Date able
    time: string; 
    releaseTime: string;
    url: string;
}


interface GameVersionManifest{
    latest: {
        release: string;
        snapshot: string;
    },
    versions: VersionDescriptor[]
}

interface AssetIndexDetails{
    id: string;
    sha1: string;
    size: number;
    totalSize: number;
    url: string;
}

interface CriticalFile{
    sha1: string;
    size: number;
    url: string;
}

interface JavaVersion{
    component: string; // jre-legacy for old versions below 1.16
    majorVersion: number; // 8 for most below 1.16
}

interface LibraryFileDetails{
    id: string;
    sha1: string;
    size: number;
    url: string;
    path: string;
}

interface DownloadRule{
    action: "allow" | "disallow";
    os: {
        name: string;
    }
}
interface CodeLibrary{
    name: string;
    downloads:{
        artifact?: LibraryFileDetails;
        // for lwjgl
        classifiers?: Record<string, LibraryFileDetails>
    },
    rules?: DownloadRule[]
    natives?:{
        windows?: string;
        linux?: string;
        osx?: string;
    },
    extract?:{
        exclude?: string[];
        include?: string[];
    }
}

interface GameVersionDetails{
    assetIndex: AssetIndexDetails;
    compilanceLevel: number; // idk what this is for
    assets: string; // major version usually like 1.8
    mainClass: string; // usually net.minecraft.client.main.Main
    minimumLauncherVersion: number;
    minecraftArguments: string; // Legacy
    arguments?: {
        game: (string | DownloadRule)[]; // New arguments
        jvm: string[];
    }
    // Important Sections
    downloads:{
        client: CriticalFile;
        server: CriticalFile;
        // there's also windows_server but i don't really care if anyone needs it just shoot a PR
    };
    javaVersion: JavaVersion;
    libraries: CodeLibrary[];
    logging:{
        client?: {
            argument: string;
            file: LibraryFileDetails;
            type: string;
        };
    } ;
    // Repeat of version descriptor
    id: string;
    releaseTime: string;
    time: string;
    type: "snapshot" | "release" | "old_alpha" | "old_beta";
}

interface AssetObject{
    hash: string;
    size: number;
}
interface AssetObjects{
    [key: string]: AssetObject;
}
interface AssetIndex{
    objects: AssetObjects
}

interface UserProperty{
    name: string;
    value: string;
};

interface UserProfile{
    name: string; // username
    id: string;
}

interface AuthenticateEndpointResponse{
    user:{
        username: string;
        properties: UserProperty[];
        id: string;
    },
   clientToken: string,
   accessToken: string,
   availableProfiles: UserProfile[],
   selectedProfile: UserProfile
}

// literally above without avalible

interface RefreshEndpointResponse{
    user:{
        username: string;
        properties: UserProperty[];
        id: string;
    },
   clientToken: string,
   accessToken: string,
   selectedProfile: UserProfile
}



export type {GameVersionManifest, VersionDescriptor, GameVersionDetails, CriticalFile, JavaVersion, 
    LibraryFileDetails, DownloadRule, CodeLibrary, AssetIndex, AssetObject, AssetObjects,
     AuthenticateEndpointResponse, RefreshEndpointResponse, UserProfile, UserProperty};