import { EC2, GetConsoleOutputResult } from "@aws-sdk/client-ec2";
import chalk from "chalk";
import { Spinner } from "clui";
import { fstat } from "fs";
import { getActions } from "./actions-list";
import { ADMIN_POLICY } from "./constants/policies";
import { ARN_REGEX } from "./constants/regex";
import { cacheExists, loadCache, saveCache } from "./files";
import { IamService } from "./iam.service";
import { analyzeEC2Resources } from "./resource-analyzers/ec2-resource.analyzer";
import { analyzeS3Resources } from "./resource-analyzers/s3-resource.analyzer";
import { ResourceService, ResourceTypeReturnType, ServiceAllResourceReturnType } from "./resource.service";
import { ResourceGroupsTaggingService } from "./resourcegroupstagging.service";
import { Node, Tree } from "./utils/graph";

const CACHE_FILE_NAME: string = 'resource-cache.json';
const TREE_CACHE_FILE_NAME = 'resource-tree-cache.json';

type ResourceRegexMatchResult = {
    principal: string,
    region: string,
    resourceType: string,
    resourceId: string
}

export async function analyzeResources(profile: string, regions: string[], refreshCache: boolean, cacheDir: string) {
    const iamClient = new IamService(profile);

    try {
        const user = await iamClient.getUser();

        let _cacheExists = await cacheExists(CACHE_FILE_NAME, profile);
        let _treeCacheExists = await cacheExists(TREE_CACHE_FILE_NAME, profile);
        let details: any = {};
        let treeDetails: any = {};

        if (_treeCacheExists && _cacheExists && !refreshCache) {
            console.log(chalk.yellow('Using cached data'));

            const cache = await loadCache(CACHE_FILE_NAME, profile, cacheDir);
            const treeCache = await loadCache(TREE_CACHE_FILE_NAME, profile, cacheDir);
            details = cache;
            treeDetails = treeCache;

        } else {
            const policies = await iamClient.listAllPoliciesForUser(user);

            details.policies = policies;

            console.log(chalk.green('Got all the policies'));

            const { totalResources, regionResourcesMap } = await getAllResources(profile, regions);
            details.resources = {
                total: totalResources,
                regionResourcesMap
            }
            console.log(chalk.green('Got all the resources'));

            console.log(chalk.underline.green(`There are total {${totalResources.length}} resources in all the regions`));

            await saveCache(CACHE_FILE_NAME, details, profile, cacheDir);
            console.log(chalk.yellow('Saved Policies data to cache'));

            const mainTree = await analyzeResourceAndPolicies(policies, profile, regions);

            await saveCache(TREE_CACHE_FILE_NAME, { tree: mainTree.toJSON() }, profile, cacheDir);
        }

        return {
            details,
            comprehensive: treeDetails
        }
    } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        console.log(error);
    }
}

const getAllResources = async (profile: string, regions: string[]) => {
    const { clients } = initializeRegionalResourceTaggingClients(profile, regions);

    const totalResources = [];

    const regionResourcesMap = {};

    for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        const resources = await client.getAllResources();
        totalResources.push(...resources);

        regionResourcesMap[client.region] = resources;

        console.log(chalk.yellow(`Got resources for ${client.region}`));
        console.log(chalk.yellow(`There are ${resources.length} resources in ${client.region}`));
    }

    return { totalResources, regionResourcesMap };
}

const initializeRegionalResourceTaggingClients = (profile: string, regions: string[]) => {
    const allClients = regions.map((r) => {
        return new ResourceGroupsTaggingService(profile, r);
    });

    let instances: { [name: string]: ResourceGroupsTaggingService } = {};

    allClients.forEach(client => {
        instances[client.region] = client;
    });

    return {
        clients: allClients,
        toArray: () => {
            return allClients;
        }
    }
};

/**
 * 
 * @param policies List of all the policies related to a user
 * @param resources A map of resources with principal as key which in term contains an object which
 * contains a list of all the resources in all the regions and also a region
 * wise map of the resources
 * For eg: { [ec2]: 
 *              {
 *                  [instances]: 
 *                      {
*                           instances: [],
                             regionInstanceMap:
                             {
                                 [region]: instances[] }
                                }
                        }
 */
const analyzeResourceAndPolicies = async (policies, profile, regions): Promise<Tree> => {
    console.log(chalk.yellow('Analyzing Resources and policies'));
    console.log(chalk.yellow('This will create a resource structure tree for the current user'));
    let statements: any[] = [];

    let isAdmin = false;

    const iamClient = new IamService(profile);

    const resourceService = new ResourceService(profile, regions);

    // Get all the statements from all the policies
    let spinner = new Spinner('Getting all the resources...');

    const user = await iamClient.getUser();

    try {
        const allResources = await resourceService.getAllResources();

        let mainTree = new Tree("User", new Node(user.UserName, {
            type: 'user',
            userName: user.UserName,
            userId: user.UserId,
        }));

        for (let i = 0; i < policies.length; i++) {
            const policy = policies[i];
            if (policy.PolicyArn == ADMIN_POLICY) {
                isAdmin = true;
            }
            for (let j = 0; j < policy.Document.Statement.length; j++) {
                const statement = policy.Document.Statement[j];
                if (statement.Effect == 'Allow') {
                    statements.push(statement);
                }
            }
        }

        console.log(chalk.yellow("\nFetched all required resources..."));
        console.log(chalk.yellow("Compiling Resource Tree\n"));

        //FOR EC2
        const { ec2Subtree } = await analyzeEC2Resources(policies, allResources.ec2, statements, profile, regions);
        mainTree.root.addChild(ec2Subtree.root);

        //FOR S3
        const { s3Subtree } = await analyzeS3Resources(policies, allResources.s3, statements, profile, regions);
        mainTree.root.addChild(s3Subtree.root);

        return mainTree;
    } catch (error) {
        console.error(chalk.red(error));
    } finally {
        spinner.stop();
    }
}
