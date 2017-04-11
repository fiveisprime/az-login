# az-login

A simple helper utlity for logging into an Azure account from Node.js

## Getting Started

In order to install the `az-login` module, simply run the following command within your app directory:

```shell
npm i --save az-login
```

From within your app code, import the `login` method and simply call it:

```javascript
const { login } = require("az-login");
const { credentials, subscriptionId } = await login();

// ... Use the credentials and subscription ID
```

This will result in a browser being launched, which will allow you the interactively authenticate with your Azure account. Once that login is complete, an Azure service principal is auto-created, and persisted to do, so that subsequent calls to `login` won't require reauthentication.

Optionally, if you'd like to create a service principal explicitly, and have `az-login` use them, you can set the following enivronment variables, which will be automatically used to authenticate, instead of using an interactive login and/or creating a new service principal:

* **azureSubId / ARM_SUBSRIPTION_ID** - The ID of the Azure subscription that you'd like to manage resources within
* **azureServicePrincipalClientId / ARM_CLIENT_ID** - The name of the service principal
* **azureServicePrincipalPassword / ARM_CLIENT_SECRET** - The password of the service principal
* **azureServicePrincipalTenantId / ARM_TENANT_ID** - The ID of the tenant that the service principal was created in

This way, `az-login` provides a super simple getting started experience, without preventing apps from having more control.

If at some later point, you'd like to clear all local auth state from the current machine, you can import and call the `logout` method:

```javascript
const { logout } = require("az-login");
logout();
```