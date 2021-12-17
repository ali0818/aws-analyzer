"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeEC2Resources = void 0;
const actions_list_1 = require("../actions-list");
const graph_1 = require("../utils/graph");
const analyzer_utils_1 = require("./analyzer-utils");
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
    let subTree = new graph_1.Tree('EC2', new graph_1.Node('EC2', {
        type: 'service',
        service: 'EC2',
    }));
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
            const { principal, region, resourceId, resourceType } = (0, analyzer_utils_1.getResourceDetailsFromResourceString)(_resource);
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
                        (0, analyzer_utils_1.generateResourceMapForResourceType)(_resource, resourceType, ec2Resources, relevantResources, regions, subTree, statements, generateTooltipForResource);
                    });
                    break;
                }
                case 'instance':
                case 'vpc':
                case 'natgateway':
                    (0, analyzer_utils_1.generateResourceMapForResourceType)(_resource, resourceType, ec2Resources, relevantResources, regions, subTree, statements, generateTooltipForResource);
                    break;
                default:
                    break;
            }
        }
    }
    return { ec2Subtree: subTree };
};
exports.analyzeEC2Resources = analyzeEC2Resources;
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
        return ec2Actions.includes(action.action.toLowerCase()) || action == '*';
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
    };
};
const generateTooltipForResource = (resource, resourceType, resourceId, region) => {
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
            };
        }
        case 'vpc': {
            return {
                title: 'VPC',
                vpcId: resource.VpcId,
                state: resource.State,
            };
        }
    }
};
//# sourceMappingURL=ec2-resource.analyzer.js.map