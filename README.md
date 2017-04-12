# az-login

Provides a simple way to add Azure authentication to a Node.js app. It is meant to compliment the already awesome [Azure SDK for Node](https://github.com/Azure/azure-sdk-for-node) (which provides the actual client APIs for managing Azure resources), by means of an opinionated login experience.

## Getting Started

In order to install the `az-login` module, simply run the following command within your app's directory:

```shell
npm i --save az-login
```

From within your app code, import the `login` method and simply call it:

```javascript
const { login } = require("az-login");
const { credentials, subscriptionId } = await login();

// Use the credentials and subscription ID... (see below)
```

This will result in a "device code" being copied to your clipboard, and a browser being launched, which allows you (or your end-users) to interactively authenticate with Azure. Once the login is complete, an Azure "service principal" is auto-created and persisted to disk, so that subsequent calls to `login` won't require re-authenticating. This allows your own apps to behave similarly to tools such as the [Az CLI](https://github.com/azure/azure-cli), without too much effort.

The credentials and subscription ID that are returned from the `login` call can then be passed to any of the management clients within the Azure SDK, in order to begin provisioning and/or modifying resources. It's that simple!

```javascript
// After having logged in above...

const { ResourceManagementClient } = require("azure-arm-resource");
const { resourceGroups } = new ResourceManagementClient(credentials, subscriptionId); 
const result = await resourceGroups.createOrUpdate("MyResourceGroup", { location: "WestUS" });
```

For more details on how `login` works, including how it auto-selects a subscription ID for accounts with multiple, refer to [reference details](#login) below.

If at some later point, you'd like to clear the local auth state from the current machine (e.g. in response to a `Logout` command), you can import and call the `logout` method:

```javascript
const { logout } = require("az-login");
await logout();
```

## API Reference

The `az-login` module exports the following methods:

* [login](#login)
* [logout](#logout)

### login

```javascript
login(options? : LoginOptions): Promise<LoginResult>
```

#### LoginOptions

While the primary use case of the `login` method is to call it without any arguments, it takes an optional config object, that allows one or more of the following properties to be specified on it:

* *clientId* - The ID/username of the service principal that should be used to authenticate with Azure.

* *clientSecret* - The password/secret of the service principal that should be used to authenticate with Azure.

* *subscriptionId* - The ID of the subscription that should be auto-selected for managing the Azure account. Setting this "disables" the logic for attempting to resolve a subscription ID automatically and/or prompting the user for a seelction.

* *tenantId* - The ID of the Active Directory tenant that the specified service principal is defined within.

#### LoginResult

After the authentication process is successfully completed, the `Promise` returned by the `login` method will resolve with an object that includes the following properties:

* *accessToken* - A "raw" access token that can be added to REST API calls directly to Azure and/or Kudu (the App Service "control plane"). This is only for advanced use cases, and unless you have a good reason to, you should likely use the `credentials` instead.

* *credentials* - Provides the opaque credentials that represent the succesful authentication session, and can be provided directly to any management client constructor within the Azure SDK. See the [Getting Started](#getting-started) section for a sample of how this is used.

* *subscriptionId* - The ID of the subscription that has been selected for this account as part of the login process. This value can be provided directly to any management client constructor within the Azure SDK, which will dictate which subscription (if the authenticated account has more than one) will be the target of any management operations (e.g. create a resource group). See the [Getting Started](#getting-started) section for a sample of how this is used.

### logout

```javascript
logout(): Promise<void>
```

The `logout` method simply deletes the service principal identity that is persisted to disk after a successful call to `login`. If you explicitly create and specify a custom service prinicipal (via `login` args or env vars), then calling `logout` will simply no-op (but won't fail), since the corresponding call to `login` didn't actually create/persist a service prinicpal that needs to be removed.