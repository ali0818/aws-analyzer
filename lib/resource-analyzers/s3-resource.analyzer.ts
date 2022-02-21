import { ServiceAllResourceReturnType } from "../resource.service";
import { Node, Tree } from "../utils/graph";
import { generateResourceMapForResourceType, getResourceDetailsFromResourceString, removeEmptyResourceNodes } from "./analyzer-utils";

/**
 * Anayyze S3 resources fetched 
 * @param policies all policies relating to S3
 * @param resources all s3 resources
 * @param statements all policy document statement 
 * @param profile current profile
 * @param regions regions provided 
 * @returns 
 */
export const analyzeS3Resources = async (policies, resources: ServiceAllResourceReturnType, statements, profile: string, regions: string[]) => {
    const s3Resources = resources;

    ///Only Relevant Resource type to look for 
    const relevantResourceTypes = ['bucket'];

    let subTree = new Tree('S3', new Node('S3', {
        type: 'service',
        service: 'S3'
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

    //Check statements for s3 principal and s3 resources
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];

        let resource = statement.Resource;
        let action = statement.Action;

        let relevantResources: { [resourceType: string]: any } = {};
        //Flag to check if the statement is for s3
        let toProcess: boolean = false;

        //Check if the statement allows for access of resources
        if (statement.Effect !== 'Allow') {
            continue;
        }

        //Turn action and resource to array if they are not already
        if (typeof action === 'string') action = [action];
        if (typeof resource === 'string') resource = [resource];

        let regionResourceTypeMap = {};

        //Read Actions for s3 
        let relevantGetActions = [
            's3:Get*',
            's3:List*',
            's3:GetBucket',
            's3:ListBuckets',
            "*",
            "s3:*"
        ]

        let hasLeastS3Access = (action as string[]).some((action: string) => {
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


        if (!hasLeastS3Access) continue;

        //Iterate over policy document resource strings
        for (let i = 0; i < resource.length; i++) {
            const _resource: string = resource[i];

            const { principal, region, resourceId, resourceType } = getResourceDetailsFromResourceString(_resource);

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
                            s3Resources,
                            relevantResources,
                            regions,
                            subTree,
                            statements,
                            generateTooltipForResource
                        );
                    });
                    break;
                }
                case 'bucket':
                    generateResourceMapForResourceType(_resource,
                        resourceType,
                        s3Resources,
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

    return { s3Subtree: subTree }
}


const generateTooltipForResource = (resource: any, resourceType: string, resourceId: string, region: string) => {
    switch (resourceType) {
        case 'bucket': {
            return {
                title: 'Bucket',
                name: resource.Name,
                createdAt: resource.CreationDate
            }
        }
    }
}
