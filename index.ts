#!/usr/bin/env node

import clear from 'clear';
import figlet from 'figlet';
import chalk from 'chalk';
import yargs from 'yargs';
import * as analyzer from './lib/analyzer';
import { regions } from './lib/constants/regions';

clear();
console.log(
    chalk.yellow(
        figlet.textSync('EC2 Analyzer', { horizontalLayout: 'full' })
    )
);


function processArgs() {
    const args: any = yargs(process.argv.slice(2))
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
        .usage('Usage: $0 --profile [profile] --regions [...regions]')
        .help('h')
        .alias('h', 'help')
        .argv;

    return args;
}

async function run() {
    const args = processArgs();

    if (!args.profile) {
        console.log(chalk.red('No profile provided'));
    }

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

    //Run analyzer
    analyzer.analyze(args.profile, _regions, args.refreshcache);

    console.log(chalk.green(`Using profile: ${args.profile}`));
}

run();