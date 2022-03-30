import { FunctionConfiguration } from "@aws-sdk/client-lambda";
import { DBInstance } from "@aws-sdk/client-rds";
import { ServiceAllResourceReturnType } from "../resource.service";
import { Node, Tree } from "../utils/graph";
import { generateResourceMapForResourceType, getResourceDetailsFromResourceString, removeEmptyResourceNodes } from "./analyzer-utils";

/**
 * Anayyze RDS resources fetched 
 * @param policies all policies relating to RDS
 * @param resources all RDS resources
 * @param statements all policy document statement 
 * @param profile current profile
 * @param regions regions provided 
 * @returns 
 */
export const analyzerRDSResources = async (policies, resources: ServiceAllResourceReturnType, statements, profile: string, regions: string[]) => {
    const rdsResources = resources;

    const relevantResourceTypes = ['dbinstance'];

    let subTree = new Tree('RDS', new Node('RDS', {
        type: 'service',
        service: 'RDS'
    }));

    //Add all the region nodes to main subtree 
    // And add all relevant resourceType nodes to all the regions 
    regions.forEach(region => {
        let node = new Node(region, {
            type: 'region'
        });
        relevantResourceTypes.forEach(resourceType => {
            node.addChild(new Node(resourceType, {
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

        let relevantResources: { [resourceType: string]: any } = {};
        //Flag to check if the statement is for rds
        let toProcess: boolean = false;

        //Check if the statement allows for access of resources
        if (statement.Effect !== 'Allow') {
            continue;
        }

        //Turn action and resource to array if they are not already
        if (typeof action === 'string') action = [action];
        if (typeof resource === 'string') resource = [resource];

        let regionResourceTypeMap = {};

        //Read Actions for rds
        let relevantGetActions = [
            "rds:Describe*",
            "rds:DescribeDBInstances",
            "rds:DescribeDbInstances",
            "*",
            "rds:*"
        ]

        let hasLeastRDSAccess = (action as string[]).some((action: string) => {
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


        if (!hasLeastRDSAccess) continue;

        //Iterate over policy document resource strings
        for (let i = 0; i < resource.length; i++) {
            const _resource: string = resource[i];

            const { principal, region, resourceId, resourceType } = getResourceDetailsFromResourceString(_resource);

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
                            rdsResources,
                            relevantResources,
                            regions,
                            subTree,
                            statements,
                            generateTooltipForResource
                        );
                    });
                    break;
                }
                case 'dbinstance':
                    generateResourceMapForResourceType(_resource,
                        resourceType,
                        rdsResources,
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

    return { rdsSubtree: subTree }
}

const generateTooltipForResource = (resource: DBInstance, resourceType: string, resourceId: string, region: string) => {
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
            }
        }
    }
}
