import constants from "./constants.js";

// @ts-ignore
import fetch from "./better_fetch.js";
import fs from "fs";
import {promises as fsPromises} from "fs";
import path from "path";
import os from "os";

import {EventEmitter} from "events";

const temporaryDirectory = os.tmpdir();

interface Downloader {
    user_agent: string;

    // Used for downloads on things like assets
    download(url: string, path: string): Promise<void>;

    cleanup(): Promise<void>;
}

class NodeFetchDownloader  extends EventEmitter implements Downloader{
    user_agent: string = "./better_fetch.js/2.6.0";

    download(url: string, path: string): Promise<void>{
        return new Promise(async (resolve, reject) => {
            const res = await fetch(url, {
                headers:{
                    "User-Agent": this.user_agent
                }
            });
            if(!res || !res.body){
                const err = new Error("Could not download file, no response or response body")
                this.emit("error",err);
                return reject(err);
            }
            let contentLength = res.headers.get("Content-Length");
            let dest = fs.createWriteStream(path);
            let recieved = 0;
            this.emit("progress", {
                total: contentLength,
                received: recieved,
                justRecieved: 0,
                url: url,
                path: path
            });
            res.body.on("data", (chunk) => {
                recieved += chunk.length;
                this.emit("progress", {
                    total: contentLength,
                    received: recieved,
                    justRecieved: chunk.length,
                    url: url,
                    path: path
                });
            });
            res.body.pipe(dest);
            dest.on("finish", () => {
                resolve();
            });
        });
    }

    cleanup(): Promise<void>{
        return Promise.resolve();
    }
}

class RetryingNodeFetchDownloader extends NodeFetchDownloader{
    maxTries = 10;
    retryDelay = 2500;

    download(url: string, path: string): Promise<void>{
        return new Promise(async (resolve, reject) => {
            let tries = 0;
            while(tries < this.maxTries){
                try{
                    await super.download(url, path);
                    resolve();
                    return;
                }catch(ex){
                    this.emit("error",ex);
                    tries++;
                    if(tries < this.maxTries){
                        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                    }else{
                        reject(ex);
                    }
                }
            }
        });
    }
}

async function getReqBuffer(downloader: Downloader, url: string, tempPath?: string){
    if(!tempPath){
        tempPath = path.join(temporaryDirectory, `${Math.random()}.cache`);
    }
    await downloader.download(url, tempPath);
    let buf = await fsPromises.readFile(tempPath);
    return buf;
}


export { NodeFetchDownloader, getReqBuffer , RetryingNodeFetchDownloader};
export type { Downloader };
