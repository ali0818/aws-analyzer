#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEC2 = exports.runResources = exports.CACHE_DIR = exports.files = void 0;
const clear_1 = __importDefault(require("clear"));
const figlet_1 = __importDefault(require("figlet"));
const chalk_1 = __importDefault(require("chalk"));
const yargs_1 = __importDefault(require("yargs"));
const analyzer = __importStar(require("./lib/analyzer"));
const regions_1 = require("./lib/constants/regions");
const resource_analyzer_1 = require("./lib/resource-analyzer");
const files_1 = require("./lib/files");
exports.files = __importStar(require("./lib/files"));
exports.CACHE_DIR = 'aws-resources-cache';
(0, clear_1.default)();
console.log(chalk_1.default.yellow(figlet_1.default.textSync('AWS CIEM Analyzer', { horizontalLayout: 'full' })));
const baseArgs = () => {
    return yargs_1.default
        .demandOption('profile')
        .options({
        cachedir: {
            alias: 'c',
            describe: 'Directory to cache data',
            default: exports.CACHE_DIR
        },
        profile: {
            alias: 'p',
            describe: 'AWS profile to use',
            type: 'string',
            required: true
        },
        refreshcache: {
            alias: 'r',
            describe: 'Refresh cache',
            type: 'boolean'
        },
    });
};
function processArgs() {
    const args = (0, yargs_1.default)(process.argv.slice(2))
        .command(['ec2'], 'analyze ec2 instances', () => { }, (argv) => {
        console.log("RUNNING EC@");
        runEC2(argv);
    })
        .command('flush', 'Flushes Errors', () => {
        return baseArgs();
    }, (argv) => {
        console.log(chalk_1.default.yellow('Flushing Previous Errors'));
        (0, files_1.flushErrors)(argv.profile, argv.cachedir);
    })
        .command('resources', 'Analyze iam resources', () => {
        return baseArgs();
    }, (argv) => {
        console.log("RUNNING RESOURCES");
        runResources(argv);
    })
        .usage('Usage: aws-manager <ec2>|<resources> --profile [profile] --regions [...regions]')
        .help('h')
        .alias('h', 'help')
        .argv;
    return args;
}
async function runResources(args) {
    try {
        const _regions = await _processRegions(args);
        console.log(chalk_1.default.yellow(`Analyzing resources in regions: ${_regions}`));
        //Run resource analyzer
        let data = await (0, resource_analyzer_1.analyzeResources)(args.profile, _regions, args.refreshcache, args.cachedir);
        return data;
    }
    catch (err) {
        console.error(err);
    }
}
exports.runResources = runResources;
async function _processRegions(args) {
    console.log(args);
    console.log(args.regions);
    let _regions = regions_1.regions;
    ///If regions are provided 
    ///filter out unwanted/wrong regions 
    if (args.regions) {
        _regions = _regions
            .map(r => r.toLowerCase())
            .filter((r) => {
            regions_1.regions.includes(r);
        });
    }
    return _regions;
}
async function runEC2(args) {
    console.log(args);
    if (!args.profile) {
        console.log(chalk_1.default.red('No profile provided'));
    }
    const _regions = await _processRegions(args);
    //Run analyzer
    analyzer.analyze(args.profile, _regions, args.refreshcache);
    console.log(chalk_1.default.green(`Using profile: ${args.profile}`));
}
exports.runEC2 = runEC2;
function run() {
    processArgs();
}
run();
//# sourceMappingURL=index.js.map