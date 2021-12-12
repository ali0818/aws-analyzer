"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCache = exports.cacheExists = exports.saveCache = exports.directoryExists = exports.getCurrentDirectoryBase = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const __1 = require("..");
const getCurrentDirectoryBase = () => {
    return "./";
    return path_1.default.basename(process.cwd());
};
exports.getCurrentDirectoryBase = getCurrentDirectoryBase;
const directoryExists = (filePath) => {
    return fs_1.default.existsSync(filePath);
};
exports.directoryExists = directoryExists;
const saveCache = async (filename, data, profile = 'default', cachedir = __1.CACHE_DIR) => {
    try {
        const baseDir = (0, exports.getCurrentDirectoryBase)();
        if (!(0, exports.directoryExists)(path_1.default.resolve(baseDir, `${cachedir}/${profile}`))) {
            fs_1.default.mkdirSync(`${cachedir}/${profile}`, { recursive: true });
        }
        const filePath = path_1.default.join(baseDir, cachedir, profile, filename);
        console.log(chalk_1.default.green(`Saving cache to ${filePath}`));
        await fs_1.default.promises.writeFile(filePath, JSON.stringify(data));
    }
    catch (error) {
        console.error(chalk_1.default.red(error));
    }
};
exports.saveCache = saveCache;
const cacheExists = async (filename, profile = 'default', cacheDir = __1.CACHE_DIR) => {
    try {
        const baseDir = (0, exports.getCurrentDirectoryBase)();
        const filePath = path_1.default.join(baseDir, cacheDir, profile, filename);
        return (0, exports.directoryExists)(filePath);
    }
    catch (error) {
        console.error(chalk_1.default.red(error));
        return false;
    }
};
exports.cacheExists = cacheExists;
const loadCache = async (filename, profile = 'default', cacheDir = __1.CACHE_DIR) => {
    try {
        const baseDir = (0, exports.getCurrentDirectoryBase)();
        const filePath = path_1.default.join(baseDir, cacheDir, profile, filename);
        const data = await fs_1.default.promises.readFile(filePath);
        return JSON.parse(data.toString());
    }
    catch (error) {
        console.error(chalk_1.default.red(error));
        return null;
    }
};
exports.loadCache = loadCache;
//# sourceMappingURL=files.js.map