"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeResourceAndPoliciesForRole = exports.analyzeResources = void 0;
const chalk_1 = __importDefault(require("chalk"));
const __1 = require("..");
const policies_1 = require("./constants/policies");
const files_1 = require("./files");
const iam_service_1 = require("./iam.service");
const dynamodb_resource_analyzer_1 = require("./resource-analyzers/dynamodb-resource.analyzer");
const ec2_resource_analyzer_1 = require("./resource-analyzers/ec2-resource.analyzer");
const lambda_resource_analyzer_1 = require("./resource-analyzers/lambda-resource.analyzer");
const rds_resource_analyzer_1 = require("./resource-analyzers/rds-resource-analyzer");
const s3_resource_analyzer_1 = require("./resource-analyzers/s3-resource.analyzer");
const resource_service_1 = require("./resource.service");
const resourcegroupstagging_service_1 = require("./resourcegroupstagging.service");
const graph_1 = require("./utils/graph");
const CACHE_FILE_NAME = 'resource-cache.json';
const TREE_CACHE_FILE_NAME = 'resource-tree-cache.json';
async function analyzeResources(profile, regions, refreshCache, cacheDir) {
    const iamClient = new iam_service_1.IamService(profile);
    const users = await iamClient.getAllUsers();
    const roles = await iamClient.getAllRoles();
    console.log(chalk_1.default.yellow(`Got ${users.length} users`));
    // const { totalResources, regionResourcesMap } = await getAllResources(profile, regions);
    const mainTree = new graph_1.Tree(`ROOT`, new graph_1.Node(`ROOT`, {
        type: "root"
    }));
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
        const resourceService = new resource_service_1.ResourceService(profile, regions);
        const allResources = await resourceService.getAllResources();
        let regionResourceMap = {};
        Object.keys(allResources).forEach(principal => {
            Object.keys(allResources[principal]).forEach(service => {
                regionResourceMap[service] = allResources[principal][service].regionMap;
            });
        });
        let userDetails = {};
        const userNode = new graph_1.Node('Users', {
            type: 'users',
            details: {
                count: users.length
            }
        });
        for (let i = 0; i < users.length; i++) {
            try {
                const user = users[i];
                const policies = await iamClient.listAllPoliciesForUser(user);
                if (!userDetails[user.UserId]) {
                    userDetails[user.UserId] = {};
                }
                userDetails[user.UserId].policies = policies;
                console.log(chalk_1.default.green('Got all the policies'));
                userDetails[user.UserId].resources = {
                    total: allResources,
                    regionResourceMap
                };
                const userTree = await analyzeResourceAndPoliciesForUser(policies, profile, regions, user, allResources);
                userNode.addChild(userTree.root);
            }
            catch (error) {
                console.error(chalk_1.default.red(`Error: ${error.message}`));
                console.log(error);
                __1.files.logError(error, profile, cacheDir);
            }
        }
        let rolesDetails = {};
        const rolesNode = new graph_1.Node('Roles', {
            type: 'roles',
            details: {
                count: roles.length
            }
        });
        for (let i = 0; i < roles.length; i++) {
            try {
                const role = roles[i];
                const policies = await iamClient.getAllPoliciesForRole(role);
                if (!rolesDetails[role.RoleId]) {
                    rolesDetails[role.RoleId] = {};
                }
                rolesDetails[role.RoleId].policies = policies;
                console.log(chalk_1.default.green('Got all the policies'));
                rolesDetails[role.RoleId].resources = {
                    total: allResources,
                    regionResourceMap
                };
                const roleTree = await (0, exports.analyzeResourceAndPoliciesForRole)(policies, profile, regions, role, allResources);
                rolesNode.addChild(roleTree.root);
            }
            catch (error) {
                console.error(chalk_1.default.red(`Error: ${error.message}`));
                console.log(error);
                __1.files.logError(error, profile, cacheDir);
            }
        }
        details.roles = rolesDetails;
        details.users = userDetails;
        mainTree.root.addChild(userNode);
        mainTree.root.addChild(rolesNode);
        await (0, files_1.saveCache)(CACHE_FILE_NAME, details, profile, cacheDir);
        console.log(chalk_1.default.yellow('Saved Policies data to cache'));
        await (0, files_1.saveCache)(TREE_CACHE_FILE_NAME, { tree: mainTree.toJSON() }, profile, cacheDir);
    }
    return {
        details,
        comprehensive: treeDetails
    };
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
 * Analyze policies and generate resource tree for a role
 * @param policies
 * @param profile
 * @param regions
 * @param role role to analyze
 * @param allResources All resources in all regions
 * @returns
 */
const analyzeResourceAndPoliciesForRole = async (policies, profile, regions, role, allResources) => {
    try {
        console.log(chalk_1.default.yellow('Analyzing Resources and policies for role'));
        console.log(chalk_1.default.yellow('This will create a resource structure tree for the current role'));
        let mainTree = new graph_1.Tree(`${role.RoleName}`, new graph_1.Node(role.RoleName, {
            type: 'role',
            roleName: role.RoleName,
            roleId: role.RoleId,
            policies: policies
        }));
        return generateResourceTree(policies, profile, regions, mainTree, allResources);
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error while generating resource tree for a role`));
        console.log(chalk_1.default.red(error));
    }
};
exports.analyzeResourceAndPoliciesForRole = analyzeResourceAndPoliciesForRole;
/**
 * Analyze policies and generate resource tree for a user
 * @param policies
 * @param profile
 * @param regions list of regions available
 * @param user user to generate resource tree for
 * @param allResources All resource available in all regions
 * @returns
 */
const analyzeResourceAndPoliciesForUser = async (policies, profile, regions, user, allResources) => {
    console.log(chalk_1.default.yellow('Analyzing Resources and policies for user'));
    console.log(chalk_1.default.yellow('This will create a resource structure tree for the current user'));
    try {
        let mainTree = new graph_1.Tree(`${user.UserName}`, new graph_1.Node(user.UserName, {
            type: 'user',
            userName: user.UserName,
            userId: user.UserId,
            policies: policies
        }));
        return await generateResourceTree(policies, profile, regions, mainTree, allResources);
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error while generating user resource tree`));
        console.log(error);
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
const generateResourceTree = async (policies, profile, regions, mainTree, allResources) => {
    console.log(chalk_1.default.yellow('Analyzing Resources and policies'));
    console.log(chalk_1.default.yellow('This will create a resource structure tree'));
    let statements = [];
    let isAdmin = false;
    // Get all the statements from all the policies
    try {
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
        console.log(chalk_1.default.yellow("Compiling Resource Tree\n"));
        //FOR EC2
        const { ec2Subtree } = await (0, ec2_resource_analyzer_1.analyzeEC2Resources)(policies, allResources.ec2, statements, profile, regions);
        mainTree.root.addChild(ec2Subtree.root);
        //FOR S3
        const { s3Subtree } = await (0, s3_resource_analyzer_1.analyzeS3Resources)(policies, allResources.s3, statements, profile, regions);
        mainTree.root.addChild(s3Subtree.root);
        //FOR RDS
        const { rdsSubtree } = await (0, rds_resource_analyzer_1.analyzerRDSResources)(policies, allResources.rds, statements, profile, regions);
        mainTree.root.addChild(rdsSubtree.root);
        //For Lambda
        const { lambdaSubtree } = await (0, lambda_resource_analyzer_1.analyzerLambdaResources)(policies, allResources.lambda, statements, profile, regions);
        mainTree.root.addChild(lambdaSubtree.root);
        //For DynamoDB
        const { dynamodbSubtree } = await (0, dynamodb_resource_analyzer_1.analyzeDynamodbResources)(policies, allResources.dynamodb, statements, profile, regions);
        mainTree.root.addChild(dynamodbSubtree.root);
        return mainTree;
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error generating resource tree`));
        console.error(chalk_1.default.red(error));
    }
    finally {
    }
};
//# sourceMappingURL=resource-analyzer.js.map