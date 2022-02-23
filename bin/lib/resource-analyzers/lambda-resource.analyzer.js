"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzerLambdaResources = void 0;
const graph_1 = require("../utils/graph");
const analyzer_utils_1 = require("./analyzer-utils");
/**
 * Anayyze lambda resources fetched
 * @param policies all policies relating to lambda
 * @param resources all lambda resources
 * @param statements all policy document statement
 * @param profile current profile
 * @param regions regions provided
 * @returns
 */
const analyzerLambdaResources = async (policies, resources, statements, profile, regions) => {
    const lambdaResources = resources;
    const relevantResourceTypes = ['function'];
    let subTree = new graph_1.Tree('Lambda', new graph_1.Node('Lambda', {
        type: 'service',
        service: 'Lambda'
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
    //Check statements for lambda principal and lambda resources
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        let resource = statement.Resource;
        let action = statement.Action;
        let relevantResources = {};
        //Flag to check if the statement is for lambda
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
        //Read Actions for lambda
        let relevantGetActions = [
            "lambda:Get*",
            "lambda:List*",
            "lambda:ListFunctions",
            "*",
            "lambda:*"
        ];
        let hasLeastLambdaAccess = action.some((action) => {
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
        if (!hasLeastLambdaAccess)
            continue;
        //Iterate over policy document resource strings
        for (let i = 0; i < resource.length; i++) {
            const _resource = resource[i];
            const { principal, region, resourceId, resourceType } = (0, analyzer_utils_1.getResourceDetailsFromResourceString)(_resource);
            //Skip non lambda resources
            if (_resource !== '*' && principal !== 'lambda') {
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
                        (0, analyzer_utils_1.generateResourceMapForResourceType)(_resource, resourceType, lambdaResources, relevantResources, regions, subTree, statements, generateTooltipForResource);
                    });
                    break;
                }
                case 'function':
                    (0, analyzer_utils_1.generateResourceMapForResourceType)(_resource, resourceType, lambdaResources, relevantResources, regions, subTree, statements, generateTooltipForResource);
                    break;
                default:
                    break;
            }
        }
    }
    subTree = (0, analyzer_utils_1.removeEmptyResourceNodes)(subTree, regions, relevantResourceTypes);
    return { lambdaSubtree: subTree };
};
exports.analyzerLambdaResources = analyzerLambdaResources;
const generateTooltipForResource = (resource, resourceType, resourceId, region) => {
    switch (resourceType) {
        case 'function': {
            return {
                title: 'Function',
                name: resource.FunctionName,
                arn: resource.FunctionArn,
                state: resource.State,
                lastModified: resource.LastModified,
                handler: resource.Handler,
                description: resource.Description
            };
        }
    }
};
//# sourceMappingURL=lambda-resource.analyzer.js.map