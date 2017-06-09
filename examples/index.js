const { login } = require("../");
const { ResourceManagementClient } = require("azure-arm-resource");

!async function () {
    try {
        const { clientFactory } = await login({ serviceClientId: "5ea5352d-330b-40a4-8c61-d05dce5c055f" });
        const { resourceGroups } = clientFactory(ResourceManagementClient);

        console.log(await resourceGroups.list());
    } catch ({ message }) {
        console.log(message);
    }
}();