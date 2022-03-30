import {
    AttachedPolicy, GetGroupPolicyCommand, GetPolicyCommand, GetPolicyVersionCommand, GetRolePolicyCommand, GetUserCommand,
    GetUserPolicyCommand, IAMClient, ListAttachedGroupPoliciesCommand, ListAttachedUserPoliciesCommand,
    ListGroupPoliciesCommand, ListGroupsForUserCommand, ListPolicyVersionsCommand, ListRolesCommand, ListUserPoliciesCommand,
    paginateListAttachedRolePolicies,
    paginateListRolePolicies,
    paginateListRoles,
    paginateListUsers,
    PolicyDetail,
    Role,
    User
} from "@aws-sdk/client-iam";
import { fromIni } from "@aws-sdk/credential-providers";
import chalk from "chalk";
import { Spinner } from "clui";

export type AttachedPolicyWithDocument = AttachedPolicy & { Document: string };

export type PolicyWithDocument = {
    Document: any,
    PolicyName: string,
    PolicyArn?: string,
}

export class IamService {
    profile: string;

    client: IAMClient;

    constructor(profile: string) {
        this.profile = profile;
        this.init();

    }

    init() {
        this.client = new IAMClient({
            credentials: fromIni({
                profile: this.profile,
            })
        });
    }

    /**
     * Get all the roles present in the account
     */
    async getAllRoles() {
        try {
            let roles: Role[] = [];
            const paginator = paginateListRoles({ client: this.client }, {});

            for await (const role of paginator) {
                roles = roles.concat(role.Roles);
            }

            return roles;
        } catch (error) {
            console.error(chalk.red(error));
        }
    }

    /**
     *Get all the policies attached to a role
     */
    async getAllRolesWithPolicies() {
        try {
            let roles = await this.getAllRoles();

            for (let i = 0; i < roles.length; i++) {
                let role = roles[i];
                let policies = await this.getAllAttachedRolePolicies(role);
                console.log(chalk.green(`GOT ${policies.length} Policies for Role ${role.RoleName}`));
            }

        } catch (error) {
            console.error(chalk.red(error));
        }
    }

    /**
     * Get all attached policies to a role
     * @param role Role to fetch policies for 
     * @returns list of attached policies
     */
    async getAllAttachedRolePolicies(role: Role): Promise<PolicyWithDocument[]> {
        let spinner = new Spinner(chalk.blue(`Getting attached policies for role ${role.RoleName}...`));
        try {
            spinner.start();
            let policies: AttachedPolicy[] = [];

            const paginator = paginateListAttachedRolePolicies({ client: this.client }, { RoleName: role.RoleName });

            for await (const policy of paginator) {
                policies = policies.concat(policy.AttachedPolicies);
            }
            let policyDocs: PolicyWithDocument[] = [];
            for (let i = 0; i < policies.length; i++) {
                let doc = await this.getPolicyDocument(policies[i].PolicyArn);
                policyDocs.push({ PolicyName: policies[i].PolicyName, Document: doc, PolicyArn: policies[i].PolicyArn });
            }

            return policyDocs;
        } catch (error) {
            console.error(chalk.red(`Error getting attached policies`));
            console.error(chalk.red(error));
        } finally {
            spinner.stop();
        }
    }

    async getAllPoliciesForRole(role: Role): Promise<PolicyWithDocument[]> {
        let spinner = new Spinner(chalk.blue(`Getting policies for role ${role.RoleName}...`));
        try {
            spinner.start();
            let policies: string[] = [];
            const paginator = paginateListRolePolicies({ client: this.client }, { RoleName: role.RoleName });

            for await (const policy of paginator) {
                policies = policies.concat(policy.PolicyNames);
            }

            let policyDocuments: PolicyWithDocument[] = [];
            for (let i = 0; i < policies.length; i++) {
                let _policy = policies[i];
                let cmd = new GetRolePolicyCommand({
                    PolicyName: _policy,
                    RoleName: role.RoleName
                });

                let response = await this.client.send(cmd);
                let doc = response.PolicyDocument;

                let policyDocument: PolicyWithDocument = {
                    PolicyName: _policy,
                    Document: doc
                };

                policyDocuments.push(policyDocument);
            }

            let attachedPolicies = await this.getAllAttachedRolePolicies(role);

            policyDocuments = policyDocuments.concat(attachedPolicies);

            return policyDocuments;
        } catch (error) {
            console.error(chalk.red(error));
        } finally {
            spinner.stop();
        }
    }

    /**
     * Returns a JSON parsed object of the default policy document for the Policy ARN given
     * @param arn ARN of the policy
     * @returns 
     */
    async getPolicyDocument(arn: string) {
        try {
            ///Get all the versions of the policy
            const cmd = new ListPolicyVersionsCommand({
                PolicyArn: arn
            });

            const res = await this.client.send(cmd);

            let doc;

            for (let i = 0; i < res.Versions.length; i++) {
                ///res.Versions[i].Document can be undefined in most of the cases
                //So we need to get the policy document for each version
                let policyVersionOutput = await this.client.send(new GetPolicyVersionCommand({
                    PolicyArn: arn,
                    VersionId: res.Versions[i].VersionId
                }));

                if (policyVersionOutput.PolicyVersion.IsDefaultVersion) {
                    doc = policyVersionOutput.PolicyVersion.Document;
                }
            }
            if (!doc) {
                console.error(chalk.red("Could not find default policy version for " + arn));
            }

            return JSON.parse(decodeURIComponent(doc));
        } catch (error) {
            console.error("Error while getting policy " + arn);
            console.error(chalk.red(error));
        }
    }

    /**
     * Get user details for the given user credentials in constructor
     * @returns 
     */
    async getUser() {
        try {
            console.log(chalk.blue("Getting user..."));
            let response = await this.client.send(new GetUserCommand({}));
            console.log(chalk.green("GOT User: " + response.User));
            console.log(response.User);

            return response.User;
        } catch (error) {
            console.error(chalk.red(error));
        }
    }

    async getAllUsers() {
        try {
            console.log(chalk.blue("Getting all users..."));

            let users: User[] = [];

            const paginator = paginateListUsers({
                client: this.client
            }, {});

            for await (const u of paginator) {
                users = users.concat(u.Users);
            };

            return users;
        } catch (error) {
            console.error(chalk.red("Error getting users"));
            console.error(chalk.red(error));
        }
    }


    /**
     * Gets all policies directly attached or under the user
     * @param user 
     * @returns 
     */
    async getAllPoliciesUnderUser(user: User) {
        try {
            let policies = [];

            let userAttachedPolicies = await this._iteratePolicies((marker: string) => {
                return this.client.send(new ListAttachedUserPoliciesCommand({
                    UserName: user.UserName,
                    Marker: marker
                }));
            }, "AttachedPolicies");

            for (let i = 0; i < userAttachedPolicies.length; i++) {
                let policy: AttachedPolicyWithDocument = userAttachedPolicies[i];
                let policyDocument = await this.getPolicyDocument(policy.PolicyArn);
                policy.Document = policyDocument;
            }

            let userPolicies = await this._iteratePolicies((marker: string) => {
                return this.client.send(new ListUserPoliciesCommand({
                    UserName: user.UserName,
                    Marker: marker
                }));
            }, "PolicyNames");

            for (let i = 0; i < userPolicies.length; i++) {
                let policy = userPolicies[i];
                let document = await this.getUserInlinePolicy(user, policy);
                console.log("POLICY DOCUMENT FOR ", policy);
                console.log(JSON.parse(decodeURIComponent(document.toString())));

                if (document) {
                    policy = {
                        PolicyName: policy,
                        Document: JSON.parse(decodeURIComponent(document))
                    }
                }

                policies.push(policy);
            }

            policies.push(...userAttachedPolicies);

            return policies;
        } catch (error) {
            console.error(chalk.red("Error getting policies for user"));
            console.error(chalk.red(error));
        }
    }

    async getGroupInlinePolicy(groupName: string, policyName: string) {
        try {
            let response = await this.client.send(new GetGroupPolicyCommand({
                GroupName: groupName,
                PolicyName: policyName
            }));

            return response.PolicyDocument;
        } catch (error) {
            console.log(error);
        }
    }

    /**
     * Get details about inline policy for a user
     * @param user 
     * @param policyName 
     * @returns 
     */
    async getUserInlinePolicy(user: User, policyName: string) {
        try {
            let response = await this.client.send(new GetUserPolicyCommand({
                UserName: user.UserName,
                PolicyName: policyName
            }));

            return response.PolicyDocument;
        } catch (error) {
            console.error(chalk.red("Error getting inline policy for user"));
            console.error(chalk.red(error));
        }
    }

    /**
     * Get all policies attached to groups for a user
     * @param user 
     * @returns 
     */
    async getAllPoliciesForUserGroups(user: User) {
        try {
            let policies = [];
            let groups = await this.client.send(new ListGroupsForUserCommand({
                UserName: user.UserName
            }));

            for (let i = 0; i < groups.Groups.length; i++) {
                let group = groups.Groups[i];
                let groupPolicies = await this._iteratePolicies((marker: string) => {
                    return this.client.send(new ListGroupPoliciesCommand({
                        GroupName: group.GroupName,
                        Marker: marker
                    }));
                }, "PolicyNames");

                for (let i = 0; i < groupPolicies.length; i++) {
                    let policy = groupPolicies[i];
                    let document = await this.getGroupInlinePolicy(group.GroupName, policy);
                    console.log("POLICY DOCUMENT FOR ", policy);
                    console.log(JSON.parse(decodeURIComponent(document.toString())));

                    if (document) {
                        policies.push({
                            Policy: policy,
                            Document: JSON.parse(decodeURIComponent(document))
                        });
                    }
                }

                let groupAttachedPolicies = await this._iteratePolicies((marker: string) => {
                    return this.client.send(new ListAttachedGroupPoliciesCommand({
                        GroupName: group.GroupName,
                        Marker: marker
                    }));
                }, "AttachedPolicies");

                for (let i = 0; i < groupAttachedPolicies.length; i++) {
                    let policy = groupAttachedPolicies[i];
                    let policyDocument = await this.getPolicyDocument(policy.PolicyArn);
                    policy.Document = policyDocument;
                }

                policies.push(...groupAttachedPolicies);
            }

            return policies;
        } catch (error) {
            console.error(chalk.red("Error getting policies for user groups"));
            console.error(chalk.red(error));
        }
    }

    /**
     * Paginates through a list of policies, sends multiple requests to aws if necessary
     * @param getterFunction  The function to call to get the next page of policies
     * @param property property to iterate over
     * @returns 
     */
    async _iteratePolicies(getterFunction: (marker: string) => any, property: string): Promise<any> {
        try {
            let policies = [];
            let response: any;
            do {
                response = await getterFunction(response?.Marker);

                if (response[property].length > 0) {
                    for (let i = 0; i < response[property].length; i++) {
                        if (property.toLowerCase() == 'policynames') {
                            console.log(response);
                        }
                        let policy = response[property][i];
                        policies.push(policy);
                    }
                }
            } while (response.Marker);

            return policies;
        } catch (error) {
            console.log(error);
            console.error(chalk.red(error));
        }
    }

    /**
     * Gets all policies applied to a user,
     * through groups, attached to roles, and attached to the user
     * @param user 
     */
    async listAllPoliciesForUser(user: User) {
        let spinner = new Spinner(chalk.blue(`Getting policies for user ${user.UserName}...`));
        try {
            spinner.start();
            let totalPolicies = [];

            let userPolicies = await this.getAllPoliciesUnderUser(user);

            totalPolicies.push(...userPolicies);

            let groupPolicies = await this.getAllPoliciesForUserGroups(user);

            totalPolicies.push(...groupPolicies);

            console.log(chalk.green("GOT " + totalPolicies.length + " Policies"));

            return totalPolicies;
        } catch (error) {
            console.error(chalk.red(error));
            throw error;
        } finally {
            spinner.stop();
        }
    }
}