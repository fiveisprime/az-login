const { login } = require("../");
const { ResourceManagementClient } = require("azure-arm-resource");

!async function () {
    const { clientFactory } = await login();
    const { resourceGroups } = clientFactory(ResourceManagementClient);

    console.log(await resourceGroups.list());
}();