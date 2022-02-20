import { getActions } from "../actions-list";
import { ServiceAllResourceReturnType } from "../resource.service";
import { Node, Tree } from "../utils/graph";
import { generateResourceMapForResourceType, getResourceDetailsFromResourceString, removeEmptyResourceNodes } from "./analyzer-utils";

/**
 * Analyze all EC2 resources in all the provided regions
 * @param policies All policies related to the iam user
 * @param resources all ec2 Resources mapped with services 
 * @param statements all policy document statement related to the user which allow access to resources 
 * @param profile profile provided 
 * @param regions regions to analyze resources in
 * @returns 
 */
export const analyzeEC2Resources = async (policies, resources: ServiceAllResourceReturnType, statements, profile: string, regions: string[]) => {
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

        //Read Actions for ec2
        let relevantGetActions = [
            'ec2:*',
            "*",
            "ec2:Describe*",
            "ec2:DescribeInstances",
            "ec2:DescribeVpcs",
            "ec2:DescribeNatGateways",
            "ec2:DescribeSecurityGroups",
        ]

        let hasLeastEC2Access = (action as string[]).some((action: string) => {
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

        if (!hasLeastEC2Access) continue;

        let regionResourceTypeMap = {};

        //Iterate over policy document resource strings
        for (let i = 0; i < resource.length; i++) {
            const _resource: string = resource[i];

            const { principal, region, resourceId, resourceType } = getResourceDetailsFromResourceString(_resource);

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
                        generateResourceMapForResourceType(_resource,
                            resourceType,
                            ec2Resources,
                            relevantResources,
                            regions,
                            subTree,
                            statements,
                            generateTooltipForResource
                        );
                    });
                    break;
                }
                case 'instance':
                case 'vpc':
                case 'natgateway':
                    generateResourceMapForResourceType(_resource,
                        resourceType,
                        ec2Resources,
                        relevantResources,
                        regions,
                        subTree,
                        statements,
                        generateTooltipForResource
                    );
                    break;
                default:
                    break;

            }
        }
    }

    subTree = removeEmptyResourceNodes(subTree, regions, relevantResourceTypes);

    return { ec2Subtree: subTree }
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

const generateTooltipForResource = (resource: any, resourceType: string, resourceId: string, region: string) => {
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
                status: resource.Status,
                launchTime: resource.LaunchTime,
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

