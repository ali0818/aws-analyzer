#!/usr/bin/env node

import clear from 'clear';
import figlet from 'figlet';
import chalk from 'chalk';
import yargs from 'yargs';
import * as analyzer from './lib/analyzer';
import { regions } from './lib/constants/regions';
import { analyzeResources } from './lib/resource-analyzer';
import { flushErrors } from './lib/files';

export * as files from './lib/files';

export const CACHE_DIR = 'aws-resources-cache';

clear();
console.log(
    chalk.yellow(
        figlet.textSync('AWS CIEM Analyzer', { horizontalLayout: 'full' })
    )
);

const baseArgs = () => {
    return yargs
        .demandOption('profile')
        .options({
            cachedir: {
                alias: 'c',
                describe: 'Directory to cache data',
                default: CACHE_DIR
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
        })
}

function processArgs() {
    const args: any = yargs(process.argv.slice(2))
        .command(['ec2'], 'analyze ec2 instances', () => { }, (argv) => {
            console.log("RUNNING EC@");
            runEC2(argv);
        })
        .command('flush', 'Flushes Errors', () => {
            return baseArgs()
        }, (argv) => {
            console.log(chalk.yellow('Flushing Previous Errors'));
            flushErrors(argv.profile, argv.cachedir);
        })
        .command('resources', 'Analyze iam resources',
            () => {
                return baseArgs()
            },
            (argv) => {
                console.log("RUNNING RESOURCES");
                runResources(argv);
            })
        .usage('Usage: aws-manager <ec2>|<resources> --profile [profile] --regions [...regions]')
        .help('h')
        .alias('h', 'help')
        .argv;

    return args;
}

export async function runResources(args) {
    try {
        const _regions = await _processRegions(args);
        console.log(chalk.yellow(`Analyzing resources in regions: ${_regions}`));
        //Run resource analyzer
        let data = await analyzeResources(args.profile, _regions, args.refreshcache, args.cachedir);

        return data;
    } catch (err) {
        console.error(err);
    }
}

async function _processRegions(args) {
    console.log(args);
    console.log(args.regions);

    let _regions = regions;

    ///If regions are provided 
    ///filter out unwanted/wrong regions 
    if (args.regions) {
        _regions = _regions
            .map(r => r.toLowerCase())
            .filter((r) => {
                regions.includes(r);
            })
    }

    return _regions;
}

export async function runEC2(args) {
    console.log(args);

    if (!args.profile) {
        console.log(chalk.red('No profile provided'));
    }

    const _regions = await _processRegions(args);

    //Run analyzer
    analyzer.analyze(args.profile, _regions, args.refreshcache);

    console.log(chalk.green(`Using profile: ${args.profile}`));
}

function run() {
    processArgs();
}

run();