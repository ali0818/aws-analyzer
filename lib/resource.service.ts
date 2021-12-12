import { DescribeInstancesCommand, EC2Client, paginateDescribeInstances, paginateDescribeNatGateways, paginateDescribeVpcs } from "@aws-sdk/client-ec2";
import { fromIni } from "@aws-sdk/credential-providers";
import { EC2Service } from "./ec2.service";
import { GetBucketAclCommand, GetBucketPolicyCommand, ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { Client as IClient, Command, MetadataBearer, MiddlewareStack, RequestHandler } from "@aws-sdk/types";
import chalk from "chalk";
import { Console } from "console";

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
            // s3: await this.resourceGetters['s3'].getAllResources()
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
        return {
            vpc: await this.getAllVPCs(),
            instance: await this.getAllInstances(),
            natgateway: await this.getAllNatGateways()
        }
    }

    async getAllVPCs(): Promise<ResourceTypeReturnType> {
        let vpcs = [];
        let regionVPCsMap = {};

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

        return {
            all: vpcs,
            regionMap: regionVPCsMap,
            metadata: { primaryKey: 'VpcId' }
        };
    }

    async getAllInstances(): Promise<ResourceTypeReturnType> {
        let instances = [];
        let regionInstancesMap = {};

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

        return {
            all: instances,
            regionMap: regionInstancesMap,
            metadata: { primaryKey: 'InstanceId' }
        }
    }

    async getAllNatGateways(): Promise<ResourceTypeReturnType> {
        let natGateways = [];
        let regionNatGatewaysMap = {};

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
        return {
            bucket: await this.getAllBuckets()
        }
    }

    async getAllBuckets(): Promise<ResourceTypeReturnType> {
        let buckets = [];
        let regionBucketsMap = {};

        for (let region of this.regions) {
            const s3 = this.clients[region];

            let cmd = new ListBucketsCommand({});

            let res = await s3.send(cmd);

            for (let i = 0; i < res.Buckets.length; i++) {
                const bucket = res.Buckets[i];
                try {
                    let cmd = new GetBucketAclCommand({ Bucket: bucket.Name });
                    let aclResponse = await s3.send(cmd);
                    bucket['ACL'] = { Grants: aclResponse.Grants, Owner: aclResponse.Owner };
                } catch (err) {
                    console.log(chalk.red(`Error while getting ACL for bucket ${bucket.Name}`));
                    console.error(err)
                }

                try {
                    let policyCmd = new GetBucketPolicyCommand({ Bucket: bucket.Name });
                    let policyResponse = await s3.send(policyCmd);

                    bucket['Policy'] = policyResponse.Policy;
                } catch (error) {
                    console.log(chalk.red(`Error while getting policy for bucket ${bucket.Name}`));
                    console.log(error);
                }

                buckets.push(bucket);
            }

            regionBucketsMap[region] = buckets;
        }

        return { all: buckets, regionMap: regionBucketsMap, metadata: { primaryKey: 'Name' } };
    }
}