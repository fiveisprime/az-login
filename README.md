# az-login

Provides a simple way to add Azure authentication to Node.js apps. It is meant to compliment the already awesome [Azure SDK for Node](https://github.com/Azure/azure-sdk-for-node), which provides the actual client APIs for managing Azure resources, once you've authenticated.

## Getting Started

In order to install the az-login` module, simply run the following command within your app directory:

```shell
npm i --save az-login
```

From within your app code, import the `login` method and simply call it:

```javascript
const { login } = require("az-login");
const { credentials, subscriptionId } = await login();

// ... Use the credentials and subscription ID
```

This will result in a "device code" being copied to your clipboard, and a browser being launched, which allows you (or your end-users) to interactively authenticate with Azure. Once the login is complete, an Azure "service principal" is auto-created, and persisted to disk, so that subsequent calls to `login` won't require re-authenticating. This allows your own apps to behave similarly to tools such as the [Az CLI](https://github.com/azure/azure-cli), without much effort.

The credentials and subscription ID that are returned can then be passed to any of the management client APIs within the Azure SDK, in order to begin provisioning and/or modifying resources.

Optionally, if you'd like to create a service principal explicitly, and have `az-login` use it instead (e.g. because you want to allow your end-users to provide one that is scoped down to their desired access), you can set and/or document the following environment variables, which will be automatically used to authenticate, instead of using the interactive login proces and then creating a new service principal:

* **azureSubId / ARM_SUBSRIPTION_ID** - The ID of the Azure subscription that you'd like to manage resources within
* **azureServicePrincipalClientId / ARM_CLIENT_ID** - The name of the service principal
* **azureServicePrincipalPassword / ARM_CLIENT_SECRET** - The password of the service principal
* **azureServicePrincipalTenantId / ARM_TENANT_ID** - The ID of the tenant that the service principal was created in

> Note: The login method also accepts a service principal identity, but this isn't recommended, since your app's config should be externalized from its code.

If at some later point, you'd like to clear all local auth state from the current machine, you can import and call the `logout` method:

```javascript
const { logout } = require("az-login");
logout();
```
