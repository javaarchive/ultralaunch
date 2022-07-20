
import os from "os";
import path from "path";
import fs from "fs";

export function guessJavaPath(){
    if(os.platform() === "win32"){
        if(process.env.JAVA_HOME){
            return path.join(process.env.JAVA_HOME,"bin","java.exe")
        }
    }else{
        // UNIX or Linux
        if(process.env.JAVA_HOME){
            return path.join(process.env.JAVA_HOME,"bin","java")
        }
    }
    return null;
}

async function checkExist(filePath){
    try{
        await fs.promises.access(filePath);
        return true;
    }catch(ex){
        return false;
    }
}

const paths = {
    win32: [
        "C:/Program Files (x86)/Java/jdk-11.0.2/bin/java.exe",
        "C:/Program Files/Java/jdk-11.0.2/bin/java.exe",
        "C:/windows/Program Files (x86)/Minecraft/runtime/jre-legacy/windows-x64/jre-legacy/bin/java.exe"
    ],
    linux: [
        "/usr/bin/java",
        "/usr/local/bin/java",
        "/usr/lib/jvm/default-java/bin/java",
        "/usr/lib/jvm/java-17-openjdk-amd64/bin/java",
        "/usr/lib/jvm/java-16-openjdk-amd64/bin/java",
        "/usr/lib/jvm/java-11-openjdk-amd64/bin/java",
        "/usr/lib/jvm/java-8-openjdk-amd64/bin/java",
    ],
    darwin:[
        "/System/Library/Frameworks/JavaVM.framework/bin/java"
    ]
} 

export async function discoverJavaPath(){
    let checkPaths = paths[os.platform()] || paths["linux"];
    for(let i = 0; i < checkPaths.length; i++){
        if(await checkExist(checkPaths[i])){
            return checkPaths[i];
        }
    }
    return "java";
}