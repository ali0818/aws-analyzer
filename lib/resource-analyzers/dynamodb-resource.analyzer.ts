import { TableDescription } from "@aws-sdk/client-dynamodb";
import { ServiceAllResourceReturnType } from "../resource.service";
import { Node, Tree } from "../utils/graph";
import { generateResourceMapForResourceType, getResourceDetailsFromResourceString, removeEmptyResourceNodes } from "./analyzer-utils";

/**
 * Anayyze Dynamodb resources fetched 
 * @param policies all policies relating to Dynamodb
 * @param resources all dynamodb resources
 * @param statements all policy document statement 
 * @param profile current profile
 * @param regions regions provided 
 * @returns 
 */
export const analyzeDynamodbResources = async (policies, resources: ServiceAllResourceReturnType, statements, profile: string, regions: string[]) => {
    const dynamodbResources = resources;

    const relevantResourceTypes = ['table'];

    let subTree = new Tree('Dynamodb', new Node('Dynamodb', {
        type: 'service',
        service: 'Dynamodb'
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

    //Check statements for dynamodb principal and dynamodb resources
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];

        let resource = statement.Resource;
        let action = statement.Action;

        let relevantResources: { [resourceType: string]: any } = {};
        //Flag to check if the statement is for dynamodb
        let toProcess: boolean = false;

        //Check if the statement allows for access of resources
        if (statement.Effect !== 'Allow') {
            continue;
        }

        //Turn action and resource to array if they are not already
        if (typeof action === 'string') action = [action];
        if (typeof resource === 'string') resource = [resource];

        let regionResourceTypeMap = {};

        //Read Actions for dynamodb
        let relevantGetActions = [
            "dynamodb:Describe*",
            "dynamodb:List*",
            "dynamodb:DescribeTable",
            "*",
            "dynamodb:*"
        ]

        let hasLeastDynamodbAccess = (action as string[]).some((action: string) => {
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


        if (!hasLeastDynamodbAccess) continue;

        //Iterate over policy document resource strings
        for (let i = 0; i < resource.length; i++) {
            const _resource: string = resource[i];

            const { principal, region, resourceId, resourceType } = getResourceDetailsFromResourceString(_resource);

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
                            dynamodbResources,
                            relevantResources,
                            regions,
                            subTree,
                            statements,
                            generateTooltipForResource
                        );
                    });
                    break;
                }
                case 'table':
                    generateResourceMapForResourceType(_resource,
                        resourceType,
                        dynamodbResources,
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

    return { dynamodbSubtree: subTree }
}

const generateTooltipForResource = (resource: TableDescription, resourceType: string, resourceId: string, region: string) => {
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
            }
        }
    }
}
