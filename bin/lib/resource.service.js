"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RDSResourceGetter = exports.DynamoDbResourceGetter = exports.LambdaResourceGetter = exports.S3ResourceGetter = exports.EC2ResourceGetter = exports.ResourceGetter = exports.ResourceService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_ec2_1 = require("@aws-sdk/client-ec2");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const client_rds_1 = require("@aws-sdk/client-rds");
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
        const lambda = new LambdaResourceGetter(this.profile, this.regions);
        const rds = new RDSResourceGetter(this.profile, this.regions);
        const dynamoDB = new DynamoDbResourceGetter(this.profile, this.regions);
        this.resourceGetters['ec2'] = ec2;
        this.resourceGetters['s3'] = s3;
        this.resourceGetters['lambda'] = lambda;
        this.resourceGetters['rds'] = rds;
        this.resourceGetters['dynamodb'] = dynamoDB;
    }
    async getAllResources() {
        return {
            ec2: await this.resourceGetters['ec2'].getAllResources(),
            s3: await this.resourceGetters['s3'].getAllResources(),
            lambda: await this.resourceGetters['lambda'].getAllResources(),
            rds: await this.resourceGetters['rds'].getAllResources(),
            dynamodb: await this.resourceGetters['dynamodb'].getAllResources()
        };
    }
}
exports.ResourceService = ResourceService;
class ResourceGetter {
    constructor(profile, regions, ResourceClient, endpoint) {
        this.profile = profile;
        this.regions = regions;
        this.endpoint = endpoint;
        this.clients = {};
        this.regions.forEach(region => {
            let config = {
                region: region,
                credentials: (0, credential_providers_1.fromIni)({ profile: this.profile }),
            };
            if (endpoint && typeof endpoint === 'function') {
                config.endpoint = endpoint(region);
            }
            this.clients[region] = new ResourceClient(config);
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
            try {
                const ec2 = this.clients[region];
                const pager = (0, client_ec2_1.paginateDescribeSecurityGroups)({ client: ec2 }, {});
                let _securityGroups = [];
                for await (const page of pager) {
                    _securityGroups = _securityGroups.concat(page.SecurityGroups);
                }
                regionSecurityGroupsMap[region] = _securityGroups;
                securityGroups = securityGroups.concat(..._securityGroups);
            }
            catch (error) {
                console.error(chalk_1.default.red(`Error while getting Security Groups for region ${region}`));
                console.error(chalk_1.default.red(error));
            }
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
                try {
                    const ec2 = this.clients[region];
                    const pager = (0, client_ec2_1.paginateDescribeVpcs)({ client: ec2 }, {});
                    let _vpcs = [];
                    for await (const page of pager) {
                        _vpcs.push(...page.Vpcs);
                    }
                    regionVPCsMap[region] = _vpcs;
                    vpcs = vpcs.concat(..._vpcs);
                }
                catch (error) {
                    console.error(chalk_1.default.red(`Error while getting VPCs for region ${region}`));
                    console.error(chalk_1.default.red(error));
                }
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
                try {
                    const ec2 = this.clients[region];
                    const pager = (0, client_ec2_1.paginateDescribeInstances)({ client: ec2 }, {});
                    let _instances = [];
                    for await (const page of pager) {
                        _instances = _instances.concat(page.Reservations.map(reservation => reservation.Instances));
                    }
                    regionInstancesMap[region] = _instances.flat();
                    instances = instances.concat(..._instances);
                }
                catch (error) {
                    console.error(chalk_1.default.red(`Error while getting EC2 instances for region ${region}`));
                    console.error(chalk_1.default.red(error));
                }
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
                try {
                    const ec2 = this.clients[region];
                    const pager = (0, client_ec2_1.paginateDescribeNatGateways)({ client: ec2 }, {});
                    let _natGateways = [];
                    for await (const page of pager) {
                        _natGateways = _natGateways.concat(page.NatGateways);
                    }
                    regionNatGatewaysMap[region] = _natGateways;
                    natGateways = natGateways.concat(..._natGateways);
                }
                catch (error) {
                    console.error(chalk_1.default.red(`Error while getting RDS resources for region ${region}`));
                    console.error(chalk_1.default.red(error));
                }
            }
        }
        catch (error) {
            console.error(chalk_1.default.red(`Error while getting NAT gateways`));
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
        this.regions
            .forEach((region) => {
            regionBucketsMap[region] = [];
        });
        try {
            const s3 = this.clients[this.regions[0]];
            let input = {};
            let cmd = new client_s3_1.ListBucketsCommand({});
            let res = await s3.send(cmd);
            for (let i = 0; i < res.Buckets.length; i++) {
                const bucket = res.Buckets[i];
                try {
                    let cmd = new client_s3_1.GetBucketLocationCommand({
                        Bucket: bucket.Name
                    });
                    let locationResponse = await s3.send(cmd);
                    let location = locationResponse.LocationConstraint;
                    bucket['Location'] = locationResponse.LocationConstraint;
                    if (location) {
                        regionBucketsMap[location].push(bucket);
                    }
                }
                catch (error) {
                    console.error(chalk_1.default.red(`Error while getting bucket location for ${bucket.Name}`));
                    console.error(chalk_1.default.red(error));
                }
                buckets.push(bucket);
            }
            Object.keys(regionBucketsMap)
                .forEach(region => {
                console.log(chalk_1.default.green(`Total buckets in ${region}: ${regionBucketsMap[region].length} `));
            });
            console.log(chalk_1.default.green(`Total buckets: ${buckets.length} `));
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
class LambdaResourceGetter extends ResourceGetter {
    constructor(profile, regions) {
        super(profile, regions, client_lambda_1.LambdaClient);
        this.profile = profile;
        this.regions = regions;
    }
    async getAllResources() {
        console.log(chalk_1.default.yellow('\nGetting all Lambda resources...\n'));
        return {
            function: await this.getAllFunctions()
        };
    }
    async getAllFunctions() {
        let paginator = await (0, client_lambda_1.paginateListFunctions)({
            client: this.clients[this.regions[0]]
        }, {});
        let functions = [];
        let regionMap = {};
        for (let region of this.regions) {
            try {
                let _functions = [];
                for await (const page of paginator) {
                    functions.push(...page.Functions);
                    _functions.push(...page.Functions);
                }
                regionMap[region] = _functions;
            }
            catch (error) {
                console.error(chalk_1.default.red(`Error while getting lambda functions for region ${region}`));
                console.error(chalk_1.default.red(error));
            }
        }
        Object.keys(regionMap)
            .forEach(region => {
            console.log(chalk_1.default.green(`Total functions in ${region}: ${regionMap[region].length} `));
        });
        return {
            all: functions,
            regionMap: regionMap,
            metadata: { primaryKey: 'FunctionName' }
        };
    }
}
exports.LambdaResourceGetter = LambdaResourceGetter;
class DynamoDbResourceGetter extends ResourceGetter {
    constructor(profile, regions) {
        super(profile, regions, client_dynamodb_1.DynamoDBClient);
        this.profile = profile;
        this.regions = regions;
    }
    async getAllResources() {
        console.log(chalk_1.default.yellow('\nGetting all DynamoDB resources...\n'));
        return {
            table: await this.getAllTables()
        };
    }
    async getAllTables() {
        let paginator = await (0, client_dynamodb_1.paginateListTables)({
            client: this.clients[this.regions[0]]
        }, {});
        let tables = [];
        let regionMap = {};
        for (let region of this.regions) {
            let _tables = [];
            const client = this.clients[region];
            try {
                for await (const page of paginator) {
                    for (let i = 0; i < page.TableNames.length; i++) {
                        let t = page.TableNames[i];
                        let cmd = new client_dynamodb_1.DescribeTableCommand({
                            TableName: t
                        });
                        let res = await client.send(cmd);
                        tables.push(res.Table);
                        _tables.push(res.Table);
                    }
                }
                regionMap[region] = _tables;
            }
            catch (error) {
                console.error(chalk_1.default.red(`Error while getting DYNAMO DB tables for region ${region}`));
                console.error(chalk_1.default.red(error));
            }
        }
        Object.keys(regionMap)
            .forEach(region => {
            console.log(chalk_1.default.green(`Total functions in ${region}: ${regionMap[region].length} `));
        });
        return {
            all: tables,
            regionMap: regionMap,
            metadata: { primaryKey: 'TableId' }
        };
    }
}
exports.DynamoDbResourceGetter = DynamoDbResourceGetter;
class RDSResourceGetter extends ResourceGetter {
    constructor(profile, regions) {
        super(profile, regions, client_rds_1.RDSClient, (region) => {
            return `https://rds.${region}.amazonaws.com`;
        });
        this.profile = profile;
        this.regions = regions;
    }
    async getAllResources() {
        console.log(chalk_1.default.yellow('\nGetting all RDS resources...\n'));
        return {
            dbinstance: await this.getAllDBInstances()
        };
    }
    async getAllDBInstances() {
        let instances = [];
        let regionMap = {};
        for (let region of this.regions) {
            const client = this.clients[region];
            try {
                const paginator = (0, client_rds_1.paginateDescribeDBInstances)({
                    client: client
                }, {});
                const _instances = [];
                for await (const page of paginator) {
                    instances.push(...page.DBInstances);
                    _instances.push(...page.DBInstances);
                }
                regionMap[region] = _instances;
            }
            catch (error) {
                console.error(chalk_1.default.red(`Error while getting RDS resources for region ${region}`));
                console.error(chalk_1.default.red(error));
            }
        }
        return {
            all: instances,
            regionMap: regionMap,
            metadata: { primaryKey: 'DBInstanceIdentifier' }
        };
    }
}
exports.RDSResourceGetter = RDSResourceGetter;
//# sourceMappingURL=resource.service.js.map