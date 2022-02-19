import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { CACHE_DIR } from '..';
import { serializeError } from './serializer';

export const getCurrentDirectoryBase = () => {
    return "./";
    return path.basename(process.cwd());
};

export const directoryExists = (filePath) => {
    return fs.existsSync(filePath);
};

export const saveCache = async (filename: string, data, profile: string = 'default', cachedir: string = CACHE_DIR) => {
    try {
        const baseDir = getCurrentDirectoryBase();

        if (!directoryExists(path.resolve(baseDir, `${cachedir}/${profile}`))) {
            fs.mkdirSync(`${cachedir}/${profile}`, { recursive: true });
        }
        const filePath = path.join(baseDir, cachedir, profile, filename);

        console.log(chalk.green(`Saving cache to ${filePath}`));

        await fs.promises.writeFile(filePath, JSON.stringify(data));
    } catch (error) {
        console.error(chalk.red(error));
    }
}
export const cacheExists = async (filename: string, profile: string = 'default', cacheDir: string = CACHE_DIR) => {
    try {
        const baseDir = getCurrentDirectoryBase();
        const filePath = path.join(baseDir, cacheDir, profile, filename);
        return directoryExists(filePath);
    } catch (error) {
        console.error(chalk.red(error));
        return false;
    }
}

export const loadCache = async (filename: string, profile: string = 'default', cacheDir: string = CACHE_DIR) => {
    try {
        const baseDir = getCurrentDirectoryBase();
        const filePath = path.join(baseDir, cacheDir, profile, filename);
        const data = await fs.promises.readFile(filePath);
        return JSON.parse(data.toString());
    } catch (error) {
        console.error(chalk.red(error));
        return null;
    }
}

export const logError = async (error: any, profile: string, cachedir: string = CACHE_DIR) => {
    try {
        const baseDir = getCurrentDirectoryBase();
        if (!directoryExists(path.resolve(baseDir, `${cachedir}/${profile}`))) {
            fs.mkdirSync(`${cachedir}/${profile}`, { recursive: true });
        }
        const filePath = path.join(baseDir, cachedir, profile, 'error.txt');
        console.log(chalk.yellow('Writing Error to file'));
        console.log(error);
        let serialized = serializeError(error);
        console.log(serialized);
        console.log(typeof serialized);
        await fs.promises.appendFile(filePath, '\n' + JSON.stringify(serializeError(error)));
    } catch (error) {
        console.error(chalk.red(error));
    }
}

export const flushErrors = async (profile: string, cachedir: string = CACHE_DIR) => {
    try {
        const baseDir = getCurrentDirectoryBase();
        if (!directoryExists(path.resolve(baseDir, `${cachedir}/${profile}`))) {
            fs.mkdirSync(`${cachedir}/${profile}`, { recursive: true });
        }
        const filePath = path.join(baseDir, cachedir, profile, 'error.log');

        fs.unlinkSync(filePath);
    } catch (error) {
        console.error(chalk.red(error));
    }
}