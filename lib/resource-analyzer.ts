import { EC2, GetConsoleOutputResult } from "@aws-sdk/client-ec2";
import { Role, RoleDetail, User } from "@aws-sdk/client-iam";
import chalk from "chalk";
import { Spinner } from "clui";
import { fstat } from "fs";
import { files } from "..";
import { getActions } from "./actions-list";
import { ADMIN_POLICY } from "./constants/policies";
import { ARN_REGEX } from "./constants/regex";
import { cacheExists, loadCache, saveCache } from "./files";
import { IamService } from "./iam.service";
import { analyzeDynamodbResources } from "./resource-analyzers/dynamodb-resource.analyzer";
import { analyzeEC2Resources } from "./resource-analyzers/ec2-resource.analyzer";
import { analyzerLambdaResources } from "./resource-analyzers/lambda-resource.analyzer";
import { analyzerRDSResources } from "./resource-analyzers/rds-resource-analyzer";
import { analyzeS3Resources } from "./resource-analyzers/s3-resource.analyzer";
import { ResourceService, ResourceTypeReturnType, ServiceAllResourceReturnType } from "./resource.service";
import { ResourceGroupsTaggingService } from "./resourcegroupstagging.service";
import { Node, Tree } from "./utils/graph";

const CACHE_FILE_NAME: string = 'resource-cache.json';
const TREE_CACHE_FILE_NAME = 'resource-tree-cache.json';

export type AllResources = {
    ec2: ServiceAllResourceReturnType, s3: ServiceAllResourceReturnType,
    rds: ServiceAllResourceReturnType, lambda: ServiceAllResourceReturnType,
    dynamodb: ServiceAllResourceReturnType,
}

type ResourceRegexMatchResult = {
    principal: string,
    region: string,
    resourceType: string,
    resourceId: string
}

export async function analyzeResources(profile: string, regions: string[], refreshCache: boolean, cacheDir: string) {
    const iamClient = new IamService(profile);

    const users = await iamClient.getAllUsers();
    const roles = await iamClient.getAllRoles();

    console.log(chalk.yellow(`Got ${users.length} users`));

    // const { totalResources, regionResourcesMap } = await getAllResources(profile, regions);

    const mainTree = new Tree(`ROOT`, new Node(`ROOT`, {
        type: "root"
    }));

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
        const resourceService = new ResourceService(profile, regions);
        const allResources = await resourceService.getAllResources();
        let regionResourceMap = {};

        Object.keys(allResources).forEach(principal => {
            Object.keys(allResources[principal]).forEach(service => {
                regionResourceMap[service] = allResources[principal][service].regionMap;
            });
        });

        let userDetails = {};
        const userNode = new Node('Users', {
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

                console.log(chalk.green('Got all the policies'));

                userDetails[user.UserId].resources = {
                    total: allResources,
                    regionResourceMap
                }

                const userTree = await analyzeResourceAndPoliciesForUser(policies, profile, regions, user, allResources);
                userNode.addChild(userTree.root);
            } catch (error) {
                console.error(chalk.red(`Error: ${error.message}`));
                console.log(error);
                files.logError(error, profile, cacheDir);
            }
        }

        let rolesDetails = {};
        const rolesNode = new Node('Roles', {
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

                console.log(chalk.green('Got all the policies'));

                rolesDetails[role.RoleId].resources = {
                    total: allResources,
                    regionResourceMap
                }

                const roleTree = await analyzeResourceAndPoliciesForRole(policies, profile, regions, role, allResources);
                rolesNode.addChild(roleTree.root);
            } catch (error) {
                console.error(chalk.red(`Error: ${error.message}`));
                console.log(error);
                files.logError(error, profile, cacheDir);
            }
        }

        details.roles = rolesDetails;
        details.users = userDetails;
        mainTree.root.addChild(userNode);
        mainTree.root.addChild(rolesNode);
        await saveCache(CACHE_FILE_NAME, details, profile, cacheDir);
        console.log(chalk.yellow('Saved Policies data to cache'));
        await saveCache(TREE_CACHE_FILE_NAME, { tree: mainTree.toJSON() }, profile, cacheDir);
    }

    return {
        details,
        comprehensive: treeDetails
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
 * Analyze policies and generate resource tree for a role
 * @param policies 
 * @param profile 
 * @param regions 
 * @param role role to analyze
 * @param allResources All resources in all regions
 * @returns 
 */
export const analyzeResourceAndPoliciesForRole = async (policies, profile: string, regions: string[], role: Role, allResources: AllResources): Promise<Tree> => {
    try {
        console.log(chalk.yellow('Analyzing Resources and policies for role'));
        console.log(chalk.yellow('This will create a resource structure tree for the current role'));

        let mainTree = new Tree(`${role.RoleName}`, new Node(role.RoleName, {
            type: 'role',
            roleName: role.RoleName,
            roleId: role.RoleId,
        }));

        return generateResourceTree(policies, profile, regions, mainTree, allResources);
    } catch (error) {
        console.error(chalk.red(`Error while generating resource tree for a role`));
        console.log(chalk.red(error));
    }
}

/**
 * Analyze policies and generate resource tree for a user 
 * @param policies 
 * @param profile 
 * @param regions list of regions available 
 * @param user user to generate resource tree for
 * @param allResources All resource available in all regions
 * @returns 
 */
const analyzeResourceAndPoliciesForUser = async (policies, profile: string, regions: string[], user: User, allResources: AllResources): Promise<Tree> => {
    console.log(chalk.yellow('Analyzing Resources and policies for user'));
    console.log(chalk.yellow('This will create a resource structure tree for the current user'));
    try {
        let mainTree = new Tree(`${user.UserName}`, new Node(user.UserName, {
            type: 'user',
            userName: user.UserName,
            userId: user.UserId,
        }));

        return await generateResourceTree(policies, profile, regions, mainTree, allResources);

    } catch (error) {
        console.error(chalk.red(`Error while generating user resource tree`));
        console.log(error);
    }
}

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
const generateResourceTree = async (policies, profile: string, regions: string[], mainTree: Tree, allResources: AllResources): Promise<Tree> => {
    console.log(chalk.yellow('Analyzing Resources and policies'));
    console.log(chalk.yellow('This will create a resource structure tree for the current user'));
    let statements: any[] = [];

    let isAdmin = false;

    // Get all the statements from all the policies
    try {

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

        console.log(chalk.yellow("Compiling Resource Tree\n"));

        //FOR EC2
        const { ec2Subtree } = await analyzeEC2Resources(policies, allResources.ec2, statements, profile, regions);
        mainTree.root.addChild(ec2Subtree.root);

        //FOR S3
        const { s3Subtree } = await analyzeS3Resources(policies, allResources.s3, statements, profile, regions);
        mainTree.root.addChild(s3Subtree.root);

        //FOR RDS
        const { rdsSubtree } = await analyzerRDSResources(policies, allResources.rds, statements, profile, regions);
        mainTree.root.addChild(rdsSubtree.root);
        //For Lambda
        const { lambdaSubtree } = await analyzerLambdaResources(policies, allResources.lambda, statements, profile, regions);
        mainTree.root.addChild(lambdaSubtree.root);

        //For DynamoDB
        const { dynamodbSubtree } = await analyzeDynamodbResources(policies, allResources.dynamodb, statements, profile, regions);
        mainTree.root.addChild(dynamodbSubtree.root);

        return mainTree;
    } catch (error) {
        console.error(chalk.red(`Error generating resource tree`));
        console.error(chalk.red(error));
    } finally {
    }
}
