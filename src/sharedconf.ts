import Conf from "conf";
import builddata from "./builddata";
import myconfig from "./myconfig";
export default new Conf({
    cwd: process.cwd(),
    projectVersion: builddata.VERSION,
    projectName: myconfig.projectName || "ultralaunch",
    defaults: myconfig.defaults
})