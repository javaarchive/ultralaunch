import {default as Conf} from "conf"; // hack ig
import builddata from "./builddata.js";
import myconfig from "./myconfig.js";

export default new Conf({
    projectVersion: builddata.VERSION,
    projectName: myconfig.projectName || "ultralaunch",
    defaults: myconfig.defaults,
    configName: "ultralauncher",
    projectSuffix: "",
    cwd: process.cwd()
});
