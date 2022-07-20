import {config as initialConfiguration, saveConfig} from "./config.js";
import builddata from "./builddata.js";

import {Launcher} from "./launcher.js";

import {discoverJavaPath,guessJavaPath} from "./mc-launch-core/guesser.js";

import chalk from "chalk";

import readline from "readline";

import ProgressBar from "progress";

(async () => {
    const launcher = new Launcher(initialConfiguration);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        prompt: "> "        
    });

    function input(query): Promise<string> {
        return new Promise(resolve => {
            rl.question(query, resolve);
        });
    }

    console.log(chalk.magenta("Ultralaunch Minecraft Launcher v" + builddata.VERSION));
    console.log(chalk.blue("This is Minimal Launcher. It will not popup any additional windows other than this one. "));

    console.log(chalk.magenta("Checking player data. You'll be prompted if any needed data is missing"));

    if(launcher.config.username === "prompt_for_username_this_is_not_valid"){
        console.log(chalk.red("Username is not set. Please choose a username: "));
        launcher.config.username = await input(chalk.red("Username: "));
    }

    if(!launcher.config.javaPath){
        launcher.config.javaPath = guessJavaPath() || (await discoverJavaPath());
    }

    if(launcher.config.javaPath === "java"){
        console.log(chalk.red("Java is not set to absolute path. You may experience issues launching. "));
    }

    console.log(chalk.green("Welcome User " + launcher.config.username));

    launcher.setLogging(true);

    // Attaching progress bars
    launcher.controller.on("assetDownloadProgress", (initialProgress) => {
        if(initialProgress.current != 0) return;
        let bar = new ProgressBar("Assets downloading... [:bar] :rate/fps :percent :etas", {
            total: initialProgress.total
        });
        launcher.controller.on("assetDownloadProgress", (progress) => {
            bar.tick(1);
        });
    });

    launcher.controller.on("libraryDownloadProgress", (initialProgress) => {
        if(initialProgress.current != 0) return;
        let bar = new ProgressBar("Libraries downloading... [:bar] :rate/fps :percent :etas", {
            total: initialProgress.total
        });
        launcher.controller.on("libraryDownloadProgress", (progress) => {
            bar.tick(1);
        });
    });

    try{
        await launcher.syncRemoteConfig();

        console.log(chalk.magenta("Download game (if needed). "));
        await launcher.download();

        console.log(chalk.magenta("Apply mods (if needed). "));
        await launcher.applyMods();

        await launcher.launch();
    }catch(ex){
        console.log(chalk.red("An inrecoverable launcher error occured. The launcher has entered a halted state. "));
        console.log(chalk.red("Error: " + ex.message));
        console.log(ex);
        console.log(chalk.red("Please report this error to the launcher developer. "));
        console.log(chalk.red("Press ENTER/RETURN to close the window. "));
    }

    rl.close();

    process.stdin.unref();
})();