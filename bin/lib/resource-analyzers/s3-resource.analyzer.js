"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeS3Resources = void 0;
const graph_1 = require("../utils/graph");
const analyzer_utils_1 = require("./analyzer-utils");
/**
 * Anayyze S3 resources fetched
 * @param policies all policies relating to S3
 * @param resources all s3 resources
 * @param statements all policy document statement
 * @param profile current profile
 * @param regions regions provided
 * @returns
 */
const analyzeS3Resources = async (policies, resources, statements, profile, regions) => {
    const s3Resources = resources;
    ///Only Relevant Resource type to look for 
    const relevantResourceTypes = ['bucket'];
    let subTree = new graph_1.Tree('S3', new graph_1.Node('S3', {
        type: 'service',
        service: 'S3'
    }));
    //Add all the region nodes to main subtree 
    // And add all relevant resourceType nodes to all the regions 
    regions.forEach(region => {
        let node = new graph_1.Node(region);
        relevantResourceTypes.forEach(resourceType => {
            node.addChild(new graph_1.Node(resourceType));
        });
        subTree.root.addChild(node);
    });
    //Check statements for s3 principal and s3 resources
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        let resource = statement.Resource;
        let action = statement.Action;
        let relevantResources = {};
        //Flag to check if the statement is for s3
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
            const { principal, region, resourceId, resourceType } = (0, analyzer_utils_1.getResourceDetailsFromResourceString)(_resource);
            //Skip non S3 resources
            if (_resource !== '*' && principal !== 's3') {
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
                        (0, analyzer_utils_1.generateResourceMapForResourceType)(_resource, resourceType, s3Resources, relevantResources, regions, subTree, statements, generateTooltipForResource);
                    });
                    break;
                }
                case 'bucket':
                    (0, analyzer_utils_1.generateResourceMapForResourceType)(_resource, resourceType, s3Resources, relevantResources, regions, subTree, statements, generateTooltipForResource);
                    break;
                default:
                    break;
            }
        }
    }
    return { s3Subtree: subTree };
};
exports.analyzeS3Resources = analyzeS3Resources;
const generateTooltipForResource = (resource, resourceType, resourceId, region) => {
    switch (resourceType) {
        case 'bucket': {
            return {
                title: 'Bucket',
                name: resource.Name,
                createdAt: resource.CreationDate
            };
        }
    }
};
//# sourceMappingURL=s3-resource.analyzer.js.map