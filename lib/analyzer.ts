import {
    Instance, Reservation, SecurityGroup
} from "@aws-sdk/client-ec2";
import chalk from "chalk";
import { EC2Service, ManagedVPC } from "./ec2.service";
import { cacheExists, loadCache, saveCache } from "./files";
import { isBetweenNumbers } from "./utils/utils";

const CACHE_FILE_NAME = "ec2-data.json";

/**
 * Analyze ec2 for a given profile
 * @param profile  aws profile name
 * @param refreshCache if true, will refresh the cache, else use the cache for the given profile
 * 
 */
export const analyze = async (profile: string, regions: string[], refreshCache: boolean) => {
    const { clients, toArray } = initializeRegionalClients(profile, regions);

    let regionEC2DetailsMap: {
        [name: string]: {
            instances: Instance[],
            reservations: Reservation[],
            VPCs: ManagedVPC[],
            instanceIDSecurityGroupsMap: { [instanceId: string]: SecurityGroup[] }
        }
    } = {}

    let _cacheExists = await cacheExists(CACHE_FILE_NAME, profile);

    // if cache exists and refreshCache is false, use cache
    if (_cacheExists && !refreshCache) {
        console.log(chalk.yellow("Cache found, Using cached data"));
        const cache = await loadCache(CACHE_FILE_NAME, profile);
        regionEC2DetailsMap = {
            ...cache
        };
    }
    else {
        //Else fetch data from all regions
        console.log(chalk.yellow("Refreshing Data..."));

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

            } catch (error) {
                console.log(chalk.red(error));
            }
        }
        console.log(chalk.green('Fetched EC2 data for all regions'));

        await saveCache(CACHE_FILE_NAME, regionEC2DetailsMap, profile);
        console.log(chalk.yellow(`Saved EC2 data to cache`));
    }

    let analyzedRegionalData = {};

    Object.keys(regionEC2DetailsMap)
        .forEach(region => {
            _analyzeRegionData(region, regionEC2DetailsMap[region]);
        });
}

/**
 * Analyze one particular region
 * @param region 
 * @param regionDetailsMap 
 */
const _analyzeRegionData = (region: string,
    regionDetailsMap: {
        instances: Instance[];
        reservations: Reservation[];
        VPCs: ManagedVPC[];
        instanceIDSecurityGroupsMap: { [instanceId: string]: SecurityGroup[] }
    }) => {
    const { instances, reservations, VPCs, instanceIDSecurityGroupsMap } = regionDetailsMap;

    console.log(chalk.cyan(`Analyzing EC2 data for region - `), chalk.bgGray(`${region}`));
    console.log(chalk.yellow(`Found ${instances.length} instance(s)`));
    console.log(chalk.yellow(`Found ${VPCs.length} VPC(s)`));

    for (let i = 0; i < instances.length; i++) {
        let instance = instances[i];
        console.log(chalk.cyan(`Instance ${instance.InstanceId} has ${instance.SecurityGroups.length} security group(s)`));
        let SGs = instanceIDSecurityGroupsMap[instance.InstanceId];

        let { portSecurityGroupsMap } = _analyzeSecurityGroups(SGs);
    }

    //Analyze VPCs found in the region
    for (let i = 0; i < VPCs.length; i++) {
        let vpc = VPCs[i];

        if (!vpc.FlowLogs || vpc.FlowLogs.length === 0) {
            console.log(chalk.yellow(`VPC ${vpc.VpcId} doesn't seem to have flow logs enabled`));
            console.log(chalk.yellow(`Enable flow logs for better analysis of yur incoming/outgoing traffic`));
        }
    }

    console.log('\n');
}

//Analylze security groups
const _analyzeSecurityGroups = (SGs: SecurityGroup[]) => {

    //Map of all security groups for a port
    let portSGsMap = {};
    let totalOpenPotentialThreatPorts = [];
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
                console.log(chalk.yellow(`Port ${port} is managed by multiple (${sgs.length}) security group(s)`));
                console.log(chalk.yellow(`Security groups:`));
                sgs.forEach(sg => {
                    console.log(chalk.yellow(`${sg.GroupName}`));
                });
            }
        });

    return {
        portSecurityGroupsMap: portSGsMap
    }
}

/**
 * Analyze a single security group
 * @param sg Security group to analyze
 * @returns 
 */
const _analyzeSecurityGroup = (sg: SecurityGroup) => {
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
            .map(c => c.CidrIp).includes('0.0.0.0/0')


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
            potentialThreatPorts.filter((x) => isBetweenNumbers(x, fromPort, toPort)).length > 0;

        if (allPortsOpen && isPotentialThreat) {
            console.log(chalk.red(`Security Group ${sg.GroupName} has ${isOnePort ? 'port' : 'ports'} ${fromPort}-${toPort} open to the world`));

            if (isOnePort) {
                openPotentialThreatPorts.push(fromPort);
            } else {
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
}

/**
 * Creates multiple instances of EC2Service with different regions
 * @param profile aws profile name
 * @param regions list of regions to create instances for
 */
const initializeRegionalClients = (profile: string, regions: string[]) => {
    const allClients = regions.map(region => {
        return new EC2Service(profile, region);
    });

    let instances: { [name: string]: EC2Service } = {};

    allClients.forEach(client => {
        instances[client.region] = client;
    });

    return {
        clients: allClients,
        toArray: () => {
            return allClients;
        }
    }
}