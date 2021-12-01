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
const clear_1 = __importDefault(require("clear"));
const figlet_1 = __importDefault(require("figlet"));
const chalk_1 = __importDefault(require("chalk"));
const yargs_1 = __importDefault(require("yargs"));
const analyzer = __importStar(require("./lib/analyzer"));
const regions_1 = require("./lib/constants/regions");
(0, clear_1.default)();
console.log(chalk_1.default.yellow(figlet_1.default.textSync('EC2 Analyzer', { horizontalLayout: 'full' })));
function processArgs() {
    const args = (0, yargs_1.default)(process.argv.slice(2))
        .demandOption(['profile'])
        .option('regions', {
        alias: 'r',
        describe: 'Regions to analyze',
        type: 'array',
    })
        .option('refreshcache', {
        demandOption: false,
        default: false,
        alias: 'C',
        describe: 'Refresh cache',
        type: 'boolean',
        boolean: true,
        description: 'Refresh cache'
    })
        .default('profile', 'default')
        .describe('profile', 'AWS profile to use')
        .usage('Usage: perusec2 --profile [profile] --regions [...regions]')
        .help('h')
        .alias('h', 'help')
        .argv;
    return args;
}
async function run() {
    const args = processArgs();
    if (!args.profile) {
        console.log(chalk_1.default.red('No profile provided'));
    }
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
    //Run analyzer
    analyzer.analyze(args.profile, _regions, args.refreshcache);
    console.log(chalk_1.default.green(`Using profile: ${args.profile}`));
}
run();
//# sourceMappingURL=index.js.map