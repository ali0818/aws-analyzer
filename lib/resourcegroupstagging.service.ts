import { GetResourcesCommand, GetResourcesCommandOutput, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { fromIni } from '@aws-sdk/credential-providers';
import chalk from 'chalk';

export class ResourceGroupsTaggingService {

    client: ResourceGroupsTaggingAPIClient;

    constructor(public profile: string, public region: string) {
        this.init()
    }

    init() {
        this.client = new ResourceGroupsTaggingAPIClient({
            credentials: fromIni({
                profile: this.profile,
            }),
            region: this.region,
            // endpoint: `https://resourcegroupstaggingapi.${this.region}.amazonaws.com`,
        });
    }

    /**
     * Get all the resources for the region
     */
    async getAllResources() {
        try {
            let response: GetResourcesCommandOutput;
            let resources = [];
            do {
                const command = new GetResourcesCommand({
                    PaginationToken: response ? response.PaginationToken : undefined,
                });

                response = await this.client.send(command);

                response.ResourceTagMappingList.forEach(resource => {
                    console.log(resource.ResourceARN);
                    console.log(resource.Tags);
                });

                resources.push(...response.ResourceTagMappingList);
            } while (response?.PaginationToken);

            return resources;
        } catch (error) {
            console.log(chalk.red(`Error getting resources: for region ${this.region}`));
            console.error(error);
            return [];
        }
    }
}