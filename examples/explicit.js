const { login } = require("../");

login().then(({ credentials }) => {
    console.log(credentials);
});