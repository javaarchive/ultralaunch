import { AssetHandler } from "./assethandler.js";
import { MapLike, convertToFullConfig, Configuration, defaultConfig, processRule  } from "./utils.js";

import {Downloader, RetryingNodeFetchDownloader, getReqBuffer} from "./downloader.js";
import constants from "./constants.js";

import {GameVersionManifest, GameVersionDetails, CriticalFile, AssetIndex, AssetObject, CodeLibrary, LibraryFileDetails} from "./schemas.js";

import {WorkerPool} from "./worker.js";

import {decodeBuffer} from "./utils.js";

import {promises as fs} from "fs"
import {createWriteStream} from "fs"
import path from "path";

import mkdirp from "mkdirp";

import yauzl from "yauzl";

import os from "os";

import child_process from "child_process";

import {EventEmitter} from "events";

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

import replaceAll from "string.prototype.replaceall";

class MinecraftController extends EventEmitter {
    assetHandler: AssetHandler;
    config: Configuration = {};
    downloader: Downloader;
    versionManifest?: GameVersionManifest;
    versionDetails?: GameVersionDetails; // TODO: make naming less confusing
    assetIndex?: AssetIndex;
    logging: boolean = true;
    platform: string = os.platform();

    constructor(config: Configuration){
        super();
        this.config = config;
        this.assetHandler = new AssetHandler(this.config);
        if(this.config.downloader == null){
            this.config.downloader = new RetryingNodeFetchDownloader();
        }
        this.downloader = this.config.downloader;
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
    
    /**
     * Create folder structure for the game if needed. 
     *
     * @memberof MinecraftController
     */
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
        let versionURL = this.config.customVersionURL;
        if(!versionURL){
            let versionSummary = this.versionManifest!.versions.filter(v => v.id == this.config.version)[0];
            versionURL = versionSummary.url;
        }
        let buf = await getReqBuffer(this.downloader,versionURL,path.join(this.config.gameDirectory!,"versions",this.config.version+".json"));
        let json = JSON.parse(decodeBuffer(buf));
        // console.log(json);
        // Extra processing
        json.libraries = json.libraries.map((lib: any) => {
            if(lib.downloads == null || lib.downloads.artifact == null){
                // for launchwrapper
                let libInfo = lib.name.split(":");
                let [domain, pkgName, version] = libInfo;
                // console.log(lib);
                if(!lib.downloads){
                    lib.downloads = {};
                }
                lib.downloads.artifact = {
                    "sha1": null,
                    "path": replaceAll(domain,".","/") + "/" + pkgName + "/" + version + "/" + pkgName + "-" + version + ".jar",
                    "url": (lib.url || "https://libraries.minecraft.net/") + replaceAll(domain,".","/") + "/" + pkgName + "/" + version + "/" + pkgName + "-" + version + ".jar"
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
                let count = zipFile.entryCount;
                if(count == 0){
                    return;
                }
                let finished = 0;
                if(this.logging) console.log("Opened",zipPath,"got ",count,"entries");
                zipFile.on("entry", (entry: yauzl.Entry) => {
                    // console.log("Found entry",entry.fileName);
                    if(!entry.fileName){
                        // folder probaly
                        finished ++; // don't stall
                        return;
                    }
                    if(excludes.some(e => entry.fileName.startsWith(e)) || entry.fileName.startsWith("META-INF")) {
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
                        this.emit("extractNativeFile", entry.fileName, dest);
                        let writeStream = createWriteStream(dest);
                        stream.pipe(writeStream);
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
        this.emit("preAssetFolderCreate");
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
        this.emit("postAssetFolderCreate");
        if(this.logging) console.log("Starting to download",keys.length,"asset objects with",this.config.parellelDownloads,"parellel downloaders");
        let pool = new WorkerPool(this.config.parellelDownloads!);
        let count = 0;
        this.emit("assetDownloadProgress",{
            total: keys.length,
            current: 0
        });
        for(let i = 0; i < keys.length; i++){
            let key = keys[i];
            let obj: AssetObject = objects[key];
            let dest = path.join(this.config.gameDirectory!, "assets","objects", obj.hash.slice(0,2), obj.hash);
            if(await checkFileExists(dest)){
                continue;
            }
            await pool.runInWorkerNowait(async () => {
                await this.downloader.download(constants.ASSETS_BASE + "/" + obj.hash.slice(0,2) + "/" + obj.hash, dest);
                count ++;
                this.emit("assetDownloadProgress",{
                    total: keys.length,
                    current: count
                });
                if(this.logging) console.log("Downloaded",i,"of",keys.length,"objects");
            });
           
        }
        await pool.waitForAllTasks();
    }

    async downloadLibraries(){
        let libs = this.versionDetails!.libraries!;
        let pool = new WorkerPool(this.config.parellelDownloads!);
        let osKey = (constants.NODE_PLATFORM_TO_MC_PLATFORM[this.platform]);
        let binFolder = path.join(this.config.gameDirectory!,"bin");
        this.emit("libraryDownloadProgress",{
            total: libs.length,
            current: 0
        });
        let count = 0;
        for(let i = 0; i < libs.length; i++){
            let library: CodeLibrary = libs[i];

            await pool.runInWorkerNowait(async () => {
                if(this.logging) console.log(library);
                if(library.rules){
                    if(!processRule(osKey,library.rules)){
                        if(this.logging) console.log("Skipping",library.name," not applicable for os");
                        return;
                    }
                }
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
                        // Artifact hasn't already been downloaded
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
                        // force extraction for all lwjgl to workaround extract not being present somehow
                        if(library.extract){
                            if(this.logging) console.log("Extracting native",artifact.path);
                            let excludes = [];
                            if(library.extract && library.extract.exclude){
                                excludes = library.extract.exclude;
                            }
                            await this.unzip(dest,binFolder,excludes);
                            if(this.logging) console.log(artifact.path,"extracted");
                        }
                    }
                }
                if(library.downloads!.artifact){
                    if(await checkFileExists(path.join(this.config.gameDirectory!, "libraries", library.downloads!.artifact!.path))){
                        return;
                    }
                    if(this.logging) console.log("Downloading Universal", library.name);
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
                count ++;
                this.emit("libraryDownloadProgress",{
                    total: libs.length,
                    current: count
                });
                if(this.logging) console.log("Downloaded",count,"of",libs.length,"Libraries");
            });
            await pool.waitForAllTasks();
            this.emit("postLibraryDownload");
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
        this.emit("postLoggingDownload");
    }

    async markDone(){
        // await fs.writeFile(path.join(this.config.gameDirectory!,".done"), "done");
    }

    async download(force: boolean = false){
        await this.prepare();
        /*if(!force && checkFileExists(path.join(this.config.gameDirectory!,".done"))){
            return;
        }*/
        //if(!this.config.modded){
        await this.fetchVersionManifest();
        //}
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
        let osKey = (constants.NODE_PLATFORM_TO_MC_PLATFORM[this.platform]);
        this.versionDetails?.libraries.forEach(lib => {
            if(lib.rules && !processRule(osKey, lib.rules)){
                // Ignore libraries not for our platform
                return;
            }
            // console.log(lib);
            if(lib.downloads && lib.downloads.artifact){
                libraryPaths.push(path.join(this.config.gameDirectory!, "libraries", lib.downloads.artifact.path));
            }else{
                // For modded
                const [domain, pkgName, version] = lib.name.split(":");
                libraryPaths.push(path.join(this.config.gameDirectory!, "libraries", ...domain.split("."),pkgName ,version,pkgName + "-" + version + ".jar"));
            }
            // natives
            if(lib.natives){
                libraryPaths.push(path.join(this.config.gameDirectory!, "libraries", lib.downloads.classifiers["natives-" + osKey].path));
            }
        });
        libraryPaths.push(path.join(this.config.gameDirectory!, "versions", this.config.version + ".jar"));
        let cpSeperator = os.platform().startsWith("win") ? ";" : ":";
        let cpArg: string = libraryPaths.join(cpSeperator);

        let versionArgs = this.versionDetails!.minecraftArguments!;
        if(this.versionDetails!.arguments && this.versionDetails!.arguments.game){
            versionArgs = this.versionDetails!.arguments.game.filter(obj => typeof obj == "string").join(" ");
            if(this.logging) console.log("vargs",versionArgs)
        }
        let mcArgsFillin: Record<string,string> = {
            "auth_player_name": this.config.username || "steve",
            "version_name": this.config.version!,
            "assets_root": path.join(this.config.gameDirectory!, "assets"),
            "game_directory": this.config.gameDirectory!,
           // "assetsIndex": path.join(this.config.gameDirectory!, "assets", "indexes", this.config.version + ".json"),
           "assets_index_name": this.versionDetails!.assetIndex.id,
            "auth_uuid": this.config.uuid || Buffer.from((this.config.username || "steve") + "              ").toString("hex").substr(0,32), // TODO: optional hash mode?
            "user_type": this.config.accountType || "msa", //"mojang",
            "user_properties":JSON.stringify({
                "prefferedLanguage": [this.config.lang]
            }),
            "auth_access_token": this.config.accessToken || "null",
            "clientid": "",
            "auth_xuid": "",
            "version_type": this.versionDetails.type
        }
        if(this.config.accessToken){
            mcArgsFillin["auth_access_token"] = this.config.accessToken;
        }

        let versionArgsSplit = versionArgs.split(" ");
        if(versionArgs.length){
            for(let i = 0; i < versionArgsSplit.length/2; i++){
                let argTemp = versionArgsSplit[i*2 + 1];
                if(!argTemp.startsWith("$")){
                    continue;
                }
                let argType = argTemp.slice(2, argTemp.length - 1);
                if(this.logging) console.log("Filling in",argType);
                versionArgsSplit[i*2 + 1] = mcArgsFillin[argType] || versionArgsSplit[i*2 + 1];
            }
        }

        if(!this.config.accessToken){
            versionArgsSplit.map((val, index) => {
                if(val == "--accessToken"){
                    versionArgsSplit[index + 1] = "null";
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
            ...(this.config.customJVMargs || []),
            "-cp", cpArg,
            this.versionDetails!.mainClass,
            ...versionArgsSplit,
            ...(this.config.customMinecraftArgs! || [])

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
            this.emit("processError",err);
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

    setVersionDetails(versionDetails: any){
        this.versionDetails = versionDetails;
    }
}


export default MinecraftController;
export {MinecraftController};