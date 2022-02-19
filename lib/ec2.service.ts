import { DescribeFlowLogsCommand, DescribeFlowLogsCommandInput, DescribeKeyPairsCommand, DescribeNatGatewaysCommand, DescribeNatGatewaysCommandInput, DescribeNatGatewaysCommandOutput, DescribeNetworkAclsCommand, DescribeVpcsCommandInput, FlowLog, KeyPairInfo, NatGateway, paginateDescribeInstances, paginateDescribeNatGateways, paginateDescribeNetworkAcls, SecurityGroup, SecurityGroupIdentifier, Vpc } from '@aws-sdk/client-ec2';
import {
    DescribeInstancesCommand, DescribeInstancesCommandInput,
    DescribeInstancesCommandOutput, EC2Client, Reservation,
    DescribeSecurityGroupsCommandInput, DescribeSecurityGroupsCommandOutput,
    DescribeSecurityGroupsCommand,
    DescribeKeyPairsCommandInput, DescribeKeyPairsCommandOutput,
    DescribeVpcsCommand,
} from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';
import chalk from 'chalk';
import cliui from 'clui';

export type ManagedSecurityGroup = SecurityGroup;
export type ManagedVPC = Vpc & { FlowLogs?: FlowLog[] };

export class EC2Service {
    client: EC2Client;

    profile: string;
    region: string;

    flowLogsCache: { [vpcId: string]: FlowLog[] } = {};

    constructor(profile: string, region: string) {
        this.profile = profile;
        this.region = region;
        this.init();
    }

    init() {
        this.client = new EC2Client({
            region: this.region,
            credentials: fromIni({
                profile: this.profile
            }),
            endpoint: `https://ec2.${this.region}.amazonaws.com`
        });
    }

    async getAllNatGateways() {
        try {
            let natGateways: NatGateway[] = [];

            const paginator = paginateDescribeNatGateways({
                client: this.client,
            }, {});

            for await (const page of paginator) {
                natGateways = natGateways.concat(page.NatGateways);
            }

            return natGateways;
        } catch (error) {

        }
    }

    async getAllKeyPairs() {
        try {
            let nextToken: string | undefined;
            let keyPairs: KeyPairInfo[] = [];

            let cmd = new DescribeKeyPairsCommand({

            });
            const res = await this.client.send(cmd);

            keyPairs = res.KeyPairs
            return keyPairs;
        } catch (error) {

        }
    }

    /**
     * Get all network ACLS
     */
    async getAllNetworkACLs() {
        try {
            let networkACLs: SecurityGroup[] = [];

            const paginator = paginateDescribeNetworkAcls({
                client: this.client
            }, {});

            for await (const page of paginator) {
                networkACLs = networkACLs.concat(page.NetworkAcls);
            }

            return networkACLs;
        } catch (error) {
            console.log(chalk.red(error));
            throw error;
        }
    }

    async describeInstances(nextToken?: string): Promise<DescribeInstancesCommandOutput> {
        try {
            const input: DescribeInstancesCommandInput = { NextToken: nextToken };

            const command = new DescribeInstancesCommand(input);

            const result = await this.client.send(command);

            return result;
        } catch (error) {
            console.log(chalk.redBright(error));
            throw error;
        }
    }

    async getSecurityGroups(groupIds: string[]): Promise<DescribeSecurityGroupsCommandOutput> {
        try {
            const input: DescribeSecurityGroupsCommandInput = { GroupIds: groupIds };

            const command = new DescribeSecurityGroupsCommand(input);

            const result = await this.client.send(command);

            return result;
        } catch (error) {
            console.log(chalk.red(error));
            throw error;
        }
    }

    async getAllVPCs() {
        try {

        } catch (error) {

        }
    }

    /**
     * Get all security groups for instances
     * 
     * @param groupIds GroupIds to get information about
     * @param instanceIdSecurityGroupIdMap  Map of instanceIds to security group ids
     * @returns 
     */
    async getAllSecurityGroupsForInstances(groupIds: string[], instanceIdSecurityGroupIdMap: Map<string, string[]>) {
        const spinner = new cliui.Spinner(`Getting all security groups... for region ${this.region}`);

        if (!groupIds.length) {
            return { instanceIdSecurityGroupsMap: new Map(), VPCs: [] }
        }

        try {
            spinner.start();
            let instanceIdSecurityGroupsMap = new Map<string, ManagedSecurityGroup[]>();
            let nextToken: string | undefined;
            let result: DescribeSecurityGroupsCommandOutput;
            let securityGroups: ManagedSecurityGroup[] = [];

            let VPCs: Vpc[] = [];

            do {
                result = await this.getSecurityGroups(groupIds);
                securityGroups = securityGroups.concat(result.SecurityGroups);
                nextToken = result.NextToken;
            } while (nextToken);

            let uniqueVpcIds = new Set<string>();

            for (let i = 0; i < securityGroups.length; i++) {
                try {
                    let securityGroup = securityGroups[i];
                    let vpcId = securityGroup.VpcId;

                    if (vpcId) {
                        uniqueVpcIds.add(vpcId);
                    }
                } catch (err) {
                    console.error(chalk.red(err));
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
        } catch (err) {
            console.log(chalk.red(err));
        }
        finally {
            spinner.stop();
        }
    }

    async describeVPCs(vpcIds: string[]) {
        try {
            const input: DescribeVpcsCommandInput = { VpcIds: vpcIds };
            let nextToken: string | undefined;
            let vpcs: Vpc[] = [];

            do {
                const command = new DescribeVpcsCommand(input);
                const result = await this.client.send(command);
                vpcs.push(...result.Vpcs);
                nextToken = result.NextToken;
            } while (nextToken)

            return vpcs;
        } catch (err) {
            console.log(chalk.red(err));
        }
    }

    /**
     * Get flow logs for a VPC
     * @param resourceId 
     * @returns 
     */
    async getFlowLogs(resourceId: string) {
        try {
            if (this.flowLogsCache[resourceId]) {
                return this.flowLogsCache[resourceId];
            }
            const input: DescribeFlowLogsCommandInput = {
                Filter: [
                    {
                        Name: 'resource-id',
                        Values: [resourceId]
                    }
                ]
            };

            const command = new DescribeFlowLogsCommand(input);

            const result = await this.client.send(command);

            this.flowLogsCache[resourceId] = result.FlowLogs;

            return result.FlowLogs;
        } catch (err) {
            console.log(chalk.red(err));
        }
    }

    async processVPCs(VPCs: Vpc[]): Promise<ManagedVPC[]> {
        for (let i = 0; i < VPCs.length; i++) {
            const vpc: ManagedVPC = VPCs[i];
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
        const spinner = new cliui.Spinner(`Getting all instances... for region ${this.region}`);
        try {
            spinner.start();
            let reservations: Reservation[] = [];

            const paginator = (paginateDescribeInstances({
                client: this.client,
                startingToken: undefined,
            }, {}));

            for await (const page of paginator) {
                reservations.push(...page.Reservations);
            }

            let instances = reservations.map(reservation => reservation.Instances).reduce((a, b) => a.concat(b), []);
            let groupsWithInstance: { groups: SecurityGroupIdentifier[], instance: string }[] = instances
                .map(instance => ({ groups: instance.SecurityGroups, instance: instance.InstanceId }))
                .reduce((a, b) => a.concat(b), []);

            let groupIds = [];
            let groupIdsInstanceIdMap = new Map<string, string[]>();
            let uniqueVpcIds = new Set<string>();

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
        } catch (err) {
            throw err
        } finally {
            spinner.stop();
        }
    }
}
