import fs from "fs";

if(process.argv.length != 4){
    console.log("Usage: node gen_modslist.js <directory> <url prefix>")
}

fs.readdir(process.argv[2], async (err, files) => {
    if(err){
        throw err;
    }
    console.log(JSON.stringify(files.map(mod => {
        return {
            filename: mod,
            url: process.argv[3] + mod
        }
    }),null,4))
});