"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3ResourceGetter = exports.EC2ResourceGetter = exports.ResourceGetter = exports.ResourceService = void 0;
const client_ec2_1 = require("@aws-sdk/client-ec2");
const client_s3_1 = require("@aws-sdk/client-s3");
const credential_providers_1 = require("@aws-sdk/credential-providers");
const chalk_1 = __importDefault(require("chalk"));
const RESOURCE_CLIENT_NAMES = [
    'ec2',
    'elb',
    's3',
    'eks'
];
class ResourceService {
    constructor(profile, regions) {
        this.profile = profile;
        this.regions = regions;
        this.resourceGetters = {};
        this._initializeResourceGetters();
    }
    _initializeResourceGetters() {
        const ec2 = new EC2ResourceGetter(this.profile, this.regions);
        const s3 = new S3ResourceGetter(this.profile, this.regions);
        this.resourceGetters['ec2'] = ec2;
        this.resourceGetters['s3'] = s3;
    }
    async getAllResources() {
        return {
            ec2: await this.resourceGetters['ec2'].getAllResources(),
            s3: await this.resourceGetters['s3'].getAllResources()
        };
    }
}
exports.ResourceService = ResourceService;
class ResourceGetter {
    constructor(profile, regions, ResourceClient) {
        this.profile = profile;
        this.regions = regions;
        this.clients = {};
        this.regions.forEach(region => {
            this.clients[region] = new ResourceClient({
                credentials: (0, credential_providers_1.fromIni)({
                    profile: this.profile,
                }),
                region: region,
            });
        });
        this.ResourceClient = ResourceClient;
    }
}
exports.ResourceGetter = ResourceGetter;
class EC2ResourceGetter extends ResourceGetter {
    constructor(profile, regions) {
        super(profile, regions, client_ec2_1.EC2Client);
        this.profile = profile;
        this.regions = regions;
    }
    async getAllResources() {
        console.log(chalk_1.default.yellow('\nGetting all EC2 resources...\n'));
        return {
            vpc: await this.getAllVPCs(),
            instance: await this.getAllInstances(),
            natgateway: await this.getAllNatGateways(),
            securitygroup: await this.getAllSecurityGroups()
        };
    }
    async getAllSecurityGroups() {
        let securityGroups = [];
        let regionSecurityGroupsMap = {};
        console.log(chalk_1.default.yellow('\nGetting all Security Groups...\n'));
        for (let region of this.regions) {
            const ec2 = this.clients[region];
            const pager = (0, client_ec2_1.paginateDescribeSecurityGroups)({ client: ec2 }, {});
            let _securityGroups = [];
            for await (const page of pager) {
                _securityGroups = _securityGroups.concat(page.SecurityGroups);
            }
            regionSecurityGroupsMap[region] = _securityGroups;
            securityGroups = securityGroups.concat(..._securityGroups);
        }
        console.log(chalk_1.default.yellow('\Got all Security Groups...\n'));
        return {
            all: securityGroups,
            regionMap: regionSecurityGroupsMap,
            metadata: { primaryKey: 'GroupId' }
        };
    }
    async getAllVPCs() {
        let vpcs = [];
        let regionVPCsMap = {};
        console.log(chalk_1.default.yellow('\nGetting all VPCs...\n'));
        try {
            for (let region of this.regions) {
                const ec2 = this.clients[region];
                const pager = (0, client_ec2_1.paginateDescribeVpcs)({ client: ec2 }, {});
                let _vpcs = [];
                for await (const page of pager) {
                    _vpcs.push(...page.Vpcs);
                }
                regionVPCsMap[region] = _vpcs;
                vpcs = vpcs.concat(..._vpcs);
            }
        }
        catch (error) {
            console.error(chalk_1.default.red(error));
        }
        finally {
            console.log(chalk_1.default.yellow('\nGot all VPCs...\n'));
        }
        return {
            all: vpcs,
            regionMap: regionVPCsMap,
            metadata: { primaryKey: 'VpcId' }
        };
    }
    async getAllInstances() {
        let instances = [];
        let regionInstancesMap = {};
        console.log(chalk_1.default.yellow('\nGetting all Instances...\n'));
        try {
            for (let region of this.regions) {
                const ec2 = this.clients[region];
                const pager = (0, client_ec2_1.paginateDescribeInstances)({ client: ec2 }, {});
                let _instances = [];
                for await (const page of pager) {
                    _instances = _instances.concat(page.Reservations.map(reservation => reservation.Instances));
                }
                regionInstancesMap[region] = _instances.flat();
                instances = instances.concat(..._instances);
            }
        }
        catch (error) {
            console.error(chalk_1.default.red(error));
        }
        finally {
            console.log(chalk_1.default.yellow('\nGot all Instances...\n'));
        }
        return {
            all: instances,
            regionMap: regionInstancesMap,
            metadata: { primaryKey: 'InstanceId' }
        };
    }
    async getAllNatGateways() {
        let natGateways = [];
        let regionNatGatewaysMap = {};
        console.log(chalk_1.default.yellow('\nGetting all Nat Gateways...\n'));
        try {
            for (let region of this.regions) {
                const ec2 = this.clients[region];
                const pager = (0, client_ec2_1.paginateDescribeNatGateways)({ client: ec2 }, {});
                let _natGateways = [];
                for await (const page of pager) {
                    _natGateways = _natGateways.concat(page.NatGateways);
                }
                regionNatGatewaysMap[region] = _natGateways;
                natGateways = natGateways.concat(..._natGateways);
            }
        }
        catch (error) {
            console.error(chalk_1.default.red(error));
        }
        finally {
            console.log(chalk_1.default.yellow('\nGot all Nat Gateways...\n'));
        }
        return {
            all: natGateways,
            regionMap: regionNatGatewaysMap,
            metadata: { primaryKey: 'NatGatewayId' }
        };
    }
}
exports.EC2ResourceGetter = EC2ResourceGetter;
class S3ResourceGetter extends ResourceGetter {
    constructor(profile, regions) {
        super(profile, regions, client_s3_1.S3Client);
        this.profile = profile;
        this.regions = regions;
    }
    async getAllResources() {
        console.log(chalk_1.default.yellow('\nGetting all S3 resources...\n'));
        return {
            bucket: await this.getAllBuckets()
        };
    }
    async getAllBuckets() {
        let buckets = [];
        let regionBucketsMap = {};
        console.log(chalk_1.default.blue('\nGetting all S3 buckets...\n'));
        try {
            for (let region of this.regions) {
                const s3 = this.clients[region];
                let cmd = new client_s3_1.ListBucketsCommand({});
                let res = await s3.send(cmd);
                for (let i = 0; i < res.Buckets.length; i++) {
                    const bucket = res.Buckets[i];
                    // try {
                    //     let cmd = new GetBucketAclCommand({ Bucket: bucket.Name });
                    //     let aclResponse = await s3.send(cmd);
                    //     bucket['ACL'] = { Grants: aclResponse.Grants, Owner: aclResponse.Owner };
                    // } catch (err) {
                    //     console.log(chalk.red(`Error while getting ACL for bucket ${bucket.Name}`));
                    //     console.error(err)
                    // }
                    // try {
                    //     let policyCmd = new GetBucketPolicyCommand({ Bucket: bucket.Name });
                    //     let policyResponse = await s3.send(policyCmd);
                    //     bucket['Policy'] = policyResponse.Policy;
                    // } catch (error) {
                    //     console.log(chalk.red(`Error while getting policy for bucket ${bucket.Name}`));
                    //     console.log(error);
                    // }
                    buckets.push(bucket);
                }
                regionBucketsMap[region] = buckets;
            }
        }
        catch (error) {
            console.error(chalk_1.default.red(error));
        }
        finally {
            console.log(chalk_1.default.blue('\nDone getting all S3 buckets...\n'));
        }
        return { all: buckets, regionMap: regionBucketsMap, metadata: { primaryKey: 'Name' } };
    }
}
exports.S3ResourceGetter = S3ResourceGetter;
//# sourceMappingURL=resource.service.js.map