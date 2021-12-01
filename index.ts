#!/usr/bin/env node

import clear from 'clear';
import figlet from 'figlet';
import chalk from 'chalk';
import yargs from 'yargs';
import * as analyzer from './lib/analyzer';

clear();
console.log(
    chalk.yellow(
        figlet.textSync('EC2 Analyzer', { horizontalLayout: 'full' })
    )
);


function processArgs() {
    const args: any = yargs(process.argv.slice(2))
        .demandOption(['profile'])
        .option('refreshcache', {
            demandOption: false,
            default: false,
            alias: 'r',
            describe: 'Refresh cache',
            type: 'boolean',
            boolean: true,
            description: 'Refresh cache'
        })
        .default('profile', 'default')
        .describe('profile', 'AWS profile to use')
        .usage('Usage: $0 --profile [profile]')
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

    //Run analyzer
    analyzer.analyze(args.profile, args.refreshcache);

    console.log(chalk.green(`Using profile: ${args.profile}`));
}

run();