const azure = require("ms-rest-azure");
const fse = require("fs-extra");
const os = require("os");
const path = require("path");
const { generateUuid } = azure;
const { env } = process;

const CONFIG_DIRECTORY = path.join(os.homedir(), ".azure");
const CONTRIBUTOR_ROLE_ID = "b24988ac-6180-42a0-ab88-20f7382dd24c";
const INTERACTIVE_LOGIN_URL = "https://aka.ms/devicelogin";

const AZ_CLI_PROFILE_FILE = path.join(CONFIG_DIRECTORY, "azureProfile.json");
const SERVICE_PRINCIPAL_FILE = path.join(CONFIG_DIRECTORY, "azloginServicePrincipal.json");

const DEFAULT_INTERACTIVE_LOGIN_HANDLER = (code) => {
    console.log("Paste the auth code (that was copied to your clipboard!) into the launched browser, and complete the login process.");
};

function authenticate({ clientId = env.azureServicePrincipalClientId || env.ARM_CLIENT_ID,
                        clientSecret = env.azureServicePrincipalPassword || env.ARM_CLIENT_SECRET,
                        tenantId = env.azureServicePrincipalTenantId || env.ARM_TENANT_ID,
                        interactiveLoginHandler = DEFAULT_INTERACTIVE_LOGIN_HANDLER }) {
    return new Promise((resolve, reject) => {
        let interactive = false;

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
            interactive = true;

            const userCodeResponseLogger = (message) => {
                const [code] = message.match(/[A-Z0-9]{9,}/);
                require("copy-paste").copy(code);

                interactiveLoginHandler(code);

                require("opn")(INTERACTIVE_LOGIN_URL, { wait: false });
            };

            azure.interactiveLogin({ userCodeResponseLogger }, resolvePromise);
        }

        function resolvePromise(error, credentials, subscriptions) {
            resolve({ credentials, subscriptions, interactive });
        }
    });
}

function createServicePrincipal(credentials, tenantId, subscriptionId) {    
    return new Promise((resolve, reject) => {
        const authorization = require("azure-arm-authorization");
        const graph = require("azure-graph");   
        const moment = require("moment"); 

        const credentialOptions = {
            domain: tenantId,
            tokenAudience: "graph",
            username: credentials.username,
            tokenCache: credentials.tokenCache,
            environment: credentials.environment
        };

        const graphCredentials = new azure.DeviceTokenCredentials(credentialOptions);
        const graphClient = new graph(graphCredentials, tenantId);

        const servicePrincipalName = `http://${generateUuid()}`;
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
                const scope = `subscriptions/${subscriptionId}`;
                const roleDefinitionId = `${scope}/providers/Microsoft.Authorization/roleDefinitions/${CONTRIBUTOR_ROLE_ID}`;

                const roleAssignmentOptions = {
                    properties: {
                        principalId: sp.objectId,
                        roleDefinitionId,
                        scope
                    }
                };

                !function createRoleAssignment() { 
                    roleAssignments.create(scope, generateUuid(), roleAssignmentOptions).then(() => {
                        fse.writeJSONSync(SERVICE_PRINCIPAL_FILE, { id: sp.appId, secret: servicePrincipalPassword, tenantId });
                        resolve();
                    }).catch(() => {
                        // This can fail due to the SP not having
                        // be fully created yet, so try again.
                        setTimeout(createRoleAssignment, 1000);
                    })
                }();
            });
        });
    });
};

function promptForSubscription(subscriptions) {
    const inquirer = require("inquirer");

    return inquirer.prompt([{
        name: "subscriptionId",
        message: "Select the Azure subscription you would like to use",
        type: "list",
        choices: subscriptions.map(({ name, value = id }) => {
            return { name, value };
        })
    }]).then((answers) => {
        return subscriptions.find(({ id }) => id === answers.subscriptionId);
    });
}

function resolveSubscription(subscriptions, subscriptionId = env.azureSubId || env.ARM_SUBSCRIPTION_ID, subscriptionResolver) {
    if (subscriptionId) {
        return promiseForSubscription(subscriptionId);
    }
    
    switch (subscriptions.length) {
        case 0:
            return Promise.reject(new Error("There aren't any subscriptions associated with this Azure account"));
        
        case 1:
            return Promise.resolve(subscriptions[0]);

        default:
            if (fse.existsSync(AZ_CLI_PROFILE_FILE)) {
                try {
                    const profile = fse.readJsonSync(AZ_CLI_PROFILE_FILE);
                    return promiseForSubscription(profile.subscriptions.find((sub) => sub.isDefault).id);
                } catch (error) {
                    return Promise.reject(error);
                }
            } else if (subscriptionResolver) {
                return subscriptionResolver(subscriptions);
            } else {
                return Promise.reject(new Error("This Azure account has multiple subscriptions, and there's no way to resolve which one to use"));
            }
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

exports.login = ({ clientId, clientSecret, tenantId, subscriptionId, interactiveLoginHandler, subscriptionResolver } = {}) => {
    let state;

    return authenticate({ clientId, clientSecret, tenantId, interactiveLoginHandler }).then(({ credentials, interactive, subscriptions }) => {
        const accessToken = credentials.tokenCache._entries[0].accessToken;

        state = {
            accessToken,
            credentials,
            interactive
        };

        // If the consuming app is using request, that return a specialized
        // version of it, that comes pre-configured with the right bearer
        // token to begin making Azure REST API calls with.
        if (require.resolve("request")) {
            state.request = require("request").defaults({
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
        }

        if (!subscriptionResolver && process.stdout.isTTY) {
            subscriptionResolver = promptForSubscription;
        }

        return resolveSubscription(subscriptions, subscriptionId, subscriptionResolver);
    }).then(({ id, tenantId }) => {
        state.subscriptionId = id;
        state.clientFactory = (clientConstructor) => Reflect.construct(clientConstructor, [state.credentials, id]);

        if (state.interactive) {
            return createServicePrincipal(state.credentials, tenantId, id);
        }
    }).then(() => { return state; });
};

exports.logout = () => {
    return new Promise((resolve, reject) => {
        fse.exists(SERVICE_PRINCIPAL_FILE, (exists) => {
            if (!exists) {
                return resolve(false);
            }

            fse.unlink(SERVICE_PRINCIPAL_FILE, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(true);
                }
            });
        })
    });
};