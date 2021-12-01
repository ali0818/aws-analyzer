"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EC2Service = void 0;
const client_ec2_1 = require("@aws-sdk/client-ec2");
const client_ec2_2 = require("@aws-sdk/client-ec2");
const credential_providers_1 = require("@aws-sdk/credential-providers");
const chalk_1 = __importDefault(require("chalk"));
const clui_1 = __importDefault(require("clui"));
class EC2Service {
    constructor(profile, region) {
        this.flowLogsCache = {};
        this.profile = profile;
        this.region = region;
        this.init();
    }
    init() {
        this.client = new client_ec2_2.EC2Client({
            region: this.region,
            credentials: (0, credential_providers_1.fromIni)({
                profile: this.profile
            })
        });
    }
    async describeInstances(nextToken) {
        try {
            const input = { NextToken: nextToken };
            const command = new client_ec2_2.DescribeInstancesCommand(input);
            const result = await this.client.send(command);
            return result;
        }
        catch (error) {
            console.log(chalk_1.default.redBright(error));
            throw error;
        }
    }
    async getSecurityGroups(groupIds) {
        try {
            const input = { GroupIds: groupIds };
            const command = new client_ec2_2.DescribeSecurityGroupsCommand(input);
            const result = await this.client.send(command);
            return result;
        }
        catch (error) {
            console.log(chalk_1.default.red(error));
            throw error;
        }
    }
    /**
     * Get all security groups for instances
     *
     * @param groupIds GroupIds to get information about
     * @param instanceIdSecurityGroupIdMap  Map of instanceIds to security group ids
     * @returns
     */
    async getAllSecurityGroupsForInstances(groupIds, instanceIdSecurityGroupIdMap) {
        const spinner = new clui_1.default.Spinner(`Getting all security groups... for region ${this.region}`);
        if (!groupIds.length) {
            return { instanceIdSecurityGroupsMap: new Map(), VPCs: [] };
        }
        try {
            spinner.start();
            let instanceIdSecurityGroupsMap = new Map();
            let nextToken;
            let result;
            let securityGroups = [];
            let VPCs = [];
            do {
                result = await this.getSecurityGroups(groupIds);
                securityGroups = securityGroups.concat(result.SecurityGroups);
                nextToken = result.NextToken;
            } while (nextToken);
            let uniqueVpcIds = new Set();
            for (let i = 0; i < securityGroups.length; i++) {
                try {
                    let securityGroup = securityGroups[i];
                    let vpcId = securityGroup.VpcId;
                    if (vpcId) {
                        uniqueVpcIds.add(vpcId);
                    }
                }
                catch (err) {
                    console.error(chalk_1.default.red(err));
                }
            }
            VPCs = await this.describeVPCs(Array.from(uniqueVpcIds));
            instanceIdSecurityGroupIdMap
                .forEach((groupIds, instanceId) => {
                const securityGroupIds = instanceIdSecurityGroupIdMap.get(instanceId);
                const securityGroupsForInstance = securityGroups.filter(securityGroup => securityGroupIds.includes(securityGroup.GroupId));
                instanceIdSecurityGroupsMap.set(instanceId, securityGroupsForInstance);
            });
            return { instanceIdSecurityGroupsMap, VPCs };
        }
        catch (err) {
            console.log(chalk_1.default.red(err));
        }
        finally {
            spinner.stop();
        }
    }
    async describeVPCs(vpcIds) {
        try {
            const input = { VpcIds: vpcIds };
            let nextToken;
            let vpcs = [];
            do {
                const command = new client_ec2_2.DescribeVpcsCommand(input);
                const result = await this.client.send(command);
                vpcs.push(...result.Vpcs);
                nextToken = result.NextToken;
            } while (nextToken);
            return vpcs;
        }
        catch (err) {
            console.log(chalk_1.default.red(err));
        }
    }
    /**
     * Get flow logs for a VPC
     * @param resourceId
     * @returns
     */
    async getFlowLogs(resourceId) {
        try {
            if (this.flowLogsCache[resourceId]) {
                return this.flowLogsCache[resourceId];
            }
            const input = {
                Filter: [
                    {
                        Name: 'resource-id',
                        Values: [resourceId]
                    }
                ]
            };
            const command = new client_ec2_1.DescribeFlowLogsCommand(input);
            const result = await this.client.send(command);
            this.flowLogsCache[resourceId] = result.FlowLogs;
            return result.FlowLogs;
        }
        catch (err) {
            console.log(chalk_1.default.red(err));
        }
    }
    async processVPCs(VPCs) {
        for (let i = 0; i < VPCs.length; i++) {
            const vpc = VPCs[i];
            const vpcId = vpc.VpcId;
            const flowLogs = await this.getFlowLogs(vpcId);
            vpc.FlowLogs = flowLogs;
        }
        return VPCs;
    }
    /**
     * Gets all ec2 instances in the region
     * @returns {Promise<DescribeInstancesCommandOutput>}
     */
    async getAllInstances() {
        const spinner = new clui_1.default.Spinner(`Getting all instances... for region ${this.region}`);
        try {
            spinner.start();
            let nextToken;
            let result;
            let reservations = [];
            do {
                result = await this.describeInstances(nextToken);
                reservations = reservations.concat(result === null || result === void 0 ? void 0 : result.Reservations);
                nextToken = result === null || result === void 0 ? void 0 : result.NextToken;
            } while (nextToken);
            let instances = reservations.map(reservation => reservation.Instances).reduce((a, b) => a.concat(b), []);
            let groupsWithInstance = instances
                .map(instance => ({ groups: instance.SecurityGroups, instance: instance.InstanceId }))
                .reduce((a, b) => a.concat(b), []);
            let groupIds = [];
            let groupIdsInstanceIdMap = new Map();
            let uniqueVpcIds = new Set();
            groupsWithInstance.forEach(({ groups, instance }) => {
                groups.forEach(group => {
                    if (!groupIdsInstanceIdMap.has(instance)) {
                        groupIdsInstanceIdMap.set(instance, []);
                    }
                    groupIdsInstanceIdMap.get(instance).push(group.GroupId);
                    groupIds.push(group.GroupId);
                });
            });
            //Map of instanceIds to security group detailed array
            let { instanceIdSecurityGroupsMap, VPCs } = await this.getAllSecurityGroupsForInstances(groupIds, groupIdsInstanceIdMap);
            VPCs = await this.processVPCs(VPCs);
            return { reservations, instances, instanceIdSecurityGroupsMap, VPCs };
        }
        catch (err) {
            throw err;
        }
        finally {
            spinner.stop();
        }
    }
}
exports.EC2Service = EC2Service;
//# sourceMappingURL=ec2.service.js.map