## Getting Started

In order to install the `az-login` module into your app, simply run the following NPM command with the CWD of your app:

```shell
npm i --save az-login
```

From within your app code, import the `login` method and simply call it:

```javascript
const { login } = require("az-login");

// Login using the following techinques, in prioritiy order:
// 1) The environment variables set on the priority machine
// 2) The service principal persisted from a previous login
// 3) An interactive login process, that launches a browser, and asks the user to sign in
const { credentials, subscriptionId } = await login();

// ... Use the credentials and subscription ID
```

Optionally, if at some later point, you'd like to clear all local auth state from the current machine, you can import and call the `logout` method:

```javascript
const { logout } = require("az-login");
logout();
```