import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

const CACHE_DIR = 'cache';


export const getCurrentDirectoryBase = () => {
    return "./";
    return path.basename(process.cwd());
};

export const directoryExists = (filePath) => {
    return fs.existsSync(filePath);
};

export const saveCache = async (filename: string, data, profile: string = 'default') => {
    try {
        const baseDir = getCurrentDirectoryBase();

        if (!directoryExists(path.resolve(baseDir, `${CACHE_DIR}/${profile}`))) {
            fs.mkdirSync(`${CACHE_DIR}/${profile}`, { recursive: true });
        }
        const filePath = path.join(baseDir, CACHE_DIR, profile, filename);
        console.log(chalk.green(`Saving cache to ${filePath}`));
        await fs.promises.writeFile(filePath, JSON.stringify(data));
    } catch (error) {
        console.error(chalk.red(error));
    }
}
export const cacheExists = async (filename: string, profile: string = 'default') => {
    try {
        const baseDir = getCurrentDirectoryBase();
        const filePath = path.join(baseDir, CACHE_DIR, profile, filename);
        return directoryExists(filePath);
    } catch (error) {
        console.error(chalk.red(error));
        return false;
    }
}

export const loadCache = async (filename: string, profile: string = 'default') => {
    try {
        const baseDir = getCurrentDirectoryBase();
        const filePath = path.join(baseDir, CACHE_DIR, profile, filename);
        const data = await fs.promises.readFile(filePath);
        return JSON.parse(data.toString());
    } catch (error) {
        console.error(chalk.red(error));
        return null;
    }
}