import { ARN_REGEX } from "../constants/regex";
import { ServiceAllResourceReturnType } from "../resource.service";
import { Node, Tree } from "../utils/graph";
import chalk from 'chalk';

export const CACHE_FILE_NAME: string = 'resource-cache.json';
export const TREE_CACHE_FILE_NAME = 'resource-tree-cache.json';



/**
 * Generates a resource map and a tree node for a resource string and resource Type
 * @param resourceString policy document resource string
 * @param serviceResources all resources of a service (ec2, iam, s3, etc)
 * @param relevantResources relevant resource  map
 * @param regions all the regions to look for resources in
 * @param subTree a subTree to cultivate 
 * @param statements policy document statement related to service
 * @param tooltipGenerator Function that creates data object for tooltip
 */
export const generateResourceMapForResourceType = (
    resourceString: string,
    resourceType: string,
    serviceResources: ServiceAllResourceReturnType,
    relevantResources,
    regions: string[],
    subTree: Tree,
    statements: any[],
    tooltipGenerator: (resource: any, resourceType: string, resourceId: string, region: string) => any,
) => {

    const { region, resourceId, } = getResourceDetailsFromResourceString(resourceString);
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

            for (let i = 0; i < resources.length; i++) {
                const r = resources[i];
                if (!node.parent.getChildByName(r[primaryKey])) {
                    node.addChild(
                        new Node(r[primaryKey], {
                            type: type,
                            resource: r,
                            info: tooltipGenerator(r, resourceType, r[primaryKey], region),
                            region: region
                        })
                    );
                }
            }
        })
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
                node.addChild(
                    new Node(r[primaryKey], {
                        type: type,
                        resource: r,
                        region: r,
                        info: tooltipGenerator(r, resourceType, r[primaryKey], region)
                    })
                );
            }
        });
    }
}


/**
 * Get further details of a resource from resource string
 * @param resourceString 
 * @returns 
 */
export const getResourceDetailsFromResourceString = (resourceString: string) => {

    if (resourceString == '*') {
        return {
            principal: '*',
            region: '*',
            resourceType: '*',
            resourceId: '*'
        }
    }

    const matchResult = resourceString.match(ARN_REGEX);

    if (!matchResult) {
        throw new Error("Invalid resource string: " + resourceString);
    }

    const principal = matchResult[1];
    const region: string = matchResult[2];
    const resourceId = matchResult[5];
    const resourceType = matchResult[4];

    return {
        principal: principal,
        region: region,
        resourceType: resourceType,
        resourceId: resourceId
    }
}

/**
 * Evaluates resources for a region using resource string
 * ffrom a list of provided resources
 * @param resourceString 
 * @param resources 
 * @param region region to evaluate resources in
 * @param resourceType 
 * @returns 
 */
export const getResourcesFromResourceString = (resourceString: string, resources: ServiceAllResourceReturnType, region: string, resourceType?: string) => {
    try {
        let { principal, region: _region, resourceId, resourceType: _type } = getResourceDetailsFromResourceString(resourceString);

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
                                } else {
                                    _resources = _resources.concat(resources[type].regionMap[_region].filter(r => r[primaryKey] == resourceId));
                                }
                            })
                    });
            } else {
                Object.keys(resources[type].regionMap)
                    .forEach(_region => {
                        if (resourceId == '' || resourceId == '*') {
                            _resources = _resources.concat(resources[type].regionMap[_region]);
                        } else {
                            _resources = _resources.concat(resources[type].regionMap[_region].filter(r => r[primaryKey] == resourceId));
                        }
                    })
            }
        } else if (type == '*' || type == '') {
            if (resourceId == '*') {
                _resources = resources[type].regionMap[region];
            } else {
                _resources = resources[type].regionMap[region].filter(resource => {
                    return resource[primaryKey] == resourceId;
                });
            }

        } else {
            if (resourceId == '*') {
                _resources = resources[type].regionMap[region];
            } else {
                _resources = resources[type].regionMap[region].filter(resource => {
                    return resource[primaryKey] == resourceId;
                });
            }
        }

        return {
            resources: _resources,
            region: region,
            type: type,
            primaryKey: primaryKey
        }
    } catch (error) {
        return { resources: [], region: '', resourceType: '', primaryKey: '' };
    }
}

/**
 * Remove resourceType nodes where there are no resources
 * @param tree 
 * @param regions 
 * @param relevantResourceTypes 
 * @returns 
 */
export const removeEmptyResourceNodes = (tree: Tree, regions: string[], relevantResourceTypes: string[]) => {
    try {
        regions.forEach(region => {
            let node = tree.getNode(region);
            let totalChildren = 0;
            relevantResourceTypes.forEach(resourceType => {
                let resourceNode = node.getChildByName(resourceType);
                if (resourceNode && resourceNode.children.length == 0) {
                    node.removeNode(resourceNode);
                }
                totalChildren += resourceNode.calculateTotalChildren();
            });

            if (totalChildren == 0) {
                tree.root.removeNode(node);
            }
        });

        return tree;
    } catch (error) {
        console.error(`Error removing empty resource nodes`);
        console.error(chalk.red(error));
        return tree;
    }
}

export const normalizePolicies = (policies) => {
    
}