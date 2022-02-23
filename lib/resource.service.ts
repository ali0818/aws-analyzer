import { DescribeTableCommand, DynamoDBClient, ListTablesCommandOutput, paginateListTables, TableDescription } from "@aws-sdk/client-dynamodb";
import { EC2Client, paginateDescribeInstances, paginateDescribeNatGateways, paginateDescribeSecurityGroups, paginateDescribeVpcs } from "@aws-sdk/client-ec2";
import { FunctionConfiguration, Lambda, LambdaClient, paginateListFunctions } from "@aws-sdk/client-lambda";
import { RDSClient, paginateDescribeDBInstances } from "@aws-sdk/client-rds";
import { GetBucketAclCommand, GetBucketLocationCommand, GetBucketPolicyCommand, ListBucketsCommand, ListBucketsCommandInput, S3Client } from '@aws-sdk/client-s3';
import { fromIni } from "@aws-sdk/credential-providers";
import chalk from "chalk";
import { Spinner } from "clui";
import { table } from "console";

const RESOURCE_CLIENT_NAMES: string[] = [
    'ec2',
    'elb',
    's3',
    'eks'
]

//Return type for a single resource type returned from a resource service instance
export type ResourceTypeReturnType = {
    all: any[],
    regionMap: { [region: string]: any[] },
    metadata: { primaryKey: string }
};



//Map like {}
export type ServiceAllResourceReturnType = { [serviceName: string]: ResourceTypeReturnType }

export class ResourceService {
    constructor(public profile: string, public regions: string[]) {
        this._initializeResourceGetters();
    }

    resourceGetters: { [key: string]: IResourceGetter } = {};

    _initializeResourceGetters() {
        const ec2 = new EC2ResourceGetter<EC2Client>(this.profile, this.regions);
        const s3 = new S3ResourceGetter<S3Client>(this.profile, this.regions);
        const lambda = new LambdaResourceGetter<LambdaClient>(this.profile, this.regions);
        const rds = new RDSResourceGetter<RDSClient>(this.profile, this.regions);
        const dynamoDB = new DynamoDbResourceGetter<DynamoDBClient>(this.profile, this.regions);

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
        }
    }
}

export interface IResourceGetter {
    getAllResources(): Promise<ServiceAllResourceReturnType>;
}

export class ResourceGetter<T> {
    clients: { [key: string]: any } = {};

    ResourceClient: T;

    constructor(
        protected profile: string,
        protected regions: string[],
        ResourceClient: any
    ) {
        this.regions.forEach(region => {
            this.clients[region] = new ResourceClient({
                credentials: fromIni({
                    profile: this.profile,
                }),
                region: region,
            });
        });

        this.ResourceClient = ResourceClient;
    }
}

export class EC2ResourceGetter<T> extends ResourceGetter<T> implements IResourceGetter {
    constructor(protected profile: string, protected regions: string[]) {
        super(profile, regions, EC2Client);
    }

    async getAllResources(): Promise<{ [key: string]: ResourceTypeReturnType }> {
        console.log(chalk.yellow('\nGetting all EC2 resources...\n'));

        return {
            vpc: await this.getAllVPCs(),
            instance: await this.getAllInstances(),
            natgateway: await this.getAllNatGateways(),
            securitygroup: await this.getAllSecurityGroups()
        }
    }

    async getAllSecurityGroups(): Promise<ResourceTypeReturnType> {
        let securityGroups = [];
        let regionSecurityGroupsMap = {};

        console.log(chalk.yellow('\nGetting all Security Groups...\n'));

        for (let region of this.regions) {
            const ec2 = this.clients[region];
            const pager = paginateDescribeSecurityGroups({ client: ec2 }, {});
            let _securityGroups = [];

            for await (const page of pager) {
                _securityGroups = _securityGroups.concat(page.SecurityGroups);
            }

            regionSecurityGroupsMap[region] = _securityGroups;
            securityGroups = securityGroups.concat(..._securityGroups);
        }

        console.log(chalk.yellow('\Got all Security Groups...\n'));

        return {
            all: securityGroups,
            regionMap: regionSecurityGroupsMap,
            metadata: { primaryKey: 'GroupId' }
        }
    }

    async getAllVPCs(): Promise<ResourceTypeReturnType> {
        let vpcs = [];
        let regionVPCsMap = {};

        console.log(chalk.yellow('\nGetting all VPCs...\n'));

        try {
            for (let region of this.regions) {
                const ec2 = this.clients[region];
                const pager = paginateDescribeVpcs({ client: ec2 }, {});
                let _vpcs = [];

                for await (const page of pager) {
                    _vpcs.push(...page.Vpcs);
                }

                regionVPCsMap[region] = _vpcs;
                vpcs = vpcs.concat(..._vpcs);
            }
        } catch (error) {
            console.error(chalk.red(error));
        } finally {
            console.log(chalk.yellow('\nGot all VPCs...\n'));
        }

        return {
            all: vpcs,
            regionMap: regionVPCsMap,
            metadata: { primaryKey: 'VpcId' }
        };
    }

    async getAllInstances(): Promise<ResourceTypeReturnType> {
        let instances = [];
        let regionInstancesMap = {};

        console.log(chalk.yellow('\nGetting all Instances...\n'));

        try {
            for (let region of this.regions) {
                const ec2 = this.clients[region];
                const pager = paginateDescribeInstances({ client: ec2 }, {});

                let _instances = [];

                for await (const page of pager) {
                    _instances = _instances.concat(page.Reservations.map(reservation => reservation.Instances));
                }

                regionInstancesMap[region] = _instances.flat();
                instances = instances.concat(..._instances);
            }

        } catch (error) {
            console.error(chalk.red(error));
        } finally {
            console.log(chalk.yellow('\nGot all Instances...\n'));
        }
        return {
            all: instances,
            regionMap: regionInstancesMap,
            metadata: { primaryKey: 'InstanceId' }
        }
    }

    async getAllNatGateways(): Promise<ResourceTypeReturnType> {
        let natGateways = [];
        let regionNatGatewaysMap = {};

        console.log(chalk.yellow('\nGetting all Nat Gateways...\n'));


        try {
            for (let region of this.regions) {
                const ec2 = this.clients[region];
                const pager = paginateDescribeNatGateways({ client: ec2 }, {});
                let _natGateways = [];

                for await (const page of pager) {
                    _natGateways = _natGateways.concat(page.NatGateways);
                }

                regionNatGatewaysMap[region] = _natGateways;
                natGateways = natGateways.concat(..._natGateways);
            }
        } catch (error) {
            console.error(chalk.red(error));
        } finally {
            console.log(chalk.yellow('\nGot all Nat Gateways...\n'));
        }

        return {
            all: natGateways,
            regionMap: regionNatGatewaysMap,
            metadata: { primaryKey: 'NatGatewayId' }
        }
    }
}

export class S3ResourceGetter<T> extends ResourceGetter<T> implements IResourceGetter {

    constructor(protected profile: string, protected regions: string[]) {
        super(profile, regions, S3Client);
    }

    async getAllResources(): Promise<{ [key: string]: ResourceTypeReturnType }> {
        console.log(chalk.yellow('\nGetting all S3 resources...\n'));

        return {
            bucket: await this.getAllBuckets()
        }
    }

    async getAllBuckets(): Promise<ResourceTypeReturnType> {
        let buckets = [];
        let regionBucketsMap = {};

        console.log(chalk.blue('\nGetting all S3 buckets...\n'));

        this.regions
            .forEach((region) => {
                regionBucketsMap[region] = [];
            })

        try {
            const s3: S3Client = this.clients[this.regions[0]];

            let input: ListBucketsCommandInput = {};
            let cmd = new ListBucketsCommand({});

            let res = await s3.send(cmd);

            for (let i = 0; i < res.Buckets.length; i++) {
                const bucket = res.Buckets[i];
                try {
                    let cmd = new GetBucketLocationCommand({
                        Bucket: bucket.Name
                    });
                    let locationResponse = await s3.send(cmd);
                    let location = locationResponse.LocationConstraint;
                    bucket['Location'] = locationResponse.LocationConstraint;

                    if (location) {
                        regionBucketsMap[location].push(bucket);
                    }

                } catch (error) {
                    console.error(error);
                }

                buckets.push(bucket);
            }

            Object.keys(regionBucketsMap)
                .forEach(region => {
                    console.log(chalk.green(`Total buckets in ${region}: ${regionBucketsMap[region].length}`));
                });

            console.log(chalk.green(`Total buckets: ${buckets.length}`));
        } catch (error) {
            console.error(chalk.red(error));
        } finally {
            console.log(chalk.blue('\nDone getting all S3 buckets...\n'));
        }

        return { all: buckets, regionMap: regionBucketsMap, metadata: { primaryKey: 'Name' } };
    }
}

export class LambdaResourceGetter<T> extends ResourceGetter<T> implements IResourceGetter {
    constructor(protected profile: string, protected regions: string[]) {
        super(profile, regions, LambdaClient);
    }

    async getAllResources(): Promise<{ [key: string]: ResourceTypeReturnType }> {
        console.log(chalk.yellow('\nGetting all Lambda resources...\n'));

        return {
            function: await this.getAllFunctions()
        }
    }

    async getAllFunctions(): Promise<ResourceTypeReturnType> {
        let paginator = await paginateListFunctions({
            client: this.clients[this.regions[0]]
        }, {

        });

        let functions: FunctionConfiguration[] = [];

        let regionMap = {};
        for (let region of this.regions) {
            let _functions = [];
            for await (const page of paginator) {
                functions.push(...page.Functions);

                _functions.push(...page.Functions);
            }
            regionMap[region] = _functions;
        }

        Object.keys(regionMap)
            .forEach(region => {
                console.log(chalk.green(`Total functions in ${region}: ${regionMap[region].length}`));
            });


        return {
            all: functions,
            regionMap: regionMap,
            metadata: { primaryKey: 'FunctionName' }
        }
    }
}

export class DynamoDbResourceGetter<T> extends ResourceGetter<T> implements IResourceGetter {
    constructor(protected profile: string, protected regions: string[]) {
        super(profile, regions, DynamoDBClient);
    }

    async getAllResources(): Promise<{ [key: string]: ResourceTypeReturnType }> {
        console.log(chalk.yellow('\nGetting all DynamoDB resources...\n'));

        return {
            table: await this.getAllTables()
        }
    }

    async getAllTables(): Promise<ResourceTypeReturnType> {
        let paginator = await paginateListTables({
            client: this.clients[this.regions[0]]
        }, {

        });

        let tables: TableDescription[] = [];
        let regionMap = {};

        for (let region of this.regions) {
            let _tables: TableDescription[] = [];
            const client: DynamoDBClient = this.clients[region];
            for await (const page of paginator) {
                for (let i = 0; i < page.TableNames.length; i++) {
                    let t = page.TableNames[i];

                    let cmd = new DescribeTableCommand({
                        TableName: t
                    });

                    let res = await client.send(cmd);
                    tables.push(res.Table);
                    _tables.push(res.Table);
                }
            }
            regionMap[region] = _tables;
        }

        Object.keys(regionMap)
            .forEach(region => {
                console.log(chalk.green(`Total functions in ${region}: ${regionMap[region].length}`));
            });


        return {
            all: tables,
            regionMap: regionMap,
            metadata: { primaryKey: 'TableId' }
        }
    }
}

export class RDSResourceGetter<T> extends ResourceGetter<T> implements IResourceGetter {
    constructor(protected profile: string, protected regions: string[]) {
        super(profile, regions, RDSClient);
    }

    async getAllResources(): Promise<{ [key: string]: ResourceTypeReturnType }> {
        console.log(chalk.yellow('\nGetting all RDS resources...\n'));

        return {
            dbinstance: await this.getAllDBInstances()
        }
    }


    async getAllDBInstances(): Promise<ResourceTypeReturnType> {
        let instances = [];
        let regionMap = {};
        for (let region of this.regions) {
            const client: RDSClient = this.clients[region];

            const paginator = paginateDescribeDBInstances({
                client: client
            }, {});
            const _instances = [];
            for await (const page of paginator) {
                instances.push(...page.DBInstances);
                _instances.push(...page.DBInstances);
            }

            regionMap[region] = _instances;
        }

        return {
            all: instances,
            regionMap: regionMap,
            metadata: { primaryKey: 'DBInstanceIdentifier' }
        }
    }
}
