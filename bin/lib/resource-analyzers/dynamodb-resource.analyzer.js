"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeDynamodbResources = void 0;
const graph_1 = require("../utils/graph");
const analyzer_utils_1 = require("./analyzer-utils");
/**
 * Anayyze Dynamodb resources fetched
 * @param policies all policies relating to Dynamodb
 * @param resources all dynamodb resources
 * @param statements all policy document statement
 * @param profile current profile
 * @param regions regions provided
 * @returns
 */
const analyzeDynamodbResources = async (policies, resources, statements, profile, regions) => {
    const dynamodbResources = resources;
    const relevantResourceTypes = ['table'];
    let subTree = new graph_1.Tree('Dynamodb', new graph_1.Node('Dynamodb', {
        type: 'service',
        service: 'Dynamodb'
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
    //Check statements for dynamodb principal and dynamodb resources
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        let resource = statement.Resource;
        let action = statement.Action;
        let relevantResources = {};
        //Flag to check if the statement is for dynamodb
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
        //Read Actions for dynamodb
        let relevantGetActions = [
            "dynamodb:Describe*",
            "dynamodb:List*",
            "dynamodb:DescribeTable",
            "*",
            "dynamodb:*"
        ];
        let hasLeastDynamodbAccess = action.some((action) => {
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
        if (!hasLeastDynamodbAccess)
            continue;
        //Iterate over policy document resource strings
        for (let i = 0; i < resource.length; i++) {
            const _resource = resource[i];
            const { principal, region, resourceId, resourceType } = (0, analyzer_utils_1.getResourceDetailsFromResourceString)(_resource);
            //Skip non dynamodb resources
            if (_resource !== '*' && principal !== 'dynamodb') {
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
                        (0, analyzer_utils_1.generateResourceMapForResourceType)(_resource, resourceType, dynamodbResources, relevantResources, regions, subTree, statements, generateTooltipForResource);
                    });
                    break;
                }
                case 'table':
                    (0, analyzer_utils_1.generateResourceMapForResourceType)(_resource, resourceType, dynamodbResources, relevantResources, regions, subTree, statements, generateTooltipForResource);
                    break;
                default:
                    break;
            }
        }
    }
    subTree = (0, analyzer_utils_1.removeEmptyResourceNodes)(subTree, regions, relevantResourceTypes);
    return { dynamodbSubtree: subTree };
};
exports.analyzeDynamodbResources = analyzeDynamodbResources;
const generateTooltipForResource = (resource, resourceType, resourceId, region) => {
    switch (resourceType) {
        case 'table': {
            return {
                title: 'Table',
                name: resource.TableName,
                createdAt: resource.CreationDateTime,
                replicas: resource.Replicas,
                itemCount: resource.ItemCount,
                size: `${resource.TableSizeBytes} Bytes`,
                status: resource.TableStatus,
            };
        }
    }
};
//# sourceMappingURL=dynamodb-resource.analyzer.js.map