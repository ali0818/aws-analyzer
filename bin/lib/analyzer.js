"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyze = void 0;
const chalk_1 = __importDefault(require("chalk"));
const ec2_service_1 = require("./ec2.service");
const files_1 = require("./files");
const utils_1 = require("./utils/utils");
const CACHE_FILE_NAME = "ec2-data.json";
/**
 * Analyze ec2 for a given profile
 * @param profile  aws profile name
 * @param refreshCache if true, will refresh the cache, else use the cache for the given profile
 *
 */
const analyze = async (profile, regions, refreshCache) => {
    const { clients, toArray } = initializeRegionalClients(profile, regions);
    let regionEC2DetailsMap = {};
    let _cacheExists = await (0, files_1.cacheExists)(CACHE_FILE_NAME, profile);
    // if cache exists and refreshCache is false, use cache
    if (_cacheExists && !refreshCache) {
        console.log(chalk_1.default.yellow("Cache found, Using cached data"));
        const cache = await (0, files_1.loadCache)(CACHE_FILE_NAME, profile);
        regionEC2DetailsMap = Object.assign({}, cache);
    }
    else {
        //Else fetch data from all regions
        console.log(chalk_1.default.yellow("Refreshing Data..."));
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            try {
                let { instances, reservations, instanceIdSecurityGroupsMap, VPCs } = await client.getAllInstances();
                regionEC2DetailsMap[client.region] = {
                    instances,
                    reservations,
                    instanceIDSecurityGroupsMap: Object.fromEntries(instanceIdSecurityGroupsMap),
                    VPCs
                };
            }
            catch (error) {
                console.log(chalk_1.default.red(error));
            }
        }
        console.log(chalk_1.default.green('Fetched EC2 data for all regions'));
        await (0, files_1.saveCache)(CACHE_FILE_NAME, regionEC2DetailsMap, profile);
        console.log(chalk_1.default.yellow(`Saved EC2 data to cache`));
    }
    let analyzedRegionalData = {};
    Object.keys(regionEC2DetailsMap)
        .forEach(region => {
        _analyzeRegionData(region, regionEC2DetailsMap[region]);
    });
};
exports.analyze = analyze;
/**
 * Analyze one particular region
 * @param region
 * @param regionDetailsMap
 */
const _analyzeRegionData = (region, regionDetailsMap) => {
    const { instances, reservations, VPCs, instanceIDSecurityGroupsMap } = regionDetailsMap;
    console.log(chalk_1.default.cyan(`Analyzing EC2 data for region - `), chalk_1.default.bgGray(`${region}`));
    console.log(chalk_1.default.yellow(`Found ${instances.length} instance(s)`));
    console.log(chalk_1.default.yellow(`Found ${VPCs.length} VPC(s)`));
    for (let i = 0; i < instances.length; i++) {
        let instance = instances[i];
        console.log(chalk_1.default.cyan(`Instance ${instance.InstanceId} has ${instance.SecurityGroups.length} security group(s)`));
        let SGs = instanceIDSecurityGroupsMap[instance.InstanceId];
        let { portSecurityGroupsMap } = _analyzeSecurityGroups(SGs);
    }
    //Analyze VPCs found in the region
    for (let i = 0; i < VPCs.length; i++) {
        let vpc = VPCs[i];
        if (!vpc.FlowLogs || vpc.FlowLogs.length === 0) {
            console.log(chalk_1.default.yellow(`VPC ${vpc.VpcId} doesn't seem to have flow logs enabled`));
            console.log(chalk_1.default.yellow(`Enable flow logs for better analysis of yur incoming/outgoing traffic`));
        }
    }
    console.log('\n');
};
/**
 * Analyze security groups for a given instance
 * @param SGs SecurityGroups
 * @returns
 */
const _analyzeSecurityGroups = (SGs) => {
    //Map of all security groups for a port
    let portSGsMap = {};
    let totalOpenPotentialThreatPorts = [];
    let securityGroupOpenThreatPortsMap = {};
    for (let i = 0; i < SGs.length; i++) {
        let sg = SGs[i];
        const { managedPorts, openPotentialThreatPorts } = _analyzeSecurityGroup(sg);
        if (managedPorts.length > 0) {
            managedPorts.forEach(port => {
                if (!portSGsMap[port]) {
                    portSGsMap[port] = [];
                }
                portSGsMap[port].push(sg);
            });
        }
        totalOpenPotentialThreatPorts = totalOpenPotentialThreatPorts.concat(openPotentialThreatPorts);
    }
    Object.keys(portSGsMap)
        .forEach(port => {
        let sgs = portSGsMap[port];
        if (sgs.length > 1) {
            console.log(chalk_1.default.yellow(`Port ${port} is managed by multiple (${sgs.length}) security group(s)`));
            console.log(chalk_1.default.yellow(`Security groups:`));
            sgs.forEach(sg => {
                console.log(chalk_1.default.yellow(`${sg.GroupName}`));
            });
        }
    });
    return {
        portSecurityGroupsMap: portSGsMap
    };
};
/**
 * Analyze a single security group
 * @param sg Security group to analyze
 * @returns
 */
const _analyzeSecurityGroup = (sg) => {
    //List of ports managed by the security group
    let managedPorts = [];
    let openPotentialThreatPorts = [];
    //Check for all the incoming ports
    for (let i = 0; i < sg.IpPermissions.length; i++) {
        let ipPermission = sg.IpPermissions[i];
        const fromPort = ipPermission.FromPort;
        const toPort = ipPermission.ToPort;
        const isOnePort = !toPort || fromPort === toPort;
        const allPortsOpen = ipPermission
            .IpRanges
            .map(c => c.CidrIp).includes('0.0.0.0/0');
        //Check if the ports are in one of the following ranges
        //@credit https://secbot.com/docs/ports/common-ports
        const potentialThreatPorts = [
            22, 3306, 5432, 8444, 8888, 9443, 9999, 27017, 6379,
            1433, 4022, 135, 1434, 1521, 1830, 8529,
            7000, 7001, 9042, 5984, 27018, 27019, 28017,
            989, 990, 20, 21, 53, 853, 23, 992, 25, 465
        ];
        const isPotentialThreat = isOnePort && potentialThreatPorts.includes(fromPort)
            ||
                potentialThreatPorts.filter((x) => (0, utils_1.isBetweenNumbers)(x, fromPort, toPort)).length > 0;
        if (allPortsOpen && isPotentialThreat) {
            console.log(chalk_1.default.red(`Security Group ${sg.GroupName} has ${isOnePort ? 'port' : 'ports'} ${fromPort}-${toPort} open to the world`));
            if (isOnePort) {
                openPotentialThreatPorts.push(fromPort);
            }
            else {
                openPotentialThreatPorts.push(`${fromPort}-${toPort}`);
            }
        }
        if (isOnePort) {
            //If one port is open, add it to the list of managed ports
            managedPorts.push(`${fromPort}`);
        }
        else {
            ///NOTE: This is not a perfect check, but let's revisit is later
            /// if it is a range of ports, add all the ports to the list of managed ports
            // managedPorts.push(
            //     ...Array(toPort - fromPort + 1).fill(0).map((_, idx) => fromPort + idx)
            // );
            managedPorts.push(`${fromPort} - ${toPort}`);
        }
    }
    return {
        managedPorts: managedPorts,
        openPotentialThreatPorts: openPotentialThreatPorts
    };
};
/**
 * Creates multiple instances of EC2Service with different regions
 * @param profile aws profile name
 * @param regions list of regions to create instances for
 */
const initializeRegionalClients = (profile, regions) => {
    const allClients = regions.map(region => {
        return new ec2_service_1.EC2Service(profile, region);
    });
    let instances = {};
    allClients.forEach(client => {
        instances[client.region] = client;
    });
    return {
        clients: allClients,
        toArray: () => {
            return allClients;
        }
    };
};
//# sourceMappingURL=analyzer.js.map