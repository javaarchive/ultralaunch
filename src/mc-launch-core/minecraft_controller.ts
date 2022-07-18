import { AssetHandler } from "./assethandler";
import { MapLike, MinecraftOptions, convertToFullConfig, UserConfig, defaultConfig  } from "./utils";

import {Downloader, NodeFetchDownloader, getReqBuffer} from "./downloader";
import constants from "./constants";

import {GameVersionManifest, GameVersionDetails, CriticalFile, AssetIndex, AssetObject, CodeLibrary, LibraryFileDetails} from "./schemas";

import {WorkerPool} from "./worker";

import {decodeBuffer} from "./utils";

import {promises as fs} from "fs"
import {createWriteStream} from "fs"
import path from "path";

import mkdirp from "mkdirp";

import yauzl from "yauzl";

import os from "os";

import child_process from "child_process";

async function checkFileExists(fpath: string){
    try{
        let stat = await fs.stat(fpath);
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

class MinecraftController{
    assetHandler: AssetHandler;
    extraOpts: MinecraftOptions;
    config: UserConfig = convertToFullConfig({});
    downloader: Downloader;
    versionManifest?: GameVersionManifest;
    versionDetails?: GameVersionDetails; // TODO: make naming less confusing
    assetIndex?: AssetIndex;
    logging: boolean = true;
    platform: string = os.platform();

    constructor(uConfig: UserConfig, extraOpts: MinecraftOptions){
        let configCopy: UserConfig = {};
        Object.keys(defaultConfig).forEach(k => {
            configCopy[k] = uConfig[k] || (defaultConfig as Record<string,any>)[k];
        });
        this.config = configCopy;
        this.extraOpts = extraOpts;
        this.assetHandler = new AssetHandler(null, this.extraOpts);
        if(this.extraOpts.downloader == null){
            this.extraOpts.downloader = new NodeFetchDownloader();
        }
        this.downloader = this.extraOpts.downloader;
        this.downloader.user_agent = this.config.downloaderUserAgent!;
    }

    async gameFolderExists(){
        try{
            let stats = await fs.stat(this.config.gameDirectory!);
            return stats.isDirectory();
        }catch(err){
            return false;
        }
    }

    async gameFolderAssetsExists(){
        try{
            let stats = await fs.stat(path.join(this.config.gameDirectory!, "assets"));
            return stats.isDirectory();
        }catch(err){
            return false;
        }
    }

    async gameFolderLibrariesExists(){
        try{
            let stats = await fs.stat(path.join(this.config.gameDirectory!, "libraries"));
            return stats.isDirectory();
        }catch(err){
            return false;
        }
    }

    async gameFolderVersionsExists(){
        try{
            let stats = await fs.stat(path.join(this.config.gameDirectory!, "versions"));
            return stats.isDirectory();
        }catch(err){
            return false;
        }
    }

    async gameFolderBinariesExists(){
        try{
            let stats = await fs.stat(path.join(this.config.gameDirectory!, "bin"));
            return stats.isDirectory();
        }catch(err){
            return false;
        }
    }

    async gameExists(){
        return (await this.gameFolderExists()) && (await this.gameFolderAssetsExists()) && (await this.gameFolderLibrariesExists());
    }

    async ensureDirectoryExists(filePath: string) {
        try {
            let stats = await fs.stat(filePath);
            if(!stats.isDirectory()){
                throw "ENOTDIR";    
            }
        }
        catch (err) {
            await fs.mkdir(filePath, { recursive: true });
        }
    }
    
    async prepare(){
        await this.ensureDirectoryExists(this.config.gameDirectory!);
        await this.ensureDirectoryExists(path.join(this.config.gameDirectory!, "assets"));
        await this.ensureDirectoryExists(path.join(this.config.gameDirectory!, "assets","indexes"));
        await this.ensureDirectoryExists(path.join(this.config.gameDirectory!, "assets","objects"));
        await this.ensureDirectoryExists(path.join(this.config.gameDirectory!, "libraries"));
        await this.ensureDirectoryExists(path.join(this.config.gameDirectory!, "versions"));
        await this.ensureDirectoryExists(path.join(this.config.gameDirectory!, "bin"));
    }

    async fetchVersionManifest(){
        let buf = await getReqBuffer(this.downloader,constants.VERSION_MANIFEST_URL,path.join(this.config.gameDirectory!,"versions.cache.json"));
        let json = JSON.parse(decodeBuffer(buf));
        this.versionManifest = (json as GameVersionManifest);
    }

    async fetchVersionData(){
        let versionURL = this.extraOpts.customVersionURL;
        if(!versionURL){
            let versionSummary = this.versionManifest!.versions.filter(v => v.id == this.config.version)[0];
            versionURL = versionSummary.url;
        }
        let buf = await getReqBuffer(this.downloader,versionURL,path.join(this.config.gameDirectory!,"versions",this.config.version+".json"));
        let json = JSON.parse(decodeBuffer(buf));
        // Extra processing
        json.libraries = json.libraries.map((lib: any) => {
            if(lib.downloads == null || lib.downloads.artifact == null){
                // for launchwrapper
                let libInfo = lib.name.split(":");
                let [domain, pkgName, version] = libInfo;
                if(!lib.downloads){
                    lib.downloads = {};
                }
                lib.downloads.artifact = {
                    "sha1": null,
                    "path": domain.replaceAll(".","/") + "/" + pkgName + "/" + version + "/" + pkgName + "-" + version + ".jar",
                    "url": (lib.url || "https://libraries.minecraft.net/") + domain.replaceAll(".","/") + "/" + pkgName + "/" + version + "/" + pkgName + "-" + version + ".jar"
                }
                // console.log("Transformed to an artifact ",lib.downloads.artifact);
            }
            return lib;
        });
        this.versionDetails = (json as GameVersionDetails);
    }

    async fetchAssetIndex(){
        let version = this.versionManifest!.versions.filter(v => v.id == this.config.version)[0];
        let assetIndexUrl = version.url;
        let buf = await getReqBuffer(this.downloader,this.versionDetails!.assetIndex!.url,path.join(this.config.gameDirectory!,"assets","indexes", this.versionDetails!.assets + ".json"));
        let json = JSON.parse(decodeBuffer(buf));
        this.assetIndex = (json as AssetIndex);
    }

    unzip(zipPath: string,destPath: string, excludes: string[] = []): Promise<void>{
        return new Promise<void>((resolve, reject) =>{
            if(this.logging) console.log("Opening file",zipPath);
            yauzl.open(zipPath,{},(err,zipFile) =>{
                if(err){
                    reject(err);
                    return;
                }
                let count = zipFile!.entryCount;
                if(count == 0){
                    return;
                }
                let finished = 0;
                if(this.logging) console.log("Opened",zipPath,"got ",count,"entries");
                zipFile!.on("entry", (entry: yauzl.Entry) => {
                    // console.log("Found entry",entry.fileName);
                    if(excludes.some(e => entry.fileName.startsWith(e))){
                        finished ++; // don't stall
                        return;
                    }
                    zipFile!.openReadStream(entry,async (err,stream) =>{
                        if(err){
                            finished ++; // to not stall process
                            reject(err);
                            return;
                        }
                        if(this.logging) console.log("Reading",entry.fileName);
                        let dest = path.join(destPath,entry.fileName);
                        // if(this.logging) console.log("Mkdirping",path.dirname(dest));
                        // await mkdirp(path.dirname(dest));
                        if(this.logging) console.log("Copying to",dest);
                        let writeStream = createWriteStream(dest);
                        stream!.pipe(writeStream);
                        writeStream.on("finish",() =>{
                            // console.log("Finished Writing", dest, finished + 1, " out of ",count, " total done now");
                            finished ++;
                            if(finished == count){
                                resolve();
                            }
                        });
                    });
                });
            });
        });

    }

    async downloadCriticals(mode: "client" | "server" = "client"){
        let criticalFile: CriticalFile = (this.versionDetails!.downloads[mode] as CriticalFile);
        await this.downloader.download(criticalFile.url, path.join(this.config.gameDirectory!, "versions", this.config.version + ".jar"));
    }

    async downloadAssets(){
        let objects = this.assetIndex!.objects!;
        let keys = Object.keys(objects);
        let trunacatedHashes = new Set<string>();
        keys.forEach(key => {
            let obj = objects[key];
            trunacatedHashes.add(obj.hash.substring(0,2));
        });
        let trunacatedHashesArray: string[] = Array.from(trunacatedHashes);
        if(this.logging) console.log("Creating folders for",trunacatedHashesArray.length,"2 letter hash slices");
        await Promise.all(trunacatedHashesArray.map(async hashslice => {
            try{
                let stats = await fs.stat(path.join(this.config.gameDirectory!, "assets", "objects", hashslice));
                if(stats.isFile()){
                    throw new Error("File made instead of directory for " + hashslice);
                }
            }catch(ex: any){
                if(ex && ex.code && ex.code == "ENOENT"){
                    await fs.mkdir(path.join(this.config.gameDirectory!, "assets", "objects", hashslice));
                }else{
                    throw new Error("File was made instead of folder for " + hashslice);
                }
            }
        }));
        if(this.logging) console.log("Starting to download",keys.length,"asset objects with",this.config.parellelDownloads,"parellel downloaders");
        let pool = new WorkerPool(this.config.parellelDownloads!);
        for(let i = 0; i < keys.length; i++){
            let key = keys[i];
            let obj: AssetObject = objects[key];
            let dest = path.join(this.config.gameDirectory!, "assets","objects", obj.hash.slice(0,2), obj.hash);
            if(await checkFileExists(dest)){
                continue;
            }
            await pool.runInWorkerNowait(async () => {
                await this.downloader.download(constants.ASSETS_BASE + "/" + obj.hash.slice(0,2) + "/" + obj.hash, dest);
            });
            if(this.logging) console.log("Downloaded",i+1,"of",keys.length,"objects");
        }
        await pool.waitForAllTasks();
    }

    async downloadLibraries(){
        let libs = this.versionDetails!.libraries!;
        let pool = new WorkerPool(this.config.parellelDownloads!);
        let osKey = (constants.NODE_PLATFORM_TO_MC_PLATFORM[this.platform]);
        let binFolder = path.join(this.config.gameDirectory!,"bin");
        for(let i = 0; i < libs.length; i++){
            let library: CodeLibrary = libs[i];

            await pool.runInWorkerNowait(async () => {
                console.log(library);
                if(library.downloads!.classifiers){
                    // console.log("Downloading based on OS", library.name);
                    // Platform Swap
                    let classifiers = library.downloads!.classifiers!; // console.log("Got classifiers");
                    let artifact = (classifiers["natives-" + osKey] as LibraryFileDetails); // console.log("cast ok") // shortcut but not 100% safe as it doesn't follow rules
                    // TODO: don't use shortcut
                    if(!artifact && osKey.toLowerCase() == "windows"){
                        let archKey = "natives-" + "windows- " + os.arch().replace("arm","").replace("x","");
                        artifact = (classifiers[archKey] as LibraryFileDetails);

                    }
                    // console.log("Actual Artifact", artifact);
                    if(artifact && !(await checkFileExists(path.join(this.config.gameDirectory!,"libraries", artifact.path)))){
                        let dest = path.join(this.config.gameDirectory!, "libraries", artifact.path);
                        // console.log("Resolved dir now creating...");
                        try{
                            await mkdirp(path.dirname(dest));
                        }catch(ex){
                            console.warn("mkdirp fail",ex);
                        }
                        if(this.logging) console.log("Downloading native",artifact.path);
                        await this.downloader.download(artifact.url, dest);
                        if(this.logging) console.log("Completed native downloading for ",artifact.path);
                        if(library.extract){
                            if(this.logging) console.log("Extracting native",artifact.path);
                            await this.unzip(dest,binFolder,library.extract!.exclude || []);
                            if(this.logging) console.log(artifact.path,"extracted");
                        }
                    }
                }
                if(library.downloads!.artifact){
                    if(await checkFileExists(path.join(this.config.gameDirectory!, "libraries", library.downloads!.artifact!.path))){
                        return;
                    }
                    console.log("Downloading Universal", library.name);
                    let artifact = library.downloads!.artifact!;
                    let dest = path.join(this.config.gameDirectory!, "libraries", artifact.path);
                    await mkdirp(path.dirname(dest));
                    if(this.logging) console.log("Downloading library",artifact.path);
                    await this.downloader.download(artifact.url, dest);
                    if(this.logging) console.log("Completed library downloading for ",artifact.path);
                    /*if(library.extract){
                        console.log("Extracting native",artifact.path);
                        await this.unzip(dest,binFolder,library.extract!.exclude || []);
                        if(this.logging) console.log(artifact.path,"extracted");
                    }*/
                }
            });
            await pool.waitForAllTasks();
            if(this.logging) console.log("Downloaded",i+1,"of",libs.length,"Libraries");
        }
    }

    async downloadLogging(){
        if(!this.versionDetails!.logging || !this.versionDetails!.logging.client){
            return;
        }
        if(await checkFileExists(path.join(this.config.gameDirectory!,this.versionDetails!.logging!.client!.file!.id))){
            return;
        }
        let dest = path.join(this.config.gameDirectory!,this.versionDetails!.logging!.client!.file!.id);
        this.downloader.download(this.versionDetails!.logging!.client!.file!.url!, dest);
    }

    async markDone(){
        // await fs.writeFile(path.join(this.config.gameDirectory!,".done"), "done");
    }

    async download(force: boolean = false){
        await this.prepare();
        /*if(!force && checkFileExists(path.join(this.config.gameDirectory!,".done"))){
            return;
        }*/
        if(!this.extraOpts.modded){
            await this.fetchVersionManifest();
        }
        await this.fetchVersionData();
        await this.downloadCriticals();
        await this.fetchAssetIndex();
        await this.downloadAssets();
        await this.downloadLibraries();
        await this.downloadLogging();
        await this.markDone();
    }
    
    spawn(){
        let libraryPaths: string[] = [];
        this.versionDetails?.libraries.forEach(lib => {
            if(lib.downloads && lib.downloads.artifact){
                libraryPaths.push(path.join(this.config.gameDirectory!, "libraries", lib.downloads.artifact.path));
            }
            // natives?
        });
        libraryPaths.push(path.join(this.config.gameDirectory!, "versions", this.config.version + ".jar"));
        let cpSeperator = os.platform().startsWith("win") ? ";" : ":";
        let cpArg: string = libraryPaths.join(cpSeperator);

        let versionArgs = this.versionDetails!.minecraftArguments!;
        let mcArgsFillin: Record<string,string> = {
            "auth_player_name": this.extraOpts.username || "steve",
            "version_name": this.config.version!,
            "assets_root": path.join(this.config.gameDirectory!, "assets"),
            "game_directory": this.config.gameDirectory!,
           // "assetsIndex": path.join(this.config.gameDirectory!, "assets", "indexes", this.config.version + ".json"),
           "assets_index_name": this.versionDetails!.assetIndex.id,
            "auth_uuid": this.extraOpts.uuid || Buffer.from((this.extraOpts.username || "steve") + "              ").toString("hex").substr(0,32), // TODO: optional hash mode?
            "user_type": "mojang",
            "user_properties":JSON.stringify({
                "prefferedLanguage": [this.config.lang]
            }),
            "auth_access_token": this.extraOpts.accessToken || "null"
        }
        if(this.extraOpts.accessToken){
            mcArgsFillin["auth_access_token"] = this.extraOpts.accessToken;
        }

        let versionArgsSplit = versionArgs.split(" ");
        for(let i = 0; i < versionArgsSplit.length/2; i++){
            let argTemp = versionArgsSplit[i*2 + 1];
            if(!argTemp.startsWith("$")){
                continue;
            }
            let argType = argTemp.slice(2, argTemp.length - 1);
            console.log("Filling in",argType);
            versionArgsSplit[i*2 + 1] = mcArgsFillin[argType] || versionArgsSplit[i*2 + 1];
        }

        if(!this.extraOpts.accessToken){
            versionArgsSplit.map((val) => {
                if(val == "--accessToken"){
                    return "--noAccessToken";
                }
            });
            
        }

        

        if(this.logging) console.log("Using java",this.config.javaPath!);
        
        let fullArgs = [
            "-Xmx" + this.config.maxMemoryMB! + "M",
            "-Xms" + this.config.initialMemoryMB! + "M",
           // "XX:-UseAdaptiveSizePolicy",
           this.versionDetails?.logging.client?.argument.replace("${path}", path.join(this.config.gameDirectory!, this.versionDetails!.logging!.client!.file!.id)) || "log4j2.xml",
            "-Djava.library.path=" + path.join(this.config.gameDirectory!, "bin"),
            ...this.config.customJVMargs!,
            "-cp", cpArg,
            this.versionDetails!.mainClass,
            ...versionArgsSplit,
            ...this.config.customMinecraftArgs!

        ];

        if(this.logging) console.log("Args",fullArgs);
        if(this.logging) console.log(this.config.javaPath!, ...fullArgs);
        return child_process.spawn(this.config.javaPath!,fullArgs,{
            cwd: this.config.gameDirectory!,
            env: {
                ...process.env,
                "CUSTOM_LAUNCHER": "1"
            },
            stdio: "inherit",
            detached: true
        }).on("error",(err) => {
            // TODO: Log
        });
    }

    async run(){
        if(this.logging) console.log("Spawning java")
        return this.spawn();
    }

    async launch(){
        // if(!checkFileExists(path.join(this.config.gameDirectory!, ".done"))){
        await this.download();
        // }
        await this.run();
    }

}


export default MinecraftController;
export {MinecraftController};