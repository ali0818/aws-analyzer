"use strict";
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
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
            // s3: await this.resourceGetters['s3'].getAllResources()
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
        return {
            vpc: await this.getAllVPCs(),
            instance: await this.getAllInstances(),
            natgateway: await this.getAllNatGateways()
        };
    }
    async getAllVPCs() {
        var e_1, _a;
        let vpcs = [];
        let regionVPCsMap = {};
        for (let region of this.regions) {
            const ec2 = this.clients[region];
            const pager = (0, client_ec2_1.paginateDescribeVpcs)({ client: ec2 }, {});
            let _vpcs = [];
            try {
                for (var pager_1 = (e_1 = void 0, __asyncValues(pager)), pager_1_1; pager_1_1 = await pager_1.next(), !pager_1_1.done;) {
                    const page = pager_1_1.value;
                    _vpcs.push(...page.Vpcs);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (pager_1_1 && !pager_1_1.done && (_a = pager_1.return)) await _a.call(pager_1);
                }
                finally { if (e_1) throw e_1.error; }
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
    async getAllInstances() {
        var e_2, _a;
        let instances = [];
        let regionInstancesMap = {};
        for (let region of this.regions) {
            const ec2 = this.clients[region];
            const pager = (0, client_ec2_1.paginateDescribeInstances)({ client: ec2 }, {});
            let _instances = [];
            try {
                for (var pager_2 = (e_2 = void 0, __asyncValues(pager)), pager_2_1; pager_2_1 = await pager_2.next(), !pager_2_1.done;) {
                    const page = pager_2_1.value;
                    _instances = _instances.concat(page.Reservations.map(reservation => reservation.Instances));
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (pager_2_1 && !pager_2_1.done && (_a = pager_2.return)) await _a.call(pager_2);
                }
                finally { if (e_2) throw e_2.error; }
            }
            regionInstancesMap[region] = _instances.flat();
            instances = instances.concat(..._instances);
        }
        return {
            all: instances,
            regionMap: regionInstancesMap,
            metadata: { primaryKey: 'InstanceId' }
        };
    }
    async getAllNatGateways() {
        var e_3, _a;
        let natGateways = [];
        let regionNatGatewaysMap = {};
        for (let region of this.regions) {
            const ec2 = this.clients[region];
            const pager = (0, client_ec2_1.paginateDescribeNatGateways)({ client: ec2 }, {});
            let _natGateways = [];
            try {
                for (var pager_3 = (e_3 = void 0, __asyncValues(pager)), pager_3_1; pager_3_1 = await pager_3.next(), !pager_3_1.done;) {
                    const page = pager_3_1.value;
                    _natGateways = _natGateways.concat(page.NatGateways);
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (pager_3_1 && !pager_3_1.done && (_a = pager_3.return)) await _a.call(pager_3);
                }
                finally { if (e_3) throw e_3.error; }
            }
            regionNatGatewaysMap[region] = _natGateways;
            natGateways = natGateways.concat(..._natGateways);
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
        return {
            bucket: await this.getAllBuckets()
        };
    }
    async getAllBuckets() {
        let buckets = [];
        let regionBucketsMap = {};
        for (let region of this.regions) {
            const s3 = this.clients[region];
            let cmd = new client_s3_1.ListBucketsCommand({});
            let res = await s3.send(cmd);
            for (let i = 0; i < res.Buckets.length; i++) {
                const bucket = res.Buckets[i];
                try {
                    let cmd = new client_s3_1.GetBucketAclCommand({ Bucket: bucket.Name });
                    let aclResponse = await s3.send(cmd);
                    bucket['ACL'] = { Grants: aclResponse.Grants, Owner: aclResponse.Owner };
                }
                catch (err) {
                    console.log(chalk_1.default.red(`Error while getting ACL for bucket ${bucket.Name}`));
                    console.error(err);
                }
                try {
                    let policyCmd = new client_s3_1.GetBucketPolicyCommand({ Bucket: bucket.Name });
                    let policyResponse = await s3.send(policyCmd);
                    bucket['Policy'] = policyResponse.Policy;
                }
                catch (error) {
                    console.log(chalk_1.default.red(`Error while getting policy for bucket ${bucket.Name}`));
                    console.log(error);
                }
                buckets.push(bucket);
            }
            regionBucketsMap[region] = buckets;
        }
        return { all: buckets, regionMap: regionBucketsMap, metadata: { primaryKey: 'Name' } };
    }
}
exports.S3ResourceGetter = S3ResourceGetter;
//# sourceMappingURL=resource.service.js.map