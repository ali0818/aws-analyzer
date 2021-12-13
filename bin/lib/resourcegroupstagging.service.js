"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceGroupsTaggingService = void 0;
const client_resource_groups_tagging_api_1 = require("@aws-sdk/client-resource-groups-tagging-api");
const credential_providers_1 = require("@aws-sdk/credential-providers");
const chalk_1 = __importDefault(require("chalk"));
class ResourceGroupsTaggingService {
    constructor(profile, region) {
        this.profile = profile;
        this.region = region;
        this.init();
    }
    init() {
        this.client = new client_resource_groups_tagging_api_1.ResourceGroupsTaggingAPIClient({
            credentials: (0, credential_providers_1.fromIni)({
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
            let response;
            let resources = [];
            do {
                const command = new client_resource_groups_tagging_api_1.GetResourcesCommand({
                    PaginationToken: response ? response.PaginationToken : undefined,
                });
                response = await this.client.send(command);
                response.ResourceTagMappingList.forEach(resource => {
                });
                resources.push(...response.ResourceTagMappingList);
            } while (response === null || response === void 0 ? void 0 : response.PaginationToken);
            return resources;
        }
        catch (error) {
            console.log(chalk_1.default.red(`Error getting resources: for region ${this.region}`));
            console.error(error);
            return [];
        }
    }
}
exports.ResourceGroupsTaggingService = ResourceGroupsTaggingService;
//# sourceMappingURL=resourcegroupstagging.service.js.map