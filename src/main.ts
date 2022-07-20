import MinecraftController from "./mc-launch-core/minecraft_controller.js";

import {config, saveConfig} from "./config.js";
import builddata from "./builddata.js";

import {discoverJavaPath,guessJavaPath} from "./mc-launch-core/guesser.js";

import chalk from "chalk";

const controller = new MinecraftController(config);

import readline from "readline";

(async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        prompt: "> "        
    })

    console.log(chalk.magenta("Ultralaunch Minecraft Launcher v" + builddata.VERSION));
    console.log(chalk.blue("This is Minimal Launcher. It will not popup any additional windows other than this one. "));
    console.log(chalk.magenta("Checking player data. You'll be prompted if any needed data is missing"));

    if(config.username === "prompt_for_username_this_is_not_valid"){
        console.log(chalk.red("Username is not set. Please choose a username: "));
        process.exit(1);
    }

    if(!config.javaPath){
        config.javaPath = guessJavaPath() || (await discoverJavaPath());
    }

    saveConfig(config);

    console.log(chalk.cyan("Downloading game (if needed)..."));
    await controller.download();
    console.log(chalk.cyan("Game downloaded! Launching now!"));
    await controller.run();

    process.stdin.unref();
})();