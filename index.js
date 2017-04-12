const azure = require("ms-rest-azure");
const fse = require("fs-extra");
const os = require("os");
const path = require("path");
const { generateUuid } = azure;

const CONFIG_DIRECTORY = path.join(os.homedir(), ".azure");
const CONTRIBUTOR_ROLE_ID = "b24988ac-6180-42a0-ab88-20f7382dd24c";

const AZ_CLI_PROFILE_FILE = path.join(CONFIG_DIRECTORY, "azureProfile.json");
const SERVICE_PRINCIPAL_FILE = path.join(CONFIG_DIRECTORY, "azloginServicePrincipal.json");

function authenticate(explicitClientId, explicitClientSecret, explicitTenantId) {
    return new Promise((resolve, reject) => {
        let interactive = false;

        // Support the same env vars that the Serverless (azure*) and Terraform (ARM*) CLIs expect
        const clientId = explicitClientId || process.env.azureServicePrincipalClientId || process.env.ARM_CLIENT_ID;
        const clientSecret = explicitClientSecret || process.env.azureServicePrincipalPassword || process.env.ARM_CLIENT_SECRET;
        const tenantId = explicitTenantId || process.env.azureServicePrincipalTenantId || process.env.ARM_TENANT_ID;

        if (clientId && clientSecret && tenantId) {
            try {
                azure.loginWithServicePrincipalSecret(clientId, clientSecret, tenantId, resolvePromise);
            } catch (error) {
                reject(new Error("The specified Azure credentials don't appear to be valid. Please check them and try authenticating again"));
            }
        } else {
            if (fse.existsSync(SERVICE_PRINCIPAL_FILE)) {                
                const { id, secret, tenantId } = fse.readJSONSync(SERVICE_PRINCIPAL_FILE);  

                try {     
                    azure.loginWithServicePrincipalSecret(id, secret, tenantId, resolvePromise); 
                } catch (error) {
                    // The SP is either invalid or expired, but since the end-user doesn't
                    // know about this file, let's simply delete it and move on to interactive auth.
                    fse.removeSync(SERVICE_PRINCIPAL_FILE);
                    loginInteractively();
                }
            } else {
                loginInteractively();
            }
        }
        
        function loginInteractively() {
            const userCodeResponseLogger = (message) => {
                const [code] = message.match(/[A-Z0-9]{7,}/);
                require("copy-paste").copy(code);

                console.log(message);
                require("opn")("https://aka.ms/devicelogin");
            };

            interactive = true;
            azure.interactiveLogin({ userCodeResponseLogger }, resolvePromise);
        }

        function resolvePromise(error, credentials, subscriptions) {
            resolve({ credentials, subscriptions, interactive });
        }
    });
}

function createServicePrincipal(credentials, tenantId, subscriptionId) {
    const authorization = require("azure-arm-authorization");
    const graph = require("azure-graph");   
    const moment = require("moment"); 
    
    return new Promise((resolve, reject) => {
        const credentialOptions = {
            domain: tenantId,
            tokenAudience: "graph",
            username: credentials.username,
            tokenCache: credentials.tokenCache,
            environment: credentials.environment
        };

        const graphCredentials = new azure.DeviceTokenCredentials(credentialOptions);
        const graphClient = new graph(graphCredentials, tenantId);

        const servicePrincipalName = `http://${generateUuid()}.azlogin`;
        const servicePrincipalPassword = generateUuid();
        
        const applicationOptions = {
            availableToOtherTenants: false,
            displayName: "az-login",
            homepage: servicePrincipalName,
            identifierUris: [servicePrincipalName],
            passwordCredentials: [{
                startDate: moment().toISOString(),
                endDate: moment().add(1, "month").toISOString(),
                keyId: generateUuid(),
                value: servicePrincipalPassword
            }]
        };

        graphClient.applications.create(applicationOptions, (error, app) => {
            if (error) {
                return reject(error);
            }

            const servicePrincipalOptions = {
                appId: app.appId,
                accountEnabled: true
            };

            graphClient.servicePrincipals.create(servicePrincipalOptions, (error, sp) => {
                if (error) {
                    return reject(error);
                }

                const { roleAssignments } = new authorization(credentials, subscriptionId);
                const scope = `/subscriptions/${subscriptionId}`;
                const roleDefinitionId = `${scope}/providers/Microsoft.Authorization/roleDefinitions/${CONTRIBUTOR_ROLE_ID}`;

                const roleAssignmentOptions = {
                    properties: {
                        principalId: sp.objectId,
                        roleDefinitionId,
                        scope
                    }
                };

                roleAssignments.create(scope, generateUuid(), roleAssignmentOptions, (error) => {
                    if (error) { 
                        return reject(error);
                    }
                    
                    fse.writeJSONSync(SERVICE_PRINCIPAL_FILE, { id: sp.appId, secret: servicePrincipalPassword, tenantId });
                    resolve();
                });
            });
        });
    });
};

function promptForSubscriptionInternal(subscriptions) {
    const inquirer = require("inquirer");

    return inquirer.prompt([{
        name: "subscriptionId",
        message: "Select the Azure subscription you would like to use",
        type: "list",
        choices: subscriptions.map(({ name, id }) => {
            return { name, value: id };
        })
    }]).then((answers) => {
        return subscriptions.find(({ id }) => id === answers.subscriptionId);
    });
}

function selectSubscription(subscriptions, subscriptionId, promptForSubscription) {
    if (subscriptionId) {
        return promiseForSubscription(subscriptionId);
    }
    
    switch (subscriptions.length) {
        case 0:
            return Promise.reject(new Error("There aren't any subscriptions associated with this Azure account"));
        
        case 1:
            return Promise.resolve(subscriptions[0]);

        default:
            let subscriptionId = process.env.azureSubId || process.env.ARM_SUBSCRIPTION_ID;
            
            if (subscriptionId) {
                return promiseForSubscription(subscriptionId);
            } else {
                if (fse.existsSync(AZ_CLI_PROFILE_FILE)) {
                    try {
                        const profile = fse.readJsonSync(AZ_CLI_PROFILE_FILE);
                        return promiseForSubscription(profile.subscriptions.find((sub) => sub.isDefault).id);
                    } catch (error) {
                        return Promise.reject(error);
                    }
                } else {
                    return promptForSubscription(subscriptions);
                }
            };
    }

    function promiseForSubscription(subscriptionId) {
        const subscription = subscriptions.find((sub) => sub.id === subscriptionId);
        if (subscription) {
            return Promise.resolve(subscription);
        } else {
            return Promise.reject(new Error(`The specified subscription ID isn't associated with your Azure account: ${subscriptionId}`));
        };
    }
}

exports.login = ({ clientId, clientSecret, tenantId, subscriptionId, promptForSubscription = promptForSubscriptionInternal } = {}) => {
    let state = {};

    return authenticate(clientId, clientSecret, tenantId).then(({ credentials, interactive, subscriptions }) => {
        state.credentials = credentials;
        state.interactive = interactive;

        return selectSubscription(subscriptions, subscriptionId, promptForSubscription);
    }).then(({ id, tenantId }) => {
        state.subscriptionId = id;

        if (state.interactive) {
            return createServicePrincipal(state.credentials, tenantId, id);
        } else {
            return Promise.resolve();
        }
    }).then(() => {
        return {
            accessToken: state.credentials.tokenCache._entries[0],
            credentials: state.credentials,
            subscriptionId: state.subscriptionId
        };
    });
};

exports.logout = () => {
    return new Promise((resolve, reject) => {
        fse.exists(SERVICE_PRINCIPAL_FILE, (exists) => {
            if (!exists) {
                return resolve();
            }

            fse.unlink(SERVICE_PRINCIPAL_FILE, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        })
    });
};