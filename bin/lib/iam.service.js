"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IamService = void 0;
const client_iam_1 = require("@aws-sdk/client-iam");
const credential_providers_1 = require("@aws-sdk/credential-providers");
const chalk_1 = __importDefault(require("chalk"));
const clui_1 = require("clui");
class IamService {
    constructor(profile) {
        this.profile = profile;
        this.init();
    }
    init() {
        this.client = new client_iam_1.IAMClient({
            credentials: (0, credential_providers_1.fromIni)({
                profile: this.profile,
            })
        });
    }
    /**
     * Get all the roles present in the account
     */
    async getAllRoles() {
        try {
            let roles = [];
            const paginator = (0, client_iam_1.paginateListRoles)({ client: this.client }, {});
            for await (const role of paginator) {
                roles = roles.concat(role.Roles);
            }
            return roles;
        }
        catch (error) {
            console.error(chalk_1.default.red(error));
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
                console.log(chalk_1.default.green(`GOT ${policies.length} Policies for Role ${role.RoleName}`));
            }
        }
        catch (error) {
            console.error(chalk_1.default.red(error));
        }
    }
    /**
     * Get all attached policies to a role
     * @param role Role to fetch policies for
     * @returns list of attached policies
     */
    async getAllAttachedRolePolicies(role) {
        let spinner = new clui_1.Spinner(chalk_1.default.blue(`Getting attached policies for role ${role.RoleName}...`));
        try {
            spinner.start();
            let policies = [];
            const paginator = (0, client_iam_1.paginateListAttachedRolePolicies)({ client: this.client }, { RoleName: role.RoleName });
            for await (const policy of paginator) {
                policies = policies.concat(policy.AttachedPolicies);
            }
            let policyDocs = [];
            for (let i = 0; i < policies.length; i++) {
                let doc = await this.getPolicyDocument(policies[i].PolicyArn);
                policyDocs.push({ Name: policies[i].PolicyName, Document: doc, Arn: policies[i].PolicyArn });
            }
            return policyDocs;
        }
        catch (error) {
            console.error(chalk_1.default.red(`Error getting attached policies`));
            console.error(chalk_1.default.red(error));
        }
        finally {
            spinner.stop();
        }
    }
    async getAllPoliciesForRole(role) {
        let spinner = new clui_1.Spinner(chalk_1.default.blue(`Getting policies for role ${role.RoleName}...`));
        try {
            spinner.start();
            let policies = [];
            const paginator = (0, client_iam_1.paginateListRolePolicies)({ client: this.client }, { RoleName: role.RoleName });
            for await (const policy of paginator) {
                policies = policies.concat(policy.PolicyNames);
            }
            let policyDocuments = [];
            for (let i = 0; i < policies.length; i++) {
                let _policy = policies[i];
                let cmd = new client_iam_1.GetRolePolicyCommand({
                    PolicyName: _policy,
                    RoleName: role.RoleName
                });
                let response = await this.client.send(cmd);
                let doc = response.PolicyDocument;
                let policyDocument = {
                    Name: _policy,
                    Document: doc
                };
                policyDocuments.push(policyDocument);
            }
            let attachedPolicies = await this.getAllAttachedRolePolicies(role);
            policyDocuments = policyDocuments.concat(attachedPolicies);
            return policyDocuments;
        }
        catch (error) {
            console.error(chalk_1.default.red(error));
        }
        finally {
            spinner.stop();
        }
    }
    /**
     * Returns a JSON parsed object of the default policy document for the Policy ARN given
     * @param arn ARN of the policy
     * @returns
     */
    async getPolicyDocument(arn) {
        try {
            ///Get all the versions of the policy
            const cmd = new client_iam_1.ListPolicyVersionsCommand({
                PolicyArn: arn
            });
            const res = await this.client.send(cmd);
            let doc;
            for (let i = 0; i < res.Versions.length; i++) {
                ///res.Versions[i].Document can be undefined in most of the cases
                //So we need to get the policy document for each version
                let policyVersionOutput = await this.client.send(new client_iam_1.GetPolicyVersionCommand({
                    PolicyArn: arn,
                    VersionId: res.Versions[i].VersionId
                }));
                if (policyVersionOutput.PolicyVersion.IsDefaultVersion) {
                    doc = policyVersionOutput.PolicyVersion.Document;
                }
            }
            if (!doc) {
                console.error(chalk_1.default.red("Could not find default policy version for " + arn));
            }
            return JSON.parse(decodeURIComponent(doc));
        }
        catch (error) {
            console.error("Error while getting policy " + arn);
            console.error(chalk_1.default.red(error));
        }
    }
    /**
     * Get user details for the given user credentials in constructor
     * @returns
     */
    async getUser() {
        try {
            console.log(chalk_1.default.blue("Getting user..."));
            let response = await this.client.send(new client_iam_1.GetUserCommand({}));
            console.log(chalk_1.default.green("GOT User: " + response.User));
            console.log(response.User);
            return response.User;
        }
        catch (error) {
            console.error(chalk_1.default.red(error));
        }
    }
    async getAllUsers() {
        try {
            console.log(chalk_1.default.blue("Getting all users..."));
            let users = [];
            const paginator = (0, client_iam_1.paginateListUsers)({
                client: this.client
            }, {});
            for await (const u of paginator) {
                users = users.concat(u.Users);
            }
            ;
            return users;
        }
        catch (error) {
            console.error(chalk_1.default.red("Error getting users"));
            console.error(chalk_1.default.red(error));
        }
    }
    /**
     * Gets all policies directly attached or under the user
     * @param user
     * @returns
     */
    async getAllPoliciesUnderUser(user) {
        try {
            let policies = [];
            let userAttachedPolicies = await this._iteratePolicies((marker) => {
                return this.client.send(new client_iam_1.ListAttachedUserPoliciesCommand({
                    UserName: user.UserName,
                    Marker: marker
                }));
            }, "AttachedPolicies");
            for (let i = 0; i < userAttachedPolicies.length; i++) {
                let policy = userAttachedPolicies[i];
                let policyDocument = await this.getPolicyDocument(policy.PolicyArn);
                policy.Document = policyDocument;
            }
            let userPolicies = await this._iteratePolicies((marker) => {
                return this.client.send(new client_iam_1.ListUserPoliciesCommand({
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
                    };
                }
                policies.push(policy);
            }
            policies.push(...userAttachedPolicies);
            return policies;
        }
        catch (error) {
            console.error(chalk_1.default.red("Error getting policies for user"));
            console.error(chalk_1.default.red(error));
        }
    }
    async getGroupInlinePolicy(groupName, policyName) {
        try {
            let response = await this.client.send(new client_iam_1.GetGroupPolicyCommand({
                GroupName: groupName,
                PolicyName: policyName
            }));
            return response.PolicyDocument;
        }
        catch (error) {
            console.log(error);
        }
    }
    /**
     * Get details about inline policy for a user
     * @param user
     * @param policyName
     * @returns
     */
    async getUserInlinePolicy(user, policyName) {
        try {
            let response = await this.client.send(new client_iam_1.GetUserPolicyCommand({
                UserName: user.UserName,
                PolicyName: policyName
            }));
            return response.PolicyDocument;
        }
        catch (error) {
            console.error(chalk_1.default.red("Error getting inline policy for user"));
            console.error(chalk_1.default.red(error));
        }
    }
    /**
     * Get all policies attached to groups for a user
     * @param user
     * @returns
     */
    async getAllPoliciesForUserGroups(user) {
        try {
            let policies = [];
            let groups = await this.client.send(new client_iam_1.ListGroupsForUserCommand({
                UserName: user.UserName
            }));
            for (let i = 0; i < groups.Groups.length; i++) {
                let group = groups.Groups[i];
                let groupPolicies = await this._iteratePolicies((marker) => {
                    return this.client.send(new client_iam_1.ListGroupPoliciesCommand({
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
                let groupAttachedPolicies = await this._iteratePolicies((marker) => {
                    return this.client.send(new client_iam_1.ListAttachedGroupPoliciesCommand({
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
        }
        catch (error) {
            console.error(chalk_1.default.red("Error getting policies for user groups"));
            console.error(chalk_1.default.red(error));
        }
    }
    /**
     * Paginates through a list of policies, sends multiple requests to aws if necessary
     * @param getterFunction  The function to call to get the next page of policies
     * @param property property to iterate over
     * @returns
     */
    async _iteratePolicies(getterFunction, property) {
        try {
            let policies = [];
            let response;
            do {
                response = await getterFunction(response === null || response === void 0 ? void 0 : response.Marker);
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
        }
        catch (error) {
            console.log(error);
            console.error(chalk_1.default.red(error));
        }
    }
    /**
     * Gets all policies applied to a user,
     * through groups, attached to roles, and attached to the user
     * @param user
     */
    async listAllPoliciesForUser(user) {
        let spinner = new clui_1.Spinner(chalk_1.default.blue(`Getting policies for user ${user.UserName}...`));
        try {
            spinner.start();
            let totalPolicies = [];
            let userPolicies = await this.getAllPoliciesUnderUser(user);
            totalPolicies.push(...userPolicies);
            let groupPolicies = await this.getAllPoliciesForUserGroups(user);
            totalPolicies.push(...groupPolicies);
            console.log(chalk_1.default.green("GOT " + totalPolicies.length + " Policies"));
            return totalPolicies;
        }
        catch (error) {
            console.error(chalk_1.default.red(error));
            throw error;
        }
        finally {
            spinner.stop();
        }
    }
}
exports.IamService = IamService;
//# sourceMappingURL=iam.service.js.map