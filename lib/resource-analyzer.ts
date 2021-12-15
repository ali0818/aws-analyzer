import { EC2, GetConsoleOutputResult } from "@aws-sdk/client-ec2";
import chalk from "chalk";
import { Spinner } from "clui";
import { fstat } from "fs";
import { getActions } from "./actions-list";
import { ADMIN_POLICY } from "./constants/policies";
import { ARN_REGEX } from "./constants/regex";
import { cacheExists, loadCache, saveCache } from "./files";
import { IamService } from "./iam.service";
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

        let mainTree = new Tree(user.UserName, new Node('User', {
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

        //FOR EC2
        const { ec2Subtree } = await analyzeEC2Resources(policies, allResources.ec2, statements, profile, regions);
        mainTree.root.addChild(ec2Subtree.root);

        //FOR S3

        return mainTree;
    } catch (error) {
        console.error(chalk.red(error));
    } finally {
        spinner.stop();
    }
}

/**
 * Analyze all EC2 resources in all the provided regions
 * @param policies All policies related to the iam user
 * @param resources all ec2 Resources mapped with services 
 * @param statements all policy document statement related to the user which allow access to resources 
 * @param profile profile provided 
 * @param regions regions to analyze resources in
 * @returns 
 */
const analyzeEC2Resources = async (policies, resources: ServiceAllResourceReturnType, statements, profile: string, regions: string[]) => {
    const ec2Resources = resources;
    //Resource Types to look for in whole aws account for EC2
    const relevantResourceTypes = ['instance', 'natgateway', 'vpc'];

    let subTree = new Tree('EC2', new Node('EC2', {
        type: 'service',
        service: 'EC2',
    }));

    regions.forEach(region => {
        let node = new Node(region);
        relevantResourceTypes.forEach(resourceType => {
            node.addChild(new Node(resourceType));
        });
        subTree.root.addChild(node);
    });

    //Check statements for ec2 principal and ec2 resources
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];

        let resource = statement.Resource;
        let action = statement.Action;

        let relevantResources: { [resourceType: string]: any } = {};
        //Flag to check if the statement is for ec2
        let toProcess: boolean = false;

        //Check if the statement allows for access of resources
        if (statement.Effect !== 'Allow') {
            continue;
        }

        //Turn action and resource to array if they are not already
        if (typeof action === 'string') action = [action];
        if (typeof resource === 'string') resource = [resource];

        let regionResourceTypeMap = {};

        //Iterate over policy document resource strings
        for (let i = 0; i < resource.length; i++) {
            const _resource: string = resource[i];

            const { principal, region, resourceId, resourceType } = _getResourceDetailsFromResourceString(_resource);

            //Skip non EC2 resources
            if (_resource !== '*' && principal !== 'ec2') {
                continue;
            }

            //If region is not wildcard and not in the list of regions, skip
            if (!regions.concat('*').includes(region)) {
                continue;
            }

            if (_resource == '*') {
                toProcess = true;
            }

            if (relevantResourceTypes.includes(resourceType) || resourceType == '*' || resourceType == '*/*' || resourceType == '') {
                toProcess = true;
            }

            if (!toProcess) continue;

            if (!relevantResources[resourceType]) {
                relevantResources[resourceType] = [];
            }

            switch (resourceType) {
                case '*': {
                    relevantResourceTypes.forEach(resourceType => {
                        if (!relevantResources[resourceType]) {
                            relevantResources[resourceType] = [];
                        }
                        _generateResourceMapForResourceType(_resource, resourceType, ec2Resources, relevantResources, regions, subTree, statements);
                    });
                    break;
                }
                case 'instance':
                case 'vpc':
                case 'natgateway':
                    _generateResourceMapForResourceType(_resource, resourceType, ec2Resources, relevantResources, regions, subTree, statements);
                    break;
                default:
                    break;

            }
        }
    }

    return { ec2Subtree: subTree }
}

const _generateTooltipForResource = (resource: any, resourceType: string, resourceId: string, region: string) => {
    switch (resourceType) {
        case 'instance': {
            return {
                title: 'Instance',
                instanceId: resource.InstanceId,
                instanceType: resource.InstanceType,
                imageId: resource.ImageId,
                az: resource.Placement.AvailabilityZone,
                publicIp: resource.PublicIpAddress,
                privateIp: resource.PrivateIpAddress,
                status: resource.Status
            }
        }
        case 'vpc': {
            return {
                title: 'VPC',
                vpcId: resource.VpcId,
                state: resource.State,
            }
        }
    }
}

/**
 * Generates a resource map and a tree node for a resource string and resource Type
 * @param resourceString policy document resource string
 * @param serviceResources all resources of a service (ec2, iam, s3)
 * @param relevantResources relevant resource  map
 * @param regions all the regions to look for resources in
 * @param subTree a subTree to cultivate 
 */
const _generateResourceMapForResourceType = (
    resourceString: string,
    resourceType: string,
    serviceResources: ServiceAllResourceReturnType,
    relevantResources,
    regions: string[],
    subTree: Tree,
    statements: any[]
) => {
    const { region, resourceId, } = _getResourceDetailsFromResourceString(resourceString);
    relevantResources[resourceType].push(resourceId);

    if (region == '' || region == '*') {
        let _resources = serviceResources[resourceType];
        if (resourceString == '' || resourceString == '*') {
            _resources.all.forEach(r => {
                relevantResources[resourceType].push(r);
            });
        }

        regions.forEach(region => {
            let regionNode = subTree.getNode(region);
            let node = regionNode.getChildByName(resourceType);

            if (!node) {
                throw new Error("Node not found for region: " + region);
            }

            let { resources, type, primaryKey } = getResourcesFromResourceString(resourceString, serviceResources, region, resourceType);

            for (let i = 0; i < resources.length; i++) {
                const r = resources[i];
                let access = evaluateResourceAccessFromStatements(statements, r, resourceType);
                if (!node.parent.getChildByName(r[primaryKey])) {
                    node.addChild(
                        new Node(r[primaryKey], {
                            type: type,
                            resource: r,
                            info: _generateTooltipForResource(r, resourceType, r[primaryKey], region),
                            region: region
                        })
                    );
                }
            }
        })
    }
    else {
        let regionNode = subTree.getNode(region);
        let { resources, type, primaryKey } = getResourcesFromResourceString(resourceString, serviceResources, region, resourceType);

        let node = regionNode.getChildByName(resourceType);

        if (!node) {
            throw new Error("Node not found for region: " + region);
        }

        resources.forEach(r => {
            if (!node.parent.getChildByName(r[primaryKey])) {
                node.addChild(
                    new Node(r[primaryKey], {
                        type: type,
                        resource: r,
                        region: r,
                        info: _generateTooltipForResource(r, resourceType, r[primaryKey], region)
                    })
                );
            }
        });
    }
}

const _getResourceDetailsFromResourceString = (resourceString: string) => {

    if (resourceString == '*') {
        return {
            principal: '*',
            region: '*',
            resourceType: '*',
            resourceId: '*'
        }
    }

    const matchResult = resourceString.match(ARN_REGEX);

    if (!matchResult) {
        throw new Error("Invalid resource string: " + resourceString);
    }

    const principal = matchResult[1];
    const region: string = matchResult[2];
    const resourceId = matchResult[5];
    const resourceType = matchResult[4];

    return {
        principal: principal,
        region: region,
        resourceType: resourceType,
        resourceId: resourceId
    }
}

const getResourcesFromResourceString = (resourceString: string, resources: ServiceAllResourceReturnType, region: string, resourceType?: string) => {
    try {
        let { principal, region: _region, resourceId, resourceType: _type } = _getResourceDetailsFromResourceString(resourceString);

        if (!resourceType) {
            resourceType = _type;
        }

        let type = resourceType;
        let primaryKey = resources[type].metadata.primaryKey;

        let _resources = [];

        if (region == '' || region == '*') {
            if (type == '*') {
                Object.keys(resources)
                    .forEach(type => {
                        Object.keys(resources[type].regionMap)
                            .forEach(_region => {
                                if (resourceId == '' || resourceId == '*') {
                                    _resources = _resources.concat(resources[type].regionMap[_region]);
                                } else {
                                    _resources = _resources.concat(resources[type].all.filter(r => r[primaryKey] == resourceId));
                                }
                            })
                    });
            } else {
                Object.keys(resources[type].regionMap)
                    .forEach(_region => {
                        if (resourceId == '' || resourceId == '*') {
                            _resources = _resources.concat(resources[type].regionMap[_region]);
                        } else {
                            _resources = _resources.concat(resources[type].all.filter(r => r[primaryKey] == resourceId));
                        }
                    })
            }
        } else if (type == '*' || type == '') {
            if (resourceId == '*') {
                _resources = resources[type].regionMap[region];
            } else {
                _resources = resources[type].all.filter(resource => {
                    return resource[primaryKey] == resourceId;
                });
            }
        } else {
            if (resourceId == '*') {
                _resources = resources[type].regionMap[region];
            } else {
                _resources = resources[type].all.filter(resource => {
                    return resource[primaryKey] == resourceId;
                });
            }
        }

        return {
            resources: _resources,
            region: region,
            type: type,
            primaryKey: primaryKey
        }
    } catch (error) {
        return { resources: [], region: '', resourceType: '', primaryKey: '' };
    }
}

/**
 * Gets detailed resources for a resourceType (eg: ec2instance, s3Bucket, etc)
 * depending on the resource string provided in policy document statement
 * @param resources 
 * @param resourceType 
 */
const getResourcesForResourceType = (resources, resourceType: string) => {

}

const evaluateResourceAccessFromStatements = (statements, resourceType: string, resourceId: string) => {
    let relevantActions = [];

    const allActions = statements.reduce((acc, statement) => { return acc.concat(statement.Action) }, [])

    //Get all the actions for the resource type which is ec2
    const ec2Actions = allActions.filter(action => {
        return action.startsWith('ec2:') || action == '*';
    }).map(action => { return action.replace('ec2:', '').toLowerCase() });

    ///Get detailed actions from ec2-actions.json file and filter the actions which are 
    ///present in policies and statements 
    const allEc2ActionsDetailed = getActions('ec2').actions.filter(action => {
        return ec2Actions.includes(action.action.toLowerCase()) || action == '*';
    });

    let relevantActionPredicate: string = '';

    let accessType = 'None';

    switch (resourceType) {
        case 'instance': {
            relevantActionPredicate = 'instance';
            break;
        }
        case 'bucket': {
            relevantActionPredicate = 'bucket';
            break;
        }
        case 'vpc': {
            relevantActionPredicate = 'vpc';
            break;
        }
        case 'natgateway': {
            relevantActionPredicate = 'natgateway';
            break;
        }
    }

    let permissions = { 'Write': [], 'Read': [], List: [], 'None': [], Tagging: [] };

    relevantActions = allEc2ActionsDetailed
        .filter(action => {
            permissions[action.access] = permissions[action.access].concat(action.actions);
            return action.action.toLowerCase() == relevantActionPredicate.toLowerCase();
        });

    if (relevantActions.length > 0) {
        accessType = 'Read';
    }

    return {
        relevantActions,
        permissions: Object.keys(permissions).filter(key => permissions[key].length > 0),
    }
}