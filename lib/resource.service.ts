import { EC2Client, paginateDescribeInstances, paginateDescribeNatGateways, paginateDescribeSecurityGroups, paginateDescribeVpcs } from "@aws-sdk/client-ec2";
import { GetBucketAclCommand, GetBucketPolicyCommand, ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { fromIni } from "@aws-sdk/credential-providers";
import chalk from "chalk";
import { Spinner } from "clui";

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

        this.resourceGetters['ec2'] = ec2;
        this.resourceGetters['s3'] = s3;
    }

    async getAllResources() {
        return {
            ec2: await this.resourceGetters['ec2'].getAllResources(),
            s3: await this.resourceGetters['s3'].getAllResources()
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

        try {
            for (let region of this.regions) {
                const s3 = this.clients[region];

                let cmd = new ListBucketsCommand({});

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
        } catch (error) {
            console.error(chalk.red(error));
        } finally {
            console.log(chalk.blue('\nDone getting all S3 buckets...\n'));
        }

        return { all: buckets, regionMap: regionBucketsMap, metadata: { primaryKey: 'Name' } };
    }
}