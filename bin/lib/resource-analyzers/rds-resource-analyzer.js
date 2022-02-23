"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzerRDSResources = void 0;
const graph_1 = require("../utils/graph");
const analyzer_utils_1 = require("./analyzer-utils");
/**
 * Anayyze RDS resources fetched
 * @param policies all policies relating to RDS
 * @param resources all RDS resources
 * @param statements all policy document statement
 * @param profile current profile
 * @param regions regions provided
 * @returns
 */
const analyzerRDSResources = async (policies, resources, statements, profile, regions) => {
    const rdsResources = resources;
    const relevantResourceTypes = ['dbinstance'];
    let subTree = new graph_1.Tree('RDS', new graph_1.Node('RDS', {
        type: 'service',
        service: 'RDS'
    }));
    //Add all the region nodes to main subtree 
    // And add all relevant resourceType nodes to all the regions 
    regions.forEach(region => {
        let node = new graph_1.Node(region, {
            type: 'region'
        });
        relevantResourceTypes.forEach(resourceType => {
            node.addChild(new graph_1.Node(resourceType, {
                type: 'resourceType'
            }));
        });
        subTree.root.addChild(node);
    });
    //Check statements for rds principal and rds resources
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        let resource = statement.Resource;
        let action = statement.Action;
        let relevantResources = {};
        //Flag to check if the statement is for rds
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
        //Read Actions for rds
        let relevantGetActions = [
            "rds:Describe*",
            "rds:DescribeDBInstances",
            "rds:DescribeDbInstances",
            "*",
            "rds:*"
        ];
        let hasLeastRDSAccess = action.some((action) => {
            if (action == '*') {
                toProcess = true;
                return true;
            }
            if (relevantGetActions.includes(action)) {
                toProcess = true;
                return true;
            }
            return false;
        });
        if (!hasLeastRDSAccess)
            continue;
        //Iterate over policy document resource strings
        for (let i = 0; i < resource.length; i++) {
            const _resource = resource[i];
            const { principal, region, resourceId, resourceType } = (0, analyzer_utils_1.getResourceDetailsFromResourceString)(_resource);
            //Skip non rds resources
            if (_resource !== '*' && principal !== 'rds') {
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
                        (0, analyzer_utils_1.generateResourceMapForResourceType)(_resource, resourceType, rdsResources, relevantResources, regions, subTree, statements, generateTooltipForResource);
                    });
                    break;
                }
                case 'dbinstance':
                    (0, analyzer_utils_1.generateResourceMapForResourceType)(_resource, resourceType, rdsResources, relevantResources, regions, subTree, statements, generateTooltipForResource);
                    break;
                default:
                    break;
            }
        }
    }
    subTree = (0, analyzer_utils_1.removeEmptyResourceNodes)(subTree, regions, relevantResourceTypes);
    return { rdsSubtree: subTree };
};
exports.analyzerRDSResources = analyzerRDSResources;
const generateTooltipForResource = (resource, resourceType, resourceId, region) => {
    switch (resourceType) {
        case 'dbinstance': {
            return {
                title: 'DbInstance',
                name: resource.DBName,
                arn: resource.DBInstanceArn,
                allocatedStorage: resource.AllocatedStorage,
                createdAt: resource.InstanceCreateTime,
                engine: resource.Engine,
                replicaMode: resource.ReplicaMode
            };
        }
    }
};
//# sourceMappingURL=rds-resource-analyzer.js.map