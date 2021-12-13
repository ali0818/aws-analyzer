"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeResources = void 0;
const chalk_1 = __importDefault(require("chalk"));
const clui_1 = require("clui");
const actions_list_1 = require("./actions-list");
const policies_1 = require("./constants/policies");
const regex_1 = require("./constants/regex");
const files_1 = require("./files");
const iam_service_1 = require("./iam.service");
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
    const resourceService = new resource_service_1.ResourceService(profile, regions);
    // Get all the statements from all the policies
    let spinner = new clui_1.Spinner('Getting all the resources...');
    try {
        const allResources = await resourceService.getAllResources();
        let mainTree = new graph_1.Tree('User', new graph_1.Node('User', true));
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
        //FOR EC2
        const { ec2Subtree } = await analyzeEC2Resources(policies, allResources.ec2, statements, profile, regions);
        mainTree.root.addChild(ec2Subtree.root);
        //FOR S3
        return mainTree;
    }
    catch (error) {
        console.error(chalk_1.default.red(error));
    }
    finally {
        spinner.stop();
    }
};
/**
 * Analyze all EC2 resources in all the provided regions
 * @param policies All policies related to the iam user
 * @param resources all ec2 Resources mapped with services
 * @param statements all policy document statement related to the user which allow access to resources
 * @param profile profile provided
 * @param regions regions to analyze resources in
 * @returns
 */
const analyzeEC2Resources = async (policies, resources, statements, profile, regions) => {
    const ec2Resources = resources;
    //Resource Types to look for in whole aws account for EC2
    const relevantResourceTypes = ['instance', 'natgateway', 'vpc'];
    let subTree = new graph_1.Tree('EC2', new graph_1.Node('EC2', true));
    regions.forEach(region => {
        let node = new graph_1.Node(region);
        relevantResourceTypes.forEach(resourceType => {
            node.addChild(new graph_1.Node(resourceType));
        });
        subTree.root.addChild(node);
    });
    //Check statements for ec2 principal and ec2 resources
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        let resource = statement.Resource;
        let action = statement.Action;
        let relevantResources = {};
        //Flag to check if the statement is for ec2
        let toProcess = false;
        //Check if the statement allows for access of resources
        if (statement.Effect !== 'Allow') {
            continue;
        }
        //Turn action and resource to array if they are not already
        if (typeof action === 'string')
            action = [action];
        if (typeof resource === 'string')
            resource = [resource];
        let regionResourceTypeMap = {};
        //Iterate over policy document resource strings
        for (let i = 0; i < resource.length; i++) {
            const _resource = resource[i];
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
            if (!toProcess)
                continue;
            if (!relevantResources[resourceType]) {
                relevantResources[resourceType] = [];
            }
            switch (resourceType) {
                case '*': {
                    relevantResourceTypes.forEach(resourceType => {
                        if (!relevantResources[resourceType]) {
                            relevantResources[resourceType] = [];
                        }
                        _generateResourceMapForResourceType(_resource, resourceType, ec2Resources, relevantResources, regions, subTree);
                    });
                    break;
                }
                case 'instance':
                case 'vpc':
                case 'natgateway':
                    _generateResourceMapForResourceType(_resource, resourceType, ec2Resources, relevantResources, regions, subTree);
                    break;
                default:
                    break;
            }
        }
    }
    return { ec2Subtree: subTree };
};
/**
 * Generates a resource map and a tree node for a resource string and resource Type
 * @param resourceString policy document resource string
 * @param serviceResources all resources of a service (ec2, iam, s3)
 * @param relevantResources relevant resource  map
 * @param regions all the regions to look for resources in
 * @param subTree a subTree to cultivate
 */
const _generateResourceMapForResourceType = (resourceString, resourceType, serviceResources, relevantResources, regions, subTree) => {
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
            resources.forEach(r => {
                if (!node.parent.getChildByName(r[primaryKey])) {
                    node.addChild(new graph_1.Node(r[primaryKey], { type: type, resource: r, region: region }));
                }
            });
        });
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
                node.addChild(new graph_1.Node(r[primaryKey], { type: type, resource: r, region: r }));
            }
        });
    }
};
const _getResourceDetailsFromResourceString = (resourceString) => {
    if (resourceString == '*') {
        return {
            principal: '*',
            region: '*',
            resourceType: '*',
            resourceId: '*'
        };
    }
    const matchResult = resourceString.match(regex_1.ARN_REGEX);
    if (!matchResult) {
        throw new Error("Invalid resource string: " + resourceString);
    }
    const principal = matchResult[1];
    const region = matchResult[2];
    const resourceId = matchResult[5];
    const resourceType = matchResult[4];
    return {
        principal: principal,
        region: region,
        resourceType: resourceType,
        resourceId: resourceId
    };
};
const getResourcesFromResourceString = (resourceString, resources, region, resourceType) => {
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
                        }
                        else {
                            _resources = _resources.concat(resources[type].all.filter(r => r[primaryKey] == resourceId));
                        }
                    });
                });
            }
            else {
                Object.keys(resources[type].regionMap)
                    .forEach(_region => {
                    if (resourceId == '' || resourceId == '*') {
                        _resources = _resources.concat(resources[type].regionMap[_region]);
                    }
                    else {
                        _resources = _resources.concat(resources[type].all.filter(r => r[primaryKey] == resourceId));
                    }
                });
            }
        }
        else if (type == '*' || type == '') {
            if (resourceId == '*') {
                _resources = resources[type].regionMap[region];
            }
            else {
                _resources = resources[type].all.filter(resource => {
                    return resource[primaryKey] == resourceId;
                });
            }
        }
        else {
            if (resourceId == '*') {
                _resources = resources[type].regionMap[region];
            }
            else {
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
        };
    }
    catch (error) {
        return { resources: [], region: '', resourceType: '', primaryKey: '' };
    }
};
/**
 * Gets detailed resources for a resourceType (eg: ec2instance, s3Bucket, etc)
 * depending on the resource string provided in policy document statement
 * @param resources
 * @param resourceType
 */
const getResourcesForResourceType = (resources, resourceType) => {
};
const evaluateResourceAccessFromStatements = (statements, resourceType, resourceId) => {
    let relevantActions = [];
    const allActions = statements.reduce((acc, statement) => { return acc.concat(statement.Action); }, []);
    //Get all the actions for the resource type which is ec2
    const ec2Actions = allActions.filter(action => {
        return action.startsWith('ec2:') || action == '*';
    }).map(action => { return action.replace('ec2:', '').toLowerCase(); });
    ///Get detailed actions from ec2-actions.json file and filter the actions which are 
    ///present in policies and statements 
    const allEc2ActionsDetailed = (0, actions_list_1.getActions)('ec2').actions.filter(action => {
        return ec2Actions.includes(action.toLowerCase()) || action == '*';
    });
    let relevantActionPredicate = '';
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
    let permissions = { 'Write': [], 'Read': [], List: [], 'None': [] };
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
    };
};
//# sourceMappingURL=resource-analyzer.js.map