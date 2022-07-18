import constants from "./constants";

// @ts-ignore
import fetch from "node-fetch";
import fs from "fs";
import {promises as fsPromises} from "fs";
import path from "path";
import os from "os";

const temporaryDirectory = os.tmpdir();

interface Downloader{
    user_agent: string;

    // Used for downloads on things like assets
    download(url: string, path: string): Promise<void>;

    cleanup(): Promise<void>;
}

class NodeFetchDownloader implements Downloader{
    user_agent: string = "Node-Fetch/2.6.0";

    download(url: string, path: string): Promise<void>{
        return new Promise(async (resolve, reject) => {
            const res = await fetch(url, {
                headers:{
                    "User-Agent": this.user_agent
                }
            });
            if(!res || !res.body){
                return reject(new Error("Could not download file, no response or response body"));
            }
            let dest = fs.createWriteStream(path);
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

async function getReqBuffer(downloader: Downloader, url: string, tempPath?: string){
    if(!tempPath){
        tempPath = path.join(temporaryDirectory, `${Math.random()}.cache`);
    }
    await downloader.download(url, tempPath);
    let buf = await fsPromises.readFile(tempPath);
    return buf;
}


export { NodeFetchDownloader, getReqBuffer };
export type { Downloader };
