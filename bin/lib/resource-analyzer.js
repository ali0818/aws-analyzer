"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeResources = void 0;
const chalk_1 = __importDefault(require("chalk"));
const clui_1 = require("clui");
const policies_1 = require("./constants/policies");
const files_1 = require("./files");
const iam_service_1 = require("./iam.service");
const ec2_resource_analyzer_1 = require("./resource-analyzers/ec2-resource.analyzer");
const s3_resource_analyzer_1 = require("./resource-analyzers/s3-resource.analyzer");
const resource_service_1 = require("./resource.service");
const resourcegroupstagging_service_1 = require("./resourcegroupstagging.service");
const graph_1 = require("./utils/graph");
const CACHE_FILE_NAME = 'resource-cache.json';
const TREE_CACHE_FILE_NAME = 'resource-tree-cache.json';
async function analyzeResources(profile, regions, refreshCache, cacheDir) {
    const iamClient = new iam_service_1.IamService(profile);
    try {
        const user = await iamClient.getUser();
        let _cacheExists = await (0, files_1.cacheExists)(CACHE_FILE_NAME, profile);
        let _treeCacheExists = await (0, files_1.cacheExists)(TREE_CACHE_FILE_NAME, profile);
        let details = {};
        let treeDetails = {};
        if (_treeCacheExists && _cacheExists && !refreshCache) {
            console.log(chalk_1.default.yellow('Using cached data'));
            const cache = await (0, files_1.loadCache)(CACHE_FILE_NAME, profile, cacheDir);
            const treeCache = await (0, files_1.loadCache)(TREE_CACHE_FILE_NAME, profile, cacheDir);
            details = cache;
            treeDetails = treeCache;
        }
        else {
            const policies = await iamClient.listAllPoliciesForUser(user);
            details.policies = policies;
            console.log(chalk_1.default.green('Got all the policies'));
            const { totalResources, regionResourcesMap } = await getAllResources(profile, regions);
            details.resources = {
                total: totalResources,
                regionResourcesMap
            };
            console.log(chalk_1.default.green('Got all the resources'));
            console.log(chalk_1.default.underline.green(`There are total {${totalResources.length}} resources in all the regions`));
            await (0, files_1.saveCache)(CACHE_FILE_NAME, details, profile, cacheDir);
            console.log(chalk_1.default.yellow('Saved Policies data to cache'));
            const mainTree = await analyzeResourceAndPolicies(policies, profile, regions);
            await (0, files_1.saveCache)(TREE_CACHE_FILE_NAME, { tree: mainTree.toJSON() }, profile, cacheDir);
        }
        return {
            details,
            comprehensive: treeDetails
        };
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error: ${error.message}`));
        console.log(error);
    }
}
exports.analyzeResources = analyzeResources;
const getAllResources = async (profile, regions) => {
    const { clients } = initializeRegionalResourceTaggingClients(profile, regions);
    const totalResources = [];
    const regionResourcesMap = {};
    for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        const resources = await client.getAllResources();
        totalResources.push(...resources);
        regionResourcesMap[client.region] = resources;
        console.log(chalk_1.default.yellow(`Got resources for ${client.region}`));
        console.log(chalk_1.default.yellow(`There are ${resources.length} resources in ${client.region}`));
    }
    return { totalResources, regionResourcesMap };
};
const initializeRegionalResourceTaggingClients = (profile, regions) => {
    const allClients = regions.map((r) => {
        return new resourcegroupstagging_service_1.ResourceGroupsTaggingService(profile, r);
    });
    let instances = {};
    allClients.forEach(client => {
        instances[client.region] = client;
    });
    return {
        clients: allClients,
        toArray: () => {
            return allClients;
        }
    };
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
const analyzeResourceAndPolicies = async (policies, profile, regions) => {
    console.log(chalk_1.default.yellow('Analyzing Resources and policies'));
    console.log(chalk_1.default.yellow('This will create a resource structure tree for the current user'));
    let statements = [];
    let isAdmin = false;
    const iamClient = new iam_service_1.IamService(profile);
    const resourceService = new resource_service_1.ResourceService(profile, regions);
    // Get all the statements from all the policies
    let spinner = new clui_1.Spinner('Getting all the resources...');
    const user = await iamClient.getUser();
    try {
        const allResources = await resourceService.getAllResources();
        let mainTree = new graph_1.Tree("User", new graph_1.Node(user.UserName, {
            type: 'user',
            userName: user.UserName,
            userId: user.UserId,
        }));
        for (let i = 0; i < policies.length; i++) {
            const policy = policies[i];
            if (policy.PolicyArn == policies_1.ADMIN_POLICY) {
                isAdmin = true;
            }
            for (let j = 0; j < policy.Document.Statement.length; j++) {
                const statement = policy.Document.Statement[j];
                if (statement.Effect == 'Allow') {
                    statements.push(statement);
                }
            }
        }
        console.log(chalk_1.default.yellow("\nFetched all required resources..."));
        console.log(chalk_1.default.yellow("Compiling Resource Tree\n"));
        //FOR EC2
        const { ec2Subtree } = await (0, ec2_resource_analyzer_1.analyzeEC2Resources)(policies, allResources.ec2, statements, profile, regions);
        mainTree.root.addChild(ec2Subtree.root);
        //FOR S3
        const { s3Subtree } = await (0, s3_resource_analyzer_1.analyzeS3Resources)(policies, allResources.s3, statements, profile, regions);
        mainTree.root.addChild(s3Subtree.root);
        return mainTree;
    }
    catch (error) {
        console.error(chalk_1.default.red(error));
    }
    finally {
        spinner.stop();
    }
};
//# sourceMappingURL=resource-analyzer.js.map