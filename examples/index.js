const { login } = require("../");
const { ResourceManagementClient } = require("azure-arm-resource");

login({ userAgent: "example" }).then(({ clientFactory }) => {
    const { resourceGroups } = clientFactory(ResourceManagementClient);
    return resourceGroups.list();
}).then((groups) => console.log(groups));